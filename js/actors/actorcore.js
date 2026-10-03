var ACTORCONSUMERS = {};

function ENSUREDISPATCHERSLICE(ENV) {
  if (ENV && ENV.DISPATCHERS) return ENV;
  var NEXT = {};
  Object.keys(ENV || {}).forEach(function (K) { NEXT[K] = ENV[K]; });
  NEXT.DISPATCHERS = {};
  return NEXT;
}

// @proposal=P61r2 — read the actor's dispatcher list. Returns a fresh
// array (never an alias into ENV).
function READDISPATCHES(ENV, ACTORNAME) {
  if (!ENV || !ENV.DISPATCHERS) return [];
  var LIST = ENV.DISPATCHERS[ACTORNAME];
  return LIST ? LIST.slice() : [];
}

// @proposal=P61r2 — append a dispatcher. Returns a fresh ENV.
function ADDDISPATCH(ENV, ACTORNAME, DISPATCHFN) {
  if (typeof DISPATCHFN !== 'function') {
    throw new Error('[ADDDISPATCH] DISPATCHFN must be a function');
  }
  var NEXT = {};
  Object.keys(ENV || {}).forEach(function (K) { NEXT[K] = ENV[K]; });
  var SLICE = NEXT.DISPATCHERS ? NEXT.DISPATCHERS : {};
  var NEWSLICE = {};
  Object.keys(SLICE).forEach(function (K) { NEWSLICE[K] = SLICE[K]; });
  NEWSLICE[ACTORNAME] = (SLICE[ACTORNAME] || []).concat([DISPATCHFN]);
  NEXT.DISPATCHERS = NEWSLICE;
  return NEXT;
}

// @proposal=P61r2 — remove a dispatcher by reference. Returns a fresh ENV.
function REMOVEDISPATCH(ENV, ACTORNAME, DISPATCHFN) {
  if (!ENV || !ENV.DISPATCHERS || !ENV.DISPATCHERS[ACTORNAME]) return ENV;
  var NEXT = {};
  Object.keys(ENV).forEach(function (K) { NEXT[K] = ENV[K]; });
  var SLICE = NEXT.DISPATCHERS;
  var NEWSLICE = {};
  Object.keys(SLICE).forEach(function (K) { NEWSLICE[K] = SLICE[K]; });
  NEWSLICE[ACTORNAME] = SLICE[ACTORNAME].filter(function (D) { return D !== DISPATCHFN; });
  NEXT.DISPATCHERS = NEWSLICE;
  return NEXT;
}

// @proposal=P61r2 — run the dispatchers in order. The first non-undefined
// result wins. Uses the framework's trampoline for stack-safe recursion
// (FT-4); no accumulator state.
function RUNDISPATCHES(ENV, ACTORNAME, MESSAGE) {
  var LIST = READDISPATCHES(ENV, ACTORNAME);
  var MESSAGEVAL = MESSAGE;
  function SCAN(INDEX, CURRENTENV) {
    if (INDEX >= LIST.length) return CURRENTENV;
    var RESULT = LIST[INDEX](CURRENTENV, MESSAGEVAL);
    if (RESULT !== undefined) return RESULT;
    return function () { return SCAN(INDEX + 1, CURRENTENV); };
  }
  return trampoline(SCAN)(0, ENV);
}

// @proposal=P62r2 — produce a typed dispatcher. Handles exactly one TYPE;
// returns undefined for every other type so the aggregate scan falls through.
function MAKETYPEDDISPATCH(TYPE, HANDLER) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[MAKETYPEDDISPATCH] TYPE must be a non-empty string');
  }
  if (typeof HANDLER !== 'function') {
    throw new Error('[MAKETYPEDDISPATCH] HANDLER must be a function');
  }
  var TYPECAP = TYPE;
  var HANDLERCAP = HANDLER;
  return function (ENV, MESSAGE) {
    if (!MESSAGE || MESSAGE.TYPE !== TYPECAP) return undefined;
    return HANDLERCAP(ENV, MESSAGE);
  };
}

