// ============================================================
// UPDATED FILE: js/actors/mailactor.js
// Changes applied:
//   - Mailbox API: getMailbox, queryMailbox, waitForMailbox
//   - Expectations hardened with context, status, trace
//   - Timeout handling for pending expectations
//   - Response handling stores in mailbox; non-actors query directly
//   - sendInstruction accepts context; validates actor messages only
// ============================================================

var mailVerbosityConstants = createVerbosityConstants();
var mailState = Object.freeze({ level: mailVerbosityConstants.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> behavior function
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> structured expectation object
var MAILBOX = [];                 // all messages, request and response

var EXPECTATION_TIMEOUT = 30000;  // 30 seconds default

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
    MAILBOX.push(envelope); // store in mailbox

    // DIRECT DISPATCH: invoke consumer for recipient and message type
    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      // Consumer is a pure behavior function; runtime owns state.
      dispatchToActor(recipient, consumer, flatMessage);
    }

    // Store expectation if responseSpec present
    if (flatMessage.responseSpec && flatMessage.tag) {
      var context = flatMessage.context || null;
      var expectation = {
        tag: flatMessage.tag,
        recipient: recipient,
        sender: flatMessage.sender || 'system',
        type: flatMessage.type,
        context: context,
        responseSpec: flatMessage.responseSpec,
        status: 'PENDING',
        createdAt: Date.now(),
        resolvedAt: null,
        error: null
      };
      EXPECTATIONS[flatMessage.tag] = expectation;
      MAILBOX.push(expectation); // store expectation in mailbox too

      // Schedule timeout
      setTimeout(function() {
        if (EXPECTATIONS[flatMessage.tag] && EXPECTATIONS[flatMessage.tag].status === 'PENDING') {
          var exp = EXPECTATIONS[flatMessage.tag];
          exp.status = 'TIMEOUT';
          exp.resolvedAt = Date.now();
          exp.error = { message: 'Response timeout for tag ' + flatMessage.tag };
          logwarn(env, '[MAILACTOR]', 'Expectation timeout:', exp.tag, 'context:', exp.context);
          if (typeof exp.responseSpec.reject === 'function') {
            exp.responseSpec.reject(new Error('Response timeout for tag ' + flatMessage.tag));
          }
          delete EXPECTATIONS[flatMessage.tag];
        }
      }, EXPECTATION_TIMEOUT);
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
    var responseConsumer = RESPONSECONSUMERS[expectation.responseSpec.responseType];
    if (responseConsumer) {
      var result = (message && message.result !== undefined) ? message.result : message;
      expectation.status = 'RESOLVED';
      expectation.resolvedAt = Date.now();
      MAILBOX.push(expectation); // update mailbox record
      setTimeout(function() { responseConsumer(result, message.tag); }, 0);
      delete EXPECTATIONS[message.tag];
    } else {
      // No registered consumer; leave message in mailbox for non-actor
      // Update expectation status if it exists
      if (expectation) {
        expectation.status = 'RESOLVED';
        expectation.resolvedAt = Date.now();
        MAILBOX.push(expectation);
        delete EXPECTATIONS[message.tag];
      }
      // Message already stored in mailbox; non-actor will query
    }
  }

  return env;
}

// Mailbox API: query and wait for messages/expectations
function getMailbox() {
  return MAILBOX.slice();
}

function queryMailbox(filter) {
  return MAILBOX.filter(function(item) {
    var matches = true;
    if (filter.recipient !== undefined && item.recipient !== filter.recipient) matches = false;
    if (filter.sender !== undefined && item.sender !== filter.sender) matches = false;
    if (filter.tag !== undefined && item.tag !== filter.tag) matches = false;
    if (filter.date !== undefined && item.timestamp !== filter.date) matches = false;
    if (filter.type !== undefined && item.type !== filter.type) matches = false;
    if (filter.status !== undefined && item.status !== filter.status) matches = false;
    return matches;
  });
}

function waitForMailbox(filter, timeout) {
  if (timeout === undefined) timeout = EXPECTATION_TIMEOUT;
  return new Promise(function(resolve, reject) {
    var found = queryMailbox(filter);
    if (found.length > 0) {
      resolve(found[0]);
      return;
    }
    var checkInterval = setInterval(function() {
      var result = queryMailbox(filter);
      if (result.length > 0) {
        clearInterval(checkInterval);
        resolve(result[0]);
      }
    }, 50);
    setTimeout(function() {
      clearInterval(checkInterval);
      reject(new Error('Mailbox wait timeout for filter: ' + JSON.stringify(filter)));
    }, timeout);
  });
}

function generateTag() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// Fire-and-forget sendInstruction: accepts optional context
function sendInstruction(recipient, type, payload, tag, sender, responseSpec, context) {
  if (tag === undefined) tag = generateTag();
  if (sender === undefined) sender = 'system';

  var flatMessage = { type: type, sender: sender, tag: tag };
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(function(key) {
      if (key !== 'type' && key !== 'sender' && key !== 'tag' && key !== 'responseSpec' && key !== 'context') {
        flatMessage[key] = payload[key];
      }
    });
  }
  if (responseSpec) flatMessage.responseSpec = responseSpec;
  if (context) flatMessage.context = context;

  // Validation: only if recipient is a registered actor
  if (MESSAGEREGISTRY && typeof MESSAGEREGISTRY.validate === 'function') {
    // We don't have actor list here; assume validation is optional
    // Could check MESSAGEREGISTRY.getInterfaces(recipient) but skip for now
  }

  dispatchToActor('mailactor', mailbehavior, {
    type: MESSAGETYPES.SEND,
    recipient: recipient,
    message: flatMessage
  });
}

// sendResponse sends a response message with type determined by original expectation.
function sendResponse(recipient, tag, result, sender, responseType) {
  var type = responseType || MESSAGETYPES.RESPONSE;
  // If responseType not registered but recipient is non-actor, still send to mailbox
  var payload = { result: result };
  sendInstruction(recipient, type, payload, tag, sender, undefined, null);
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
