// ============================================================
// UPDATED FILE: js/actors/apiactor.js
// Change applied: STATELESS PURE FUNCTION + MESSAGE-BASED UPDATES
//   - No interface definitions, no MESSAGEREGISTRY, no createactor.
//   - Behavior signature: apibehavior(env, message) -> env
//   - Uses env.api slice for lastRequest/requestCount.
//   - When it needs to update env.api, sends an UPDATE message to
//     worldmapactor via sendInstruction.
//   - Does NOT return a modified env; returns env unchanged.
//   - Producers enqueueapi/enqueuefetch remain.
// ============================================================

// Pure behavior function: (env, message) -> env
function apibehavior(env, message) {
  logdebug(env, '[APIACTOR]', 'behavior handling action:', message.type);

  if (message.type === MESSAGETYPES.API || message.type === MESSAGETYPES.FETCH) {
    logdebug(env, '[APIACTOR]', 'action:', message.type, 'method:', message.method, 'endpoint:', message.endpoint);

    // Prepare updated api slice
    var updatedApi = {
      lastRequest: {
        type: message.type,
        endpoint: message.endpoint,
        method: message.method,
        payload: message.payload || {},
        token: message.token || '',
        timestamp: Date.now()
      },
      requestCount: (env.api.requestCount || 0) + 1
    };

    // Send update to worldmapactor (message-based, no direct mutation)
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      patch: { api: updatedApi }
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

  // Return env unchanged; updates happen via worldmapactor message.
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