// @proposal=P62r2 — unified registration. Registration IS dispatcher
// creation: the handler is wrapped as a typed dispatcher and appended to
// the actor's list. Returns a fresh ENV. The caller publishes it at the
// seam.
function REGISTERCONSUMER(ENV, ACTORNAME, TYPE, HANDLER) {
  var DISPATCHFN = MAKETYPEDDISPATCH(TYPE, HANDLER);
  return ADDDISPATCH(ENV, ACTORNAME, DISPATCHFN);
}

// @proposal=P63r2 — per-actor dispatcher surface. Boot-time handlers may
// be supplied at construction; additional handlers may be registered at
// runtime via REGISTERHANDLER, which threads the state through the world
// map (read, transform, publish). DISPATCH reads the ENV it is given; it
// does not consult any module-level mutable registry.
function MAKEACTORDISPATCHSURFACE(ACTORNAME, INITIALDISPATCHERS) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[MAKEACTORDISPATCHSURFACE] ACTORNAME must be a non-empty string');
  }
  var INITIAL = (INITIALDISPATCHERS || []).slice();
  var STAGED = INITIAL.slice();
  var STAGEDINSTALLED = false;

  function INSTALLSTAGED(ENV) {
    if (STAGEDINSTALLED) return ENV;
    var NEXT = ENV;
    STAGED.forEach(function (D) {
      NEXT = ADDDISPATCH(NEXT, ACTORNAME, D);
    });
    STAGEDINSTALLED = true;
    return NEXT;
  }

  function READ(ENV) {
    var INSTALLED = STAGEDINSTALLED ? ENV : INSTALLSTAGED(ENV);
    return READDISPATCHES(INSTALLED, ACTORNAME);
  }

  function REGISTERHANDLER(ENV, TYPE, HANDLER) {
    var DISPATCHFN = MAKETYPEDDISPATCH(TYPE, HANDLER);
    var BASE = STAGEDINSTALLED ? ENV : INSTALLSTAGED(ENV);
    return ADDDISPATCH(BASE, ACTORNAME, DISPATCHFN);
  }

  function UNREGISTERHANDLER(ENV, DISPATCHFN) {
    var BASE = STAGEDINSTALLED ? ENV : INSTALLSTAGED(ENV);
    return REMOVEDISPATCH(BASE, ACTORNAME, DISPATCHFN);
  }

  function DISPATCH(ENV, MESSAGE) {
    var BASE = STAGEDINSTALLED ? ENV : INSTALLSTAGED(ENV);
    return RUNDISPATCHES(BASE, ACTORNAME, MESSAGE);
  }

  return {
    NAME: ACTORNAME,
    READDISPATCHES: READ,
    REGISTERHANDLER: REGISTERHANDLER,
    UNREGISTERHANDLER: UNREGISTERHANDLER,
    DISPATCH: DISPATCH
  };
}

// @proposal=P63r2 — registries of actor surfaces and aggregate behaviours.
// Populated by each actor file at load time. Read by helpers that need to
// reach an actor's surface (e.g. REGISTERACTORHANDLER).
var ACTORSURFACEREGISTRY = {};
var AGGREGATEBEHAVIOR = {};

function REGISTERACTORSURFACE(ACTORNAME, SURFACE) {
  ACTORSURFACEREGISTRY[ACTORNAME] = SURFACE;
  return SURFACE;
}

function REGISTERAGGREGATEBEHAVIOR(ACTORNAME, BEHAVIOR) {
  AGGREGATEBEHAVIOR[ACTORNAME] = BEHAVIOR;
  return BEHAVIOR;
}

function GETACTORSURFACE(ACTORNAME) {
  return ACTORSURFACEREGISTRY[ACTORNAME] || null;
}

function GETAGGREGATEBEHAVIOR(ACTORNAME) {
  return AGGREGATEBEHAVIOR[ACTORNAME] || null;
}

