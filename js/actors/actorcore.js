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

// @proposal=P63r2 — per-actor dispatcher surface.
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
    STAGED.forEach(function (D) { NEXT = ADDDISPATCH(NEXT, ACTORNAME, D); });
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
// name, publishing the resulting ENV to the world map.
function REGISTERACTORHANDLER(ACTORNAME, TYPE, HANDLER) {
  var SURFACE = GETACTORSURFACE(ACTORNAME);
  if (!SURFACE) {
    throw new Error('[REGISTERACTORHANDLER] unknown actor: ' + ACTORNAME);
  }
  var CURRENTENV = GETACTORSTATE('WORLDMAPACTOR');
  if (CURRENTENV === undefined) {
    return SURFACE.REGISTERHANDLER({}, TYPE, HANDLER);
  }
  var NEXTENV = SURFACE.REGISTERHANDLER(CURRENTENV, TYPE, HANDLER);
  SETACTORSTATE('WORLDMAPACTOR', NEXTENV);
  return NEXTENV;
}

// @proposal=P68 — producer factory.
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

// ---------- §17.3 — Actor dispatch (async-capable) ----------
//
// @proposal=P-ACTOR-FLOW-001 — the framework flow contract.
//
// A handler returns one of:
//   ENV                            — state update; no response
//   Promise<ENV>                   — state update on resolution
//   { ENV, RESPONSE }              — state update + response
//   Promise<{ ENV, RESPONSE }>     — both on resolution
//   { RESPONSE }                   — response; no state change
//   Promise<{ RESPONSE }>          — response on resolution
//   true | undefined               — fire-and-forget / no-op
//
// The dispatcher is the sole site of response emission and the sole site
// of state publication for handler-owned returns. It never publishes a
// Promise as state.
//
// @proposal=P-FLOW-BOUND-001 — bounded-resolution invariant. An async
// handler MUST bound its own resolution. An "external event never fires"
// path is a valid exit path and MUST resolve the handler's Promise via a
// handler-owned internal timeout. The bound is a registry value, not a
// literal, and MUST be strictly smaller than the mailbox expectation
// window that the caller is waiting on.
//
// @proposal=P-FLOW-INSTALL-FIRST-004 — the dispatcher's side-effect
// order MUST be publish → install → respond. The installer creates the
// expectation the caller is waiting on; the response is the emission
// that must resolve it. Reversing the order makes the mailbox's sole
// resolution hook a no-op (the expectation does not yet exist at
// envelope-admission time), and the wait runs to timeout.
//
// @proposal=P-FLOW-RESPONSE-CHANNEL-006 — single-channel response. A
// message's WAITMODE field declares the caller's channel: 'mailbox'
// (traditional; envelope delivery) or 'promise' (the resolved
// SENDINSTRUCTION return). The dispatcher MUST emit exactly one channel
// per message. In 'promise' mode, no expectation is created and no
// envelope is emitted.
//
// @proposal=P-CCC-FLOW-009 — CCC connector. A response message whose
// payload carries CCC_TOKEN also fires the CCC registry's handler for
// that token, in addition to its declared channel. The CCC connector
// runs after install (PH2) so that any expectation the response
// resolves already exists.

function DISPATCHPROJECT(VALUE, MESSAGE, ACTORNAME) {
  var OUT = { ENV: undefined, RESPONSE: undefined };
  if (VALUE === undefined || VALUE === true || VALUE === false) return OUT;
  if (VALUE === null) return OUT;
  if (typeof VALUE !== 'object') return OUT;
  if (Object.prototype.hasOwnProperty.call(VALUE, 'ENV') ||
      Object.prototype.hasOwnProperty.call(VALUE, 'RESPONSE')) {
    if (Object.prototype.hasOwnProperty.call(VALUE, 'ENV')) OUT.ENV = VALUE.ENV;
    if (Object.prototype.hasOwnProperty.call(VALUE, 'RESPONSE')) OUT.RESPONSE = VALUE.RESPONSE;
    return OUT;
  }
  OUT.ENV = VALUE;
  return OUT;
}

