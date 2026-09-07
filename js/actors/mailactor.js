var MAILVERBOSITYCONSTANTS = createverbosityconstants();
var MAILSTATE = { level: MAILVERBOSITYCONSTANTS.DEBUG };

// Global registries
var ACTORCONSUMERS = {};
var EXPECTATIONS = {};
var MAILBOX = [];

// Index maps for efficient lookup
var INDEXBYTAG = {};
var INDEXBYSENDER = {};
var INDEXBYTYPE = {};

var EXPECTATIONTIMEOUT = 20000;
var POLLINTERVAL = 150;
var MAILBOXRESPONSETYPE = 'MAILBOXRESPONSE';

function ADDENVELOPETOMAILBOX(ENVELOPE) {
  MAILBOX.push(ENVELOPE);
  var TAG = ENVELOPE.TAG || ENVELOPE.tag;
  if (TAG) {
    if (!INDEXBYTAG[TAG]) INDEXBYTAG[TAG] = [];
    INDEXBYTAG[TAG].push(ENVELOPE);
  }
  var SENDER = ENVELOPE.SENDER || ENVELOPE.sender;
  if (SENDER) {
    if (!INDEXBYSENDER[SENDER]) INDEXBYSENDER[SENDER] = [];
    INDEXBYSENDER[SENDER].push(ENVELOPE);
  }
  var PAYLOAD = ENVELOPE.PAYLOAD || ENVELOPE.payload;
  var TYPE = PAYLOAD && (PAYLOAD.TYPE || PAYLOAD.type);
  if (TYPE) {
    if (!INDEXBYTYPE[TYPE]) INDEXBYTYPE[TYPE] = [];
    INDEXBYTYPE[TYPE].push(ENVELOPE);
  }
}

function REMOVEENVELOPEFROMMAILBOX(ENVELOPE) {
  var IDX = MAILBOX.indexOf(ENVELOPE);
  if (IDX !== -1) MAILBOX.splice(IDX, 1);
  var TAG = ENVELOPE.TAG || ENVELOPE.tag;
  if (TAG && INDEXBYTAG[TAG]) {
    INDEXBYTAG[TAG] = INDEXBYTAG[TAG].filter(function(E) { return E !== ENVELOPE; });
    if (INDEXBYTAG[TAG].length === 0) delete INDEXBYTAG[TAG];
  }
  var SENDER = ENVELOPE.SENDER || ENVELOPE.sender;
  if (SENDER && INDEXBYSENDER[SENDER]) {
    INDEXBYSENDER[SENDER] = INDEXBYSENDER[SENDER].filter(function(E) { return E !== ENVELOPE; });
    if (INDEXBYSENDER[SENDER].length === 0) delete INDEXBYSENDER[SENDER];
  }
  var PAYLOAD = ENVELOPE.PAYLOAD || ENVELOPE.payload;
  var TYPE = PAYLOAD && (PAYLOAD.TYPE || PAYLOAD.type);
  if (TYPE && INDEXBYTYPE[TYPE]) {
    INDEXBYTYPE[TYPE] = INDEXBYTYPE[TYPE].filter(function(E) { return E !== ENVELOPE; });
    if (INDEXBYTYPE[TYPE].length === 0) delete INDEXBYTYPE[TYPE];
  }
}

function CREATEEXPECTATION(TAG, RECIPIENT, SENDER, TYPE, CONTEXT, RESPONSESPEC) {
  var EXPECTATION = {
    TAG: TAG,
    RECIPIENT: RECIPIENT,
    SENDER: SENDER || 'system',
    TYPE: TYPE,
    CONTEXT: CONTEXT,
    RESPONSESPEC: RESPONSESPEC,
    STATUS: 'PENDING',
    CREATEDAT: Date.now(),
    RESOLVEDAT: null,
    ERROR: null,
    READ: 'UNREAD'
  };
  EXPECTATIONS[TAG] = EXPECTATION;
  MAILBOX.push(EXPECTATION);

  setTimeout(function() {
    if (EXPECTATIONS[TAG] && (EXPECTATIONS[TAG].STATUS === 'PENDING')) {
      REJECTEXPECTATION(TAG, { MESSAGE: 'Response timeout for tag ' + TAG });
    }
  }, EXPECTATIONTIMEOUT);

  return EXPECTATION;
}