// @proposal=P63r2 — convenience: register a handler against an actor by
// name, publishing the resulting ENV to the world map. Uses the framework's
// designated seam. Returns the fresh ENV.
function REGISTERACTORHANDLER(ACTORNAME, TYPE, HANDLER) {
  var SURFACE = GETACTORSURFACE(ACTORNAME);
  if (!SURFACE) {
    throw new Error('[REGISTERACTORHANDLER] unknown actor: ' + ACTORNAME);
  }
  var CURRENTENV = GETACTORSTATE('WORLDMAPACTOR');
  if (CURRENTENV === undefined) {
    // Defer: surface stages the handler; installed on first dispatch.
    return SURFACE.REGISTERHANDLER({}, TYPE, HANDLER);
  }
  var NEXTENV = SURFACE.REGISTERHANDLER(CURRENTENV, TYPE, HANDLER);
  SETACTORSTATE('WORLDMAPACTOR', NEXTENV);
  return NEXTENV;
}

// @proposal=P68 — producer factory. Returns an enqueue function for the
// (ACTORNAME, TYPE) pair. The produced function sends a message and returns
// the tag. The factory itself is a pure constructor (no side effects at
// construction time).
function MAKEPRODUCER(ACTORNAME, TYPE) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[MAKEPRODUCER] ACTORNAME must be a non-empty string');
  }
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[MAKEPRODUCER] TYPE must be a non-empty string');
  }
  var ACTORNAMECAP = ACTORNAME;
  var TYPECAP = TYPE;
  return function (PAYLOAD, RESPONSESPEC, SENDER) {
    var TAG = GENERATETAG();
    SENDINSTRUCTION(ACTORNAMECAP, TYPECAP, PAYLOAD || {}, TAG, SENDER || 'system', RESPONSESPEC);
    return TAG;
  };
}

// ============================================================
// §17 — Base primitives (P64-idiomatic)
// ============================================================
//
// @proposal=P-AC-001a — the 25 base primitives declared by the manifest
// entry for actors/actorcore.js, expressed in P64 idiom (I-1..I-8).
// The pre-rewrite base module was not brought forward when the
// dispatcher-surface (§1..§16) was introduced; this section completes
// the rewrite.
//
// Idiom witnesses in the received tree:
//   I-1 freeze         — BROADCASTTYPESREF, MAILBOXCONFIG, MESSAGETYPES
//   I-2 ref-swap       — BROADCASTTYPESREF, MAILBOXEXEMPTREF,
//                        BLOCKCOMPILEREXTENSIONSREF, DYNAMICMESSAGETYPESREF
//   I-3 fresh-env      — ADDDISPATCH, REMOVEDISPATCH, ENSUREDISPATCHERSLICE
//   I-4 typed-dispatch — MAKETYPEDDISPATCH
//   I-5 typeof-guard   — every actor's handler map
//   I-6 register-at-load — REGISTERACTORSURFACE, REGISTERAGGREGATEBEHAVIOR
//
// Behavioural verification for the 10 NAMED-ONLY primitives is deferred
// under @proposal=P-AC-001b.

// ---------- §17.1 — Actor state registry ----------

var ACTORSTATESREF = { current: Object.freeze({}) };

function REGISTERACTORSTATE(ACTORNAME, INITIAL) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[REGISTERACTORSTATE] ACTORNAME must be a non-empty string');
  }
  var CURRENT = ACTORSTATESREF.current;
  if (Object.prototype.hasOwnProperty.call(CURRENT, ACTORNAME)) {
    return CURRENT[ACTORNAME];
  }
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[ACTORNAME] = INITIAL;
  ACTORSTATESREF.current = Object.freeze(NEXT);
  return INITIAL;
}

function GETACTORSTATE(ACTORNAME) {
  var CURRENT = ACTORSTATESREF.current;
  return Object.prototype.hasOwnProperty.call(CURRENT, ACTORNAME)
    ? CURRENT[ACTORNAME]
    : undefined;
}

function SETACTORSTATE(ACTORNAME, ENV) {
  var CURRENT = ACTORSTATESREF.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[ACTORNAME] = ENV;
  ACTORSTATESREF.current = Object.freeze(NEXT);
  return ENV;
}

// ---------- §17.2 — Env slice (fresh-env return, I-3) ----------

function ENSUREENVSLICE(ENV, SLICENAME, INITFN) {
  var E = ENV || {};
  if (E[SLICENAME] !== undefined && E[SLICENAME] !== null) return E;
  var SLICE = (typeof INITFN === 'function') ? INITFN() : {};
  var NEXT = {};
  Object.keys(E).forEach(function (K) { NEXT[K] = E[K]; });
  NEXT[SLICENAME] = SLICE;
  return NEXT;
}

