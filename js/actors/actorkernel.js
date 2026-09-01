// ============================================================
// UPDATED FILE: js/actorkernel.js
// Change applied: GLOBAL ENV RUNTIME (worldmapactor owns ENV)
//   - Removes actor object construction entirely.
//   - Runtime holds only the global ENV object, managed by worldmapactor.
//   - dispatchToActor retrieves ENV from worldmapactor, calls pure
//     behavior(env, message), and stores the returned ENV back to
//     worldmapactor state.
//   - createMessageValidator retained for message validation.
// ============================================================

var kernelVerbosityConstants = createVerbosityConstants();

// State registry now only holds worldmapactor's ENV.
var actorStateRegistry = {};

function registerActorState(actorName, initialState) {
  actorStateRegistry[actorName] = initialState;
}

function getActorState(actorName) {
  return actorStateRegistry[actorName];
}

function setActorState(actorName, nextState) {
  actorStateRegistry[actorName] = nextState;
}

// Dispatch a message to a pure behavior function.
// The global ENV is retrieved from worldmapactor and passed as first argument.
// The behavior returns the updated ENV, which is stored back to worldmapactor.
function dispatchToActor(actorName, behavior, message) {
  var env = getActorState('worldmapactor');
  if (env === undefined) {
    throw new Error('[dispatchToActor] worldmapactor state (ENV) is not registered');
  }
  var result = behavior(env, message);
  if (result && typeof result.then === 'function') {
    return result.then(function(resolved) {
      setActorState('worldmapactor', resolved);
      return resolved;
    });
  }
  setActorState('worldmapactor', result);
  return result;
}

function createMessageValidator(interfaceMap) {
  return function(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'message must be a non-null object', type: 'null' };
    }
    var type = message.type;
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'message type must be a string, got: ' + typeof type, type: String(type) };
    }
    var iface = interfaceMap[type];
    if (!iface) {
      return { valid: false, error: 'unknown message type: ' + type, type: type };
    }
    var keys = Object.keys(iface);
    var invalid = keys.reduce(function(acc, key) {
      if (acc) return acc;
      var spec = iface[key];
      var optional = spec.charAt(spec.length - 1) === '?';
      var expectedtype = optional ? spec.slice(0, -1) : spec;
      if (message[key] === undefined || message[key] === null) {
        if (!optional) {
          return { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
        }
        return acc;
      }
      if (expectedtype === 'any') return acc;
      if (expectedtype === 'array') {
        if (!Array.isArray(message[key])) {
          return { valid: false, error: 'type "' + type + '" field "' + key + '" expected array got ' + (Array.isArray(message[key]) ? 'array' : typeof message[key]), type: type };
        }
      } else if (expectedtype === 'object') {
        if (message[key] === null || typeof message[key] !== 'object') {
          return { valid: false, error: 'type "' + type + '" field "' + key + '" expected object got ' + (message[key] === null ? 'null' : typeof message[key]), type: type };
        }
      } else {
        var actualtype = typeof message[key];
        if (actualtype !== expectedtype) {
          return { valid: false, error: 'type "' + type + '" field "' + key + '" expected ' + expectedtype + ' got ' + actualtype, type: type };
        }
      }
      return acc;
    }, null);
    if (invalid) return invalid;
    return { valid: true, error: null, type: type };
  };
}

var actorRegistry = {};

function pingActor(enqueuePing, timeout) {
  if (timeout === undefined) timeout = 1000;
  return new Promise(function(resolve) {
    var timer = setTimeout(function() { resolve(false); }, timeout);
    Promise.resolve().then(enqueuePing).then(function() {
      clearTimeout(timer);
      resolve(true);
    }).catch(function() {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function getActorRegistry() {
  return actorRegistry;
}
