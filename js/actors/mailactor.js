// mailactor.js — mail transport concern.
//
// @proposal=P5 (corrected, Cycle 39R) — the OP-011 (FB-14) payload-key
// case aliasing is removed.
//
// @proposal=P1 (P-MAILBOX-EXCHANGE-CONSOLIDATION) — resolver channel.
//
// @proposal=P1-fix (P-MAILBOX-RESOLVER-PAYLOAD-ENVELOPE) — resolver
// fires with the raw envelope.
//
// @proposal=P7 (P-ACTORCORE-PREDISPATCH-STAGE) — MAILBEHAVIOR's SEND
// branch creates the expectation in a pre-dispatch stage.
//
// @proposal=P30 (P-CATCHTIMEOUT-STRUCTURAL-KIND) — the timeout errors
// produced by WAITFORMAILBOX's push path, POLLFALLBACK's terminal
// timer, and REJECTEXPECTATION's rejection all carry
// diagnostic.KIND = 'mailbox-wait-timeout'. The catchtimeout check in
// blockcompiler.js reads this classifier instead of the error's
// message prefix. The human-readable messages are unchanged.

var MAILVERBOSITYCONSTANTS = createverbosityconstants();
var MAILSTATE = { level: MAILVERBOSITYCONSTANTS.DEBUG };

var ACTORCONSUMERS = {};
var EXPECTATIONS = {};
var MAILBOX = [];

var INDEXBYTAG = {};
var INDEXBYSENDER = {};
var INDEXBYTYPE = {};

var MAILBOXRESPONSETYPE = 'MAILBOXRESPONSE';

// @proposal=P1 — retention timer for settled envelopes (F6/F34).
var RETENTIONTIMERS = {};

function SCHEDULERETENTIONPRUNE(TAG) {
  if (!TAG || RETENTIONTIMERS[TAG]) return;
  RETENTIONTIMERS[TAG] = setTimeout(function() {
    delete RETENTIONTIMERS[TAG];
    var ENVELOPES = (INDEXBYTAG[TAG] || []).slice();
    ENVELOPES.forEach(function(E) {
      if (E && E.TAG === TAG) REMOVEENVELOPEFROMMAILBOX(E);
    });
  }, mailboxresolve('expectationtimeout'));
}

function ADDENVELOPETOMAILBOX(ENVELOPE) {
  MAILBOX.push(ENVELOPE);
  var TAG = ENVELOPE.TAG;
  if (TAG) {
    if (!INDEXBYTAG[TAG]) INDEXBYTAG[TAG] = [];
    INDEXBYTAG[TAG].push(ENVELOPE);
  }
  var SENDER = ENVELOPE.SENDER;
  if (SENDER) {
    if (!INDEXBYSENDER[SENDER]) INDEXBYSENDER[SENDER] = [];
    INDEXBYSENDER[SENDER].push(ENVELOPE);
  }
  var PAYLOAD = ENVELOPE.PAYLOAD;
  var TYPE = PAYLOAD && PAYLOAD.TYPE;
  if (TYPE) {
    if (!INDEXBYTYPE[TYPE]) INDEXBYTYPE[TYPE] = [];
    INDEXBYTYPE[TYPE].push(ENVELOPE);
  }

  // @proposal=P1 / @proposal=P1-fix — fire the live expectation's
  // resolver with the arriving envelope.
  if (TAG && EXPECTATIONS[TAG] && EXPECTATIONS[TAG].STATUS === 'PENDING') {
    RESOLVEEXPECTATION(TAG, ENVELOPE);
  }
}

function REMOVEENVELOPEFROMMAILBOX(ENVELOPE) {
  var IDX = MAILBOX.indexOf(ENVELOPE);
  if (IDX !== -1) MAILBOX.splice(IDX, 1);
  var TAG = ENVELOPE.TAG;
  if (TAG && INDEXBYTAG[TAG]) {
    INDEXBYTAG[TAG] = INDEXBYTAG[TAG].filter(function(E) { return E !== ENVELOPE; });
    if (INDEXBYTAG[TAG].length === 0) delete INDEXBYTAG[TAG];
  }
  var SENDER = ENVELOPE.SENDER;
  if (SENDER && INDEXBYSENDER[SENDER]) {
    INDEXBYSENDER[SENDER] = INDEXBYSENDER[SENDER].filter(function(E) { return E !== ENVELOPE; });
    if (INDEXBYSENDER[SENDER].length === 0) delete INDEXBYSENDER[SENDER];
  }
  var PAYLOAD = ENVELOPE.PAYLOAD;
  var TYPE = PAYLOAD && PAYLOAD.TYPE;
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
    READ: 'UNREAD',
    RESOLVERS: [],
    REJECTERS: [],
    TIMEOUTID: null
  };
  EXPECTATIONS[TAG] = EXPECTATION;

  EXPECTATION.TIMEOUTID = setTimeout(function() {
    if (EXPECTATIONS[TAG] && (EXPECTATIONS[TAG].STATUS === 'PENDING')) {
      REJECTEXPECTATION(TAG, { MESSAGE: 'Response timeout for tag ' + TAG });
    }
  }, mailboxresolve('expectationtimeout'));

  return EXPECTATION;
}

