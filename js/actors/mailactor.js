var MAILVERBOSITYCONSTANTS = createverbosityconstants();
var MAILSTATE = { level: MAILVERBOSITYCONSTANTS.DEBUG };

var PINGTYPE = messagetype('PING', {
  SENDER: optionaltype(stringtype()),
  TAG: optionaltype(stringtype())
});
var RESPONSETYPE = messagetype('RESPONSE', {});
var SENDTYPE = messagetype('SEND', {
  RECIPIENT: stringtype(),
  MESSAGE: objecttype()
});
var ACKTYPE = messagetype('ACK', {
  RECIPIENT: stringtype(),
  IDS: arraytype()
});

REGISTERMESSAGETYPE(PINGTYPE);
REGISTERMESSAGETYPE(RESPONSETYPE);
REGISTERMESSAGETYPE(SENDTYPE);
REGISTERMESSAGETYPE(ACKTYPE);

REGISTERRESPONSETYPE('RESPONSE');
var MAILACTORVOCABULARY = {};

var MAILACTORENVELOPEKEYS = {
  TYPE: true,
  SENDER: true,
  TAG: true,
  RECIPIENT: true,
  WAITMODE: true,
  RESPONSESPEC: true,
  CONTEXT: true
};

// Private. Reads the type-value map for one actor; used by SENDINSTRUCTION's
// validation gate.
function MAILACTORINTERFACES(ACTORNAME) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME] || {};
  var MAP = {};
  Object.keys(ENTRY).forEach(function (TYPE) {
    MAP[TYPE] = ENTRY[TYPE].type ? ENTRY[TYPE].type.iface : {};
  });
  return MAP;
}

// Private. Validates a message against its type value's shape (required
// fields) and against the envelope-undeclared-field rule (R43). The
// envelope-identity keys are exempt from the undeclared-field rule.
function MAILACTORVALIDATE(ACTORNAME, MESSAGE) {
  if (!MESSAGE || typeof MESSAGE !== 'object') {
    return { valid: false, error: 'message must be a non-null object', type: null };
  }
  var TYPE = MESSAGE.TYPE || MESSAGE.type;
  if (!TYPE || typeof TYPE !== 'string') {
    return { valid: false, error: 'message type must be a string, got: ' + typeof TYPE, type: String(TYPE) };
  }
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  var ENTRYTYPE = (ENTRY && ENTRY[TYPE]) ? ENTRY[TYPE].type : null;
  if (!ENTRYTYPE) {
    ENTRYTYPE = GETMESSAGETYPE(TYPE);
  }
  if (!ENTRYTYPE) {
    return { valid: false, error: 'unknown message type: ' + TYPE, type: TYPE };
  }

  var R = ENTRYTYPE.validate(MESSAGE);
  if (R.valid !== true) {
    return { valid: false, error: R.errors.join('; '), type: TYPE };
  }

  var UNDECLARED = [];
  Object.keys(MESSAGE).forEach(function (K) {
    if (MAILACTORENVELOPEKEYS[K] === true) return;
    if (MESSAGE[K] === undefined) return;
    if (ENTRYTYPE.iface[K] === undefined) UNDECLARED.push(K);
  });
  if (UNDECLARED.length > 0) {
    return { valid: false, error: 'undeclared fields: ' + UNDECLARED.join(', '), type: TYPE };
  }

  return { valid: true, error: null, type: TYPE };
}

// Public. Registers a (typevalue ↦ handler) mapping for ACTORNAME.
// TYPEVALUE must be a type value produced by messagetype. HANDLERFN is
// the per-type handler (ENV, ARGS) → …; it may be null.
function REGISTERACTORMESSAGE(ACTORNAME, TYPEVALUE, HANDLERFN) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[REGISTERACTORMESSAGE] ACTORNAME must be a non-empty string');
  }
  if (typeof TYPEVALUE !== 'function' || typeof TYPEVALUE.typename !== 'string' || TYPEVALUE.typename.length === 0) {
    throw new Error('[REGISTERACTORMESSAGE] TYPEVALUE must be a type value produced by messagetype');
  }
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (!ENTRY) {
    ENTRY = {};
    MAILACTORVOCABULARY[ACTORNAME] = ENTRY;
  }
  ENTRY[TYPEVALUE.typename] = { type: TYPEVALUE, handler: HANDLERFN || null };
  return ENTRY[TYPEVALUE.typename];
}

