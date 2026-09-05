var MAILVERBOSITYCONSTANTS = createVerbosityConstants();
var MAILSTATE = Object.freeze({ level: MAILVERBOSITYCONSTANTS.DEBUG });

// Global registries
var ACTORCONSUMERS = {};
var EXPECTATIONS = {};
var MAILBOX = [];

// Index maps for efficient lookup
var indexByTag = {};
var indexBySender = {};
var indexByType = {};

var EXPECTATION_TIMEOUT = 20000;
var POLL_INTERVAL = 150;
var MAILBOX_RESPONSE_TYPE = 'mailbox_response';

function addEnvelopeToMailbox(envelope) {
  MAILBOX.push(envelope);
  if (envelope.tag) {
    if (!indexByTag[envelope.tag]) indexByTag[envelope.tag] = [];
    indexByTag[envelope.tag].push(envelope);
  }
  if (envelope.sender) {
    if (!indexBySender[envelope.sender]) indexBySender[envelope.sender] = [];
    indexBySender[envelope.sender].push(envelope);
  }
  if (envelope.payload && envelope.payload.type) {
    if (!indexByType[envelope.payload.type]) indexByType[envelope.payload.type] = [];
    indexByType[envelope.payload.type].push(envelope);
  }
}

function removeEnvelopeFromMailbox(envelope) {
  var idx = MAILBOX.indexOf(envelope);
  if (idx !== -1) MAILBOX.splice(idx, 1);
  if (envelope.tag && indexByTag[envelope.tag]) {
    indexByTag[envelope.tag] = indexByTag[envelope.tag].filter(function(e) { return e !== envelope; });
    if (indexByTag[envelope.tag].length === 0) delete indexByTag[envelope.tag];
  }
  if (envelope.sender && indexBySender[envelope.sender]) {
    indexBySender[envelope.sender] = indexBySender[envelope.sender].filter(function(e) { return e !== envelope; });
    if (indexBySender[envelope.sender].length === 0) delete indexBySender[envelope.sender];
  }
  if (envelope.payload && envelope.payload.type && indexByType[envelope.payload.type]) {
    indexByType[envelope.payload.type] = indexByType[envelope.payload.type].filter(function(e) { return e !== envelope; });
    if (indexByType[envelope.payload.type].length === 0) delete indexByType[envelope.payload.type];
  }
}

function createExpectation(tag, recipient, sender, type, context, responseSpec) {
  var expectation = {
    tag: tag,
    recipient: recipient,
    sender: sender || 'system',
    type: type,
    context: context,
    responseSpec: responseSpec,
    status: 'PENDING',
    createdAt: Date.now(),
    resolvedAt: null,
    error: null,
    read: 'UNREAD'
  };
  EXPECTATIONS[tag] = expectation;
  MAILBOX.push(expectation);

  setTimeout(function() {
    if (EXPECTATIONS[tag] && EXPECTATIONS[tag].status === 'PENDING') {
      rejectExpectation(tag, { message: 'Response timeout for tag ' + tag });
    }
  }, EXPECTATION_TIMEOUT);

  return expectation;
}

function resolveExpectation(tag) {
  if (EXPECTATIONS[tag]) {
    var exp = EXPECTATIONS[tag];
    exp.status = 'RESOLVED';
    exp.resolvedAt = Date.now();
    exp.read = 'READ';
    delete EXPECTATIONS[tag];

    if (indexByTag[tag]) {
      indexByTag[tag].slice().forEach(function(env) {
        if (env.tag === tag) removeEnvelopeFromMailbox(env);
      });
    }

    var expIdx = MAILBOX.findIndex(function(item) { return item.tag === tag && item.read === 'UNREAD' && item.status === 'RESOLVED'; });
    if (expIdx !== -1) MAILBOX.splice(expIdx, 1);
  }
}

