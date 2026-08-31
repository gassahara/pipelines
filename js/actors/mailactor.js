// ============================================================
// UPDATED FILE: js/actors/mailactor.js
// Change applied: ES5 syntax, no arrow functions, no const, no async/await syntax,
// module.exports. Top-level await removed (CJS): actor starts with synchronous
// initial state; persisted state is restored asynchronously after load and merged
// into the live actor state (preserves persistence semantics).
// Purpose: dedicated message broker for all actor communication.
// Mail Actor persists its message queues via DB Actor storage
// (enqueueDbStore / enqueueDbRestore), presenting a clean
// abstraction from storage. Actors never touch DB Actor directly
// for messaging; they only use sendInstruction / requestUnreadMessages.
// Messages are flat: type, sender, tag, and original fields are
// all top-level in the payload. Responses use type 'response' and
// carry result under payload.result.
// ============================================================


var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

var mailactorINTERFACES = {};
mailactorINTERFACES[MESSAGETYPES.SEND] = {
  recipient: 'string',
  message: 'object',
  resolve: 'function?',
  reject: 'function?'
};
mailactorINTERFACES[MESSAGETYPES.POLL] = {
  recipient: 'string',
  resolve: 'function',
  reject: 'function?'
};
mailactorINTERFACES[MESSAGETYPES.ACK] = {
  recipient: 'string',
  ids: 'array',
  resolve: 'function?',
  reject: 'function?'
};
Object.freeze(mailactorINTERFACES);

function createInitialMailState() {
  return {
    queues: {},        // recipient -> array of envelopes
    nextId: 1
  };
}

// Persistence via DB actor abstraction (not direct localStorage)
function persistMailState(state) {
  enqueueDbStore('actor:state:mail', state).catch(function(err) {
    logwarn(mailState, '[MAILACTOR]', 'state persist failed:', err);
  });
}

function loadInitialMailState() {
  return enqueueDbRestore('actor:state:mail').then(function(saved) {
    if (saved && typeof saved === 'object' && saved.queues) {
      return saved;
    }
    return createInitialMailState();
  }).catch(function(err) {
    logwarn(mailState, '[MAILACTOR]', 'state restore failed:', err);
    return createInitialMailState();
  });
}

var mailbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : mailVerbosityConstants.DEBUG;
  mailState = Object.freeze({ level: v });

  logdebug(mailState, '[MAILACTOR]', 'behavior handling action:', message.type);

  if (!state.queues) state.queues = {};
  if (!state.nextId) state.nextId = 1;

  if (message.type === MESSAGETYPES.SEND) {
    var recipient = message.recipient;
    if (!recipient || typeof recipient !== 'string') {
      if (typeof message.reject === 'function') message.reject(new Error('[MAILACTOR] recipient required'));
      return state;
    }
    if (!state.queues[recipient]) state.queues[recipient] = [];
    // envelope contains id, recipient, sender, tag, unread, timestamp, payload (flat message)
    var envelope = {
      id: 'mail_' + (state.nextId++),
      recipient: recipient,
      sender: (message.message && message.message.sender) || 'system',
      tag: (message.message && message.message.tag) || null,
      unread: true,
      timestamp: Date.now(),
      payload: message.message
    };
    state.queues[recipient].push(envelope);
    persistMailState(state);
    if (typeof message.resolve === 'function') message.resolve(true);
    return state;
  }

  if (message.type === MESSAGETYPES.POLL) {
    var pollRecipient = message.recipient;
    if (!pollRecipient || typeof pollRecipient !== 'string') {
      if (typeof message.reject === 'function') message.reject(new Error('[MAILACTOR] recipient required'));
      return state;
    }
    var queue = state.queues[pollRecipient] || [];
    var unread = queue.filter(function(m) { return m.unread === true; });
    queue.forEach(function(m) { if (m.unread === true) m.unread = false; });
    persistMailState(state);
    if (typeof message.resolve === 'function') message.resolve(unread);
    return state;
  }

  if (message.type === MESSAGETYPES.ACK) {
    var ackRecipient = message.recipient;
    var ackIds = message.ids || [];
    var ackQueue = state.queues[ackRecipient] || [];
    ackQueue.forEach(function(m) {
      if (ackIds.indexOf(m.id) !== -1) m.unread = false;
    });
    persistMailState(state);
    if (typeof message.resolve === 'function') message.resolve(true);
    return state;
  }

  return state;
};

