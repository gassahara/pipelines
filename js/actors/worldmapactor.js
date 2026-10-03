var WORLDMAPVERBOSITYCONSTANTS = createverbosityconstants();
var WORLDMAPSTATE = { level: WORLDMAPVERBOSITYCONSTANTS.DEBUG };

// @proposal=P22 — framework keys are never pruned by unused-removal.
// @proposal=P64-amendment-1 — DISPATCHERS is a framework key: it holds
// the per-actor dispatcher lists installed by the surface on first use.
var FRAMEWORKKEYS = {
  DEBUG: true,
  EXECUTION: true,
  MAIL: true,
  HYPERVISOR: true,
  RENDER: true,
  db: true,
  VERBOSITY: true,
  OBSERVERS: true,
  pipestate: true,
  PIPELINEUSEDKEYS: true,
  DISPATCHERS: true
};

// @proposal=P16 — persistent slices are included in the persisted payload.
var PERSISTENTSLICES = {
  HYPERVISOR: true,
  db: true
};

// @proposal=P16 — debounce parameters and state.
var PERSISTDEBOUNCE = 500;
var PERSISTMAXDEFER = 2000;
var PERSISTTIMER = null;
var PERSISTMAXTIMER = null;
var PERSISTPENDING = false;

// @proposal=P22 — settled task predicate.
function ISSETTLEDTASK(TASK) {
  if (!TASK) return false;
  var S = TASK.STATUS;
  var TERMINAL = S === 'EXECUTED' || S === 'FAILED' || S === 'CANCELLED' || S === 'STOPPED';
  if (!TERMINAL) return false;
  var C = TASK.CONSUMERS || [];
  return C.length === 0;
}

// @proposal=P22 — unused key predicate.
function ISUNUSEDKEY(KEY, ENV) {
  if (FRAMEWORKKEYS[KEY] === true) return false;
  var USEDMAP = ENV && ENV.PIPELINEUSEDKEYS;
  if (USEDMAP) {
    var FOUND = false;
    Object.keys(USEDMAP).forEach(function(PID) {
      if (FOUND) return;
      if (USEDMAP[PID] && USEDMAP[PID][KEY] === true) FOUND = true;
    });
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
    if (!ISSETTLEDTASK(T)) {
      KEEP[TID] = T;
      KEEPORDER.push(TID);
    }
  });
  ENV.EXECUTION.TASKS = KEEP;
  ENV.EXECUTION.TASKORDER = KEEPORDER.length === ORDER.length ? ORDER : KEEPORDER;
}

function CONSOLIDATEENV(ENV) {
  if (!ENV || typeof ENV !== 'object') return ENV;
  var OUT = {};
  Object.keys(ENV).forEach(function(K) {
    if (!ISUNUSEDKEY(K, ENV)) OUT[K] = ENV[K];
  });
  SWEEPSETTLEDTASKS(OUT);
  return OUT;
}

function SELECTPERSISTENTSLICES(ENV) {
  if (!ENV || typeof ENV !== 'object') return {};
  var OUT = {};
  Object.keys(ENV).forEach(function(K) {
    if (PERSISTENTSLICES[K] === true) OUT[K] = ENV[K];
  });
  return OUT;
}

function SETINPATH(OBJ, PATH, VALUE) {
  var KEYS = PATH.split('.');
  if (KEYS.length === 0) return VALUE;
  var KEY = KEYS[0];
  var REST = KEYS.slice(1).join('.');
  var NEXTOBJ = OBJ && typeof OBJ === 'object' ? OBJ : {};
  var UPDATEDCHILD = REST ? SETINPATH(NEXTOBJ[KEY], REST, VALUE) : VALUE;
  var NEWOBJ = Array.isArray(NEXTOBJ) ? NEXTOBJ.slice() : Object.keys(NEXTOBJ).reduce(function(ACC, K) {
    ACC[K] = NEXTOBJ[K];
    return ACC;
  }, {});
  NEWOBJ[KEY] = UPDATEDCHILD;
  return NEWOBJ;
}