// Public. Returns the per-type handler for (ACTORNAME, TYPE), or null.
function RESOLVEHANDLER(ACTORNAME, TYPE) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (ENTRY && ENTRY[TYPE] && typeof ENTRY[TYPE].handler === 'function') {
    return ENTRY[TYPE].handler;
  }
  return null;
}

// Public. Projects MESSAGE onto the payload keys of the type value's iface
// for (ACTORNAME, TYPE). Envelope-identity keys are excluded defensively.
function EXTRACTPAYLOAD(ACTORNAME, TYPE, MESSAGE) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  var ENTRYTYPE = (ENTRY && ENTRY[TYPE]) ? ENTRY[TYPE].type : null;
  if (!ENTRYTYPE) return {};
  var PROJECTED = ENTRYTYPE.project(MESSAGE);
  Object.keys(MAILACTORENVELOPEKEYS).forEach(function (K) {
    if (MAILACTORENVELOPEKEYS[K] === true && Object.prototype.hasOwnProperty.call(PROJECTED, K)) {
      delete PROJECTED[K];
    }
  });
  return PROJECTED;
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
//
// @proposal=P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH — the queue is the
// DB. EXPECTATIONS is retained as the local waiter registry: the
// sender-side record of which TAGs the current process is awaiting.
// The former in-memory mailbox and its indexes are retired.

var EXPECTATIONS = {};

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
//
// @proposal=P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH — the deposit
// primitive (ADDENVELOPETOMAILBOX) is retired: SENDINSTRUCTION writes
// directly to the DB queue. The retention scheduler
// (SCHEDULERETENTIONPRUNE) is retired: MAILGCSTEP performs the
// scheduled deletion. CREATEEXPECTATION is idempotent so that the
// caller's WAITFORMAILBOX (armed before the dispatched behaviour has
// run) and DISPATCHINSTALL (armed after the behaviour returns) do not
// clobber each other's expectation.

function CREATEEXPECTATION(TAG, RECIPIENT, SENDER, TYPE, CONTEXT, RESPONSESPEC) {
  if (EXPECTATIONS[TAG] && EXPECTATIONS[TAG].STATUS === 'PENDING') {
    return EXPECTATIONS[TAG];
  }
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
  var RESOLVERS = EXP.RESOLVERS.slice();
  RESOLVERS.forEach(function(FN) {
    try { FN(FIREPAYLOAD); } catch (E) { /* resolver error does not block others */ }
  });
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
}

// ============================================================
// §5 — Mail vocabulary registration
// ============================================================
//
// @proposal=P-MAILACTOR-DEAD-BRANCH-REMOVAL — MAILACTOR no longer
// registers any per-type handler of its own. The SEND and ACK branches
// were unreachable; the handlers and their registrations were removed.
// Only BROADCAST's ifaces (recovered from the deleted registerconsumers.js
// under @proposal=P-MESSAGEREGISTRY-ABSORPTION) remain, for
// MAILACTORVALIDATE's field-shape check.
//
// @proposal=P-MESSAGETYPE-TYPED-INTERFACE — the BROADCAST ifaces are
// now type values. The ifaces are declared inside the type value's SPEC.

var BLOCKEXECUTEDTYPE = messagetype('BLOCKEXECUTED', {
  PIPELINEID: optionaltype(stringtype()),
  STAGEPATH: optionaltype(arraytype()),
  ELEMENTID: optionaltype(stringtype()),
  TOKEN: optionaltype(stringtype()),
  RESULT: objecttype()
});
REGISTERMESSAGETYPE(BLOCKEXECUTEDTYPE);
REGISTERACTORMESSAGE('BROADCAST', BLOCKEXECUTEDTYPE, null);

