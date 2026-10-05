var UPDATETYPE = messagetype('UPDATE', {
  UPDATES: arraytype()
});
var UPDATEFNTYPE = messagetype('UPDATEFN', {
  FN: functiontype()
});
var OBSERVETYPE = messagetype('OBSERVE', {
  OBSERVER: functiontype()
});
var UNOBSERVETYPE = messagetype('UNOBSERVE', {
  OBSERVER: functiontype()
});
var GETWORLDMAPTYPE = messagetype('GETWORLDMAP', {});
var GETENVTYPE = messagetype('GETENV', {
  PIPELINEID: stringtype()
});

REGISTERMESSAGETYPE(UPDATETYPE);
REGISTERMESSAGETYPE(UPDATEFNTYPE);
REGISTERMESSAGETYPE(OBSERVETYPE);
REGISTERMESSAGETYPE(UNOBSERVETYPE);
REGISTERMESSAGETYPE(GETWORLDMAPTYPE);
REGISTERMESSAGETYPE(GETENVTYPE);

var WORLDMAPSTATE = { level: createverbosityconstants().DEBUG };

// @proposal=P22 — framework keys are never pruned.
// @proposal=P64-amendment-1 — DISPATCHERS is a framework key.
var FRAMEWORKKEYS = {
  DEBUG: true, EXECUTION: true, MAIL: true, HYPERVISOR: true, RENDER: true,
  db: true, VERBOSITY: true, OBSERVERS: true, pipestate: true,
  PIPELINEUSEDKEYS: true, DISPATCHERS: true
};

var PERSISTENTSLICES = { HYPERVISOR: true, db: true };

var PERSISTDEBOUNCE = 500;
var PERSISTMAXDEFER = 2000;
var PERSISTTIMER = null;
var PERSISTMAXTIMER = null;
var PERSISTPENDING = false;

function ISSETTLEDTASK(TASK) {
  if (!TASK) return false;
  var S = TASK.STATUS;
  var TERMINAL = S === 'EXECUTED' || S === 'FAILED' || S === 'CANCELLED' || S === 'STOPPED';
  if (!TERMINAL) return false;
  var C = TASK.CONSUMERS || [];
  return C.length === 0;
}

function ISUNUSEDKEY(KEY, ENV) {
  if (FRAMEWORKKEYS[KEY] === true) return false;
  var USEDMAP = ENV && ENV.PIPELINEUSEDKEYS;
  if (USEDMAP) {
    var FOUND = false;
    Object.keys(USEDMAP).forEach(function(PID) { if (FOUND) return; if (USEDMAP[PID] && USEDMAP[PID][KEY] === true) FOUND = true; });
    if (FOUND) return false;
  }
  return true;
}

function SWEEPSETTLEDTASKS(ENV) {
  if (!ENV || !ENV.EXECUTION || !ENV.EXECUTION.TASKS) return;
  var TASKS = ENV.EXECUTION.TASKS;
  var KEEP = {};
  var ORDER = ENV.EXECUTION.TASKORDER || [];
  var KEEPORDER = [];
  Object.keys(TASKS).forEach(function(TID) {
    var T = TASKS[TID];
    if (!ISSETTLEDTASK(T)) { KEEP[TID] = T; KEEPORDER.push(TID); }
  });
  ENV.EXECUTION.TASKS = KEEP;
  ENV.EXECUTION.TASKORDER = KEEPORDER.length === ORDER.length ? ORDER : KEEPORDER;
}

function CONSOLIDATEENV(ENV) {
  if (!ENV || typeof ENV !== 'object') return ENV;
  var OUT = {};
  Object.keys(ENV).forEach(function(K) { if (!ISUNUSEDKEY(K, ENV)) OUT[K] = ENV[K]; });
  SWEEPSETTLEDTASKS(OUT);
  return OUT;
}

function SELECTPERSISTENTSLICES(ENV) {
  if (!ENV || typeof ENV !== 'object') return {};
  var OUT = {};
  Object.keys(ENV).forEach(function(K) { if (PERSISTENTSLICES[K] === true) OUT[K] = ENV[K]; });
  return OUT;
}