function APPLYVALUESET(ENV, UPDATES) {
  return UPDATES.reduce(function(ACC, UPDATE) {
    return SETINPATH(ACC, UPDATE.PATH, UPDATE.VALUE);
  }, ENV);
}

function PERSISTENV(ENV) {
  PERSISTPENDING = true;
  if (PERSISTTIMER) {
    clearTimeout(PERSISTTIMER);
    PERSISTTIMER = null;
  }
  PERSISTTIMER = setTimeout(function() {
    PERSISTTIMER = null;
    if (PERSISTMAXTIMER) {
      clearTimeout(PERSISTMAXTIMER);
      PERSISTMAXTIMER = null;
    }
    DOPERSIST(ENV);
  }, PERSISTDEBOUNCE);
  if (!PERSISTMAXTIMER) {
    PERSISTMAXTIMER = setTimeout(function() {
      PERSISTMAXTIMER = null;
      if (PERSISTPENDING) {
        if (PERSISTTIMER) {
          clearTimeout(PERSISTTIMER);
          PERSISTTIMER = null;
        }
        DOPERSIST(ENV);
      }
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
      if (SUCCESS === false) {
        logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED');
      }
    }).catch(function(E) {
      logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED:', E);
    });
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
    if (SAVED !== null && SAVED !== undefined) {
      loginfo(SAVED, '[WORLDMAPACTOR]', 'RECOVERENV RESTORED ENV');
      return CONSOLIDATEENV(SAVED);
    }
    loginfo({}, '[WORLDMAPACTOR]', 'RECOVERENV NO SAVED ENV, USING EMPTY CONTAINER');
    return {};
  });
}

// ============================================================
// §2 — Message handlers (P64)
// ============================================================