// ---------- §17.3 — Actor dispatch ----------

function DISPATCHTOACTOR(ACTORNAME, BEHAVIOR, MESSAGE, INSTALLER) {
  var ENV = GETACTORSTATE(ACTORNAME);
  if (ENV === undefined) ENV = {};
  var RESULT = BEHAVIOR(ENV, MESSAGE);
  if (RESULT !== undefined) {
    SETACTORSTATE(ACTORNAME, RESULT);
  }
  if (typeof INSTALLER === 'function') {
    INSTALLER(MESSAGE);
  }
  return RESULT;
}

function DISPATCHIMMUTABLE(ACTORNAME, BEHAVIOR, MESSAGE) {
  var ENV = GETACTORSTATE(ACTORNAME);
  if (ENV === undefined) ENV = {};
  return BEHAVIOR(ENV, MESSAGE);
}

// ---------- §17.4 — Actor registry, render accessor, ping ----------

var ACTORREGISTRYREF = { current: Object.freeze({}) };

function CREATEACTORREGISTRY() {
  return { current: Object.freeze({}) };
}

function GETACTORREGISTRY() {
  return ACTORREGISTRYREF.current;
}

function SETRENDERACTOR(REGISTRY, ACTOR) {
  if (!REGISTRY || typeof REGISTRY !== 'object') {
    throw new Error('[SETRENDERACTOR] REGISTRY must be an object');
  }
  var CURRENT = REGISTRY.current || Object.freeze({});
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT.RENDERACTOR = ACTOR;
  REGISTRY.current = Object.freeze(NEXT);
  return REGISTRY;
}

function GETRENDERACTOR(REGISTRY) {
  if (!REGISTRY || typeof REGISTRY !== 'object' || !REGISTRY.current) return null;
  return REGISTRY.current.RENDERACTOR || null;
}

function PINGACTOR(ACTORNAME, RESPONSESPEC) {
  if (typeof SENDINSTRUCTION !== 'function' || typeof MESSAGETYPES === 'undefined') {
    return null;
  }
  var TAG = (typeof GENERATETAG === 'function') ? GENERATETAG() : ('PING' + Date.now());
  SENDINSTRUCTION(ACTORNAME, MESSAGETYPES.PING, {}, TAG, 'system', RESPONSESPEC);
  return TAG;
}

// ---------- §17.5 — Trigger registry (ref-swap, I-2) ----------

function CREATETRIGGERREGISTRY() {
  return { current: Object.freeze({}) };
}

function REGISTERTRIGGER(REGISTRY, KEY, VALUE) {
  if (!REGISTRY || typeof REGISTRY !== 'object' || !REGISTRY.current) {
    throw new Error('[REGISTERTRIGGER] REGISTRY must be a trigger-registry value');
  }
  if (typeof KEY !== 'string' || KEY.length === 0) {
    throw new Error('[REGISTERTRIGGER] KEY must be a non-empty string');
  }
  var CURRENT = REGISTRY.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[KEY] = VALUE;
  REGISTRY.current = Object.freeze(NEXT);
  return VALUE;
}

function UNREGISTERTRIGGER(REGISTRY, KEY) {
  if (!REGISTRY || typeof REGISTRY !== 'object' || !REGISTRY.current) return false;
  if (typeof KEY !== 'string' || KEY.length === 0) return false;
  var CURRENT = REGISTRY.current;
  if (!Object.prototype.hasOwnProperty.call(CURRENT, KEY)) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) {
    if (K !== KEY) NEXT[K] = CURRENT[K];
  });
  REGISTRY.current = Object.freeze(NEXT);
  return true;
}

function GETTRIGGERMAP(REGISTRY) {
  if (!REGISTRY || typeof REGISTRY !== 'object') return {};
  return REGISTRY.current || {};
}

function REVALIDATEALL(REGISTRY) {
  if (!REGISTRY || typeof REGISTRY !== 'object' || !REGISTRY.current) return {};
  var CURRENT = REGISTRY.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  REGISTRY.current = Object.freeze(NEXT);
  return NEXT;
}

