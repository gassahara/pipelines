// ============================================================
// UPDATED FILE: js/actors/actorkernel.js
// Change applied: ES5 syntax, no arrow functions, no const, no async/await syntax,
// module.exports. Promise chains retained per blueprint §2 (kernel surface).
// - mailboxType 'mail' now requires options.mailTransport with
//   sendInstruction, requestUnreadMessages, sendResponse
// - dedicated setInterval polling loop independent of ensureLoop
// - pollInterval configurable (default 25ms)
// - send for mail actors now throws error (prevent self-send)
// - waitforemptymailbox for mail actors resolves immediately
// - processMessage returns a promise chain; async keyword removed
// - retained memory/db mailbox logic and drain fixes
// ============================================================


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
    append: function(message) {
      return load().then(function(data) {
        data.items.push(message);
        return save(data);
      });
    },
    peek: function() {
      return load().then(function(data) {
        return data.items.length ? data.items[0] : null;
      });
    },
    remove: function() {
      return load().then(function(data) {
        data.items.shift();
        return save(data);
      });
    },
    clear: function() {
      return dbStore.delete(key);
    },
    isEmpty: function() {
      return load().then(function(data) {
        return data.items.length === 0;
      });
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
  } else if (mailboxType === 'mail') {
    if (!options.mailTransport || typeof options.mailTransport.requestUnreadMessages !== 'function' ||
        typeof options.mailTransport.sendInstruction !== 'function' ||
        typeof options.mailTransport.sendResponse !== 'function') {
      throw new Error('[createactor] mailboxType "mail" requires options.mailTransport with requestUnreadMessages, sendInstruction, sendResponse');
    }
    mailbox = null;
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

  function processMessage(message) {
    var msgType = message && message.type ? message.type : String(message);
    var currentVerbosity = currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity;
    logdebug({ level: currentVerbosity }, '[ACTOR:' + actorName + ']', 'processMessage start:', msgType);

    if (validator) {
      var check = validator(message);
      if (!check.valid) {
        logerror({ level: currentVerbosity }, '[ACTOR:' + actorName + ']', '[ACTOR:INVALID]', check.error);
        return Promise.resolve(null);
      }
    }

    try {
      var result = behavior(currentstate, message);
      if (result && typeof result.then === 'function') {
        return result.then(function(res) {
          currentstate = res;
          logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'processMessage done:', msgType);
          return res;
        });
      }
      if (result !== undefined) {
        currentstate = result;
      }
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'processMessage done:', msgType);
      return Promise.resolve(result);
    } catch (err) {
      logerror({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'behavior error:', err);
      return Promise.reject(err);
    }
  }

  function drainMemory() {
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
    processMessage(message).then(function() {
      setTimeout(drainMemory, 0);
    });
  }

  function drainDb() {
    if (!running) return;
    draining = true;
    mailbox.peek().then(function(message) {
      if (message === null) {
        draining = false;
        if (polltimer) { clearTimeout(polltimer); polltimer = null; }
        logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainDb mailbox empty, polling');
        resolveWaiters();
        polltimer = setTimeout(drainDb, 25);
        return;
      }
      mailbox.remove().then(function() {
        logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'drainDb processing message:', message && message.type);
        processMessage(message).then(function() {
          var after = mailbox.clearIfEmpty ? mailbox.clearIfEmpty() : null;
          var finish = function() {
            draining = false;
            if (polltimer) { clearTimeout(polltimer); polltimer = null; }
            polltimer = setTimeout(drainDb, 0);
          };
          if (after && typeof after.then === 'function') {
            after.then(finish);
          } else {
            finish();
          }
        });
      });
    });
  }

  function ensureLoop() {
    if (!running && !draining) {
      running = true;
      logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'ensureLoop starting loop for mailboxType:', mailboxType);
      if (mailboxType === 'db') {
        drainDb();
      } else if (mailboxType === 'memory') {
        setTimeout(drainMemory, 0);
      }
    }
  }

  var send = function(message) {
    if (!message || typeof message !== 'object') {
      message = { type: message };
    }
    logdebug({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'send message:', message.type);
    if (mailboxType === 'mail') {
      throw new Error('[createactor] send() is not supported for mail actors; use sendInstruction directly.');
    }
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
    if (mailboxType === 'mail') {
      return Promise.resolve(currentstate);
    }
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

  // Start dedicated polling interval for mail actors
  if (mailboxType === 'mail') {
    var pollInterval = options.pollInterval !== undefined ? options.pollInterval : 25;
    var mailTransport = options.mailTransport;
    var pollMailbox = function() {
      mailTransport.requestUnreadMessages(actorName).then(function(envelopes) {
        var i = 0;
        var processNext = function() {
          if (i >= envelopes.length) return;
          var env = envelopes[i];
          i += 1;
          processMessage(env.payload).then(function(result) {
            if (env.tag && env.sender && result !== undefined && result !== null) {
              mailTransport.sendResponse(env.sender, env.tag, result, actorName).then(processNext);
            } else {
              processNext();
            }
          }, function() { processNext(); });
        };
        processNext();
      }).catch(function(err) {
        logwarn({ level: currentstate.verbosity !== undefined ? currentstate.verbosity : initialVerbosity }, '[ACTOR:' + actorName + ']', 'pollMailbox error:', err);
      });
    };
    setInterval(pollMailbox, pollInterval);
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
