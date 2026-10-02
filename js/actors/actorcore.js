var ACTORSTATEREGISTRY = {};
function CREATEGARBAGECOLLECTOR() {
  return {
    OBJECTS: {},
    NEXTID: 0
  };
}

function REGISTEROBJECT(GC, OBJ) {
  if (!OBJ.ID) {
    GC.NEXTID += 1;
    OBJ.ID = 'gc' + GC.NEXTID;
  }
  OBJ.STATUS = OBJ.STATUS || 'EXPECTING';
  OBJ.SENTCOUNT = OBJ.SENTCOUNT || 0;
  OBJ.RECEIVEDCOUNT = OBJ.RECEIVEDCOUNT || 0;
  GC.OBJECTS[OBJ.ID] = OBJ;
  return OBJ;
}

// ---- OP-100: shared guarded-object walker (extracted from 3 GC mutators) ----
function WITHOBJ(GC, ID, FN) {
  if (!GC || !GC.OBJECTS || !GC.OBJECTS[ID]) return;
  FN(GC.OBJECTS[ID]);
}

// ---- OP-101: GC mutators routed through WITHOBJ ----
function UPDATESTATUS(GC, ID, STATUS) {
  WITHOBJ(GC, ID, function(OBJ) {
    OBJ.STATUS = STATUS;
  });
}

function INCREMENTSENT(GC, ID, COUNT) {
  WITHOBJ(GC, ID, function(OBJ) {
    OBJ.SENTCOUNT = (OBJ.SENTCOUNT || 0) + (COUNT || 1);
  });
}

function INCREMENTRECEIVED(GC, ID, COUNT) {
  WITHOBJ(GC, ID, function(OBJ) {
    OBJ.RECEIVEDCOUNT = (OBJ.RECEIVEDCOUNT || 0) + (COUNT || 1);
  });
}

function COLLECTENDED(GC) {
  GC.OBJECTS = Object.keys(GC.OBJECTS).reduce(function(ACC, ID) {
    var OBJ = GC.OBJECTS[ID];
    if (OBJ.STATUS !== 'ENDED') {
      ACC[ID] = OBJ;
    }
    return ACC;
  }, {});
}

function LISTOBJECTS(GC, STATUS) {
  return Object.keys(GC.OBJECTS).filter(function(ID) {
    var OBJ = GC.OBJECTS[ID];
    return !STATUS || OBJ.STATUS === STATUS;
  }).map(function(ID) {
    return GC.OBJECTS[ID];
  });
}

// ---------- ACTOR KERNEL ----------

function REGISTERACTORSTATE(ACTORNAME, INITIALSTATE) {
  ACTORSTATEREGISTRY[ACTORNAME] = INITIALSTATE;
}

function GETACTORSTATE(ACTORNAME) {
  return ACTORSTATEREGISTRY[ACTORNAME];
}

function SETACTORSTATE(ACTORNAME, NEXTSTATE) {
  ACTORSTATEREGISTRY[ACTORNAME] = NEXTSTATE;
}

function DISPATCHIMMUTABLE(ENV, ACTORNAME, BEHAVIOR, MESSAGE) {
  return BEHAVIOR(ENV, MESSAGE);
}

// @proposal=P7 — optional fourth argument STAGE, invoked synchronously
// after the world-map state is resolved and before DISPATCHIMMUTABLE
// runs. The stage's return value is discarded. Stage exceptions
// propagate (DISPATCHIMMUTABLE is not invoked in that case).
function DISPATCHTOACTOR(ACTORNAME, BEHAVIOR, MESSAGE, STAGE) {
  var CURRENTENV = GETACTORSTATE('WORLDMAPACTOR');
  if (CURRENTENV === undefined) {
    throw new Error('[DISPATCHTOACTOR] WORLDMAPACTOR state (ENV) is not registered');
  }
  if (typeof STAGE === 'function') {
    STAGE(MESSAGE);
  }
  var RESULT = DISPATCHIMMUTABLE(CURRENTENV, ACTORNAME, BEHAVIOR, MESSAGE);
  if (RESULT && typeof RESULT.then === 'function') {
    return RESULT.then(function(NEWENV) {
      SETACTORSTATE('WORLDMAPACTOR', NEWENV);
      return NEWENV;
    });
  }
  SETACTORSTATE('WORLDMAPACTOR', RESULT);
  return RESULT;
}

function ENSUREENVSLICE(ENV, SLICENAME, DEFAULTFACTORY) {
  if (!ENV[SLICENAME]) {
    ENV[SLICENAME] = DEFAULTFACTORY();
  }
  return ENV[SLICENAME];
}

