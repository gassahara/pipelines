// ============================================================
// UPDATED FILE: js/actors/apiactor.js
// Change applied: PURE FUNCTION REFACTOR
//   - No message interface definitions.
//   - No MESSAGEREGISTRY references.
//   - No createactor object construction.
//   - Exports only createInitialApiState, apibehavior, and enqueue producers.
//   - Actor state is owned by the runtime (actorkernel.js).
// ============================================================

var apiVerbosityConstants = createVerbosityConstants();
var apiState = Object.freeze({ level: apiVerbosityConstants.DEBUG });

function createInitialApiState() {
  return {
    worldmap: {
      lastRequest: null,
      requestCount: 0
    },
    verbosity: apiVerbosityConstants.DEBUG
  };
}

function persistApiWorldmap(state) {
  logdebug(apiState, '[APIACTOR]', 'persistApiWorldmap saving state to db');
  enqueueDbStore('actor:state:api', state.worldmap).catch(function(e) {
    logwarn(apiState, '[APIACTOR]', 'state persist failed:', e);
  });
}

// Pure behavior function: (state, message) -> state
function apibehavior(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : apiVerbosityConstants.DEBUG;
  apiState = Object.freeze({ level: v });

  logdebug(apiState, '[APIACTOR]', 'behavior handling action:', message.type);

  if (message.type === MESSAGETYPES.API || message.type === MESSAGETYPES.FETCH) {
    logdebug(apiState, '[APIACTOR]', 'action:', message.type, 'method:', message.method, 'endpoint:', message.endpoint);
    persistApiWorldmap(state);

    state.worldmap.lastRequest = {
      type: message.type,
      endpoint: message.endpoint,
      method: message.method,
      payload: message.payload || {},
      token: message.token || '',
      timestamp: Date.now()
    };
    state.worldmap.requestCount = (state.worldmap.requestCount || 0) + 1;

    persistApiWorldmap(state);

    var apiConstants = createApiConstants();
    var url = apiConstants.APIBASE + '/' + message.endpoint;
    var isTextual = message.type === MESSAGETYPES.FETCH;
    var method = String(message.method || 'GET').toUpperCase();
    var headers = {
      'Authorization': 'Bearer ' + (message.token || '')
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
    if (isTextual) {
      headers['Accept'] = 'text/plain, */*';
    }
    var body = method === 'POST' ? JSON.stringify(message.payload || {}) : undefined;

    fetch(url, { method: method, headers: headers, body: body }).then(function(response) {
      var status = response.status;
      logdebug(apiState, '[APIACTOR]', 'action response status:', status, 'for:', message.endpoint);
      if (!isTextual) {
        return response.json().then(function(data) {
          logdebug(apiState, '[APIACTOR]', 'action JSON response received for:', message.endpoint);
          var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
          sendInstruction(message.sender, responseType, { result: { status: status, data: data } }, message.tag, 'apiactor');
        });
      }
      return response.text().then(function(data) {
        logdebug(apiState, '[APIACTOR]', 'action text response received for:', message.endpoint);
        var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
        sendInstruction(message.sender, responseType, { result: { status: status, data: data } }, message.tag, 'apiactor');
      });
    }).catch(function(err) {
      logerror(apiState, '[APIACTOR]', 'action request error for:', message.endpoint, err);
      var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseType, { result: { error: err.message || String(err) } }, message.tag, 'apiactor');
    });
  }

  return state;
}

// Register initial state with runtime.
registerActorState('apiactor', createInitialApiState());

// Minimal handle for compatibility (stateless).
var APIACTOR = {
  getstate: function() { return getActorState('apiactor'); },
  dispatch: function(message) { return dispatchToActor('apiactor', apibehavior, message); }
};

function startApiActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      apiState = Object.freeze({ level: lvl });
      var apiStateObj = getActorState('apiactor');
      if (apiStateObj) apiStateObj.verbosity = lvl;
    }
  }
  return APIACTOR;
}

function enqueueapi(endpoint, method, payload, options, responseSpec) {
  var tag = generateTag();
  sendInstruction('apiactor', MESSAGETYPES.API, {
    endpoint: endpoint,
    method: method,
    payload: payload || {},
    token: (options && options.token) || ''
  }, tag, 'system', responseSpec);
}

function enqueuefetch(endpoint, method, payload, options, responseSpec) {
  var tag = generateTag();
  sendInstruction('apiactor', MESSAGETYPES.FETCH, {
    endpoint: endpoint,
    method: method,
    payload: payload || {},
    token: (options && options.token) || ''
  }, tag, 'system', responseSpec);
}
