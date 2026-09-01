// ============================================================
// UPDATED FILE: js/actors/mailactor.js
// Change applied: IMMUTABLE DISPATCH REFACTOR
//   - mailbehavior now returns env after processing SEND/ACK.
//   - No actor object construction; no polling; no registration.
//   - Uses dispatchToActor wrapper for state management.
//   - ACTORCONSUMERS, RESPONSECONSUMERS, EXPECTATIONS remain global.
// ============================================================

var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> behavior function
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> { responseType: string }

// Pure behavior for SEND and ACK messages.
// Returns env (or Promise<env>), never a non-env value.
function mailbehavior(env, message) {
  logdebug(env, '[MAILACTOR]', 'behavior handling action:', message.type);

  // Ensure mail slice exists if needed (optional audit)
  var mailSlice = ensureEnvSlice(env, 'mail', function() { return { queues: {}, nextId: 1 }; });

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
      // dispatchToActor will get current env, call consumer(env, flatMessage),
      // and store returned env.
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

// No registration of mailactor state; worldmapactor owns ENV.
// Dispatch uses dispatchToActor('mailactor', mailbehavior, message).

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
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('mailactor', mailbehavior, message); }
  };
}