function CREATEMESSAGEVALIDATOR(INTERFACEMAP) {
  return function(MESSAGE) {
    if (!MESSAGE || typeof MESSAGE !== 'object') {
      return { VALID: false, ERROR: 'message must be a non-null object', TYPE: 'null' };
    }
    var TYPE = MESSAGE.TYPE;
    if (!TYPE || typeof TYPE !== 'string') {
      return { VALID: false, ERROR: 'message type must be a string, got: ' + typeof TYPE, TYPE: String(TYPE) };
    }
    var IFACE = INTERFACEMAP[TYPE];
    if (!IFACE) {
      return { VALID: false, ERROR: 'unknown message type: ' + TYPE, TYPE: TYPE };
    }
    var KEYS = Object.keys(IFACE);
    var INVALID = KEYS.reduce(function(ACC, KEY) {
      if (ACC) return ACC;
      var SPEC = IFACE[KEY];
      var OPTIONAL = SPEC.charAt(SPEC.length - 1) === '?';
      var EXPECTEDTYPE = OPTIONAL ? SPEC.slice(0, -1) : SPEC;
      var VAL = MESSAGE[KEY] !== undefined ? MESSAGE[KEY] : MESSAGE[KEY.toLowerCase()];
      if (VAL === undefined || VAL === null) {
        if (!OPTIONAL) {
          return { VALID: false, ERROR: 'type "' + TYPE + '" missing required field "' + KEY + '" (' + EXPECTEDTYPE + ')', TYPE: TYPE };
        }
        return ACC;
      }
      if (EXPECTEDTYPE === 'any') return ACC;
      if (EXPECTEDTYPE === 'array') {
        if (!Array.isArray(VAL)) {
          return { VALID: false, ERROR: 'type "' + TYPE + '" field "' + KEY + '" expected array got ' + (Array.isArray(VAL) ? 'array' : typeof VAL), TYPE: TYPE };
        }
      } else if (EXPECTEDTYPE === 'object') {
        if (VAL === null || typeof VAL !== 'object') {
          return { VALID: false, ERROR: 'type "' + TYPE + '" field "' + KEY + '" expected object got ' + (VAL === null ? 'null' : typeof VAL), TYPE: TYPE };
        }
      } else {
        var ACTUALTYPE = typeof VAL;
        if (ACTUALTYPE !== EXPECTEDTYPE) {
          return { VALID: false, ERROR: 'type "' + TYPE + '" field "' + KEY + '" expected ' + EXPECTEDTYPE + ' got ' + ACTUALTYPE, TYPE: TYPE };
        }
      }
      return ACC;
    }, null);
    if (INVALID) return INVALID;
    return { VALID: true, ERROR: null, TYPE: TYPE };
  };
}

function PINGACTOR(ENQUEUEPING, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = 1000;
  return new Promise(function(RESOLVE) {
    var TIMER = setTimeout(function() { RESOLVE(false); }, TIMEOUT);
    Promise.resolve().then(ENQUEUEPING).then(function() {
      clearTimeout(TIMER);
      RESOLVE(true);
    }).catch(function() {
      clearTimeout(TIMER);
      RESOLVE(false);
    });
  });
}

// ---- OP-096 (P44): guard-and-respond helper ----
function RESPONDIF(MESSAGE, ACTORNAME, PAYLOAD, DEFAULTTYPE) {
  if (!MESSAGE.SENDER || !MESSAGE.TAG) return false;
  var SPEC = MESSAGE.RESPONSESPEC;
  var RESPONSETYPE = (SPEC && SPEC.RESPONSETYPE) || DEFAULTTYPE || 'response';
  SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, PAYLOAD, ACTORNAME, RESPONSETYPE);
  return true;
}

var ACTORREGISTRY = {};

function GETACTORREGISTRY() {
  return ACTORREGISTRY;
}

// ---------- ACTOR REGISTRY ----------

function CREATEACTORREGISTRY() {
  return Object.freeze({ RENDERACTOR: null });
}

function SETRENDERACTOR(REGISTRY, ACTOR) {
  if (!ACTOR || typeof ACTOR !== 'object' || typeof ACTOR.send !== 'function') {
    throw new Error('[actorregistry] SETRENDERACTOR: actor must implement send(message)');
  }
  return Object.freeze({ RENDERACTOR: ACTOR });
}

function GETRENDERACTOR(REGISTRY) {
  if (!REGISTRY || !REGISTRY.RENDERACTOR) {
    throw new Error('[actorregistry] RENDERACTOR is not registered');
  }
  return REGISTRY.RENDERACTOR;
}

// ---------- TRIGGER REGISTRY ----------

function CREATETRIGGERREGISTRY() {
  return Object.freeze({ MAP: Object.freeze({}) });
}

function CLONEREGISTRYMAP(MAP) {
  var OUT = {};
  Object.keys(MAP).forEach(function(ID) {
    var EVENTS = MAP[ID];
    var NEWEVENTS = {};
    Object.keys(EVENTS).forEach(function(EVENT) {
      NEWEVENTS[EVENT] = EVENTS[EVENT];
    });
    OUT[ID] = NEWEVENTS;
  });
  return OUT;
}