function SETINPATH(OBJ, PATH, VALUE) {
  var KEYS = PATH.split('.');
  if (KEYS.length === 0) return VALUE;
  var KEY = KEYS[0];
  var REST = KEYS.slice(1).join('.');
  var NEXTOBJ = OBJ && typeof OBJ === 'object' ? OBJ : {};
  var UPDATEDCHILD = REST ? SETINPATH(NEXTOBJ[KEY], REST, VALUE) : VALUE;
  var NEWOBJ = Array.isArray(NEXTOBJ) ? NEXTOBJ.slice() : Object.keys(NEXTOBJ).reduce(function(ACC, K) { ACC[K] = NEXTOBJ[K]; return ACC; }, {});
  NEWOBJ[KEY] = UPDATEDCHILD;
  return NEWOBJ;
}

function APPLYVALUESET(ENV, UPDATES) {
  return UPDATES.reduce(function(ACC, UPDATE) { return SETINPATH(ACC, UPDATE.PATH, UPDATE.VALUE); }, ENV);
}

function PERSISTENV(ENV) {
  PERSISTPENDING = true;
  if (PERSISTTIMER) { clearTimeout(PERSISTTIMER); PERSISTTIMER = null; }
  PERSISTTIMER = setTimeout(function() {
    PERSISTTIMER = null;
    if (PERSISTMAXTIMER) { clearTimeout(PERSISTMAXTIMER); PERSISTMAXTIMER = null; }
    DOPERSIST(ENV);
  }, PERSISTDEBOUNCE);
  if (!PERSISTMAXTIMER) {
    PERSISTMAXTIMER = setTimeout(function() {
      PERSISTMAXTIMER = null;
      if (PERSISTPENDING) { if (PERSISTTIMER) { clearTimeout(PERSISTTIMER); PERSISTTIMER = null; } DOPERSIST(ENV); }
    }, PERSISTMAXDEFER);
  }
}

