var MAILVERBOSITYCONSTANTS = createverbosityconstants();
var MAILSTATE = { level: MAILVERBOSITYCONSTANTS.DEBUG };

REGISTERMESSAGETYPE('PING');
REGISTERMESSAGETYPE('RESPONSE');
REGISTERMESSAGETYPE('SEND');
REGISTERMESSAGETYPE('ACK');

REGISTERRESPONSETYPE('RESPONSE');
var MAILACTORVOCABULARY = {};

var MAILACTORENVELOPEKEYS = {
  TYPE: true,
  SENDER: true,
  TAG: true,
  WAITMODE: true,
  RESPONSESPEC: true,
  CONTEXT: true
};

// Private. Reads the iface map for one actor; used by SENDINSTRUCTION's
// validation gate.
function MAILACTORINTERFACES(ACTORNAME) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME] || {};
  var MAP = {};
  Object.keys(ENTRY).forEach(function (TYPE) {
    MAP[TYPE] = ENTRY[TYPE].iface;
  });
  return MAP;
}

// Private. Transplanted body of the former MESSAGEREGISTRY.validate,
// reading from MAILACTORVOCABULARY instead. MESSAGETYPEEXISTS is the
// dynamic-register predicate from js/messagetypes.js (manifest #6).
function MAILACTORVALIDATE(ACTORNAME, MESSAGE) {
  if (!MESSAGE || typeof MESSAGE !== 'object') {
    return { valid: false, error: 'message must be a non-null object', type: 'null' };
  }
  var TYPE = MESSAGE.TYPE || MESSAGE.type;
  if (!TYPE || typeof TYPE !== 'string') {
    return { valid: false, error: 'message type must be a string, got: ' + typeof TYPE, type: String(TYPE) };
  }
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  var IFACE = (ENTRY && ENTRY[TYPE]) ? ENTRY[TYPE].iface : null;
  if (!IFACE) {
    if (MESSAGETYPEEXISTS(TYPE)) {
      IFACE = {};
    } else {
      return { valid: false, error: 'unknown message type: ' + TYPE, type: TYPE };
    }
  }
  var KEYS = Object.keys(IFACE);
  var INVALID = null;
  KEYS.forEach(function (KEY) {
    if (INVALID) return;
    var SPEC = IFACE[KEY];
    var OPTIONAL = SPEC.charAt(SPEC.length - 1) === '?';
    var EXPECTEDTYPE = OPTIONAL ? SPEC.slice(0, -1) : SPEC;
    var VAL = MESSAGE[KEY] !== undefined ? MESSAGE[KEY] :
      (MESSAGE[KEY.toLowerCase()] !== undefined ? MESSAGE[KEY.toLowerCase()] :
      MESSAGE[KEY.toUpperCase()]);
    if (VAL === undefined || VAL === null) {
      if (!OPTIONAL) {
        INVALID = { valid: false, error: 'type "' + TYPE + '" missing required field "' + KEY + '" (' + EXPECTEDTYPE + ')', type: TYPE };
      }
      return;
    }
    if (EXPECTEDTYPE === 'any') return;
    if (EXPECTEDTYPE === 'array') {
      if (!Array.isArray(VAL)) {
        INVALID = { valid: false, error: 'type "' + TYPE + '" field "' + KEY + '" expected array got ' + (Array.isArray(VAL) ? 'array' : typeof VAL), type: TYPE };
      }
    } else if (EXPECTEDTYPE === 'object') {
      if (VAL === null || typeof VAL !== 'object') {
        INVALID = { valid: false, error: 'type "' + TYPE + '" field "' + KEY + '" expected object got ' + (VAL === null ? 'null' : typeof VAL), type: TYPE };
      }
    } else {
      var ACTUALTYPE = typeof VAL;
      if (ACTUALTYPE !== EXPECTEDTYPE) {
        INVALID = { valid: false, error: 'type "' + TYPE + '" field "' + KEY + '" expected ' + EXPECTEDTYPE + ' got ' + ACTUALTYPE, type: TYPE };
      }
    }
  });
  if (INVALID) return INVALID;
  return { valid: true, error: null, type: TYPE };
}

// Public. Registers a (type ↦ handler) mapping for ACTORNAME. IFACE is
// the payload schema; HANDLERFN is the per-type handler (ENV, ARGS) → ….
function REGISTERACTORMESSAGE(ACTORNAME, TYPE, IFACE, HANDLERFN) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[REGISTERACTORMESSAGE] ACTORNAME must be a non-empty string');
  }
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERACTORMESSAGE] TYPE must be a non-empty string');
  }
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (!ENTRY) {
    ENTRY = {};
    MAILACTORVOCABULARY[ACTORNAME] = ENTRY;
  }
  ENTRY[TYPE] = { iface: IFACE || {}, handler: HANDLERFN || null };
  return ENTRY[TYPE];
}