function DISPATCHPUBLISH(ACTORNAME, ENV) {
  if (ENV !== undefined) {
    SETACTORSTATE(ACTORNAME, ENV);
  }
}

// @proposal=P-FLOW-RESPONSE-CHANNEL-006 / @proposal=P-CCC-FLOW-009 —
// response emission is gated by WAITMODE and also fires the CCC
// connector for messages carrying CCC_TOKEN.
function DISPATCHRESPOND(MESSAGE, RESPONSE, ACTORNAME) {
  // promise-mode: the response travels via the returned Promise; no
  // mailbox envelope is emitted.
  if (MESSAGE && MESSAGE.WAITMODE === 'promise') return;
  if (RESPONSE !== undefined && MESSAGE.SENDER && MESSAGE.TAG) {
    var RESPONSESPEC = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
    var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || 'response';
    SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, RESPONSE, ACTORNAME, RESPONSETYPE);
  }
  // @proposal=P-CCC-FLOW-009 — the CCC connector fires for any message
  // carrying a CCC_TOKEN, regardless of response presence. The connector
  // runs after install (ordering guaranteed by DISPATCHTOACTOR).
  if (MESSAGE && MESSAGE.CCC_TOKEN !== undefined && typeof CCCNOTIFY === 'function') {
    CCCNOTIFY(MESSAGE.CCC_TOKEN, {
      TYPE: MESSAGE.TYPE,
      TAG: MESSAGE.TAG,
      SENDER: MESSAGE.SENDER,
      RESPONSE: RESPONSE
    });
  }
}

// @proposal=P-FLOW-RESPONSE-CHANNEL-006 — installation is gated by
// WAITMODE. In 'promise' mode, no expectation is created (the caller
// receives the response through the returned Promise, and creating an
// expectation would orphan it).
function DISPATCHINSTALL(INSTALLER, MESSAGE) {
  if (MESSAGE && MESSAGE.WAITMODE === 'promise') return;
  if (typeof INSTALLER === 'function') {
    INSTALLER(MESSAGE);
  }
}

// @proposal=P-FLOW-INSTALL-FIRST-004 — publish → install → respond.
// The install step precedes the respond step so that the response
// envelope, when routed via the mailbox, resolves an expectation that
// already exists.
function DISPATCHTOACTOR(ACTORNAME, BEHAVIOR, MESSAGE, INSTALLER) {
  if (typeof BEHAVIOR !== 'function') {
    throw new Error('[DISPATCHTOACTOR] BEHAVIOR must be a function');
  }
  var ENV = GETACTORSTATE(ACTORNAME);
  if (ENV === undefined) ENV = {};
  var RESULT = BEHAVIOR(ENV, MESSAGE);
  if (RESULT && typeof RESULT.then === 'function') {
    return RESULT.then(function (RESOLVED) {
      var OUT = DISPATCHPROJECT(RESOLVED, MESSAGE, ACTORNAME);
      DISPATCHPUBLISH(ACTORNAME, OUT.ENV);
      DISPATCHINSTALL(INSTALLER, MESSAGE);
      DISPATCHRESPOND(MESSAGE, OUT.RESPONSE, ACTORNAME);
      return RESOLVED;
    });
  }
  var OUT = DISPATCHPROJECT(RESULT, MESSAGE, ACTORNAME);
  DISPATCHPUBLISH(ACTORNAME, OUT.ENV);
  DISPATCHINSTALL(INSTALLER, MESSAGE);
  DISPATCHRESPOND(MESSAGE, OUT.RESPONSE, ACTORNAME);
  return RESULT;
}

