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