// @proposal=P1 — register callbacks on a live expectation (F4/i).
function ARMEXPECTATIONRESOLVER(TAG, ONRESOLVE, ONREJECT) {
  var EXPECTATION = EXPECTATIONS[TAG];
  if (EXPECTATION && EXPECTATION.STATUS === 'PENDING') {
    if (typeof ONRESOLVE === 'function') EXPECTATION.RESOLVERS.push(ONRESOLVE);
    if (typeof ONREJECT === 'function') EXPECTATION.REJECTERS.push(ONREJECT);
    return true;
  }
  return false;
}

// @proposal=P1 / @proposal=P1-fix — the resolver fires with the raw
// envelope.
function RESOLVEEXPECTATION(TAG, envelope) {
  var EXP = EXPECTATIONS[TAG];
  if (!EXP) return;
  EXP.STATUS = 'RESOLVED';
  EXP.RESOLVEDAT = Date.now();
  EXP.READ = 'READ';
  if (EXP.TIMEOUTID) {
    clearTimeout(EXP.TIMEOUTID);
    EXP.TIMEOUTID = null;
  }
  delete EXPECTATIONS[TAG];

  var firepayload = envelope;
  if (firepayload === undefined || firepayload === null) {
    var CANDIDATES = INDEXBYTAG[TAG] || [];
    firepayload = CANDIDATES.length > 0 ? CANDIDATES[0] : null;
  }

  var RESOLVERS = EXP.RESOLVERS.slice();
  RESOLVERS.forEach(function(FN) {
    try { FN(firepayload); } catch (E) { /* resolver error does not block others */ }
  });

  SCHEDULERETENTIONPRUNE(TAG);
}

// @proposal=P30 — the rejection error carries the classifier
// 'mailbox-wait-timeout'. The message remains human-readable.
function REJECTEXPECTATION(TAG, ERROR) {
  var EXP = EXPECTATIONS[TAG];
  if (!EXP) return;
  EXP.STATUS = 'TIMEOUT';
  EXP.RESOLVEDAT = Date.now();
  EXP.ERROR = ERROR;
  EXP.READ = 'READ';
  if (EXP.TIMEOUTID) {
    clearTimeout(EXP.TIMEOUTID);
    EXP.TIMEOUTID = null;
  }
  var SPEC = EXP.RESPONSESPEC;
  var REJECTIONERROR = new Error(ERROR && ERROR.MESSAGE ? ERROR.MESSAGE : 'Expectation rejected');
  REJECTIONERROR.diagnostic = REJECTIONERROR.diagnostic || {};
  REJECTIONERROR.diagnostic.KIND = 'mailbox-wait-timeout';
  if (SPEC && typeof SPEC.reject === 'function') {
    SPEC.reject(REJECTIONERROR);
  }
  delete EXPECTATIONS[TAG];

  var REJECTERS = EXP.REJECTERS.slice();
  REJECTERS.forEach(function(FN) {
    try { FN(REJECTIONERROR); } catch (E) { /* do not block */ }
  });

  SCHEDULERETENTIONPRUNE(TAG);
}

function MAILBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);

  var MAILSLICE = ENSUREENVSLICE(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });

  var MSGTYPE = MESSAGE.TYPE;
  if (MSGTYPE === MESSAGETYPES.SEND) {
    var RECIPIENT = MESSAGE.RECIPIENT;
    if (!RECIPIENT || typeof RECIPIENT !== 'string') {
      return ENV;
    }
    if (!MAILSLICE.QUEUES[RECIPIENT]) MAILSLICE.QUEUES[RECIPIENT] = [];
    var FLATMESSAGE = MESSAGE.MESSAGE;

    var FLATTYPE = FLATMESSAGE && FLATMESSAGE.TYPE;
    var FLATTAG = FLATMESSAGE && FLATMESSAGE.TAG;
    var FLATSENDER = FLATMESSAGE && FLATMESSAGE.SENDER;

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
      DISPATCHTOACTOR(RECIPIENT, CONSUMER, FLATMESSAGE, function(stagedmessage) {
        var stagedspec = stagedmessage && stagedmessage.RESPONSESPEC;
        if (stagedspec && stagedmessage.TAG) {
          CREATEEXPECTATION(
            stagedmessage.TAG,
            RECIPIENT,
            stagedmessage.SENDER || 'system',
            stagedmessage.TYPE,
            stagedmessage.CONTEXT || null,
            stagedspec
          );
        }
      });
      ENVELOPE.READ = 'READ';
    } else {
      if (RECIPIENT === 'BLOCKCOMPILER') {
        logdebug(ENV, '[MAILACTOR]', 'NO CONSUMER REGISTERED FOR:', CONSUMERKEY1, '(BLOCKCOMPILER polls mailbox directly)');
      } else {
        logdebug(ENV, '[MAILACTOR]', 'NO CONSUMER REGISTERED FOR:', CONSUMERKEY1);
      }
    }

    return ENV;
  }

  if (MSGTYPE === MESSAGETYPES.ACK) {
    var ACKRECIPIENT = MESSAGE.RECIPIENT;
    var ACKIDS = MESSAGE.IDS || [];
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

  var FILTERTYPE = FILTER.TYPE;
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
  var FILTERTAG = FILTER.TAG;
  var FILTERSENDER = FILTER.SENDER;
  var FILTERRECIPIENT = FILTER.RECIPIENT;
  var FILTERSTATUS = FILTER.STATUS;
  var FILTERREAD = FILTER.READ;

  if (FILTERTAG && INDEXBYTAG[FILTERTAG]) {
    CANDIDATES = INDEXBYTAG[FILTERTAG];
  } else if (FILTERSENDER && INDEXBYSENDER[FILTERSENDER]) {
    CANDIDATES = INDEXBYSENDER[FILTERSENDER];
  } else if (FILTERTYPE && (INDEXBYTYPE[FILTERTYPE] || INDEXBYTYPE[String(FILTERTYPE).toUpperCase()] || INDEXBYTYPE[String(FILTERTYPE).toLowerCase()])) {
    CANDIDATES = INDEXBYTYPE[FILTERTYPE] || INDEXBYTYPE[String(FILTERTYPE).toUpperCase()] || INDEXBYTYPE[String(FILTERTYPE).toLowerCase()];
  }

  var MATCHED = CANDIDATES.filter(function(ITEM) {
    if (!ITEM || !ITEM.PAYLOAD) return false;
    var MATCHES = true;
    var ITEMRECIPIENT = ITEM.RECIPIENT;
    var ITEMSENDER = ITEM.SENDER;
    var ITEMTAG = ITEM.TAG;
    var ITEMTIMESTAMP = ITEM.TIMESTAMP;
    var ITEMSTATUS = ITEM.STATUS;
    var ITEMREAD = ITEM.READ;
    var ITEMPAYLOAD = ITEM.PAYLOAD;
    var ITEMTYPE = ITEMPAYLOAD ? ITEMPAYLOAD.TYPE : ITEM.TYPE;

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
    var TAGVAL = ITEM.TAG;
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
      logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX MARKING READ:', ITEM.ID, 'TAG=', ITEM.TAG);
    }
    return ITEM;
  });

  RESULT.forEach(function(ITEM) {
    var TAGVAL = ITEM && ITEM.TAG;
    if (ITEM && TAGVAL && EXPECTATIONS[TAGVAL] && (ITEM.READ === 'READ')) {
      RESOLVEEXPECTATION(TAGVAL, ITEM);
    }
    if (ITEM && (ITEM.READ === 'READ')) {
      if (TAGVAL) SCHEDULERETENTIONPRUNE(TAGVAL);
      else setTimeout(function() { REMOVEENVELOPEFROMMAILBOX(ITEM); }, 0);
    }
  });

  logdebug(MAILSTATE, '[MAILACTOR]', 'QUERYMAILBOX RETURNING', RESULT.length, 'ITEMS');
  return RESULT;
}

// @proposal=P1 — pre-existing poll path, preserved as the fallback.
// @proposal=P30 — the timeout rejection carries the classifier.
function POLLFALLBACK(FILTER, TIMEOUT, RESOLVE, REJECT) {
  if (typeof BLOCKCOMPILERSTATE !== 'undefined' && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN.CANCELLED) {
    REJECT(new Error('Cancelled'));
    return;
  }

  var TAGVAL = FILTER && FILTER.TAG;
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
    if (typeof BLOCKCOMPILERSTATE !== 'undefined' && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN.CANCELLED) {
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
  }, mailboxresolve('pollinterval'));

  setTimeout(function() {
    clearInterval(CHECKINTERVAL);
    if (typeof BLOCKCOMPILERSTATE !== 'undefined' && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN && BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN.CANCELLED) {
      REJECT(new Error('Cancelled'));
      return;
    }
    var LATE = QUERYMAILBOX(FILTER);
    if (LATE.length > 0) {
      LATE[0].READ = 'READ';
      RESOLVE(LATE[0]);
    } else {
      var TIMEOUTERR = new Error('Mailbox wait timeout for filter: ' + JSON.stringify(FILTER));
      TIMEOUTERR.diagnostic = TIMEOUTERR.diagnostic || {};
      TIMEOUTERR.diagnostic.KIND = 'mailbox-wait-timeout';
      REJECT(TIMEOUTERR);
    }
  }, TIMEOUT);
}