function DISPATCHIMMUTABLE(ACTORNAME, BEHAVIOR, MESSAGE) {
  if (typeof BEHAVIOR !== 'function') {
    throw new Error('[DISPATCHIMMUTABLE] BEHAVIOR must be a function');
  }
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
    var HANDLER = ACTORCONSUMERS[NAME];
    if (typeof HANDLER === 'function') {
      try {
        var RESULT = DISPATCHTOACTOR(NAME, HANDLER, ACTION);
        if (RESULT && typeof RESULT.then === 'function') {
          ACTIONS[ID] = { ID: ID, STATUS: 'PENDING', RESULT: null, ERROR: null };
          RESULT.then(function (V) {
            ACTIONS[ID] = { ID: ID, STATUS: 'EXECUTED', RESULT: V, ERROR: null };
          }).catch(function (E) {
            ACTIONS[ID] = { ID: ID, STATUS: 'FAILED', RESULT: null, ERROR: E };
          });
        } else {
          ACTIONS[ID] = { ID: ID, STATUS: 'EXECUTED', RESULT: RESULT, ERROR: null };
        }
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

// ============================================================
// §18 — Inference facility (P-INFER-001)
// ============================================================
//
// INFERDISPATCHSTRATEGY is a pure function of (RECIPIENT, TYPE, PAYLOAD,
// SENDER, TAG, RESPONSESPEC) and the current registry snapshots. It
// returns { route, batch, suppress, reason }.
//
// Heuristic rules (evaluated in order):
//   0. TYPE ∈ RESPONSETYPES                → mailbox  (P-FLOW-RESPONSE-ROUTING-003)
//   1. RECIPIENT ∈ POLLERRECIPIENTS        → mailbox
//   2. RECIPIENT ∈ BROADCASTRECIPIENTS     → broadcast
//   3. RECIPIENT ∈ ACTORCONSUMERS          → direct
//   4. TYPE ∈ SUPPRESSIBLETYPES ∧ below threshold → suppress
//   5. TYPE ∈ BATCHABLETYPES               → batch
//   6. fallback                            → mailbox
//
// Every registry uses the frozen-value/ref-swap idiom (I-2).

// ---------- §18.0 — Script-load timeout (P-FLOW-BOUND-001) ----------

var SCRIPTLOADTIMEOUTREF = { current: 5000 };

function GETSCRIPTLOADTIMEOUT() { return SCRIPTLOADTIMEOUTREF.current; }

function SETSCRIPTLOADTIMEOUT(MS) {
  if (typeof MS !== 'number' || MS <= 0 || Math.floor(MS) !== MS) {
    throw new Error('[SETSCRIPTLOADTIMEOUT] MS must be a positive integer');
  }
  var MAILBOX = (typeof mailboxresolve === 'function') ? mailboxresolve('expectationtimeout') : null;
  if (MAILBOX !== null && MS >= MAILBOX) {
    throw new Error('[SETSCRIPTLOADTIMEOUT] MS must be strictly smaller than expectationtimeout');
  }
  SCRIPTLOADTIMEOUTREF.current = MS;
  return MS;
}

// ---------- §18.1 — Poller recipients ----------

var POLLERRECIPIENTSREF = { current: Object.freeze({ BLOCKCOMPILER: true }) };

function GETPOLLERRECIPIENTS() { return POLLERRECIPIENTSREF.current; }
function REGISTERPOLLERRECIPIENT(NAME) {
  if (typeof NAME !== 'string' || NAME.length === 0) {
    throw new Error('[REGISTERPOLLERRECIPIENT] NAME must be a non-empty string');
  }
  var CURRENT = POLLERRECIPIENTSREF.current;
  if (CURRENT[NAME] === true) return NAME;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[NAME] = true;
  POLLERRECIPIENTSREF.current = Object.freeze(NEXT);
  return NAME;
}
function UNREGISTERPOLLERRECIPIENT(NAME) {
  if (typeof NAME !== 'string' || NAME.length === 0) return false;
  var CURRENT = POLLERRECIPIENTSREF.current;
  if (CURRENT[NAME] !== true) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== NAME) NEXT[K] = CURRENT[K]; });
  POLLERRECIPIENTSREF.current = Object.freeze(NEXT);
  return true;
}

// ---------- §18.2 — Broadcast recipients ----------

var BROADCASTRECIPIENTSREF = { current: Object.freeze({ BROADCAST: true }) };