// CJS: no top-level await. Start with synchronous fresh state, then merge
// persisted state asynchronously once restored.
var initialMailState = createInitialMailState();
Object.keys(mailactorINTERFACES).forEach(function(type) {
  MESSAGEREGISTRY.register('mailactor', type, mailactorINTERFACES[type], mailbehavior);
});

var MAILACTOR = createactor(
  mailbehavior,
  initialMailState,
  MESSAGEREGISTRY.getInterfaces('mailactor'),
  {
    actorName: 'mailactor',
    mailboxType: 'memory',   // Mail Actor itself uses memory to avoid recursion
    verbosity: mailVerbosityConstants.DEBUG
  }
);

loadInitialMailState().then(function(saved) {
  var current = MAILACTOR.getstate();
  if (saved && saved.queues) {
    var keys = Object.keys(saved.queues);
    keys.forEach(function(key) {
      current.queues[key] = saved.queues[key];
    });
    if (saved.nextId) current.nextId = saved.nextId;
    logdebug(mailState, '[MAILACTOR]', 'restored persisted mail state, recipients:', keys.length);
  }
});

function startMailActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      mailState = Object.freeze({ level: lvl });
      if (MAILACTOR && MAILACTOR.getstate()) {
        MAILACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return MAILACTOR;
}

// Generate a unique correlation tag
function generateTag() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// sendInstruction(recipient, type, payload, tag, sender)
// Constructs a flat message: { type, sender, tag, ...payload }
// Sends it to Mail Actor; returns storage ack promise (may be ignored).
function sendInstruction(recipient, type, payload, tag, sender) {
  if (tag === undefined) tag = generateTag();
  if (sender === undefined) sender = 'system';

  var flatMessage = { type: type, sender: sender, tag: tag };
  // Flatten payload keys into the flat message, but never override reserved keys
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(function(key) {
      if (key !== 'type' && key !== 'sender' && key !== 'tag') {
        flatMessage[key] = payload[key];
      }
    });
  }

  return new Promise(function(resolve, reject) {
    MAILACTOR.send({
      type: MESSAGETYPES.SEND,
      recipient: recipient,
      message: flatMessage,
      resolve: resolve,
      reject: reject
    });
  });
}

// requestUnreadMessages(recipient) – poll Mail Actor for unread envelopes.
function requestUnreadMessages(recipient) {
  return new Promise(function(resolve, reject) {
    MAILACTOR.send({
      type: MESSAGETYPES.POLL,
      recipient: recipient,
      resolve: resolve,
      reject: reject
    });
  });
}

// sendResponse(recipient, tag, result, sender)
// Sends a response message: { type:'response', sender, tag, payload:{ result } }
function sendResponse(recipient, tag, result, sender) {
  return sendInstruction(recipient, 'response', { result: result }, tag, sender);
}

// awaitResponse(recipient, tag, timeout) – caller polls until response with matching tag arrives.
// ES5: promise chain + setTimeout recursion instead of async/await while-loop.
function awaitResponse(recipient, tag, timeout) {
  if (timeout === undefined) timeout = 30000;
  var start = Date.now();

  function attempt(resolve, reject) {
    requestUnreadMessages(recipient).then(function(envelopes) {
      var found = envelopes.filter(function(env) {
        return env.tag === tag && env.payload && env.payload.type === 'response';
      }).reduce(function(acc, env) {
        return acc !== null ? acc : (env.payload.payload ? env.payload.payload.result : env.payload.result);
      }, null);
      if (found !== null) {
        resolve(found);
        return;
      }
      if (Date.now() - start >= timeout) {
        reject(new Error('[awaitResponse] timeout waiting for tag: ' + tag));
        return;
      }
      setTimeout(function() { attempt(resolve, reject); }, 25);
    }).catch(function(err) {
      reject(err);
    });
  }

  return new Promise(function(resolve, reject) {
    attempt(resolve, reject);
  });
}
