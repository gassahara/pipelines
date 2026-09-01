// ============================================================
// UPDATED FILE: js/mailactor.js
// Change applied: NO POLLING, PURE FUNCTION MAIL BEHAVIOR
//   - Removes actor object construction and polling loops.
//   - Mail behavior is a pure function used by the runtime.
//   - sendInstruction uses runtime dispatch to mailbehavior.
//   - Global registries (ACTORCONSUMERS, RESPONSECONSUMERS, EXPECTATIONS).
//   - sendResponse sends a response message with type from original
//     expectation (responseSpec.responseType).
// ============================================================

var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> behavior function
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> { responseType: string }

function createInitialMailState() {
  return {
    queues: {},        // recipient -> array of envelopes (may be unused in direct dispatch)
    nextId: 1
  };
}

// Pure behavior for SEND and ACK messages.
// In direct dispatch, queues are not used for polling; they remain for
// optional persistence or auditing.
function mailbehavior(env, message) {
  var v = env && env.verbosity !== undefined ? env.verbosity : mailVerbosityConstants.DEBUG;
  mailState = Object.freeze({ level: v });

  logdebug(env, '[MAILACTOR]', 'behavior handling action:', message.type);

  if (!env.mail) env.mail = createInitialMailState();
  var mailSlice = env.mail;

  if (message.type === MESSAGETYPES.SEND) {
    var recipient = message.recipient;
    if (!recipient || typeof recipient !== 'string') {
      return env;
    }
    if (!mailSlice.queues[recipient]) mailSlice.queues[recipient] = [];
    var flatMessage = message.message;
    var envelope = {
      id: 'mail_' + (mailSlice.nextId++),
      recipient: recipient,
      sender: (flatMessage && flatMessage.sender) || 'system',
      tag: (flatMessage && flatMessage.tag) || null,
      unread: true,
      timestamp: Date.now(),
      payload: flatMessage
    };
    mailSlice.queues[recipient].push(envelope);

    // DIRECT DISPATCH: invoke consumer for recipient and message type
    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      // Consumer is a pure behavior function; runtime owns state.
      // Use dispatchToActor, which passes the current ENV to the consumer.
      dispatchToActor(recipient, consumer, flatMessage);
    }

    // Store expectation if responseSpec present
    if (flatMessage.responseSpec && flatMessage.tag) {
      EXPECTATIONS[flatMessage.tag] = flatMessage.responseSpec;
    }

    return env;
  }

  if (message.type === MESSAGETYPES.ACK) {
    var ackRecipient = message.recipient;
    var ackIds = message.ids || [];
    var ackQueue = mailSlice.queues[ackRecipient] || [];
    ackQueue.forEach(function(m) {
      if (ackIds.indexOf(m.id) !== -1) m.unread = false;
    });
    return env;
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

  return env;
}

// Register initial state for mailactor within worldmapactor's ENV.
// This is done by the boot process or by worldmapactor initialization,
// not here, to avoid coupling. However, we provide a helper.
function initializeMailInEnv(env) {
  if (!env.mail) env.mail = createInitialMailState();
  return env;
}

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

  // Dispatch SEND message to mailbehavior (pure function, ENV owned by worldmapactor).
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
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('mailactor', mailbehavior, message); }
  };
}