function GETBROADCASTRECIPIENTS() { return BROADCASTRECIPIENTSREF.current; }
function REGISTERBROADCASTRECIPIENT(NAME) {
  if (typeof NAME !== 'string' || NAME.length === 0) {
    throw new Error('[REGISTERBROADCASTRECIPIENT] NAME must be a non-empty string');
  }
  var CURRENT = BROADCASTRECIPIENTSREF.current;
  if (CURRENT[NAME] === true) return NAME;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[NAME] = true;
  BROADCASTRECIPIENTSREF.current = Object.freeze(NEXT);
  return NAME;
}
function UNREGISTERBROADCASTRECIPIENT(NAME) {
  if (typeof NAME !== 'string' || NAME.length === 0) return false;
  var CURRENT = BROADCASTRECIPIENTSREF.current;
  if (CURRENT[NAME] !== true) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== NAME) NEXT[K] = CURRENT[K]; });
  BROADCASTRECIPIENTSREF.current = Object.freeze(NEXT);
  return true;
}

// ---------- §18.3 — Suppressible types ----------

var SUPPRESSIBLETYPESREF = { current: Object.freeze({}) };

function GETSUPPRESSIBLETYPES() { return SUPPRESSIBLETYPESREF.current; }
function REGISTERSUPPRESSIBLETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERSUPPRESSIBLETYPE] TYPE must be a non-empty string');
  }
  var CURRENT = SUPPRESSIBLETYPESREF.current;
  if (CURRENT[TYPE] === true) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = true;
  SUPPRESSIBLETYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}
function UNREGISTERSUPPRESSIBLETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var CURRENT = SUPPRESSIBLETYPESREF.current;
  if (CURRENT[TYPE] !== true) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== TYPE) NEXT[K] = CURRENT[K]; });
  SUPPRESSIBLETYPESREF.current = Object.freeze(NEXT);
  return true;
}

// ---------- §18.4 — Batchable types ----------

var BATCHABLETYPESREF = { current: Object.freeze({}) };

function GETBATCHABLETYPES() { return BATCHABLETYPESREF.current; }
function REGISTERBATCHABLETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERBATCHABLETYPE] TYPE must be a non-empty string');
  }
  var CURRENT = BATCHABLETYPESREF.current;
  if (CURRENT[TYPE] === true) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = true;
  BATCHABLETYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}
function UNREGISTERBATCHABLETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var CURRENT = BATCHABLETYPESREF.current;
  if (CURRENT[TYPE] !== true) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== TYPE) NEXT[K] = CURRENT[K]; });
  BATCHABLETYPESREF.current = Object.freeze(NEXT);
  return true;
}

// ---------- §18.5 — Batch windows ----------

var BATCHWINDOWSREF = { current: Object.freeze({ LOGLINE: 250 }) };

function GETBATCHWINDOWS() { return BATCHWINDOWSREF.current; }
function SETBATCHWINDOW(TYPE, MS) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[SETBATCHWINDOW] TYPE must be a non-empty string');
  }
  if (typeof MS !== 'number' || MS < 0 || Math.floor(MS) !== MS) {
    throw new Error('[SETBATCHWINDOW] MS must be a non-negative integer');
  }
  var CURRENT = BATCHWINDOWSREF.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = MS;
  BATCHWINDOWSREF.current = Object.freeze(NEXT);
  return MS;
}

// ---------- §18.6 — Verbosity thresholds ----------

var VERBOSITYTHRESHOLDREF = { current: Object.freeze({ LOGLINE: 'DEBUG' }) };

function GETVERBOSITYTHRESHOLD() { return VERBOSITYTHRESHOLDREF.current; }
function SETVERBOSITYTHRESHOLD(TYPE, LEVEL) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[SETVERBOSITYTHRESHOLD] TYPE must be a non-empty string');
  }
  var CURRENT = VERBOSITYTHRESHOLDREF.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = LEVEL;
  VERBOSITYTHRESHOLDREF.current = Object.freeze(NEXT);
  return LEVEL;
}

// ---------- §18.7 — The inference facility ----------

