// ============================================================
// UPDATED FILE: js/actors/actorkernel.js
// Changes applied:
//   P1: processMessage now async and awaits behavior result;
//       drainMemory and drainDb await processMessage to preserve
//       sequential processing and keep currentstate as object.
// ============================================================

import { createGarbageCollector } from './actorgc.js';
import {
  createVerbosityConstants,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';

var kernelVerbosityConstants = createVerbosityConstants();

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

function createMemoryMailbox() {
  var queue = [];
  return {
    append: function(message) { queue.push(message); },
    peek: function() { return queue.length ? queue[0] : null; },
    remove: function() { queue.shift(); },
    clear: function() { queue.length = 0; },
    isEmpty: function() { return queue.length === 0; }
  };
}

function createDbMailbox(actorName, dbStore) {
  var key = 'actor:mailbox:' + actorName;

  function load() {
    return dbStore.restore(key).then(function(data) {
      if (!data || typeof data !== 'object') return { items: [] };
      if (!Array.isArray(data.items)) return { items: [] };
      return data;
    });
  }

  function save(value) {
    return dbStore.store(key, value);
  }

  return {
    append: async function(message) {
      var data = await load();
      data.items.push(message);
      await save(data);
    },
    peek: async function() {
      var data = await load();
      return data.items.length ? data.items[0] : null;
    },
    remove: async function() {
      var data = await load();
      data.items.shift();
      await save(data);
    },
    clear: async function() {
      await dbStore.delete(key);
    },
    isEmpty: async function() {
      var data = await load();
      return data.items.length === 0;
    }
  };
}

var actorRegistry = {};

function createactor(behavior, initialstate, messageInterface, options) {
  if (options === undefined) options = {};
  var actorName = options.actorName || 'anonymous';
  if (options.actorName && actorRegistry[options.actorName]) {
    return actorRegistry[options.actorName];
  }

  var currentstate = initialstate || {};

  var initialVerbosity = options.verbosity !== undefined
    ? options.verbosity
    : (options.verbosityLevel !== undefined
      ? options.verbosityLevel
      : (currentstate.verbosity !== undefined ? currentstate.verbosity : (currentstate.level !== undefined ? currentstate.level : kernelVerbosityConstants.DEBUG)));

  if (!currentstate._gc) {
    currentstate._gc = createGarbageCollector();
  }
  if (currentstate.verbosity === undefined) {
    currentstate.verbosity = initialVerbosity;
  }

  var validator = messageInterface ? createMessageValidator(messageInterface) : null;
  var mailboxType = options.mailboxType || 'memory';

  var mailbox = null;
  var running = false;
  var draining = false;
  var drainpromise = null;
  var drainresolve = null;
  var polltimer = null;

  if (mailboxType === 'db' && options.mailboxStore) {
    mailbox = createDbMailbox(actorName, options.mailboxStore);
  } else {
    mailbox = createMemoryMailbox();
  }

  function resolveWaiters() {
    if (drainresolve) {
      var res = drainresolve;
      drainresolve = null;
      drainpromise = null;
      res(currentstate);
    }
  }

  // P1: processMessage becomes async to await async behavior results
  async function processMessage(message) {
    var msgType = message && message.type ? message.type : String(message);
    var currentVerbosity = currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity;
    logdebug({ level: currentVerbosity }, '[ACTOR:' + actorName + ']', 'processMessage start:', msgType);

    if (validator) {
      var check = validator(message);
      if (!check.valid) {
        logerror({ level: currentVerbosity }, '[ACTOR:' + actorName + ']', '[ACTOR:INVALID]', check.error);
        if (typeof message.reject === 'function') {
          message.reject(new Error('[ACTOR:INVALID] ' + check.error));
        }
        return true;
      }
    }

    try {
      var result = behavior(currentstate, message);
      if (result && typeof result.then === 'function') {
        currentstate = await result;
      } else if (result !== undefined) {
        currentstate = result;
      }
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'processMessage done:', msgType);
    } catch (err) {
      logerror({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'behavior error:', err);
      if (typeof message.reject === 'function') {
        message.reject(err);
      } else if (typeof message.resolve === 'function') {
        message.resolve(undefined);
      }
    }
    return true;
  }

  async function drainMemory() {
    if (!running) return;
    if (mailbox.isEmpty()) {
      running = false;
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainMemory mailbox empty, waiting resolved');
      resolveWaiters();
      return;
    }
    var message = mailbox.peek();
    mailbox.remove();
    logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainMemory processing message:', message && message.type);
    await processMessage(message);
    setTimeout(drainMemory, 0);
  }

  async function drainDb() {
    if (!running) return;
    draining = true;
    var message = await mailbox.peek();
    if (message === null) {
      draining = false;
      running = false;
      if (polltimer) { clearTimeout(polltimer); polltimer = null; }
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainDb mailbox empty, polling');
      resolveWaiters();
      polltimer = setTimeout(drainDb, 25);
      return;
    }
    await mailbox.remove();
    logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainDb processing message:', message && message.type);
    await processMessage(message);
    await mailbox.clearIfEmpty ? mailbox.clearIfEmpty() : null;
    draining = false;
    if (polltimer) { clearTimeout(polltimer); polltimer = null; }
    polltimer = setTimeout(drainDb, 0);
  }

  function ensureLoop() {
    if (!running && !draining) {
      running = true;
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'ensureLoop starting loop for mailboxType:', mailboxType);
      if (mailboxType === 'db') {
        drainDb();
      } else {
        setTimeout(drainMemory, 0);
      }
    }
  }

  var send = function(message) {
    if (!message || typeof message !== 'object') {
      message = { type: message };
    }
    logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'send message:', message.type);
    if (mailboxType === 'db') {
      mailbox.append(message).then(function() {
        ensureLoop();
      });
    } else {
      mailbox.append(message);
      ensureLoop();
    }
  };

  var waitforemptymailbox = function() {
    if (!running && (mailboxType === 'memory' ? mailbox.isEmpty() : false)) {
      return Promise.resolve(currentstate);
    }
    if (!drainpromise) {
      drainpromise = new Promise(function(resolve) { drainresolve = resolve; });
    }
    return drainpromise;
  };

  var getstate = function() { return currentstate; };

  var actor = Object.freeze({
    send: send,
    getstate: getstate,
    waitforemptymailbox: waitforemptymailbox
  });

  if (options.actorName) {
    actorRegistry[options.actorName] = actor;
  }

  return actor;
}

function pingActor(enqueuePing, timeout) {
  if (timeout === undefined) timeout = 1000;
  return new Promise(function(resolve) {
    var timer = setTimeout(function() {
      resolve(false);
    }, timeout);
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

export { createactor, createMessageValidator, pingActor, getActorRegistry };