// ---------- §17.6 — Message validator ----------

function CREATEMESSAGEVALIDATOR(SCHEMA) {
  var S = SCHEMA || {};
  return function (MESSAGE) {
    if (!MESSAGE || typeof MESSAGE !== 'object') {
      return { valid: false, error: 'message must be a non-null object' };
    }
    var KEYS = Object.keys(S);
    var INVALID = null;
    KEYS.forEach(function (K) {
      if (INVALID) return;
      var SPEC = S[K];
      var OPT = SPEC.charAt(SPEC.length - 1) === '?';
      var EXPECTED = OPT ? SPEC.slice(0, -1) : SPEC;
      var VAL = MESSAGE[K];
      if (VAL === undefined || VAL === null) {
        if (!OPT) INVALID = { valid: false, error: 'missing required field ' + K };
        return;
      }
      if (EXPECTED === 'any') return;
      var ACTUAL = Array.isArray(VAL) ? 'array' : typeof VAL;
      if (ACTUAL !== EXPECTED) {
        INVALID = { valid: false, error: 'field ' + K + ' expected ' + EXPECTED + ' got ' + ACTUAL };
      }
    });
    return INVALID || { valid: true, error: null };
  };
}

// ---------- §17.7 — Dispatcher-object collection (I-1, I-2) ----------

function CREATEGARBAGECOLLECTOR() {
  return { OBJECTS: Object.freeze([]), NEXTID: 1 };
}

function REGISTEROBJECT(GC, OBJ) {
  if (!GC || typeof GC !== 'object' || !Array.isArray(GC.OBJECTS)) {
    throw new Error('[REGISTEROBJECT] GC must be a garbage-collector value');
  }
  if (!OBJ || typeof OBJ !== 'object') {
    throw new Error('[REGISTEROBJECT] OBJ must be an object');
  }
  var ID = (OBJ.ID !== undefined) ? OBJ.ID : ('GCO' + (GC.NEXTID));
  var ENTRY = {};
  Object.keys(OBJ).forEach(function (K) { ENTRY[K] = OBJ[K]; });
  ENTRY.ID = ID;
  if (ENTRY.SENTCOUNT === undefined) ENTRY.SENTCOUNT = 0;
  if (ENTRY.RECEIVEDCOUNT === undefined) ENTRY.RECEIVEDCOUNT = 0;
  GC.OBJECTS = Object.freeze(GC.OBJECTS.concat([ENTRY]));
  if (OBJ.ID === undefined) GC.NEXTID = GC.NEXTID + 1;
  return ID;
}

function LISTOBJECTS(GC) {
  if (!GC || !Array.isArray(GC.OBJECTS)) return [];
  return GC.OBJECTS.slice();
}

function gcfindobject(GC, ID) {
  if (!GC || !Array.isArray(GC.OBJECTS)) return null;
  var FOUND = null;
  GC.OBJECTS.some(function (O) {
    if (O && O.ID === ID) { FOUND = O; return true; }
    return false;
  });
  return FOUND;
}

function UPDATESTATUS(GC, ID, STATUS) {
  var O = gcfindobject(GC, ID);
  if (!O) return null;
  var NEXT = {};
  Object.keys(O).forEach(function (K) { NEXT[K] = O[K]; });
  NEXT.STATUS = STATUS;
  GC.OBJECTS = Object.freeze(GC.OBJECTS.map(function (X) {
    return (X && X.ID === ID) ? NEXT : X;
  }));
  return STATUS;
}

function INCREMENTSENT(GC, ID, N) {
  var O = gcfindobject(GC, ID);
  if (!O) return 0;
  var DELTA = (typeof N === 'number' && N > 0) ? N : 1;
  var NEXT = {};
  Object.keys(O).forEach(function (K) { NEXT[K] = O[K]; });
  NEXT.SENTCOUNT = (O.SENTCOUNT || 0) + DELTA;
  GC.OBJECTS = Object.freeze(GC.OBJECTS.map(function (X) {
    return (X && X.ID === ID) ? NEXT : X;
  }));
  return NEXT.SENTCOUNT;
}