function RESOLVEEXPECTATION(TAG) {
  if (EXPECTATIONS[TAG]) {
    var EXP = EXPECTATIONS[TAG];
    EXP.STATUS = 'RESOLVED';
    EXP.RESOLVEDAT = Date.now();
    EXP.READ = 'READ';
    delete EXPECTATIONS[TAG];

    if (INDEXBYTAG[TAG]) {
      INDEXBYTAG[TAG].slice().forEach(function(ENVLP) {
        if ((ENVLP.TAG || ENVLP.tag) === TAG) REMOVEENVELOPEFROMMAILBOX(ENVLP);
      });
    }

    var EXPIDX = MAILBOX.findIndex(function(ITEM) {
      return (ITEM.TAG || ITEM.tag) === TAG && (ITEM.READ === 'UNREAD') && (ITEM.STATUS === 'RESOLVED');
    });
    if (EXPIDX !== -1) MAILBOX.splice(EXPIDX, 1);
  }
}

function REJECTEXPECTATION(TAG, ERROR) {
  if (EXPECTATIONS[TAG]) {
    var EXP = EXPECTATIONS[TAG];
    EXP.STATUS = 'TIMEOUT';
    EXP.RESOLVEDAT = Date.now();
    EXP.ERROR = ERROR;
    EXP.READ = 'READ';
    var SPEC = EXP.RESPONSESPEC;
    if (SPEC && typeof SPEC.reject === 'function') {
      SPEC.reject(new Error(ERROR && ERROR.MESSAGE ? ERROR.MESSAGE : 'Expectation rejected'));
    }
    delete EXPECTATIONS[TAG];

    if (INDEXBYTAG[TAG]) {
      INDEXBYTAG[TAG].slice().forEach(function(ENVLP) {
        if ((ENVLP.TAG || ENVLP.tag) === TAG) REMOVEENVELOPEFROMMAILBOX(ENVLP);
      });
    }

    var EXPIDX = MAILBOX.findIndex(function(ITEM) {
      return (ITEM.TAG || ITEM.tag) === TAG && (ITEM.READ === 'UNREAD') && (ITEM.STATUS === 'TIMEOUT');
    });
    if (EXPIDX !== -1) MAILBOX.splice(EXPIDX, 1);
  }
}

function MAILBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE || MESSAGE.type);

  var MAILSLICE = ensureenvslice(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });

  var MSGTYPE = MESSAGE.TYPE || MESSAGE.type;
  if (MSGTYPE === MESSAGETYPES.SEND) {
    var RECIPIENT = MESSAGE.RECIPIENT || MESSAGE.recipient;
    if (!RECIPIENT || typeof RECIPIENT !== 'string') {
      return ENV;
    }
    if (!MAILSLICE.QUEUES[RECIPIENT]) MAILSLICE.QUEUES[RECIPIENT] = [];
    var FLATMESSAGE = MESSAGE.MESSAGE || MESSAGE.message;

    var FLATTYPE = FLATMESSAGE && (FLATMESSAGE.TYPE || FLATMESSAGE.type);
    var FLATTAG = FLATMESSAGE && (FLATMESSAGE.TAG || FLATMESSAGE.tag);
    var FLATSENDER = FLATMESSAGE && (FLATMESSAGE.SENDER || FLATMESSAGE.sender);

    logdebug(ENV, '[MAILACTOR]', 'SEND START:', 'RECIPIENT=', RECIPIENT, 'TYPE=', FLATTYPE, 'TAG=', FLATTAG, 'SENDER=', FLATSENDER);

    var ENVELOPE = {
      ID: 'MAIL' + (MAILSLICE.NEXTID++),
      RECIPIENT: RECIPIENT,
      SENDER: FLATSENDER || 'system',
      TAG: FLATTAG || null,
      UNREAD: true,
      READ: 'UNREAD',
      TIMESTAMP: Date.now(),
      PAYLOAD: FLATMESSAGE
    };

    ADDENVELOPETOMAILBOX(ENVELOPE);

    var CONSUMERKEY1 = RECIPIENT + ':' + FLATTYPE;
    var CONSUMERKEY2 = RECIPIENT + ':' + String(FLATTYPE).toLowerCase();
    var CONSUMERKEY3 = RECIPIENT + ':' + String(FLATTYPE).toUpperCase();
    var CONSUMER = ACTORCONSUMERS[CONSUMERKEY1] || ACTORCONSUMERS[CONSUMERKEY2] || ACTORCONSUMERS[CONSUMERKEY3];
    if (CONSUMER) {
      logdebug(ENV, '[MAILACTOR]', 'DISPATCHING TO ACTOR:', RECIPIENT, 'TYPE=', FLATTYPE, 'TAG=', FLATTAG);
      DISPATCHTOACTOR(RECIPIENT, CONSUMER, FLATMESSAGE);
      ENVELOPE.READ = 'READ';
    } else {
      logdebug(ENV, '[MAILACTOR]', 'NO CONSUMER REGISTERED FOR:', CONSUMERKEY1);
    }

    var RESPONSESPEC = FLATMESSAGE && (FLATMESSAGE.RESPONSESPEC || FLATMESSAGE.responseSpec);
    if (RESPONSESPEC && FLATTAG) {
      CREATEEXPECTATION(
        FLATTAG,
        RECIPIENT,
        FLATSENDER || 'system',
        FLATTYPE,
        (FLATMESSAGE && (FLATMESSAGE.CONTEXT || FLATMESSAGE.context)) || null,
        RESPONSESPEC
      );
    }

    return ENV;
  }

  if (MSGTYPE === MESSAGETYPES.ACK) {
    var ACKRECIPIENT = MESSAGE.RECIPIENT || MESSAGE.recipient;
    var ACKIDS = MESSAGE.IDS || MESSAGE.ids || [];
    var ACKQUEUE = MAILSLICE.QUEUES[ACKRECIPIENT] || [];
    ACKQUEUE.forEach(function(M) {
      if (ACKIDS.indexOf(M.ID || M.id) !== -1) {
        M.UNREAD = false;
      }
    });
    return ENV;
  }

  return ENV;
}

