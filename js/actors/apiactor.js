// ============================================================
// UPDATED FILE: js/actors/apiactor.js
// Change applied: IMMUTABLE DISPATCH REFACTOR
//   - apibehavior returns env unchanged after sending updates via
//     sendInstruction to worldmapactor (value set format).
//   - No per-actor state globals; no createactor; no interfaces.
// ============================================================

// Pure behavior function: (env, message) -> env
function apibehavior(env, message) {
  logdebug(env, '[APIACTOR]', 'behavior handling action:', message.type);

  if (message.type === MESSAGETYPES.API || message.type === MESSAGETYPES.FETCH) {
    logdebug(env, '[APIACTOR]', 'action:', message.type, 'method:', message.method, 'endpoint:', message.endpoint);

    var updatedApi = {
      lastRequest: {
        type: message.type,
        endpoint: message.endpoint,
        method: message.method,
        payload: message.payload || {},
        token: message.token || '',
        timestamp: Date.now()
      },
      requestCount: (env.api && env.api.requestCount || 0) + 1
    };

    // Send update to worldmapactor via message
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'api', value: updatedApi }]
    }, generateTag(), 'apiactor');

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
      logdebug(env, '[APIACTOR]', 'action response status:', status, 'for:', message.endpoint);
      if (!isTextual) {
        return response.json().then(function(data) {
          logdebug(env, '[APIACTOR]', 'action JSON response received for:', message.endpoint);
          var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
          sendInstruction(message.sender, responseType, { result: { status: status, data: data } }, message.tag, 'apiactor');
        });
      }
      return response.text().then(function(data) {
        logdebug(env, '[APIACTOR]', 'action text response received for:', message.endpoint);
        var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
        sendInstruction(message.sender, responseType, { result: { status: status, data: data } }, message.tag, 'apiactor');
      });
    }).catch(function(err) {
      logerror(env, '[APIACTOR]', 'action request error for:', message.endpoint, err);
      var responseType = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseType, { result: { error: err.message || String(err) } }, message.tag, 'apiactor');
    });
  }

  return env;
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