// Public. Returns the per-type handler for (ACTORNAME, TYPE), or null.
function RESOLVEHANDLER(ACTORNAME, TYPE) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (ENTRY && ENTRY[TYPE] && typeof ENTRY[TYPE].handler === 'function') {
    return ENTRY[TYPE].handler;
  }
  return null;
}

// Public. Projects MESSAGE onto the payload keys of the iface for
// (ACTORNAME, TYPE), excluding envelope keys.
function EXTRACTPAYLOAD(ACTORNAME, TYPE, MESSAGE) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (!ENTRY || !ENTRY[TYPE]) return {};
  var IFACE = ENTRY[TYPE].iface || {};
  var ARGS = {};
  Object.keys(IFACE).forEach(function (KEY) {
    if (MAILACTORENVELOPEKEYS[KEY] === true) return;
    if (MESSAGE && MESSAGE[KEY] !== undefined) ARGS[KEY] = MESSAGE[KEY];
  });
  return ARGS;
}

// Public. Resolves the handler for (ACTORNAME, MESSAGE.TYPE), projects
// MESSAGE to ARGS, and invokes the handler. Returns { matched, result }.
// The sentinel is structurally distinct from any handler-returned value.
function INVOKEHANDLER(ACTORNAME, ENV, MESSAGE) {
  if (!MESSAGE || typeof MESSAGE !== 'object') {
    return { matched: false, result: undefined };
  }
  var TYPE = MESSAGE.TYPE;
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    return { matched: false, result: undefined };
  }
  var HANDLER = RESOLVEHANDLER(ACTORNAME, TYPE);
  if (typeof HANDLER !== 'function') {
    return { matched: false, result: undefined };
  }
  var ARGS = EXTRACTPAYLOAD(ACTORNAME, TYPE, MESSAGE);
  return { matched: true, result: HANDLER(ENV, ARGS) };
}

// ============================================================
// §1 — Mailbox state
// ============================================================

var EXPECTATIONS = {};
var MAILBOX = [];
var INDEXBYTAG = {};
var INDEXBYSENDER = {};
var INDEXBYTYPE = {};

var RETENTIONTIMERS = {};

// ============================================================
// §2 — Dynamic broadcast-type registry
// ============================================================

var BROADCASTTYPESREF = { current: Object.freeze({}) };

function GETBROADCASTTYPES() {
  return BROADCASTTYPESREF.current;
}

function REGISTERBROADCASTTYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERBROADCASTTYPE] TYPE must be a non-empty string');
  }
  var CURRENT = BROADCASTTYPESREF.current;
  if (CURRENT[TYPE] !== undefined) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = true;
  BROADCASTTYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}

function UNREGISTERBROADCASTTYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var CURRENT = BROADCASTTYPESREF.current;
  if (CURRENT[TYPE] === undefined) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) {
    if (K !== TYPE) NEXT[K] = CURRENT[K];
  });
  BROADCASTTYPESREF.current = Object.freeze(NEXT);
  return true;
}

// @proposal=P-COMPILER-TYPE-LITERALS — literal type names, not
// MESSAGETYPES lookups. The type-name register is dynamic.
REGISTERBROADCASTTYPE('BLOCKEXECUTED');
REGISTERBROADCASTTYPE('BLOCKFAILED');

// ============================================================
// §3 — Dynamic mailbox-exempt registry
// ============================================================

var MAILBOXEXEMPTREF = { current: Object.freeze({}) };

function GETMAILBOXEXEMPT() {
  return MAILBOXEXEMPTREF.current;
}

function REGISTERMAILBOXEXEMPT(RECIPIENT) {
  if (typeof RECIPIENT !== 'string' || RECIPIENT.length === 0) {
    throw new Error('[REGISTERMAILBOXEXEMPT] RECIPIENT must be a non-empty string');
  }
  var CURRENT = MAILBOXEXEMPTREF.current;
  if (CURRENT[RECIPIENT] !== undefined) return RECIPIENT;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[RECIPIENT] = true;
  MAILBOXEXEMPTREF.current = Object.freeze(NEXT);
  return RECIPIENT;
}