function INFERDISPATCHSTRATEGY(RECIPIENT, TYPE, PAYLOAD, SENDER, TAG, RESPONSESPEC) {
  var POLLERS = GETPOLLERRECIPIENTS();
  var BROADCASTERS = GETBROADCASTRECIPIENTS();
  var SUPPRESSIBLE = GETSUPPRESSIBLETYPES();
  var BATCHABLE = GETBATCHABLETYPES();
  var THRESHOLD = GETVERBOSITYTHRESHOLD();
  var RESPONSETYPES = (typeof GETRESPONSETYPES === 'function') ? GETRESPONSETYPES() : {};

  // @proposal=P-FLOW-RESPONSE-ROUTING-003 — rule 0: response types are
  // always routed via mailbox.
  if (RESPONSETYPES[TYPE] === true) {
    return { route: 'mailbox', batch: false, suppress: false, reason: 'response-type' };
  }
  if (POLLERS[RECIPIENT] === true) {
    return { route: 'mailbox', batch: false, suppress: false, reason: 'poller-recipient' };
  }
  if (BROADCASTERS[RECIPIENT] === true) {
    return { route: 'broadcast', batch: false, suppress: false, reason: 'broadcast-recipient' };
  }
  if (Object.prototype.hasOwnProperty.call(ACTORCONSUMERS, RECIPIENT)) {
    if (BATCHABLE[TYPE] === true) {
      return { route: 'direct', batch: true, suppress: false, reason: 'batchable-to-actor' };
    }
    return { route: 'direct', batch: false, suppress: false, reason: 'known-actor' };
  }
  if (SUPPRESSIBLE[TYPE] === true) {
    var level = THRESHOLD[TYPE];
    var current = (typeof getverbosity === 'function') ? getverbosity(blockcompilerstate) : null;
    var levelval = (typeof resolvelevel === 'function') ? resolvelevel(level) : null;
    if (current !== null && levelval !== null && current < levelval) {
      return { route: 'mailbox', batch: false, suppress: true, reason: 'suppressed-below-threshold' };
    }
  }
  if (BATCHABLE[TYPE] === true) {
    return { route: 'mailbox', batch: true, suppress: false, reason: 'batchable-to-mailbox' };
  }
  return { route: 'mailbox', batch: false, suppress: false, reason: 'fallback' };
}

// ---------- §18.8 — Response-type registry (P-FLOW-RESPONSE-ROUTING-003) ----------

var RESPONSETYPESREF = { current: Object.freeze({}) };

function GETRESPONSETYPES() { return RESPONSETYPESREF.current; }

function REGISTERRESPONSETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERRESPONSETYPE] TYPE must be a non-empty string');
  }
  var CURRENT = RESPONSETYPESREF.current;
  if (CURRENT[TYPE] === true) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = true;
  RESPONSETYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}

function UNREGISTERRESPONSETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var CURRENT = RESPONSETYPESREF.current;
  if (CURRENT[TYPE] !== true) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== TYPE) NEXT[K] = CURRENT[K]; });
  RESPONSETYPESREF.current = Object.freeze(NEXT);
  return true;
}

if (typeof MAILBOXFILTERTYPES !== 'undefined' && MAILBOXFILTERTYPES) {
  Object.keys(MAILBOXFILTERTYPES).forEach(function (K) {
    var TYPE = MAILBOXFILTERTYPES[K];
    if (typeof TYPE === 'string' && TYPE.length > 0) {
      REGISTERRESPONSETYPE(TYPE);
    }
  });
}

// ---------- §18.9 — CCC registry + CCCNOTIFY (P-CCC-FLOW-009) ----------
//
// The CCC (composite-block error-capture) settlement currently reads
// from the broadcast fan-out (SUBSCRIBEBROADCAST on BLOCKEXECUTED /
// BLOCKFAILED). Under the flow, responses travel via mailbox or
// Promise; neither channel is a broadcast. This registry gives the
// CCC a first-class hook into the flow: a response whose payload
// carries CCC_TOKEN causes DISPATCHRESPOND to invoke CCCNOTIFY, which
// dispatches to the subscribed handler. The connector is additive to
// the broadcast channel; existing CCC subscribers are unaffected.
//
// The registry follows the ref-swap idiom (I-2). The CCC token
// namespace is disjoint from the message TAG namespace.

var CCCREGISTRYREF = { current: Object.freeze({}) };

function GETCCCREGISTRY() { return CCCREGISTRYREF.current; }