function WORLDMAPBEHAVIORUPDATE(ENV, MESSAGE) {
  if (!MESSAGE.UPDATES || !Array.isArray(MESSAGE.UPDATES)) {
    logwarn(ENV, '[WORLDMAPACTOR]', 'UPDATE MISSING UPDATES ARRAY');
    return ENV;
  }
  var MERGED = APPLYVALUESET(ENV, MESSAGE.UPDATES);
  var NEWENV = CONSOLIDATEENV(MERGED);
  (NEWENV.OBSERVERS || []).forEach(function(OBSERVER) {
    try { OBSERVER(NEWENV); } catch (ERR) { logwarn(NEWENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
  });
  PERSISTENV(NEWENV);
  return NEWENV;
}

function WORLDMAPBEHAVIORUPDATEFN(ENV, MESSAGE) {
  var RESULT = MESSAGE.FN(ENV);
  if (RESULT === undefined) RESULT = ENV;
  var NEXTENV = CONSOLIDATEENV(RESULT);
  (NEXTENV.OBSERVERS || []).forEach(function(OBSERVER) {
    try { OBSERVER(NEXTENV); } catch (ERR) { logwarn(NEXTENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
  });
  PERSISTENV(NEXTENV);
  return NEXTENV;
}

function WORLDMAPBEHAVIOROBSERVE(ENV, MESSAGE) {
  var NEWOBSERVERS = (ENV.OBSERVERS || []).concat([MESSAGE.OBSERVER]);
  return SETINPATH(ENV, 'OBSERVERS', NEWOBSERVERS);
}

function WORLDMAPBEHAVIORUNOBSERVE(ENV, MESSAGE) {
  var FILTERED = (ENV.OBSERVERS || []).filter(function(OBS) { return OBS !== MESSAGE.OBSERVER; });
  return SETINPATH(ENV, 'OBSERVERS', FILTERED);
}

function WORLDMAPBEHAVIORGETENV(ENV, MESSAGE) {
  if (MESSAGE.SENDER && MESSAGE.TAG) {
    SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'WORLDMAPACTOR');
  }
  return ENV;
}

function WORLDMAPBEHAVIORDEFAULT(ENV, MESSAGE) {
  logwarn(ENV, '[WORLDMAPACTOR]', 'UNKNOWN MESSAGE TYPE:', MESSAGE.TYPE);
  return ENV;
}

// ============================================================
// §3 — Dispatcher surface (P64)
// ============================================================

var WORLDMAPBEHAVIORDISPATCH = MAKEACTORDISPATCHSURFACE('WORLDMAPACTOR', [
  MAKETYPEDDISPATCH(MESSAGETYPES.UPDATE, WORLDMAPBEHAVIORUPDATE),
  MAKETYPEDDISPATCH(MESSAGETYPES.UPDATEFN, WORLDMAPBEHAVIORUPDATEFN),
  MAKETYPEDDISPATCH(MESSAGETYPES.OBSERVE, WORLDMAPBEHAVIOROBSERVE),
  MAKETYPEDDISPATCH(MESSAGETYPES.UNOBSERVE, WORLDMAPBEHAVIORUNOBSERVE),
  MAKETYPEDDISPATCH(MESSAGETYPES.GETWORLDMAP, WORLDMAPBEHAVIORGETENV),
  MAKETYPEDDISPATCH(MESSAGETYPES.GETENV, WORLDMAPBEHAVIORGETENV),
  WORLDMAPBEHAVIORDEFAULT
]);

// @proposal=P64 — the actor's behaviour is the surface's dispatch. The
// pre-adoption per-message log line is preserved at the behaviour level.
function WORLDMAPBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[WORLDMAPACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);
  return WORLDMAPBEHAVIORDISPATCH.DISPATCH(ENV, MESSAGE);
}

// @proposal=P64 — publish the surface and the aggregate; self-register.
REGISTERACTORSURFACE('WORLDMAPACTOR', WORLDMAPBEHAVIORDISPATCH);
REGISTERAGGREGATEBEHAVIOR('WORLDMAPACTOR', WORLDMAPBEHAVIOR);
ACTORCONSUMERS['WORLDMAPACTOR'] = WORLDMAPBEHAVIOR;

// ============================================================
// §4 — World-map state registration and start
// ============================================================

// Initial state is empty object; actors own their slices.
REGISTERACTORSTATE('WORLDMAPACTOR', {});

function STARTWORLDMAPACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS : (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      WORLDMAPSTATE = { level: LVL };
      var ENVFORVERBOSITY = GETACTORSTATE('WORLDMAPACTOR');
      if (ENVFORVERBOSITY) {
        SETACTORSTATE('WORLDMAPACTOR', SETINPATH(ENVFORVERBOSITY, 'VERBOSITY', LVL));
      }
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
// §5 — Actor handle surface (P4, unchanged)
// ============================================================

var WORLDMAPHANDLE = null;

function WORLDMAPHANDLEINSTANCE() {
  if (!WORLDMAPHANDLE) {
    WORLDMAPHANDLE = CREATEACTORHANDLE('WORLDMAPACTOR');
  }
  return WORLDMAPHANDLE;
}

function SUBMIT(ACTION) { return WORLDMAPHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return WORLDMAPHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return WORLDMAPHANDLEINSTANCE().GETACTIONRESULT(ID); }

// ============================================================
// §6 — Producers (unchanged)
// ============================================================

function SENDWORLDMAPPATCH(PATCH, RESPONSESPEC) {
  if (PATCH && PATCH.UPDATES) {
    var TAG = GENERATETAG();
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, { UPDATES: PATCH.UPDATES }, TAG, 'system', RESPONSESPEC);
  }
}

function UPDATEWORLDMAPFN(FN, RESPONSESPEC) {
  var TAG = GENERATETAG();
  var TYPE = MESSAGETYPES.UPDATEFN;
  SENDINSTRUCTION('WORLDMAPACTOR', TYPE, { FN: FN }, TAG, 'system', RESPONSESPEC);
}

function OBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.OBSERVE, { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function UNOBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UNOBSERVE, { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function GETWORLDMAP(RESPONSESPEC) {
  var TAG = GENERATETAG();
  var TYPE = MESSAGETYPES.GETWORLDMAP;
  SENDINSTRUCTION('WORLDMAPACTOR', TYPE, {}, TAG, 'system', RESPONSESPEC);
}