function UNREGISTERMAILBOXEXEMPT(RECIPIENT) {
  if (typeof RECIPIENT !== 'string' || RECIPIENT.length === 0) return false;
  var CURRENT = MAILBOXEXEMPTREF.current;
  if (CURRENT[RECIPIENT] === undefined) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) {
    if (K !== RECIPIENT) NEXT[K] = CURRENT[K];
  });
  MAILBOXEXEMPTREF.current = Object.freeze(NEXT);
  return true;
}

REGISTERMAILBOXEXEMPT('BROADCAST');

// ============================================================
// §4 — Mail transport primitives
// ============================================================

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

function ARMEXPECTATIONRESOLVER(TAG, ONRESOLVE, ONREJECT) {
  var EXPECTATION = EXPECTATIONS[TAG];
  if (EXPECTATION && EXPECTATION.STATUS === 'PENDING') {
    if (typeof ONRESOLVE === 'function') EXPECTATION.RESOLVERS.push(ONRESOLVE);
    if (typeof ONREJECT === 'function') EXPECTATION.REJECTERS.push(ONREJECT);
    return true;
  }
  return false;
}

function RESOLVEEXPECTATION(TAG, ENVELOPE) {
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
  var FIREPAYLOAD = ENVELOPE;
  if (FIREPAYLOAD === undefined || FIREPAYLOAD === null) {
    var CANDIDATES = INDEXBYTAG[TAG] || [];
    FIREPAYLOAD = CANDIDATES.length > 0 ? CANDIDATES[0] : null;
  }
  var RESOLVERS = EXP.RESOLVERS.slice();
  RESOLVERS.forEach(function(FN) {
    try { FN(FIREPAYLOAD); } catch (E) { /* resolver error does not block others */ }
  });
  SCHEDULERETENTIONPRUNE(TAG);
}

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

// ============================================================
// §5 — Mail handlers (P-HANDLER-FUNCTIONAL-CONVENTION)
// ============================================================
//
// Handlers take (ENV, ARGS); ARGS is the payload projection from
// EXTRACTPAYLOAD. Envelope keys (TYPE, SENDER, TAG, …) do not appear
// in ARGS.

function MAILSENDHANDLER(ENV, ARGS) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION: SEND');
  var NEXTENV = ENSUREENVSLICE(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });
  var MAILSLICE = NEXTENV.mail;

  var RECIPIENT = ARGS.RECIPIENT;
  if (!RECIPIENT || typeof RECIPIENT !== 'string') {
    return { ENV: NEXTENV };
  }
  if (!MAILSLICE.QUEUES[RECIPIENT]) MAILSLICE.QUEUES[RECIPIENT] = [];
  var FLATMESSAGE = ARGS.MESSAGE;

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

  if (GETMAILBOXEXEMPT()[RECIPIENT] !== true) {
    ADDENVELOPETOMAILBOX(ENVELOPE);
  }

  logdebug(ENV, '[MAILACTOR]', 'ENVELOPE STORED FOR POLLING RECIPIENT:', RECIPIENT, 'TAG=', FLATTAG);
  return { ENV: NEXTENV };
}

function MAILACKHANDLER(ENV, ARGS) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION: ACK');
  var NEXTENV = ENSUREENVSLICE(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });
  var MAILSLICE = NEXTENV.mail;

  var ACKRECIPIENT = ARGS.RECIPIENT;
  var ACKIDS = ARGS.IDS || [];
  var ACKQUEUE = MAILSLICE.QUEUES[ACKRECIPIENT] || [];
  ACKQUEUE.forEach(function(M) {
    if (ACKIDS.indexOf(M.ID || M.id) !== -1) {
      M.UNREAD = false;
    }
  });
  return { ENV: NEXTENV };
}

// ============================================================
// §6 — Mailactor's own vocabulary registration
// ============================================================

REGISTERACTORMESSAGE('MAILACTOR', 'SEND', { RECIPIENT: 'string', MESSAGE: 'object' }, MAILSENDHANDLER);
REGISTERACTORMESSAGE('MAILACTOR', 'ACK', { RECIPIENT: 'string', IDS: 'array' }, MAILACKHANDLER);

// @proposal=P-MESSAGEREGISTRY-ABSORPTION, R-EXEC — the BROADCAST ifaces
// recovered from the deleted registerconsumers.js. The BROADCAST
// recipient has no aggregate; the handler is null. Registration exists
// for MAILACTORVALIDATE's field-shape check.
REGISTERACTORMESSAGE('BROADCAST', 'BLOCKEXECUTED', {
  PIPELINEID: 'string?',
  STAGEPATH: 'array?',
  ELEMENTID: 'string?',
  TOKEN: 'string?',
  RESULT: 'object'
}, null);

