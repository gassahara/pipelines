// ============================================================
// UPDATED FILE: js/actors/mailactor.js
// Change applied: FINAL SWEEP
//   - Removed local MESSAGEREGISTRY.register loop
//   - createactor receives mailactorINTERFACES directly
//   - No polling; no POLL message type
//   - Global consumer registries (ACTORCONSUMERS, RESPONSECONSUMERS, EXPECTATIONS)
//   - sendInstruction fire-and-forget with responseSpec
//   - sendResponse sends response message with type from responseSpec
//   - Response matching by tag and expectation.responseType
//   - Persist before/after state-changing actions
// ============================================================


var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> function(message)
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> { responseType: string }

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
      return state;
    }
    if (!state.queues[recipient]) state.queues[recipient] = [];
    var flatMessage = message.message;
    var envelope = {
      id: 'mail_' + (state.nextId++),
      recipient: recipient,
      sender: (flatMessage && flatMessage.sender) || 'system',
      tag: (flatMessage && flatMessage.tag) || null,
      unread: true,
      timestamp: Date.now(),
      payload: flatMessage
    };
    state.queues[recipient].push(envelope);
    // Post-action persist
    persistMailState(state);

    // DIRECT DISPATCH: invoke consumer for recipient and message type
    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
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

  // Response handling: for any message with a tag that has an expectation
  // (this branch is reached when a message is sent via sendInstruction and
  //  has type that is not SEND/ACK, e.g., a response message from an actor)
  if (message && message.tag && EXPECTATIONS[message.tag]) {
    var expectation = EXPECTATIONS[message.tag];
    var responseConsumer = RESPONSECONSUMERS[expectation.responseType];
    if (responseConsumer) {
      var result = (message && message.result !== undefined) ? message.result : message;
      setTimeout(function() { responseConsumer(result, message.tag); }, 0);
    }
    delete EXPECTATIONS[message.tag];
  }

  return state;
};

var initialMailState = createInitialMailState();

// NOTE: No MESSAGEREGISTRY.register here. Centralized in registerconsumers.js.

var MAILACTOR = createactor(
  mailbehavior,
  initialMailState,
  mailactorINTERFACES,
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

// sendResponse sends a response message with type determined by the original expectation.
function sendResponse(recipient, tag, result, sender, responseType) {
  var type = responseType || MESSAGETYPES.RESPONSE;
  sendInstruction(recipient, type, { result: result }, tag, sender);
}