function REGISTERCCCHANDLER(TOKEN, HANDLER) {
  if (typeof TOKEN !== 'string' || TOKEN.length === 0) {
    throw new Error('[REGISTERCCCHANDLER] TOKEN must be a non-empty string');
  }
  if (typeof HANDLER !== 'function') {
    throw new Error('[REGISTERCCCHANDLER] HANDLER must be a function');
  }
  var CURRENT = CCCREGISTRYREF.current;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TOKEN] = HANDLER;
  CCCREGISTRYREF.current = Object.freeze(NEXT);
  return HANDLER;
}

function UNREGISTERCCCHANDLER(TOKEN) {
  if (typeof TOKEN !== 'string' || TOKEN.length === 0) return false;
  var CURRENT = CCCREGISTRYREF.current;
  if (!Object.prototype.hasOwnProperty.call(CURRENT, TOKEN)) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { if (K !== TOKEN) NEXT[K] = CURRENT[K]; });
  CCCREGISTRYREF.current = Object.freeze(NEXT);
  return true;
}

function CCCNOTIFY(TOKEN, SIGNAL) {
  if (typeof TOKEN !== 'string' || TOKEN.length === 0) return;
  var CURRENT = CCCREGISTRYREF.current;
  var HANDLER = CURRENT[TOKEN];
  if (typeof HANDLER !== 'function') return;
  try { HANDLER(SIGNAL); } catch (E) { /* handler error does not block others */ }
}

// ============================================================
// §18b — Batch scheduler (P-INFER-001)
// ============================================================

var BATCHBUFFERS = {};

function BATCHKEY(RECIPIENT, TYPE) {
  return RECIPIENT + '\u0000' + TYPE;
}

function ENQUEUEBATCH(RECIPIENT, TYPE, MESSAGE, TAG, SENDER, RESPONSESPEC) {
  var KEY = BATCHKEY(RECIPIENT, TYPE);
  if (!BATCHBUFFERS[KEY]) {
    BATCHBUFFERS[KEY] = { RECIPIENT: RECIPIENT, TYPE: TYPE, ITEMS: [], TIMER: null };
  }
  var BUF = BATCHBUFFERS[KEY];
  BUF.ITEMS.push({ MESSAGE: MESSAGE, TAG: TAG, SENDER: SENDER, RESPONSESPEC: RESPONSESPEC });
  if (BUF.TIMER === null) {
    var WINDOWS = GETBATCHWINDOWS();
    var MS = (typeof WINDOWS[TYPE] === 'number') ? WINDOWS[TYPE] : 0;
    BUF.TIMER = setTimeout(function () { FLUSHBATCH(KEY); }, MS);
  }
  return TAG;
}

function FLUSHBATCH(KEY) {
  var BUF = BATCHBUFFERS[KEY];
  if (!BUF) return;
  delete BATCHBUFFERS[KEY];
  var ITEMS = BUF.ITEMS;
  if (ITEMS.length === 0) return;
  var FIRST = ITEMS[0];
  var FLAT = {
    TYPE: BUF.TYPE,
    SENDER: FIRST.SENDER || 'system',
    TAG: FIRST.TAG,
    ITEMS: ITEMS.map(function (it) { return it.MESSAGE; })
  };
  if (FIRST.RESPONSESPEC) FLAT.RESPONSESPEC = FIRST.RESPONSESPEC;
  var CONSUMER = ACTORCONSUMERS[BUF.RECIPIENT];
  if (typeof CONSUMER === 'function') {
    DISPATCHTOACTOR(BUF.RECIPIENT, CONSUMER, FLAT);
  } else if (typeof SENDINSTRUCTION === 'function') {
    SENDINSTRUCTION(BUF.RECIPIENT, BUF.TYPE, FLAT, FLAT.TAG, FLAT.SENDER);
  }
}

function FLUSHALLBATCHES() {
  var KEYS = Object.keys(BATCHBUFFERS);
  KEYS.forEach(function (K) {
    if (BATCHBUFFERS[K] && BATCHBUFFERS[K].TIMER !== null) {
      clearTimeout(BATCHBUFFERS[K].TIMER);
      BATCHBUFFERS[K].TIMER = null;
    }
    FLUSHBATCH(K);
  });
}
