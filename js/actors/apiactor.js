import { createactor, createMessageValidator } from './actorkernel.js';
import { createApiConstants } from '../utils.js';

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

var validatemessage = createMessageValidator(MESSAGEINTERFACES);

var apibehavior = function(state, message) {
  var check = validatemessage(message);
  if (!check.valid) {
    console.error('[APIACTOR:INVALID] ' + check.error);
    return state;
  }

  if (message.type === MESSAGETYPES.API || message.type === MESSAGETYPES.FETCH) {
    var apiConstants = createApiConstants();
    var url = apiConstants.APIBASE + '/' + message.endpoint;
    var isTextual = message.type === MESSAGETYPES.FETCH;

    fetch(url, {
      method: message.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (message.token || '')
      },
      body: JSON.stringify(message.payload || {})
    }).then(function(response) {
      var status = response.status;
      if (!isTextual) {
        return response.json().then(function(data) {
          if (typeof message.resolve === 'function') {
            message.resolve({ status: status, data: data });
          }
        });
      }
      return response.text().then(function(data) {
        if (typeof message.resolve === 'function') {
          message.resolve({ status: status, data: data });
        }
      });
    }).catch(function(err) {
      if (typeof message.reject === 'function') {
        message.reject(err);
      }
    });
  }

  return state;
};

export var APIACTOR = createactor(apibehavior, {});

export function enqueueapi(endpoint, method, payload, options) {
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

export function enqueuefetch(endpoint, method, payload, options) {
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

export { MESSAGETYPES };