function REGISTERTRIGGER(REGISTRY, ID, EVENT, HANDLER) {
  if (!REGISTRY || !REGISTRY.MAP) {
    throw new Error('[REGISTERTRIGGER] registry is null or missing map');
  }

  var NEWMAP = CLONEREGISTRYMAP(REGISTRY.MAP);
  var EVENTS = NEWMAP[ID] || {};
  var NEWEVENTS = {};
  Object.keys(EVENTS).forEach(function(K) { NEWEVENTS[K] = EVENTS[K]; });
  NEWEVENTS[EVENT] = HANDLER;
  NEWMAP[ID] = NEWEVENTS;
  return Object.freeze({ MAP: Object.freeze(NEWMAP) });
}

function UNREGISTERTRIGGER(REGISTRY, ID, EVENT) {
  var NEWMAP = CLONEREGISTRYMAP(REGISTRY.MAP);
  if (EVENT === undefined || EVENT === null) {
    delete NEWMAP[ID];
  } else if (NEWMAP[ID]) {
    var NEWEVENTS = {};
    Object.keys(NEWMAP[ID]).forEach(function(K) {
      if (K !== EVENT) NEWEVENTS[K] = NEWMAP[ID][K];
    });
    if (Object.keys(NEWEVENTS).length > 0) NEWMAP[ID] = NEWEVENTS;
    else delete NEWMAP[ID];
  }
  return Object.freeze({ MAP: Object.freeze(NEWMAP) });
}

function REVALIDATEALL(REGISTRY, DOC) {
  var DOCUMENTREF = DOC || (typeof document !== 'undefined' ? document : null);
  if (!DOCUMENTREF || typeof DOCUMENTREF.getElementById !== 'function') {
    throw new Error('[REVALIDATEALL] Document object not available; provide a valid DOM document.');
  }

  var MAP = REGISTRY.MAP;
  Object.keys(MAP).forEach(function(ID) {
    var EL = DOCUMENTREF.getElementById(ID);
    if (EL) {
      var EVENTS = MAP[ID];
      Object.keys(EVENTS).forEach(function(EVENT) {
        EL.removeEventListener(EVENT, EVENTS[EVENT]);
        EL.addEventListener(EVENT, EVENTS[EVENT]);
      });
    }
  });
}

function GETTRIGGERMAP(REGISTRY) {
  return REGISTRY.MAP;
}

// ---------- ACTOR HANDLE — three-operation protocol (@proposal=P4) ----------
//
// Per the frozen P4 (RUN 9, ITERATION 4):
//   - every actor exposes SUBMIT(ACTION)              → ID
//   - every actor exposes EXPECT(ID, INTERVAL, TIMEOUT) → Promise
//   - every actor exposes GETACTIONRESULT(ID)          → STATUS
//
// SUBMIT routes the ACTION through the mail system (Q6 re-derivation,
// RUN 8): the identifier returned is the mail-system correlation
// identifier (the envelope's TAG). No out-of-band path exists.
//
// EXPECT polls GETACTIONRESULT at INTERVAL. A response — including an
// error response — terminates polling (Q7). On timeout, and on an
// EXPIRED record, the promise rejects.
//
// GETACTIONRESULT queries the mail system's per-message records by
// ID; no parallel store is introduced (Q8). The query is delegated
// to MAILGETACTIONSTATUS(ID), declared by mailactor.js at File Cycle
// 20. The typeof guard avoids a ReferenceError in the interim.
//
// @proposal=P5 (P-ACTORHANDLE-EXPECT-CONSOLIDATION) — EXPECT consults
// EXPECTATIONS[ID] first. When a live expectation exists (the
// framework's mail actor created one at SUBMIT time and its resolver
// channel is armed by P1), EXPECT registers a resolver via
// ARMEXPECTATIONRESOLVER and resolves on arrival — no interval. When
// no live expectation exists (either ID was never submitted, or the
// response has already arrived), the pre-existing poll is preserved
// as the fallback. The caller's TIMEOUT bounds both paths; on
// timeout, the promise rejects with the pre-existing shape. Per F36,
// a resolver left armed after a caller timeout is a no-op on the
// already-settled caller promise. Per F35, the check-then-arm
// sequence executes synchronously (single-threaded event loop).