var BLOCKFAILEDTYPE = messagetype('BLOCKFAILED', {
  PIPELINEID: optionaltype(stringtype()),
  STAGEPATH: optionaltype(arraytype()),
  ELEMENTID: optionaltype(stringtype()),
  TOKEN: optionaltype(stringtype()),
  ERROR: stringtype(),
  DIAGNOSTIC: objecttype()
});
REGISTERMESSAGETYPE(BLOCKFAILEDTYPE);
REGISTERACTORMESSAGE('BROADCAST', BLOCKFAILEDTYPE, null);

// @proposal=P-FACTORY-ACTOR-NAME-INVERSION — the BROADCAST type names
// owned by mailactor.js, published by their owner. The factory layer
// (blockcompilers.js::makecaptureerror) obtains these by calling the
// accessor rather than inlining the string literals. The values are
// identical to the strings REGISTERBROADCASTTYPE installs.
function BROADCASTNAMES() {
  return Object.freeze({
    BLOCKEXECUTED: 'BLOCKEXECUTED',
    BLOCKFAILED: 'BLOCKFAILED'
  });
}

// ============================================================
// §8 — Wait primitive
// ============================================================
//
// @proposal=P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH — WAITFORMAILBOX
// arms the expectation (creating it if absent) and returns a Promise
// that resolves when MAILDELIVER (invoked by the interval when the
// matching envelope is read) calls RESOLVEEXPECTATION. Polling
// mechanisms (QUERYMAILBOX, POLLFALLBACK) are retired.

function WAITFORMAILBOX(FILTER, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = mailboxresolve('expectationtimeout');
  var TAGVAL = FILTER && FILTER.TAG;
  if (!TAGVAL) {
    return Promise.reject(new Error('[WAITFORMAILBOX] FILTER must carry a TAG'));
  }
  CREATEEXPECTATION(TAGVAL, FILTER.RECIPIENT || '', FILTER.SENDER || 'system', null, null, null);
  return new Promise(function (RESOLVE, REJECT) {
    var SETTLED = false;
    function ONSETTLE(FN, ARG) {
      if (SETTLED) return;
      SETTLED = true;
      FN(ARG);
    }
    ARMEXPECTATIONRESOLVER(
      TAGVAL,
      function (PAYLOADVAL) { ONSETTLE(RESOLVE, PAYLOADVAL); },
      function (ERR) { ONSETTLE(REJECT, ERR); }
    );
    setTimeout(function () {
      if (SETTLED) return;
      var TIMEOUTERR = new Error('Mailbox wait timeout for tag: ' + TAGVAL);
      TIMEOUTERR.diagnostic = TIMEOUTERR.diagnostic || {};
      TIMEOUTERR.diagnostic.KIND = 'mailbox-wait-timeout';
      ONSETTLE(REJECT, TIMEOUTERR);
    }, TIMEOUT);
  });
}

// ============================================================
// §9 — Broadcast subscription
// ============================================================
//
// @proposal=P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH — subscriber
// handlers are wrapped at registration: the stored value is a
// promise-returning function. DISPATCHBROADCAST iterates the wrappers
// and does not invoke any subscriber within the caller's synchronous
// frame.

var BROADCASTSUBSCRIPTIONS = {};
var BROADCASTSUBCOUNTER = 0;

function SUBSCRIBEBROADCAST(PATTERN, HANDLER) {
  if (!PATTERN || typeof PATTERN !== 'object') {
    throw new Error('[SUBSCRIBEBROADCAST] PATTERN must be a non-null object');
  }
  if (typeof HANDLER !== 'function') {
    throw new Error('[SUBSCRIBEBROADCAST] HANDLER must be a function');
  }
  var WRAPPED = function (MESSAGE) {
    return Promise.resolve().then(function () {
      return HANDLER(MESSAGE);
    });
  };
  BROADCASTSUBCOUNTER += 1;
  var SUBID = 'BSUB' + BROADCASTSUBCOUNTER;
  BROADCASTSUBSCRIPTIONS[SUBID] = { PATTERN: PATTERN, HANDLER: WRAPPED };
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
  return SUBIDS.reduce(function (CHAIN, SUBID) {
    return CHAIN.then(function () {
      var SUB = BROADCASTSUBSCRIPTIONS[SUBID];
      if (!SUB) return;
      if (!PATTERNMATCHES(SUB.PATTERN, MESSAGE)) return;
      return Promise.resolve().then(function () {
        return SUB.HANDLER(MESSAGE);
      }).catch(function (E) { /* handler error does not block others */ });
    });
  }, Promise.resolve());
}

