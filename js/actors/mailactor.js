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
function MAILACTORINTERFACES(ACTORNAME) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME] || {};
  var MAP = {};
  Object.keys(ENTRY).forEach(function (TYPE) {
    MAP[TYPE] = ENTRY[TYPE].iface;
  });
  return MAP;
}
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
function RESOLVEHANDLER(ACTORNAME, TYPE) {
  var ENTRY = MAILACTORVOCABULARY[ACTORNAME];
  if (ENTRY && ENTRY[TYPE] && typeof ENTRY[TYPE].handler === 'function') {
    return ENTRY[TYPE].handler;
  }
  return null;
}
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
var EXPECTATIONS = {};
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
REGISTERBROADCASTTYPE('BLOCKEXECUTED');
REGISTERBROADCASTTYPE('BLOCKFAILED');
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
function MAILSENDHANDLER(ENV, ARGS) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION: SEND');
  var NEXTENV = ENSUREENVSLICE(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });
  return { ENV: NEXTENV };
}

function MAILACKHANDLER(ENV, ARGS) {
  logdebug(ENV, '[MAILACTOR]', 'BEHAVIOR HANDLING ACTION: ACK');
  var NEXTENV = ENSUREENVSLICE(ENV, 'mail', function() { return { QUEUES: {}, NEXTID: 1 }; });
  return { ENV: NEXTENV };
}
REGISTERACTORMESSAGE('MAILACTOR', 'SEND', { RECIPIENT: 'string', MESSAGE: 'object' }, MAILSENDHANDLER);
REGISTERACTORMESSAGE('MAILACTOR', 'ACK', { RECIPIENT: 'string', IDS: 'array' }, MAILACKHANDLER);
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
function MAILBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('MAILACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERDISPATCH('MAILACTOR', MAILBEHAVIOR);
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
      return DISPATCHTOACTOR(RECIPIENT, CONSUMER, FLATMESSAGE, INSTALLER).then(function () { return TAG; });
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
  var MAILCONSUMER = ACTORCONSUMERS['MAILACTOR'];
  if (typeof MAILCONSUMER === 'function') DISPATCHTOACTOR('MAILACTOR', MAILCONSUMER, MESSAGE);
}

var MAILCONSUMERINTERVALID = setInterval(MAILCONSUMERSTEP, mailboxresolve('pollinterval'));