function rejectExpectation(tag, error) {
  if (EXPECTATIONS[tag]) {
    var exp = EXPECTATIONS[tag];
    exp.status = 'TIMEOUT';
    exp.resolvedAt = Date.now();
    exp.error = error;
    exp.read = 'READ';
    if (exp.responseSpec && typeof exp.responseSpec.reject === 'function') {
      exp.responseSpec.reject(new Error(error && error.message ? error.message : 'Expectation rejected'));
    }
    delete EXPECTATIONS[tag];

    if (indexByTag[tag]) {
      indexByTag[tag].slice().forEach(function(env) {
        if (env.tag === tag) removeEnvelopeFromMailbox(env);
      });
    }

    var expIdx = MAILBOX.findIndex(function(item) { return item.tag === tag && item.read === 'UNREAD' && item.status === 'TIMEOUT'; });
    if (expIdx !== -1) MAILBOX.splice(expIdx, 1);
  }
}

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

    addEnvelopeToMailbox(envelope);

    var consumerKey = recipient + ':' + flatMessage.type;
    var consumer = ACTORCONSUMERS[consumerKey];
    if (consumer) {
      logdebug(env, '[MAILACTOR]', 'Dispatching to actor:', recipient, 'type=', flatMessage.type, 'tag=', flatMessage.tag);
      DISPATCHTOACTOR(recipient, consumer, flatMessage);
      envelope.read = 'READ';
    } else {
      logdebug(env, '[MAILACTOR]', 'No consumer registered for:', consumerKey);
    }

    if (flatMessage.responseSpec && flatMessage.tag) {
      createExpectation(
        flatMessage.tag,
        recipient,
        flatMessage.sender || 'system',
        flatMessage.type,
        flatMessage.context || null,
        flatMessage.responseSpec
      );
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

  if (filter.type !== undefined) {
    var allowedTypes = (typeof MAILBOX_FILTER_TYPES !== 'undefined' && MAILBOX_FILTER_TYPES)
      ? Object.keys(MAILBOX_FILTER_TYPES).map(function(k) { return MAILBOX_FILTER_TYPES[k]; })
      : Object.keys(MESSAGETYPES).map(function(k) { return MESSAGETYPES[k]; });
    if (allowedTypes.indexOf(filter.type) === -1) {
      throw new Error('[QUERYMAILBOX] Invalid filter type: ' + filter.type);
    }
  }

  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox filter:', JSON.stringify(filter));

  var candidates = MAILBOX;
  if (filter.tag && indexByTag[filter.tag]) {
    candidates = indexByTag[filter.tag];
  } else if (filter.sender && indexBySender[filter.sender]) {
    candidates = indexBySender[filter.sender];
  } else if (filter.type && indexByType[filter.type]) {
    candidates = indexByType[filter.type];
  }

  var matched = candidates.filter(function(item) {
    var matches = true;
    if (filter.recipient !== undefined && item.recipient !== filter.recipient) matches = false;
    if (filter.sender !== undefined && item.sender !== filter.sender) matches = false;
    if (filter.tag !== undefined && item.tag !== filter.tag) matches = false;
    if (filter.date !== undefined && item.timestamp !== filter.date) matches = false;
    if (filter.type !== undefined) {
      var actualType = (item.payload && item.payload.type) ? item.payload.type : item.type;
      if (actualType !== filter.type) matches = false;
    }
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

  // P48: Deduplicate by tag before marking read/returning
  var seenTags = {};
  var deduped = matched.filter(function(item) {
    if (item.tag) {
      if (seenTags[item.tag]) return false;
      seenTags[item.tag] = true;
    }
    return true;
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox raw matches:', deduped.length);

  var result = deduped.map(function(item) {
    if (item && item.read !== 'READ') {
      item.read = 'READ';
      logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox marking READ:', item.id, 'tag=', item.tag);
    }
    return item;
  });

  // Resolve expectations for matched items
  result.forEach(function(item) {
    if (item && item.tag && EXPECTATIONS[item.tag] && item.read === 'READ') {
      resolveExpectation(item.tag);
    }
    if (item && item.read === 'READ' && !EXPECTATIONS[item.tag]) {
      setTimeout(function() { removeEnvelopeFromMailbox(item); }, 0);
    }
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'queryMailbox returning', result.length, 'items');
  return result;
}

function WAITFORMAILBOX(filter, timeout) {
  if (timeout === undefined) timeout = EXPECTATION_TIMEOUT;
  return new Promise(function(resolve, reject) {
    if (typeof blockCompilerState !== 'undefined' && blockCompilerState.activeCancellationToken && blockCompilerState.activeCancellationToken.cancelled) {
      reject(new Error('Cancelled'));
      return;
    }

    if (filter.tag && EXPECTATIONS[filter.tag] && EXPECTATIONS[filter.tag].status !== 'PENDING') {
      reject(new Error('Expectation already settled'));
      return;
    }

    var found = QUERYMAILBOX(filter);
    if (found.length > 0) {
      found[0].read = 'READ';
      resolve(found[0]);
      return;
    }

    var checkInterval = setInterval(function() {
      if (typeof blockCompilerState !== 'undefined' && blockCompilerState.activeCancellationToken && blockCompilerState.activeCancellationToken.cancelled) {
        clearInterval(checkInterval);
        reject(new Error('Cancelled'));
        return;
      }
      if (filter.tag && EXPECTATIONS[filter.tag] && EXPECTATIONS[filter.tag].status !== 'PENDING') {
        clearInterval(checkInterval);
        reject(new Error('Expectation already settled'));
        return;
      }
      var result = QUERYMAILBOX(filter);
      if (result.length > 0) {
        clearInterval(checkInterval);
        result[0].read = 'READ';
        resolve(result[0]);
      }
    }, POLL_INTERVAL);

    setTimeout(function() {
      clearInterval(checkInterval);
      if (typeof blockCompilerState !== 'undefined' && blockCompilerState.activeCancellationToken && blockCompilerState.activeCancellationToken.cancelled) {
        reject(new Error('Cancelled'));
        return;
      }
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
    throw new Error('[SENDRESPONSE] responseType is required');
  }
  var type = responseType;
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
