var KERNELVERBOSITYCONSTANTS = createVerbosityConstants();

// State registry now only holds WORLDMAPACTOR's ENV.
var ACTORSTATEREGISTRY = {};

function REGISTERACTORSTATE(actorName, initialState) {
  ACTORSTATEREGISTRY[actorName] = initialState;
}

function GETACTORSTATE(actorName) {
  return ACTORSTATEREGISTRY[actorName];
}

function SETACTORSTATE(actorName, nextState) {
  ACTORSTATEREGISTRY[actorName] = nextState;
}

// Pure immutable transformer: (env, actorName, behavior, message) -> env | Promise<env>
function DISPATCHIMMUTABLE(env, actorName, behavior, message) {
  var result = behavior(env, message);
  if (result && typeof result.then === 'function') {
    return result;
  }
  return result;
}

// Wrapper that manages global state outside the pure core.
function DISPATCHTOACTOR(actorName, behavior, message) {
  var currentEnv = GETACTORSTATE('WORLDMAPACTOR');
  if (currentEnv === undefined) {
    throw new Error('[DISPATCHTOACTOR] WORLDMAPACTOR state (ENV) is not registered');
  }
  var result = DISPATCHIMMUTABLE(currentEnv, actorName, behavior, message);
  if (result && typeof result.then === 'function') {
    return result.then(function(newEnv) {
      SETACTORSTATE('WORLDMAPACTOR', newEnv);
      return newEnv;
    });
  }
  SETACTORSTATE('WORLDMAPACTOR', result);
  return result;
}

// Helper for actors to ensure their slice exists.
function ENSUREENVSLICE(env, sliceName, defaultFactory) {
  if (!env[sliceName]) {
    env[sliceName] = defaultFactory();
  }
  return env[sliceName];
}

function CREATEMESSAGEVALIDATOR(interfaceMap) {
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

var ACTORREGISTRY = {};

function PINGACTOR(enqueuePing, timeout) {
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

function GETACTORREGISTRY() {
  return ACTORREGISTRY;
}
