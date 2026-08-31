// ============================================================
// UPDATED FILE: js/mailactor.js
// Change applied: PURE FUNCTION RUNTIME INTEGRATION
//   - Removes actor object construction; no MAILACTOR instance.
//   - Mail behavior is a pure function used by runtime.
//   - sendInstruction uses runtime dispatch to mailbehavior.
//   - Global registries (ACTORCONSUMERS, RESPONSECONSUMERS, EXPECTATIONS).
// ============================================================

var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> behavior function
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> { responseType: string }

function createInitialMailState() {
  return {
    queues: {},        // recipient -> array of envelopes
    nextId: 1
  };
}

// Pure behavior for SEND and ACK messages, used by the runtime.
function mailbehavior(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : mailVerbosityConstants.DEBUG;
  mailState = Object.freeze({ level: v });

  logdebug(mailState, '[MAILACTOR]', 'behavior handling action:', message.type);

  if (!state.queues) state.queues = {};
  if (!state.nextId) state.nextId = 1;

  if (message.type === MESSAGETYPES.SEND) {
    // Pre-action persist (optional; could call DB actor later)
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

    // DIRECT DISPATCH: invoke consumer for recipient and message type
    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      // Consumer is a pure behavior function; runtime owns state.
      // Use dispatchToActor for proper state management.
      dispatchToActor(recipient, consumer, flatMessage);
    }

    // Store expectation if responseSpec present
    if (flatMessage.responseSpec && flatMessage.tag) {
      EXPECTATIONS[flatMessage.tag] = flatMessage.responseSpec;
    }

    return state;
  }

  if (message.type === MESSAGETYPES.ACK) {
    var ackRecipient = message.recipient;
    var ackIds = message.ids || [];
    var ackQueue = state.queues[ackRecipient] || [];
    ackQueue.forEach(function(m) {
      if (ackIds.indexOf(m.id) !== -1) m.unread = false;
    });
    return state;
  }

  // Response handling: for any message with a tag that has an expectation
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
}

// Register initial mail state in runtime.
registerActorState('mailactor', createInitialMailState());

function generateTag() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// Fire-and-forget sendInstruction: dispatches SEND to mailbehavior via runtime.
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

  // Dispatch SEND message to mailbehavior (pure function, state owned by runtime).
  dispatchToActor('mailactor', mailbehavior, {
    type: MESSAGETYPES.SEND,
    recipient: recipient,
    message: flatMessage
  });
}

// sendResponse sends a response message with type determined by original expectation.
function sendResponse(recipient, tag, result, sender, responseType) {
  var type = responseType || MESSAGETYPES.RESPONSE;
  sendInstruction(recipient, type, { result: result }, tag, sender);
}

function startMailActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      mailState = Object.freeze({ level: lvl });
      var mailStateObj = getActorState('mailactor');
      if (mailStateObj) mailStateObj.verbosity = lvl;
    }
  }
  // Return a minimal handle for compatibility.
  return {
    getstate: function() { return getActorState('mailactor'); },
    dispatch: function(message) { return dispatchToActor('mailactor', mailbehavior, message); }
  };
}
