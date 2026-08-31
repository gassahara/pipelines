// ============================================================
// UPDATED FILE: js/actors/mailactor.js
// Change applied: DIRECT DISPATCH REFACTOR
// - No polling, no POLL message type
// - Global consumer registries (ACTORCONSUMERS, RESPONSECONSUMERS)
// - sendInstruction fire-and-forget with responseSpec
// - sendResponse triggers response consumer via mail actor
// - persist before/after state-changing actions
// ============================================================

var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {}; // key: actorName + ':' + messageType -> function(message)
var RESPONSECONSUMERS = {}; // key: responseType -> function(response, tag)
var EXPECTATIONS = {}; // key: tag -> { responseType: string }

var mailactorINTERFACES = {};
mailactorINTERFACES[MESSAGETYPES.SEND] = {
  recipient: 'string',
  message: 'object'
};
mailactorINTERFACES[MESSAGETYPES.ACK] = {
  recipient: 'string',
  ids: 'array'
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
    // Pre-action persist
    persistMailState(state);

    var recipient = message.recipient;
    if (!recipient || typeof recipient !== 'string') {
      if (typeof message.reject === 'function') message.reject(new Error('[MAILACTOR] recipient required'));
      return state;
    }
    if (!state.queues[recipient]) state.queues[recipient] = [];
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
    // Post-action persist
    persistMailState(state);

    // DIRECT DISPATCH: invoke consumer for recipient and message type
    var flatMessage = message.message;
    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      // Call asynchronously to avoid blocking mail actor
      setTimeout(function() { consumer(flatMessage); }, 0);
    }

    // Store expectation if responseSpec present
    if (flatMessage.responseSpec && flatMessage.tag) {
      EXPECTATIONS[flatMessage.tag] = flatMessage.responseSpec;
    }

    return state;
  }

  if (message.type === MESSAGETYPES.ACK) {
    // Pre-action persist
    persistMailState(state);

    var ackRecipient = message.recipient;
    var ackIds = message.ids || [];
    var ackQueue = state.queues[ackRecipient] || [];
    ackQueue.forEach(function(m) {
      if (ackIds.indexOf(m.id) !== -1) m.unread = false;
    });
    // Post-action persist
    persistMailState(state);
    return state;
  }

  // Response message handling (type 'response')
  if (flatMessage && flatMessage.type === 'response') {
    var tag = flatMessage.tag;
    if (tag && EXPECTATIONS[tag]) {
      var expectation = EXPECTATIONS[tag];
      var responseConsumer = RESPONSECONSUMERS[expectation.responseType];
      if (responseConsumer) {
        // Invoke response consumer asynchronously
        setTimeout(function() { responseConsumer(flatMessage.result, tag); }, 0);
      }
      delete EXPECTATIONS[tag];
    }
  }

  return state;
};

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
    mailboxType: 'memory',
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

function generateTag() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// Fire-and-forget sendInstruction
function sendInstruction(recipient, type, payload, tag, sender, responseSpec) {
  if (tag === undefined) tag = generateTag();
  if (sender === undefined) sender = 'system';

  var flatMessage = { type: type, sender: sender, tag: tag };
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(function(key) {
      if (key !== 'type' && key !== 'sender' && key !== 'tag' && key !== 'responseSpec') {
        flatMessage[key] = payload[key];
      }
    });
  }
  if (responseSpec) flatMessage.responseSpec = responseSpec;

  MAILACTOR.send({
    type: MESSAGETYPES.SEND,
    recipient: recipient,
    message: flatMessage
  });
}

// sendResponse sends a response message; mail actor activates response consumer
function sendResponse(recipient, tag, result, sender) {
  sendInstruction(recipient, 'response', { result: result }, tag, sender);
}