function DOPERSIST(ENV) {
  if (!PERSISTPENDING) return;
  PERSISTPENDING = false;
  var PAYLOAD = SELECTPERSISTENTSLICES(ENV);
  var STOREFN = (typeof DBSTORE === 'function') ? DBSTORE : (typeof DB_STORE === 'function' ? DB_STORE : function() { return Promise.resolve(true); });
  var RUNCALL = function() {
    STOREFN('actor:state:env', PAYLOAD).then(function(SUCCESS) {
      if (SUCCESS === false) logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED');
    }).catch(function(E) { logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED:', E); });
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    try { window.requestIdleCallback(RUNCALL, { timeout: 500 }); return; } catch (e) { /* fall through */ }
  }
  setTimeout(RUNCALL, 0);
}

function RECOVERENV() {
  logdebug({}, '[WORLDMAPACTOR]', 'RECOVERENV START');
  var RESTOREFN = (typeof DBRESTORE === 'function') ? DBRESTORE : (typeof DB_RESTORE === 'function' ? DB_RESTORE : function() { return Promise.resolve(null); });
  return RESTOREFN('actor:state:env').then(function(SAVED) {
    if (SAVED !== null && SAVED !== undefined) { loginfo(SAVED, '[WORLDMAPACTOR]', 'RECOVERENV RESTORED ENV'); return CONSOLIDATEENV(SAVED); }
    loginfo({}, '[WORLDMAPACTOR]', 'RECOVERENV NO SAVED ENV, USING EMPTY CONTAINER');
    return {};
  });
}

// ============================================================
// §1 — Message handlers
// ============================================================

function WORLDMAPBEHAVIORUPDATE(ENV, ARGS) {
  if (!ARGS.UPDATES || !Array.isArray(ARGS.UPDATES)) {
    logwarn(ENV, '[WORLDMAPACTOR]', 'UPDATE MISSING UPDATES ARRAY');
    return ENV;
  }
  var MERGED = APPLYVALUESET(ENV, ARGS.UPDATES);
  var NEWENV = CONSOLIDATEENV(MERGED);
  (NEWENV.OBSERVERS || []).forEach(function(OBSERVER) {
    try { OBSERVER(NEWENV); } catch (ERR) { logwarn(NEWENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
  });
  PERSISTENV(NEWENV);
  return NEWENV;
}

function WORLDMAPBEHAVIORUPDATEFN(ENV, ARGS) {
  var RESULT = ARGS.FN(ENV);
  if (RESULT === undefined) RESULT = ENV;
  var NEXTENV = CONSOLIDATEENV(RESULT);
  (NEXTENV.OBSERVERS || []).forEach(function(OBSERVER) {
    try { OBSERVER(NEXTENV); } catch (ERR) { logwarn(NEXTENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
  });
  PERSISTENV(NEXTENV);
  return NEXTENV;
}

function WORLDMAPBEHAVIOROBSERVE(ENV, ARGS) {
  var NEWOBSERVERS = (ENV.OBSERVERS || []).concat([ARGS.OBSERVER]);
  return SETINPATH(ENV, 'OBSERVERS', NEWOBSERVERS);
}

function WORLDMAPBEHAVIORUNOBSERVE(ENV, ARGS) {
  var FILTERED = (ENV.OBSERVERS || []).filter(function(OBS) { return OBS !== ARGS.OBSERVER; });
  return SETINPATH(ENV, 'OBSERVERS', FILTERED);
}

// @proposal=P-ACTOR-FLOW-002 — response via return, not SENDRESPONSE.
function WORLDMAPBEHAVIORGETENV(ENV, ARGS) {
  return { ENV: ENV, RESPONSE: ENV };
}

// ============================================================
// §2 — Handler registration
// ============================================================

REGISTERACTORMESSAGE('WORLDMAPACTOR', UPDATETYPE,
  WORLDMAPBEHAVIORUPDATE);

REGISTERACTORMESSAGE('WORLDMAPACTOR', UPDATEFNTYPE,
  WORLDMAPBEHAVIORUPDATEFN);

REGISTERACTORMESSAGE('WORLDMAPACTOR', OBSERVETYPE,
  WORLDMAPBEHAVIOROBSERVE);

REGISTERACTORMESSAGE('WORLDMAPACTOR', UNOBSERVETYPE,
  WORLDMAPBEHAVIORUNOBSERVE);

REGISTERACTORMESSAGE('WORLDMAPACTOR', GETWORLDMAPTYPE,
  WORLDMAPBEHAVIORGETENV);

REGISTERACTORMESSAGE('WORLDMAPACTOR', GETENVTYPE,
  WORLDMAPBEHAVIORGETENV);

// ============================================================
// §3 — Aggregate behaviour
// ============================================================

function WORLDMAPBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('WORLDMAPACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERDISPATCH('WORLDMAPACTOR', WORLDMAPBEHAVIOR);

// ============================================================
// §4 — World-map state registration and start
// ============================================================

REGISTERACTORSTATE('WORLDMAPACTOR', {});

function STARTWORLDMAPACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS : (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      WORLDMAPSTATE = { level: LVL };
      var ENVFORVERBOSITY = GETACTORSTATE('WORLDMAPACTOR');
      if (ENVFORVERBOSITY) SETACTORSTATE('WORLDMAPACTOR', SETINPATH(ENVFORVERBOSITY, 'VERBOSITY', LVL));
    }
  }
  var CURRENTENV = GETACTORSTATE('WORLDMAPACTOR') || {};
  return RECOVERENV().then(function(SAVED) {
    SETACTORSTATE('WORLDMAPACTOR', SAVED);
    return SAVED;
  }).catch(function(ERR) {
    logwarn(CURRENTENV, '[WORLDMAPACTOR]', 'STATE RESTORE FAILED:', ERR);
    return CURRENTENV;
  });
}

// ============================================================
// §5 — Actor handle surface
// ============================================================

var WORLDMAPHANDLE = null;

function WORLDMAPHANDLEINSTANCE() {
  if (!WORLDMAPHANDLE) WORLDMAPHANDLE = CREATEACTORHANDLE('WORLDMAPACTOR');
  return WORLDMAPHANDLE;
}

function SUBMIT(ACTION) { return WORLDMAPHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return WORLDMAPHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return WORLDMAPHANDLEINSTANCE().GETACTIONRESULT(ID); }

// ============================================================
// §6 — Producers (literals)
// ============================================================

function SENDWORLDMAPPATCH(PATCH, RESPONSESPEC) {
  if (PATCH && PATCH.UPDATES) {
    var TAG = GENERATETAG();
    SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', { UPDATES: PATCH.UPDATES }, TAG, 'system', RESPONSESPEC);
  }
}

function UPDATEWORLDMAPFN(FN, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATEFN', { FN: FN }, TAG, 'system', RESPONSESPEC);
}

function OBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', 'OBSERVE', { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function UNOBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', 'UNOBSERVE', { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function GETWORLDMAP(RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', 'GETWORLDMAP', {}, TAG, 'system', RESPONSESPEC);
}