// ============================================================
// §10 — Tag generation and send primitives
// ============================================================

function GENERATETAG() {
  return 'TAG' + Date.now() + Math.random().toString(36).slice(2, 10);
}

// @proposal=P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH — on the mailbox
// route, SENDINSTRUCTION writes the flat message to the DB queue under
// 'mail:unopened:' + TAG. The direct and broadcast routes are
// unchanged. The external contract:
//   direct route    — Promise resolving to { ENV, RESPONSE } (the
//                     dispatcher's value; @proposal=P-SENDINSTRUCTION-
//                     DIRECT-RETURN restores this shape).
//   broadcast route — Promise resolving to TAG.
//   mailbox route   — Promise resolving to TAG.
//
// @proposal=P-MAIL-INTERVAL-QUIET — the mailbox route also updates the
// in-memory counter MAILUNOPENEDCOUNT: incremented before the DBSTORE
// and decremented if the store fails, so the count reflects the number
// of envelopes the current tab has pending in the unopened namespace.
//
// @proposal=P-SENDINSTRUCTION-RECIPIENT-FOLD — RECIPIENT is folded
// into FLATMESSAGE's literal so that the persisted envelope carries
// the intended recipient, and RECIPIENT is guarded against payload
// overwrite so the fold cannot be silently undone.
//
// @proposal=P-MESSAGETYPE-TYPED-INTERFACE — the type argument may be
// a type value or a registered type name. A name is resolved via
// GETMESSAGETYPE; an unknown name raises. The payload's shape is
// validated against the recipient's type value before dispatch.
//
// @proposal=P-IFACE-VALIDATION-GATE — when the recipient has a
// registered dispatch behaviour (ACTORCONSUMERS[RECIPIENT] is a
// function) but no registered message-type ifaces
// (MAILACTORINTERFACES(RECIPIENT) is empty), SENDINSTRUCTION raises
// [MAILACTOR] no-interface-for-recipient. This closes the silent
// bypass that permitted undeclared fields to reach a handler whose
// type had no shape contract.
function SENDINSTRUCTION(RECIPIENT, TYPEARG, PAYLOAD, TAG, SENDER, RESPONSESPEC, CONTEXT, WAITMODE) {
  if (TAG === undefined) TAG = GENERATETAG();
  if (SENDER === undefined) SENDER = 'system';
  if (WAITMODE === undefined) WAITMODE = RESPONSESPEC ? 'mailbox' : 'promise';

  var TYPE;
  if (typeof TYPEARG === 'function' && typeof TYPEARG.typename === 'string' && TYPEARG.typename.length > 0) {
    TYPE = TYPEARG.typename;
  } else if (typeof TYPEARG === 'string' && TYPEARG.length > 0) {
    if (typeof MESSAGETYPEEXISTS === 'function' && MESSAGETYPEEXISTS(TYPEARG) !== true) {
      throw new Error('[SENDINSTRUCTION] unknown message type: ' + TYPEARG);
    }
    TYPE = TYPEARG;
  } else {
    throw new Error('[SENDINSTRUCTION] TYPE must be a type value or a non-empty string');
  }

  var FLATMESSAGE = { TYPE: TYPE, SENDER: SENDER, TAG: TAG, RECIPIENT: RECIPIENT, WAITMODE: WAITMODE };
  if (PAYLOAD && typeof PAYLOAD === 'object') {
    Object.keys(PAYLOAD).forEach(function(KEY) {
      if (KEY !== 'TYPE' && KEY !== 'SENDER' && KEY !== 'TAG' &&
          KEY !== 'RECIPIENT' && KEY !== 'RESPONSESPEC' && KEY !== 'CONTEXT' && KEY !== 'WAITMODE') {
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
  } else if (typeof ACTORCONSUMERS[RECIPIENT] === 'function') {
    throw new Error('[MAILACTOR] no-interface-for-recipient: ' + RECIPIENT +
      ' has a registered dispatch behaviour but no registered message-type ifaces');
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
    if (typeof CONSUMER === 'function') {
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
      return DISPATCHTOACTOR(RECIPIENT, CONSUMER, FLATMESSAGE, INSTALLER);
    }
  }
  MAILUNOPENEDCOUNT = MAILUNOPENEDCOUNT + 1;
  return DBSTORE('mail:unopened:' + TAG, FLATMESSAGE)
    .then(function () { return TAG; })
    .catch(function (ERR) {
      MAILUNOPENEDCOUNT = Math.max(0, MAILUNOPENEDCOUNT - 1);
      throw ERR;
    });
}

function SENDRESPONSE(RECIPIENT, TAG, RESULT, SENDER, RESPONSETYPE) {
  if (RESPONSETYPE === undefined) {
    throw new Error('[SENDRESPONSE] responseType is required');
  }
  var TYPEVALUE = (typeof RESPONSETYPE === 'function') ? RESPONSETYPE : GETMESSAGETYPE(RESPONSETYPE);
  if (!TYPEVALUE) {
    throw new Error('[SENDRESPONSE] unknown response type: ' + RESPONSETYPE);
  }
  var PAYLOAD = { RESULT: RESULT };
  SENDINSTRUCTION(RECIPIENT, TYPEVALUE, PAYLOAD, TAG, SENDER, undefined, null, 'mailbox');
}

function MAILGETACTIONSTATUS(ID) {
  if (typeof ID !== 'string' || ID.length === 0) return null;
  var EXP = EXPECTATIONS[ID];
  if (EXP) {
    if (EXP.STATUS === 'PENDING') return { STATUS: 'PENDING', RESULT: null, ERROR: null };
    if (EXP.STATUS === 'TIMEOUT') return { STATUS: 'EXPIRED', RESULT: null, ERROR: EXP.ERROR || null };
  }
  return null;
}

// ============================================================
// §11 — Consumer interval (P-MAILACTOR-DB-QUEUE-AND-ASYNC-DISPATCH)
// ============================================================
//
// One interval per MAILACTOR. Each tick executes two passes:
//   (1) GC pass — delete every envelope opened in a prior tick.
//   (2) Read pass — read every unopened envelope; move it to the opened
//       namespace; deliver it (resolve a pending expectation or
//       dispatch to a registered recipient).
//
// The two-pass order gives the envelope lifetime: at most
// 2 × pollinterval after deposit; at least pollinterval.
//
// @proposal=P-MAIL-INTERVAL-QUIET — the tick short-circuits when there
// is no work to do. Three module-local variables track the state:
//   MAILUNOPENEDCOUNT — envelopes this tab has deposited that have not
//                       yet been read.
//   MAILOPENEDCOUNT   — envelopes this tab has read that have not yet
//                       been GC'd.
//   MAILCONSUMERBOOTED — false until the first tick runs; the first tick
//                        runs unconditionally so that a reload reconciles
//                        the DB's actual state with the counters.
// When both counters are zero and the first tick has run, the tick
// returns without invoking DBLISTPREFIX and without emitting a
// [DBACTOR] log line.
//
// @proposal=P-MAILBOXCONFIG-OVERRIDE-TIMING — the tick is scheduled by
// a self-rescheduling setTimeout chain. Each tick re-reads
// mailboxresolve('pollinterval'), so the appinit / bootloader overrides
// are honored even when they are installed after this file has loaded.

var MAILUNOPENEDCOUNT = 0;
var MAILOPENEDCOUNT = 0;
var MAILCONSUMERBOOTED = false;

function MAILCONSUMERSTEP() {
  if (MAILCONSUMERBOOTED === true && MAILUNOPENEDCOUNT === 0 && MAILOPENEDCOUNT === 0) {
    return;
  }
  MAILCONSUMERBOOTED = true;
  MAILGCSTEP().then(MAILREADSTEP).catch(function (ERR) {
    logwarn(MAILSTATE, '[MAILACTOR]', 'CONSUMER STEP FAILED:',
            ERR && ERR.message ? ERR.message : String(ERR));
  });
}

function MAILGCSTEP() {
  return DBLISTPREFIX('mail:opened:').then(function (OPENED) {
    return OPENED.reduce(function (CHAIN, K) {
      return CHAIN.then(function () { return DBDELETE(K); })
        .then(function () { MAILOPENEDCOUNT = Math.max(0, MAILOPENEDCOUNT - 1); });
    }, Promise.resolve());
  });
}

function MAILREADSTEP() {
  return DBLISTPREFIX('mail:unopened:').then(function (UNOPENED) {
    return UNOPENED.reduce(function (CHAIN, K) {
      return CHAIN.then(function () { return MAILCONSUMEONE(K); });
    }, Promise.resolve());
  });
}

function MAILCONSUMEONE(KEY) {
  return DBRESTORE(KEY).then(function (MESSAGE) {
    if (MESSAGE === null || MESSAGE === undefined) {
      MAILUNOPENEDCOUNT = Math.max(0, MAILUNOPENEDCOUNT - 1);
      return;
    }
    var TAG = MESSAGE.TAG;
    var VALIDATION = MAILACTORVALIDATE(MESSAGE.RECIPIENT, MESSAGE);
    if (VALIDATION.valid !== true) {
      logwarn(MAILSTATE, '[MAILACTOR]', 'DISCARDED INVALID MESSAGE:', VALIDATION.error);
      MAILUNOPENEDCOUNT = Math.max(0, MAILUNOPENEDCOUNT - 1);
      return DBDELETE(KEY);
    }
    return DBDELETE(KEY)
      .then(function () { MAILUNOPENEDCOUNT = Math.max(0, MAILUNOPENEDCOUNT - 1); })
      .then(function () { return DBSTORE('mail:opened:' + TAG, MESSAGE); })
      .then(function () { MAILOPENEDCOUNT = MAILOPENEDCOUNT + 1; })
      .then(function () { MAILDELIVER(MESSAGE); });
  });
}

function MAILDELIVER(MESSAGE) {
  var TAG = MESSAGE.TAG;
  var SENDER = MESSAGE.SENDER;
  var RECIPIENT = MESSAGE.RECIPIENT;
  var TYPE = MESSAGE.TYPE;
  var RESPONSESPEC = MESSAGE.RESPONSESPEC;

  if (TAG && EXPECTATIONS[TAG] && EXPECTATIONS[TAG].STATUS === 'PENDING') {
    RESOLVEEXPECTATION(TAG, MESSAGE);
    return;
  }
  var STRATEGY = INFERDISPATCHSTRATEGY(RECIPIENT, TYPE, MESSAGE, SENDER, TAG, RESPONSESPEC);
  if (STRATEGY.suppress === true) return;
  if (STRATEGY.route === 'broadcast') { DISPATCHBROADCAST(MESSAGE); return; }
  if (STRATEGY.route === 'direct') {
    var CONSUMER = ACTORCONSUMERS[RECIPIENT];
    if (typeof CONSUMER === 'function') { DISPATCHTOACTOR(RECIPIENT, CONSUMER, MESSAGE); return; }
  }
  logwarn(MAILSTATE, '[MAILACTOR]', 'DISCARDED UNROUTABLE ENVELOPE:', TYPE, TAG);
}

// @proposal=P-MAILBOXCONFIG-OVERRIDE-TIMING — self-rescheduling chain.
// MAILCONSUMERINTERVALID holds the current setTimeout handle. Each tick
// re-reads mailboxresolve('pollinterval') so that later overrides (e.g.
// a hot-reloaded appinit or bootloader config) are honored.
var MAILCONSUMERINTERVALID = null;

function MAILCONSUMERSCHEDULE() {
  MAILCONSUMERINTERVALID = setTimeout(function () {
    MAILCONSUMERSTEP();
    MAILCONSUMERSCHEDULE();
  }, mailboxresolve('pollinterval'));
}

MAILCONSUMERSCHEDULE();
