import { createactor, createMessageValidator } from './actorkernel.js';
import { APIBASE } from '../utils.js';

const MESSAGETYPES = Object.freeze({
    FETCH: 'fetch'
});

const MESSAGEINTERFACES = Object.freeze({
    [MESSAGETYPES.FETCH]: { endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', resolve: 'function', reject: 'function?' }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const apibehavior = (state, message) => {
    var check = validatemessage(message);
    if (!check.valid) {
        console.error('[APIACTOR:INVALID] ' + check.error);
        return state;
    }
    if (message.type === MESSAGETYPES.FETCH) {
        var url = APIBASE + '/' + message.endpoint;
        fetch(url, {
            method: message.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (message.token || '')
            },
            body: JSON.stringify(message.payload || {})
        })
        .then(function(response) {
            var status = response.status;
            if(!message.textual) {
                return response.json().then(function(data) {
                    if (typeof message.resolve === 'function') {
                        message.resolve({ status: status, data: data });
                    }
                });
            } else {
                return response.text().then(function(data) {
                    if (typeof message.resolve === 'function') {
                        message.resolve({ status: status, data: data });
                    }
                });
            }
        })
        .catch(function(err) {
            if (typeof message.reject === 'function') {
                message.reject(err);
            }
        });
    }
    return state;
};

export const APIACTOR = createactor(apibehavior, {});

export const enqueueapi = function(endpoint, method, payload, options) {
    return new Promise(function(resolve, reject) {
        APIACTOR.send({
            type: MESSAGETYPES.FETCH,
            endpoint: endpoint,
            method: method,
            payload: payload || {},
            token: (options && options.token) || '',
            textual: (options && options.textual) || false,
            resolve: resolve,
            reject: reject
        });
    });
};

export { MESSAGETYPES };
