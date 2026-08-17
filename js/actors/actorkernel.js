// actorkernel.js — ES5 actor kernel. Stateful actor instances preserved.

export function createactor(behavior, initialstate) {
  var currentstate = initialstate;
  var mailbox = [];
  var scheduled = false;
  var drainpromise = null;
  var drainresolve = null;

  var drain = function() {
    if (mailbox.length === 0) {
      scheduled = false;
      if (drainresolve) {
        var res = drainresolve;
        drainresolve = null;
        drainpromise = null;
        res(currentstate);
      }
      return;
    }
    var message = mailbox.shift();
    currentstate = behavior(currentstate, message);
    queueMicrotask(drain);
  };

  var send = function(message) {
    mailbox.push(message);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(drain);
    }
  };

  var waitforemptymailbox = function() {
    if (!scheduled && mailbox.length === 0) return Promise.resolve(currentstate);
    if (!drainpromise) {
      drainpromise = new Promise(function(resolve) { drainresolve = resolve; });
    }
    return drainpromise;
  };

  var getstate = function() { return currentstate; };

  return Object.freeze({
    send: send,
    getstate: getstate,
    waitforemptymailbox: waitforemptymailbox
  });
}

export function createMessageValidator(interfaceMap) {
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
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var spec = iface[key];
      var optional = spec.charAt(spec.length - 1) === '?';
      var expectedtype = optional ? spec.slice(0, -1) : spec;
      if (message[key] === undefined || message[key] === null) {
        if (!optional) {
          return { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
        }
        continue;
      }
      if (expectedtype === 'any') continue;

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
    }
    return { valid: true, error: null, type: type };
  };
}