function INCREMENTRECEIVED(GC, ID, N) {
  var O = gcfindobject(GC, ID);
  if (!O) return 0;
  var DELTA = (typeof N === 'number' && N > 0) ? N : 1;
  var NEXT = {};
  Object.keys(O).forEach(function (K) { NEXT[K] = O[K]; });
  NEXT.RECEIVEDCOUNT = (O.RECEIVEDCOUNT || 0) + DELTA;
  GC.OBJECTS = Object.freeze(GC.OBJECTS.map(function (X) {
    return (X && X.ID === ID) ? NEXT : X;
  }));
  return NEXT.RECEIVEDCOUNT;
}

function COLLECTENDED(GC) {
  if (!GC || !Array.isArray(GC.OBJECTS)) return 0;
  var BEFORE = GC.OBJECTS.length;
  var NEXT = GC.OBJECTS.filter(function (O) {
    if (!O) return false;
    var TERMINAL = O.STATUS === 'EXECUTED' || O.STATUS === 'FAILED' ||
                   O.STATUS === 'CANCELLED' || O.STATUS === 'STOPPED' ||
                   O.STATUS === 'SETTLED';
    if (!TERMINAL) return true;
    return (O.RECEIVEDCOUNT || 0) < (O.SENTCOUNT || 0);
  });
  GC.OBJECTS = Object.freeze(NEXT);
  return BEFORE - NEXT.length;
}

// ---------- §17.8 — Actor handle (I-1, I-6) ----------

function CREATEACTORHANDLE(ACTORNAME) {
  if (typeof ACTORNAME !== 'string' || ACTORNAME.length === 0) {
    throw new Error('[CREATEACTORHANDLE] ACTORNAME must be a non-empty string');
  }
  var NAME = ACTORNAME;
  var ACTIONS = {};
  var COUNTER = 0;

  function SUBMIT(ACTION) {
    COUNTER += 1;
    var ID = NAME + '-ACTION-' + COUNTER + '-' + Date.now();
    // @proposal=P-AC-001g — unconditional read; ACTORCONSUMERS is declared at file top.
    var HANDLER = ACTORCONSUMERS[NAME];
    if (typeof HANDLER === 'function') {
      try {
        var RESULT = DISPATCHTOACTOR(NAME, HANDLER, ACTION);
        ACTIONS[ID] = { ID: ID, STATUS: 'EXECUTED', RESULT: RESULT, ERROR: null };
      } catch (E) {
        ACTIONS[ID] = { ID: ID, STATUS: 'FAILED', RESULT: null, ERROR: E };
      }
    } else {
      ACTIONS[ID] = { ID: ID, STATUS: 'PENDING', RESULT: null, ERROR: null };
    }
    return ID;
  }

  function EXPECT(ID, INTERVAL, TIMEOUT) {
    if (INTERVAL === undefined) INTERVAL = 50;
    if (TIMEOUT === undefined) TIMEOUT = 30000;
    return new Promise(function (RESOLVE, REJECT) {
      var START = Date.now();
      function POLL() {
        var A = ACTIONS[ID];
        if (!A) { REJECT(new Error('[EXPECT] unknown action: ' + ID)); return; }
        if (A.STATUS === 'EXECUTED') { RESOLVE(A.RESULT); return; }
        if (A.STATUS === 'FAILED') { REJECT(A.ERROR || new Error('[EXPECT] action failed')); return; }
        if (Date.now() - START > TIMEOUT) { REJECT(new Error('[EXPECT] timeout: ' + ID)); return; }
        setTimeout(POLL, INTERVAL);
      }
      POLL();
    });
  }

  function GETACTIONRESULT(ID) {
    var A = ACTIONS[ID];
    if (!A) return null;
    if (A.STATUS === 'EXECUTED') return { STATUS: 'EXECUTED', RESULT: A.RESULT, ERROR: null };
    if (A.STATUS === 'FAILED')   return { STATUS: 'FAILED',   RESULT: null,      ERROR: A.ERROR };
    return { STATUS: 'PENDING', RESULT: null, ERROR: null };
  }

  return Object.freeze({
    NAME: NAME,
    SUBMIT: SUBMIT,
    EXPECT: EXPECT,
    GETACTIONRESULT: GETACTIONRESULT
  });
}