function GETMAILBOX() {
  return MAILBOX.slice();
}

function QUERYMAILBOX(FILTER) {
  if (!FILTER) FILTER = {};

  var FILTERTYPE = FILTER.TYPE || FILTER.type;
  if (FILTERTYPE !== undefined) {
    var ALLOWEDTYPES = Object.keys(MESSAGETYPES).map(function(K) { return MESSAGETYPES[K]; });
    var FILTERUPPER = String(FILTERTYPE).toUpperCase();
    var FOUNDTYPE = ALLOWEDTYPES.filter(function(T) {
      return T === FILTERTYPE || T === FILTERUPPER || String(T).toLowerCase() === String(FILTERTYPE).toLowerCase();
    });
    if (FOUNDTYPE.length === 0) {
      throw new Error('[QUERYMAILBOX] Invalid filter type: ' + FILTERTYPE);
    }
  }

  logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX FILTER:', JSON.stringify(FILTER));

  var CANDIDATES = MAILBOX;
  var FILTERTAG = FILTER.TAG || FILTER.tag;
  var FILTERSENDER = FILTER.SENDER || FILTER.sender;
  var FILTERRECIPIENT = FILTER.RECIPIENT || FILTER.recipient;
  var FILTERSTATUS = FILTER.STATUS || FILTER.status;
  var FILTERREAD = FILTER.READ || FILTER.read;

  if (FILTERTAG && INDEXBYTAG[FILTERTAG]) {
    CANDIDATES = INDEXBYTAG[FILTERTAG];
  } else if (FILTERSENDER && INDEXBYSENDER[FILTERSENDER]) {
    CANDIDATES = INDEXBYSENDER[FILTERSENDER];
  } else if (FILTERTYPE && (INDEXBYTYPE[FILTERTYPE] || INDEXBYTYPE[String(FILTERTYPE).toUpperCase()] || INDEXBYTYPE[String(FILTERTYPE).toLowerCase()])) {
    CANDIDATES = INDEXBYTYPE[FILTERTYPE] || INDEXBYTYPE[String(FILTERTYPE).toUpperCase()] || INDEXBYTYPE[String(FILTERTYPE).toLowerCase()];
  }

  var MATCHED = CANDIDATES.filter(function(ITEM) {
    var MATCHES = true;
    var ITEMRECIPIENT = ITEM.RECIPIENT || ITEM.recipient;
    var ITEMSENDER = ITEM.SENDER || ITEM.sender;
    var ITEMTAG = ITEM.TAG || ITEM.tag;
    var ITEMTIMESTAMP = ITEM.TIMESTAMP || ITEM.timestamp;
    var ITEMSTATUS = ITEM.STATUS || ITEM.status;
    var ITEMREAD = ITEM.READ || ITEM.read;
    var ITEMPAYLOAD = ITEM.PAYLOAD || ITEM.payload;
    var ITEMTYPE = ITEMPAYLOAD ? (ITEMPAYLOAD.TYPE || ITEMPAYLOAD.type) : (ITEM.TYPE || ITEM.type);

    if (FILTERRECIPIENT !== undefined && ITEMRECIPIENT !== FILTERRECIPIENT) MATCHES = false;
    if (FILTERSENDER !== undefined && ITEMSENDER !== FILTERSENDER) MATCHES = false;
    if (FILTERTAG !== undefined && ITEMTAG !== FILTERTAG) MATCHES = false;
    if (FILTER.DATE !== undefined && ITEMTIMESTAMP !== FILTER.DATE) MATCHES = false;
    if (FILTERTYPE !== undefined) {
      if (ITEMTYPE !== FILTERTYPE && String(ITEMTYPE).toUpperCase() !== String(FILTERTYPE).toUpperCase()) MATCHES = false;
    }
    if (FILTERSTATUS !== undefined && ITEMSTATUS !== FILTERSTATUS) MATCHES = false;
    if (FILTERREAD !== undefined) {
      if (ITEMREAD !== FILTERREAD) MATCHES = false;
    } else if (ITEMREAD === 'READ') {
      MATCHES = false;
    }
    if (FILTER.MATCHES && typeof FILTER.MATCHES === 'function') {
      if (!FILTER.MATCHES(ITEM)) MATCHES = false;
    }
    if (FILTER.PROPS && typeof FILTER.PROPS === 'object') {
      Object.keys(FILTER.PROPS).forEach(function(KEY) {
        var EXPECTED = FILTER.PROPS[KEY];
        var ACTUAL = ITEM[KEY] !== undefined ? ITEM[KEY] : (ITEMPAYLOAD && ITEMPAYLOAD[KEY]);
        if (ACTUAL !== EXPECTED) MATCHES = false;
      });
    }
    return MATCHES;
  });

  var SEENTAGS = {};
  var DEDUPED = MATCHED.filter(function(ITEM) {
    var TAGVAL = ITEM.TAG || ITEM.tag;
    if (TAGVAL) {
      if (SEENTAGS[TAGVAL]) return false;
      SEENTAGS[TAGVAL] = true;
    }
    return true;
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX RAW MATCHES:', DEDUPED.length);

  var RESULT = DEDUPED.map(function(ITEM) {
    if (ITEM && (ITEM.READ !== 'READ')) {
      ITEM.READ = 'READ';
      logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX MARKING READ:', ITEM.ID, 'TAG=', ITEM.TAG || ITEM.tag);
    }
    return ITEM;
  });

  RESULT.forEach(function(ITEM) {
    var TAGVAL = ITEM && (ITEM.TAG || ITEM.tag);
    if (ITEM && TAGVAL && EXPECTATIONS[TAGVAL] && (ITEM.READ === 'READ')) {
      RESOLVEEXPECTATION(TAGVAL);
    }
    if (ITEM && (ITEM.READ === 'READ') && (!TAGVAL || !EXPECTATIONS[TAGVAL])) {
      setTimeout(function() { REMOVEENVELOPEFROMMAILBOX(ITEM); }, 0);
    }
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX RETURNING', RESULT.length, 'ITEMS');
  return RESULT;
}

function WAITFORMAILBOX(FILTER, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = EXPECTATIONTIMEOUT;
  return new Promise(function(RESOLVE, REJECT) {
    if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.activecancellationtoken && blockcompilerstate.activecancellationtoken.cancelled) {
      REJECT(new Error('Cancelled'));
      return;
    }

    var TAGVAL = FILTER && (FILTER.TAG || FILTER.tag);
    if (TAGVAL && EXPECTATIONS[TAGVAL] && EXPECTATIONS[TAGVAL].STATUS !== 'PENDING') {
      REJECT(new Error('Expectation already settled'));
      return;
    }

    var FOUND = QUERYMAILBOX(FILTER);
    if (FOUND.length > 0) {
      FOUND[0].READ = 'READ';
      RESOLVE(FOUND[0]);
      return;
    }

    var CHECKINTERVAL = setInterval(function() {
      if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.activecancellationtoken && blockcompilerstate.activecancellationtoken.cancelled) {
        clearInterval(CHECKINTERVAL);
        REJECT(new Error('Cancelled'));
        return;
      }
      if (TAGVAL && EXPECTATIONS[TAGVAL] && EXPECTATIONS[TAGVAL].STATUS !== 'PENDING') {
        clearInterval(CHECKINTERVAL);
        REJECT(new Error('Expectation already settled'));
        return;
      }
      var RES = QUERYMAILBOX(FILTER);
      if (RES.length > 0) {
        clearInterval(CHECKINTERVAL);
        RES[0].READ = 'READ';
        RESOLVE(RES[0]);
      }
    }, POLLINTERVAL);

    setTimeout(function() {
      clearInterval(CHECKINTERVAL);
      if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.activecancellationtoken && blockcompilerstate.activecancellationtoken.cancelled) {
        REJECT(new Error('Cancelled'));
        return;
      }
      var LATE = QUERYMAILBOX(FILTER);
      if (LATE.length > 0) {
        LATE[0].READ = 'READ';
        RESOLVE(LATE[0]);
      } else {
        REJECT(new Error('Mailbox wait timeout for filter: ' + JSON.stringify(FILTER)));
      }
    }, TIMEOUT);
  });
}

function GENERATETAG() {
  return 'TAG' + Date.now() + Math.random().toString(36).slice(2, 10);
}

function SENDINSTRUCTION(RECIPIENT, TYPE, PAYLOAD, TAG, SENDER, RESPONSESPEC, CONTEXT) {
  if (TAG === undefined) TAG = GENERATETAG();
  if (SENDER === undefined) SENDER = 'system';

  var FLATMESSAGE = { TYPE: TYPE, SENDER: SENDER, TAG: TAG };
  if (PAYLOAD && typeof PAYLOAD === 'object') {
    Object.keys(PAYLOAD).forEach(function(KEY) {
      if (KEY !== 'TYPE' && KEY !== 'SENDER' && KEY !== 'TAG' &&
          KEY !== 'RESPONSESPEC' && KEY !== 'CONTEXT') {
        FLATMESSAGE[KEY] = PAYLOAD[KEY];
      }
    });
  }
  if (RESPONSESPEC) {
    FLATMESSAGE.RESPONSESPEC = RESPONSESPEC;
  }
  if (CONTEXT) {
    FLATMESSAGE.CONTEXT = CONTEXT;
  }

  if (messageregistry && typeof messageregistry.getinterfaces === 'function') {
    var GETIFACES = messageregistry.getinterfaces;
    var IFACES = GETIFACES(RECIPIENT);
    if (IFACES && Object.keys(IFACES).length > 0) {
      var VALIDATEFN = messageregistry.validate;
      var VALIDATION = VALIDATEFN(RECIPIENT, FLATMESSAGE);
      if (VALIDATION.valid === false) {
        throw new Error('[MAILACTOR] Message validation failed for ' + RECIPIENT + ': ' + VALIDATION.error);
      }
    }
  }

  DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, {
    TYPE: MESSAGETYPES.SEND,
    RECIPIENT: RECIPIENT,
    MESSAGE: FLATMESSAGE
  });
}

function SENDRESPONSE(RECIPIENT, TAG, RESULT, SENDER, RESPONSETYPE) {
  if (RESPONSETYPE === undefined) {
    throw new Error('[SENDRESPONSE] responseType is required');
  }
  var TYPE = RESPONSETYPE;
  var PAYLOAD = { RESULT: RESULT };
  SENDINSTRUCTION(RECIPIENT, TYPE, PAYLOAD, TAG, SENDER, undefined, null);
}

function STARTMAILACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS :
      (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      if (ENV) ENV.VERBOSITY = LVL;
    }
  }
  return {
    GETSTATE: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    DISPATCH: function(MSG) { return DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, MSG); }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAILBEHAVIOR: MAILBEHAVIOR,
    GENERATETAG: GENERATETAG,
    SENDINSTRUCTION: SENDINSTRUCTION,
    SENDRESPONSE: SENDRESPONSE,
    QUERYMAILBOX: QUERYMAILBOX,
    WAITFORMAILBOX: WAITFORMAILBOX,
    STARTMAILACTOR: STARTMAILACTOR
  };
}
