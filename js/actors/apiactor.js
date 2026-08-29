import { createactor } from './actorkernel.js';
import { createApiConstants } from '../utils.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';

var apiVerbosityConstants = createVerbosityConstants();
var apiVerbosityFunctions = createVerbosityFunctions(apiVerbosityConstants);
var apiLogger = apiVerbosityFunctions.createLogger('[APIACTOR]', apiVerbosityConstants.DEBUG);

var MESSAGETYPES = Object.freeze({
  API: 'api',
  FETCH: 'fetch'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[MESSAGETYPES.API] = {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', resolve: 'function', reject: 'function?'
};
MESSAGEINTERFACES[MESSAGETYPES.FETCH] = {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', resolve: 'function', reject: 'function?'
};
Object.freeze(MESSAGEINTERFACES);

function createInitialApiWorldmap() {
  return {
    lastRequest: null,
    requestCount: 0
  };
}

function persistApiWorldmap(state) {
  apiLogger.debug('persistApiWorldmap saving state to db');
  enqueueDbStore('actor:state:api', state.worldmap).catch(function(e) {
    apiLogger.warn('state persist failed:', e);
  });
}

var apibehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : apiLogger.getLevel();
  apiLogger.setLevel(v);

  apiLogger.debug('behavior handling action:', message.type);

  if (message.type === MESSAGETYPES.API || message.type === MESSAGETYPES.FETCH) {
    apiLogger.debug('action:', message.type, 'method:', message.method, 'endpoint:', message.endpoint);
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
      apiLogger.debug('action response status:', status, 'for:', message.endpoint);
      if (!isTextual) {
        return response.json().then(function(data) {
          apiLogger.debug('action JSON response received for:', message.endpoint);
          if (typeof message.resolve === 'function') {
            message.resolve({ status: status, data: data });
          }
        });
      }
      return response.text().then(function(data) {
        apiLogger.debug('action text response received for:', message.endpoint);
        if (typeof message.resolve === 'function') {
          message.resolve({ status: status, data: data });
        }
      });
    }).catch(function(err) {
      apiLogger.error('action request error for:', message.endpoint, err);
      if (typeof message.reject === 'function') {
        message.reject(err);
      }
    });
  }

  return state;
};

var apiMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

var APIACTOR = createactor(
  apibehavior,
  { worldmap: createInitialApiWorldmap(), verbosity: apiVerbosityConstants.DEBUG },
  MESSAGEINTERFACES,
  { actorName: 'apiactor', mailboxType: 'db', mailboxStore: apiMailboxStore, verbosity: apiVerbosityConstants.DEBUG }
);

function startApiActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      apiLogger.setLevel(lvl);
      if (APIACTOR && APIACTOR.getstate()) {
        APIACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return APIACTOR;
}

function enqueueapi(endpoint, method, payload, options) {
  return new Promise(function(resolve, reject) {
    APIACTOR.send({
      type: MESSAGETYPES.API,
      endpoint: endpoint,
      method: method,
      payload: payload || {},
      token: (options && options.token) || '',
      resolve: resolve,
      reject: reject
    });
  });
}

function enqueuefetch(endpoint, method, payload, options) {
  return new Promise(function(resolve, reject) {
    APIACTOR.send({
      type: MESSAGETYPES.FETCH,
      endpoint: endpoint,
      method: method,
      payload: payload || {},
      token: (options && options.token) || '',
      resolve: resolve,
      reject: reject
    });
  });
}

export {
  APIACTOR,
  MESSAGETYPES,
  startApiActor,
  enqueueapi,
  enqueuefetch
};