REGISTERACTORMESSAGE('BROADCAST', 'BLOCKFAILED', {
  PIPELINEID: 'string?',
  STAGEPATH: 'array?',
  ELEMENTID: 'string?',
  TOKEN: 'string?',
  ERROR: 'string',
  DIAGNOSTIC: 'object'
}, null);

// ============================================================
// §7 — Mailactor's aggregate behaviour
// ============================================================
//
// @proposal=P-ACTOR-L1-L2-SEPARATION — delegates to INVOKEHANDLER.
// The { matched, result } shape is unwrapped; a non-match returns the
// ENV unchanged so DISPATCHPROJECT's contract is preserved.

function MAILBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('MAILACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERAGGREGATEBEHAVIOR('MAILACTOR', MAILBEHAVIOR);
ACTORCONSUMERS['MAILACTOR'] = MAILBEHAVIOR;

// ============================================================
// §8 — Mailbox query, polling, subscriptions
// ============================================================

function GETMAILBOX() {
  return MAILBOX.slice();
}

function QUERYMAILBOX(FILTER) {
  if (!FILTER) FILTER = {};
  var FILTERTYPE = FILTER.TYPE;
  if (FILTERTYPE !== undefined) {
    if (!MESSAGETYPEEXISTS(FILTERTYPE)) {
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

function POLLFALLBACK(FILTER, TIMEOUT, RESOLVE, REJECT) {
  if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.ACTIVECANCELLATIONTOKEN && blockcompilerstate.ACTIVECANCELLATIONTOKEN.CANCELLED) {
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
    if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.ACTIVECANCELLATIONTOKEN && blockcompilerstate.ACTIVECANCELLATIONTOKEN.CANCELLED) {
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
    if (typeof blockcompilerstate !== 'undefined' && blockcompilerstate.ACTIVECANCELLATIONTOKEN && blockcompilerstate.ACTIVECANCELLATIONTOKEN.CANCELLED) {
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

function WAITFORMAILBOX(FILTER, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = mailboxresolve('expectationtimeout');
  var TAGVAL = FILTER && FILTER.TAG;
  if (TAGVAL && EXPECTATIONS[TAGVAL] && EXPECTATIONS[TAGVAL].STATUS === 'PENDING') {
    var EARLY = QUERYMAILBOX(FILTER);
    if (EARLY.length > 0) {
      EARLY[0].READ = 'READ';
      return Promise.resolve(EARLY[0]);
    }
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

// ============================================================
// §9 — Broadcast subscription
// ============================================================

var BROADCASTSUBSCRIPTIONS = {};
var BROADCASTSUBCOUNTER = 0;

function SUBSCRIBEBROADCAST(PATTERN, HANDLER) {
  if (!PATTERN || typeof PATTERN !== 'object') {
    throw new Error('[SUBSCRIBEBROADCAST] PATTERN must be a non-null object');
  }
  if (typeof HANDLER !== 'function') {
    throw new Error('[SUBSCRIBEBROADCAST] HANDLER must be a function');
  }
  BROADCASTSUBCOUNTER += 1;
  var SUBID = 'BSUB' + BROADCASTSUBCOUNTER;
  BROADCASTSUBSCRIPTIONS[SUBID] = { PATTERN: PATTERN, HANDLER: HANDLER };
  return SUBID;
}

function UNSUBSCRIBEBROADCAST(SUBID) {
  if (typeof SUBID !== 'string' || SUBID.length === 0) return false;
  if (!BROADCASTSUBSCRIPTIONS[SUBID]) return false;
  delete BROADCASTSUBSCRIPTIONS[SUBID];
  return true;
}

function PATTERNMATCHES(PATTERN, MESSAGE) {
  var KEYS = Object.keys(PATTERN);
  return KEYS.every(function(KEY) {
    if (MESSAGE[KEY] === undefined) return false;
    return MESSAGE[KEY] === PATTERN[KEY];
  });
}

function DISPATCHBROADCAST(MESSAGE) {
  var SUBIDS = Object.keys(BROADCASTSUBSCRIPTIONS);
  SUBIDS.forEach(function(SUBID) {
    var SUB = BROADCASTSUBSCRIPTIONS[SUBID];
    if (!SUB) return;
    if (PATTERNMATCHES(SUB.PATTERN, MESSAGE)) {
      try { SUB.HANDLER(MESSAGE); } catch (E) { /* handler error does not block others */ }
    }
  });
}

// ============================================================
// §10 — Tag generation and send primitives
// ============================================================

function GENERATETAG() {
  return 'TAG' + Date.now() + Math.random().toString(36).slice(2, 10);
}

function SENDINSTRUCTION(RECIPIENT, TYPE, PAYLOAD, TAG, SENDER, RESPONSESPEC, CONTEXT, WAITMODE) {
  if (TAG === undefined) TAG = GENERATETAG();
  if (SENDER === undefined) SENDER = 'system';
  if (WAITMODE === undefined) WAITMODE = RESPONSESPEC ? 'mailbox' : 'promise';

  var FLATMESSAGE = { TYPE: TYPE, SENDER: SENDER, TAG: TAG, WAITMODE: WAITMODE };
  if (PAYLOAD && typeof PAYLOAD === 'object') {
    Object.keys(PAYLOAD).forEach(function(KEY) {
      if (KEY !== 'TYPE' && KEY !== 'SENDER' && KEY !== 'TAG' &&
          KEY !== 'RESPONSESPEC' && KEY !== 'CONTEXT' && KEY !== 'WAITMODE') {
        FLATMESSAGE[KEY] = PAYLOAD[KEY];
      }
    });
  }
  if (RESPONSESPEC) FLATMESSAGE.RESPONSESPEC = RESPONSESPEC;
  if (CONTEXT) FLATMESSAGE.CONTEXT = CONTEXT;

  var IFACES = MAILACTORINTERFACES(RECIPIENT);
  if (IFACES && Object.keys(IFACES).length > 0) {
    var VALIDATION = MAILACTORVALIDATE(RECIPIENT, FLATMESSAGE);
    if (VALIDATION.valid === false) {
      throw new Error('[MAILACTOR] Message validation failed for ' + RECIPIENT + ': ' + VALIDATION.error);
    }
  }

  var STRATEGY = INFERDISPATCHSTRATEGY(RECIPIENT, TYPE, FLATMESSAGE, SENDER, TAG, RESPONSESPEC);
  if (STRATEGY.suppress === true) return Promise.resolve(TAG);
  if (STRATEGY.batch === true) {
    ENQUEUEBATCH(RECIPIENT, TYPE, FLATMESSAGE, TAG, SENDER, RESPONSESPEC);
    return Promise.resolve(TAG);
  }
  if (STRATEGY.route === 'broadcast') {
    if (GETBROADCASTTYPES()[TYPE] === true) {
      DISPATCHBROADCAST(FLATMESSAGE);
    }
    return Promise.resolve(TAG);
  }
  if (STRATEGY.route === 'direct') {
    var CONSUMER = ACTORCONSUMERS[RECIPIENT];
    if (typeof CONSUMER !== 'function') {
      return Promise.resolve(DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, {
        TYPE: 'SEND',
        RECIPIENT: RECIPIENT,
        MESSAGE: FLATMESSAGE
      }));
    }
    var INSTALLER = function(stagedmessage) {
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
    };
    return Promise.resolve(DISPATCHTOACTOR(RECIPIENT, CONSUMER, FLATMESSAGE, INSTALLER));
  }
  return Promise.resolve(DISPATCHTOACTOR('MAILACTOR', MAILBEHAVIOR, {
    TYPE: 'SEND',
    RECIPIENT: RECIPIENT,
    MESSAGE: FLATMESSAGE
  }));
}

function SENDRESPONSE(RECIPIENT, TAG, RESULT, SENDER, RESPONSETYPE) {
  if (RESPONSETYPE === undefined) {
    throw new Error('[SENDRESPONSE] responseType is required');
  }
  var TYPE = RESPONSETYPE;
  var PAYLOAD = { RESULT: RESULT };
  SENDINSTRUCTION(RECIPIENT, TYPE, PAYLOAD, TAG, SENDER, undefined, null, 'mailbox');
}

function MAILGETACTIONSTATUS(ID) {
  if (typeof ID !== 'string' || ID.length === 0) return null;

  var EXP = EXPECTATIONS[ID];
  if (EXP) {
    if (EXP.STATUS === 'PENDING') return { STATUS: 'PENDING', RESULT: null, ERROR: null };
    if (EXP.STATUS === 'TIMEOUT') return { STATUS: 'EXPIRED', RESULT: null, ERROR: EXP.ERROR || null };
  }

  var RESPONSETYPESET = GETRESPONSETYPES();
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