// @proposal=P30 — the push-path timeout rejection carries the
// classifier.
function WAITFORMAILBOX(FILTER, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = mailboxresolve('expectationtimeout');
  var TAGVAL = FILTER && FILTER.TAG;

  if (TAGVAL && EXPECTATIONS[TAGVAL] && EXPECTATIONS[TAGVAL].STATUS === 'PENDING') {
    return new Promise(function(RESOLVE, REJECT) {
      var SETTLED = false;
      function ONSETTLE(FN, ARG) {
        if (SETTLED) return;
        SETTLED = true;
        FN(ARG);
      }
      ARMEXPECTATIONRESOLVER(
        TAGVAL,
        function(PAYLOADVAL) { ONSETTLE(RESOLVE, PAYLOADVAL); },
        function(ERR) { ONSETTLE(REJECT, ERR); }
      );
      setTimeout(function() {
        if (SETTLED) return;
        var LATE = MAILGETACTIONSTATUS(TAGVAL);
        if (LATE !== null) { ONSETTLE(RESOLVE, LATE); return; }
        var TIMEOUTERR = new Error('Mailbox wait timeout for filter: ' + JSON.stringify(FILTER));
        TIMEOUTERR.diagnostic = TIMEOUTERR.diagnostic || {};
        TIMEOUTERR.diagnostic.KIND = 'mailbox-wait-timeout';
        ONSETTLE(REJECT, TIMEOUTERR);
      }, TIMEOUT);
    });
  }

  return new Promise(function(RESOLVE, REJECT) {
    POLLFALLBACK(FILTER, TIMEOUT, RESOLVE, REJECT);
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

  if (MESSAGEREGISTRY && typeof MESSAGEREGISTRY.getinterfaces === 'function') {
    var GETIFACES = MESSAGEREGISTRY.getinterfaces;
    var IFACES = GETIFACES(RECIPIENT);
    if (IFACES && Object.keys(IFACES).length > 0) {
      var VALIDATEFN = MESSAGEREGISTRY.validate;
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

function MAILGETACTIONSTATUS(ID) {
  if (typeof ID !== 'string' || ID.length === 0) return null;

  var EXP = EXPECTATIONS[ID];
  if (EXP) {
    if (EXP.STATUS === 'PENDING') {
      return { STATUS: 'PENDING', RESULT: null, ERROR: null };
    }
    if (EXP.STATUS === 'TIMEOUT') {
      return { STATUS: 'EXPIRED', RESULT: null, ERROR: EXP.ERROR || null };
    }
  }

  var RESPONSETYPESET = {};
  if (typeof MAILBOXFILTERTYPES !== 'undefined') {
    Object.keys(MAILBOXFILTERTYPES).forEach(function(K) {
      RESPONSETYPESET[MAILBOXFILTERTYPES[K]] = true;
    });
  }
  var ENVELOPES = INDEXBYTAG[ID] || [];
  var RESPONSEENVELOPE = null;
  ENVELOPES.forEach(function(E) {
    var PAYLOADTYPE = E.PAYLOAD && E.PAYLOAD.TYPE;
    if (PAYLOADTYPE && RESPONSETYPESET[PAYLOADTYPE]) {
      RESPONSEENVELOPE = E;
    }
  });

  if (RESPONSEENVELOPE) {
    var PAYLOAD = RESPONSEENVELOPE.PAYLOAD || {};
    var HASERROR = PAYLOAD.ERROR !== undefined ||
                   (PAYLOAD.RESULT && typeof PAYLOAD.RESULT === 'object' && PAYLOAD.RESULT.ERROR !== undefined);
    if (HASERROR) {
      return {
        STATUS: 'FAILED',
        RESULT: null,
        ERROR: PAYLOAD.ERROR !== undefined ? PAYLOAD.ERROR : PAYLOAD.RESULT.ERROR
      };
    }
    return {
      STATUS: 'RESOLVED',
      RESULT: PAYLOAD.RESULT !== undefined ? PAYLOAD.RESULT : PAYLOAD,
      ERROR: null
    };
  }

  return null;
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
