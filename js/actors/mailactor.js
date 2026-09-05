var MAILVERBOSITYCONSTANTS = createVerbosityConstants();
var MAILSTATE = Object.freeze({ level: MAILVERBOSITYCONSTANTS.DEBUG });

// Global registries
var ACTORCONSUMERS = {};
var EXPECTATIONS = {};
var MAILBOX = [];

var EXPECTATION_TIMEOUT = 20000;
var POLL_INTERVAL = 150;
var MAILBOX_RESPONSE_TYPE = 'mailbox_response';

function MAILBEHAVIOR(env, message) {
  logdebug(env, '[MAILACTOR]', 'behavior handling action:', message.type);

  var mailSlice = ENSUREENVSLICE(env, 'mail', function() { return { queues: {}, nextId: 1 }; });

  if (message.type === MESSAGETYPES.SEND) {
    var recipient = message.recipient;
    if (!recipient || typeof recipient !== 'string') {
      return env;
    }
    if (!mailSlice.queues[recipient]) mailSlice.queues[recipient] = [];
    var flatMessage = message.message;

    logdebug(env, '[MAILACTOR]', 'SEND start:', 'recipient=', recipient, 'type=', flatMessage.type, 'tag=', flatMessage.tag, 'sender=', flatMessage.sender);

    var envelope = {
      id: 'mail_' + (mailSlice.nextId++),
      recipient: recipient,
      sender: (flatMessage && flatMessage.sender) || 'system',
      tag: (flatMessage && flatMessage.tag) || null,
      unread: true,
      read: 'UNREAD',
      timestamp: Date.now(),
      payload: flatMessage
    };

    logdebug(env, '[MAILACTOR]', 'Envelope created:', envelope.id, 'read=', envelope.read, 'tag=', envelope.tag, 'sender=', envelope.sender);

    mailSlice.queues[recipient].push(envelope);
    MAILBOX.push(envelope);

    logdebug(env, '[MAILACTOR]', 'Envelope pushed to MAILBOX:', envelope.id, 'MAILBOX length=', MAILBOX.length);

    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      logdebug(env, '[MAILACTOR]', 'Dispatching to actor:', recipient, 'type=', flatMessage.type, 'tag=', flatMessage.tag);
      DISPATCHTOACTOR(recipient, consumer, flatMessage);
      envelope.read = 'READ';
      logdebug(env, '[MAILACTOR]', 'Envelope marked READ after dispatch:', envelope.id, 'tag=', envelope.tag);
    } else {
      logdebug(env, '[MAILACTOR]', 'No consumer registered for:', consumerKey);
    }

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
      MAILBOX.push(expectation);
      logdebug(env, '[MAILACTOR]', 'Expectation created:', flatMessage.tag, 'status=', expectation.status, 'read=', expectation.read);

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

  return env;
}

function getMailbox() {
  return MAILBOX.slice();
}

function QUERYMAILBOX(filter) {
  if (!filter) filter = {};
  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox filter:', JSON.stringify(filter));

  var matched = MAILBOX.filter(function(item) {
    var matches = true;
    if (filter.recipient !== undefined && item.recipient !== filter.recipient) matches = false;
    if (filter.sender !== undefined && item.sender !== filter.sender) matches = false;
    if (filter.tag !== undefined && item.tag !== filter.tag) matches = false;
    if (filter.date !== undefined && item.timestamp !== filter.date) matches = false;
    if (filter.type !== undefined && item.type !== filter.type) matches = false;
    if (filter.status !== undefined && item.status !== filter.status) matches = false;
    if (filter.read !== undefined) {
      if (item.read !== filter.read) matches = false;
    } else if (item.read === 'READ') {
      matches = false;
    }
    if (filter.matches && typeof filter.matches === 'function') {
      if (!filter.matches(item)) matches = false;
    }
    if (filter.props && typeof filter.props === 'object') {
      Object.keys(filter.props).forEach(function(key) {
        var expected = filter.props[key];
        var actual = item[key] !== undefined ? item[key] : (item.payload && item.payload[key]);
        if (actual !== expected) matches = false;
      });
    }
    return matches;
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox raw matches:', matched.length);

  var result = matched.map(function(item) {
    if (item && item.read !== 'READ') {
      item.read = 'READ';
      logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox marking READ:', item.id, 'tag=', item.tag);
    }
    return item;
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox returning', result.length, 'items');
  return result;
}

function WAITFORMAILBOX(filter, timeout) {
  if (timeout === undefined) timeout = EXPECTATION_TIMEOUT;
  return new Promise(function(resolve, reject) {
    var found = QUERYMAILBOX(filter);
    if (found.length > 0) {
      found[0].read = 'READ';
      resolve(found[0]);
      return;
    }
    var checkInterval = setInterval(function() {
      var result = QUERYMAILBOX(filter);
      if (result.length > 0) {
        clearInterval(checkInterval);
        result[0].read = 'READ';
        resolve(result[0]);
      }
    }, POLL_INTERVAL);
    setTimeout(function() {
      clearInterval(checkInterval);
      var late = QUERYMAILBOX(filter);
      if (late.length > 0) {
        late[0].read = 'READ';
        resolve(late[0]);
      } else {
        reject(new Error('Mailbox wait timeout for filter: ' + JSON.stringify(filter)));
      }
    }, timeout);
  });
}

function GENERATETAG() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function SENDINSTRUCTION(recipient, type, payload, tag, sender, responseSpec, context) {
  if (tag === undefined) tag = GENERATETAG();
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

  if (MESSAGEREGISTRY && typeof MESSAGEREGISTRY.getInterfaces === 'function') {
    var ifaces = MESSAGEREGISTRY.getInterfaces(recipient);
    if (ifaces && Object.keys(ifaces).length > 0) {
      var validation = MESSAGEREGISTRY.validate(recipient, flatMessage);
      if (!validation.valid) {
        throw new Error('[MAILACTOR] Message validation failed for ' + recipient + ': ' + validation.error);
      }
    }
  }

  DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, {
    type: MESSAGETYPES.SEND,
    recipient: recipient,
    message: flatMessage
  });
}

function SENDRESPONSE(recipient, tag, result, sender, responseType) {
  if (responseType === undefined) {
    logwarn(MAILSTATE, '[MAILACTOR]', 'sendResponse missing responseType for tag:', tag);
    responseType = MAILBOX_RESPONSE_TYPE;
  }
  var type = responseType || MESSAGETYPES.RESPONSE;
  var payload = { result: result };
  SENDINSTRUCTION(recipient, type, payload, tag, sender, undefined, null);
}

function STARTMAILACTOR(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    dispatch: function(message) { return DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, message); }
  };
}
