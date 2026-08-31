// ============================================================
// UPDATED FILE: js/actorkernel.js
// Change applied: RUNTIME STATE OWNERSHIP REFACTOR
//   - Removes actor object construction as the primary pattern.
//   - Introduces a pure state registry and dispatch helpers.
//   - Keeps createactor as a compatibility shim (deprecated, unused by actors).
//   - createMessageValidator, pingActor, getActorRegistry retained.
// ============================================================

var kernelVerbosityConstants = createVerbosityConstants();

// Pure state registry: maps actor name -> current state.
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
// The behavior function is provided externally (from ACTORCONSUMERS).
function dispatchToActor(actorName, behavior, message) {
  var current = getActorState(actorName);
  var next = behavior(current, message);
  if (next && typeof next.then === 'function') {
    return next.then(function(resolved) {
      setActorState(actorName, resolved);
      return resolved;
    });
  }
  setActorState(actorName, next);
  return next;
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

// Compatibility shim for createactor (deprecated).
// Returns an object with dispatch/getstate/send, but actors no longer use this.
function createactor(behavior, initialstate, messageInterface, options) {
  if (options === undefined) options = {};
  var actorName = options.actorName || 'anonymous';
  registerActorState(actorName, initialstate || {});
  return {
    dispatch: function(message) {
      return dispatchToActor(actorName, behavior, message);
    },
    getstate: function() { return getActorState(actorName); },
    send: function(message) {
      return dispatchToActor(actorName, behavior, message);
    },
    waitforemptymailbox: function() { return Promise.resolve(getActorState(actorName)); }
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
