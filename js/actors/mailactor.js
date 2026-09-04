var MAILVERBOSITYCONSTANTS = createVerbosityConstants();
var MAILSTATE = Object.freeze({ level: MAILVERBOSITYCONSTANTS.DEBUG });

// Global registries
var ACTORCONSUMERS = {};          // key: actorName + ':' + messageType -> behavior function
var RESPONSECONSUMERS = {};       // key: responseType -> function(result, tag)
var EXPECTATIONS = {};            // key: tag -> structured expectation object
var MAILBOX = [];                 // all messages, request and response

var EXPECTATION_TIMEOUT = 20000;  // 30 seconds default
var POLL_INTERVAL = 150;           // milliseconds between mailbox polls
var MAILBOX_RESPONSE_TYPE = 'mailbox_response'; // generic fallback for missing response type

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
      read: 'UNREAD',          // explicit initial read status
      timestamp: Date.now(),
      payload: flatMessage
    };
    mailSlice.queues[recipient].push(envelope);
    MAILBOX.push(envelope); // store in mailbox

    // DIRECT DISPATCH REMOVED – no consumer invocation here.
    // All delivery is through MAILBOX and queryMailbox/waitForMailbox.

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
        error: null,
        read: 'UNREAD'
      };
      EXPECTATIONS[flatMessage.tag] = expectation;
      MAILBOX.push(expectation); // store expectation in mailbox too

      // Schedule timeout (does NOT delete expectation; just marks it TIMEOUT)
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
          // Do not delete; keep in mailbox with TIMEOUT status.
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

  // Response handling block REMOVED – messages are homogeneous.
  // No special handling for tagged responses; they are already in MAILBOX.

  return env;
}

// Mailbox API: query and wait for messages/expectations
function getMailbox() {
  return MAILBOX.slice();
}

// queryMailbox returns only unread messages by default.
// Extended to support filter.matches (function) and filter.props (object).
function queryMailbox(filter) {
  if (!filter) filter = {};
  return MAILBOX.filter(function(item) {
    var matches = true;
    if (filter.recipient !== undefined && item.recipient !== filter.recipient) matches = false;
    if (filter.sender !== undefined && item.sender !== filter.sender) matches = false;
    if (filter.tag !== undefined && item.tag !== filter.tag) matches = false;
    if (filter.date !== undefined && item.timestamp !== filter.date) matches = false;
    if (filter.type !== undefined && item.type !== filter.type) matches = false;
    if (filter.status !== undefined && item.status !== filter.status) matches = false;
    // Read filter: default to unread only, using string statuses
    if (filter.read !== undefined) {
      if (item.read !== filter.read) matches = false;
    } else if (item.read === 'READ') {
      matches = false;  // only return UNREAD by default
    }
    // Extended: custom matches function
    if (filter.matches && typeof filter.matches === 'function') {
      if (!filter.matches(item)) matches = false;
    }
    // Extended: property bag filter (checked on envelope and payload)
    if (filter.props && typeof filter.props === 'object') {
      Object.keys(filter.props).forEach(function(key) {
        var expected = filter.props[key];
        var actual = item[key] !== undefined ? item[key] : (item.payload && item.payload[key]);
        if (actual !== expected) matches = false;
      });
    }
    return matches;
  }).map(function(item) {
    // Mark as READ when query returns the item
    if (item && item.read !== 'READ') {
      item.read = 'READ';
      // Also update the original in MAILBOX (it's the same reference)
    }
    return item;
  });
}

// Unified wait: polls using POLL_INTERVAL, marks message as read on delivery.
function waitForMailbox(filter, timeout) {
  if (timeout === undefined) timeout = EXPECTATION_TIMEOUT;
  return new Promise(function(resolve, reject) {
    var found = queryMailbox(filter);
    if (found.length > 0) {
      found[0].read = 'READ';   // ensure read status
      resolve(found[0]);
      return;
    }
    var checkInterval = setInterval(function() {
      var result = queryMailbox(filter);
      if (result.length > 0) {
        clearInterval(checkInterval);
        result[0].read = 'READ';
        resolve(result[0]);
      }
    }, POLL_INTERVAL);
    setTimeout(function() {
      clearInterval(checkInterval);
      // Final check before rejecting (race mitigation)
      var late = queryMailbox(filter);
      if (late.length > 0) {
        late[0].read = 'READ';
        resolve(late[0]);
      } else {
        reject(new Error('Mailbox wait timeout for filter: ' + JSON.stringify(filter)));
      }
    }, timeout);
  });
}

function generateTag() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// Fire-and-forget sendInstruction: accepts optional context.
// Validates actor messages against registry interfaces (P8).
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

  // Validate only if recipient is a registered actor
  if (MESSAGEREGISTRY && typeof MESSAGEREGISTRY.getInterfaces === 'function') {
    var ifaces = MESSAGEREGISTRY.getInterfaces(recipient);
    if (ifaces && Object.keys(ifaces).length > 0) {
      var validation = MESSAGEREGISTRY.validate(recipient, flatMessage);
      if (!validation.valid) {
        throw new Error('[MAILACTOR] Message validation failed for ' + recipient + ': ' + validation.error);
      }
    }
  }

  dispatchToActor('mailactor', mailbehavior, {
    type: MESSAGETYPES.SEND,
    recipient: recipient,
    message: flatMessage
  });
}

// sendResponse sends a response message.
// P20: responseType is now required. If omitted, fallback to generic mailbox type.
function sendResponse(recipient, tag, result, sender, responseType) {
  if (responseType === undefined) {
    logwarn(MAILSTATE, '[MAILACTOR]', 'sendResponse missing responseType for tag:', tag);
    responseType = MAILBOX_RESPONSE_TYPE;
  }
  var type = responseType || MESSAGETYPES.RESPONSE;
  var payload = { result: result };
  sendInstruction(recipient, type, payload, tag, sender, undefined, null);
}

function startMailActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
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
