// ============================================================
// UPDATED FILE: js/actors/apiactor.js
// Changes applied:
//   - mailboxType changed to 'mail'
//   - mailTransport injected from mailactor.js static imports
//   - enqueue functions use tag-based sendInstruction/awaitResponse
//   - behavior sends response via mailTransport.sendResponse
//   - state persistence still uses enqueueDbStore/Restore/Delete
// ============================================================

import { createactor } from './actorkernel.js';
import { createApiConstants } from '../utils.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import {
  sendInstruction,
  requestUnreadMessages,
  sendResponse,
  awaitResponse,
  generateTag
} from './mailactor.js';
import {
  createVerbosityConstants,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';

var apiVerbosityConstants = createVerbosityConstants();
var apiState = Object.freeze({ level: apiVerbosityConstants.DEBUG });

var MESSAGETYPES = Object.freeze({
  API: 'api',
  FETCH: 'fetch'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[MESSAGETYPES.API] = {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
};
MESSAGEINTERFACES[MESSAGETYPES.FETCH] = {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
};
Object.freeze(MESSAGEINTERFACES);

function createInitialApiWorldmap() {
  return {
    lastRequest: null,
    requestCount: 0
  };
}

function persistApiWorldmap(state) {
  logdebug(apiState, '[APIACTOR]', 'persistApiWorldmap saving state to db');
  enqueueDbStore('actor:state:api', state.worldmap).catch(function(e) {
    logwarn(apiState, '[APIACTOR]', 'state persist failed:', e);
  });
}

var apibehavior = function(state, message) {
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
          sendResponse(message.sender, message.tag, { status: status, data: data }, 'apiactor').catch(function(err) {
            logwarn(apiState, '[APIACTOR]', 'sendResponse failed:', err);
          });
        });
      }
      return response.text().then(function(data) {
        logdebug(apiState, '[APIACTOR]', 'action text response received for:', message.endpoint);
        sendResponse(message.sender, message.tag, { status: status, data: data }, 'apiactor').catch(function(err) {
          logwarn(apiState, '[APIACTOR]', 'sendResponse failed:', err);
        });
      });
    }).catch(function(err) {
      logerror(apiState, '[APIACTOR]', 'action request error for:', message.endpoint, err);
      sendResponse(message.sender, message.tag, { error: err.message || String(err) }, 'apiactor').catch(function(e) {
        logwarn(apiState, '[APIACTOR]', 'sendResponse failed:', e);
      });
    });
  }

  return state;
};

var APIACTOR = createactor(
  apibehavior,
  { worldmap: createInitialApiWorldmap(), verbosity: apiVerbosityConstants.DEBUG },
  MESSAGEINTERFACES,
  {
    actorName: 'apiactor',
    mailboxType: 'mail',
    mailTransport: {
      sendInstruction: sendInstruction,
      requestUnreadMessages: requestUnreadMessages,
      sendResponse: sendResponse
    },
    pollInterval: 25,
    verbosity: apiVerbosityConstants.DEBUG
  }
);

function startApiActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      apiState = Object.freeze({ level: lvl });
      if (APIACTOR && APIACTOR.getstate()) {
        APIACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return APIACTOR;
}

function enqueueapi(endpoint, method, payload, options) {
  const tag = generateTag();
  sendInstruction('apiactor', MESSAGETYPES.API, {
    endpoint: endpoint,
    method: method,
    payload: payload || {},
    token: (options && options.token) || ''
  }, tag, tag);
  return awaitResponse(tag, tag);
}

function enqueuefetch(endpoint, method, payload, options) {
  const tag = generateTag();
  sendInstruction('apiactor', MESSAGETYPES.FETCH, {
    endpoint: endpoint,
    method: method,
    payload: payload || {},
    token: (options && options.token) || ''
  }, tag, tag);
  return awaitResponse(tag, tag);
}

export {
  APIACTOR,
  MESSAGETYPES,
  startApiActor,
  enqueueapi,
  enqueuefetch
};