function CREATEACTORHANDLE(ACTORNAME) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[CREATEACTORHANDLE] ACTORNAME must be a non-empty string');
  }

  function SUBMIT(ACTION) {
    if (!ACTION || typeof ACTION !== 'object') {
      throw new Error('[SUBMIT] ACTION must be a non-null object');
    }
    if (!ACTION.TYPE || typeof ACTION.TYPE !== 'string') {
      throw new Error('[SUBMIT] ACTION.TYPE must be a non-empty string');
    }

    var REGISTRY = (typeof MESSAGEREGISTRY !== 'undefined') ? MESSAGEREGISTRY : null;
    if (REGISTRY && typeof REGISTRY.getinterfaces === 'function' && typeof REGISTRY.validate === 'function') {
      var IFACES = REGISTRY.getinterfaces(ACTORNAME);
      if (IFACES && Object.keys(IFACES).length > 0) {
        var VALIDATION = REGISTRY.validate(ACTORNAME, ACTION);
        if (VALIDATION.valid === false) {
          throw new Error('[SUBMIT] ' + VALIDATION.error);
        }
      }
    }

    var TAG = GENERATETAG();
    var SENDER = ACTION.SENDER || 'system';
    var RESPONSESPEC = ACTION.RESPONSESPEC;

    var PAYLOAD = {};
    Object.keys(ACTION).forEach(function(K) {
      if (K !== 'TYPE' && K !== 'SENDER' && K !== 'TAG' && K !== 'RESPONSESPEC' && K !== 'CONTEXT') {
        PAYLOAD[K] = ACTION[K];
      }
    });

    SENDINSTRUCTION(ACTORNAME, ACTION.TYPE, PAYLOAD, TAG, SENDER, RESPONSESPEC);
    return TAG;
  }

  function EXPECT(ID, INTERVAL, TIMEOUT) {
    if (typeof ID !== 'string' || ID.length === 0) {
      return Promise.reject(new Error('[EXPECT] ID must be a non-empty string'));
    }
    var IV = (typeof INTERVAL === 'number' && INTERVAL > 0) ? INTERVAL : 50;
    var TO = (typeof TIMEOUT === 'number' && TIMEOUT > 0) ? TIMEOUT : 20000;

    if (typeof EXPECTATIONS !== 'undefined' &&
        EXPECTATIONS[ID] &&
        EXPECTATIONS[ID].STATUS === 'PENDING' &&
        typeof ARMEXPECTATIONRESOLVER === 'function') {
      return new Promise(function(RESOLVE, REJECT) {
        var SETTLED = false;
        function ONSETTLE(FN, ARG) {
          if (SETTLED) return;
          SETTLED = true;
          FN(ARG);
        }
        function ONSHAPE(RECORD) {
          if (RECORD === null || RECORD === undefined) {
            ONSETTLE(REJECT, new Error('[EXPECT] no record for ' + ID));
            return;
          }
          if (RECORD.STATUS === 'RESOLVED') { ONSETTLE(RESOLVE, RECORD.RESULT); return; }
          if (RECORD.STATUS === 'FAILED') { ONSETTLE(RESOLVE, RECORD.ERROR); return; }
          if (RECORD.STATUS === 'EXPIRED') { ONSETTLE(REJECT, new Error('[EXPECT] action expired: ' + ID)); return; }
          ONSETTLE(REJECT, new Error('[EXPECT] unknown record status: ' + String(RECORD.STATUS)));
        }
        ARMEXPECTATIONRESOLVER(
          ID,
          function(RECORD) { ONSHAPE(RECORD); },
          function(ERR) { ONSETTLE(REJECT, ERR); }
        );
        setTimeout(function() {
          if (SETTLED) return;
          var LATE = GETACTIONRESULT(ID);
          if (LATE !== null && LATE !== undefined) { ONSHAPE(LATE); return; }
          ONSETTLE(REJECT, new Error('[EXPECT] timeout for ' + ID));
        }, TO);
      });
    }

    return new Promise(function(RESOLVE, REJECT) {
      var START = Date.now();

      function POLL() {
        var RECORD = GETACTIONRESULT(ID);
        if (RECORD !== null && RECORD !== undefined) {
          if (RECORD.STATUS === 'RESOLVED') {
            RESOLVE(RECORD.RESULT);
            return;
          }
          if (RECORD.STATUS === 'FAILED') {
            RESOLVE(RECORD.ERROR);
            return;
          }
          if (RECORD.STATUS === 'EXPIRED') {
            REJECT(new Error('[EXPECT] action expired: ' + ID));
            return;
          }
        }
        if (Date.now() - START > TO) {
          REJECT(new Error('[EXPECT] timeout for ' + ID));
          return;
        }
        setTimeout(POLL, IV);
      }
      POLL();
    });
  }

  function GETACTIONRESULT(ID) {
    if (typeof ID !== 'string' || ID.length === 0) return null;
    var MAILFN = (typeof MAILGETACTIONSTATUS === 'function') ? MAILGETACTIONSTATUS : null;
    if (!MAILFN) return null;
    return MAILFN(ID);
  }

  return {
    SUBMIT: SUBMIT,
    EXPECT: EXPECT,
    GETACTIONRESULT: GETACTIONRESULT
  };
}

// ---------- EXPORT ----------
