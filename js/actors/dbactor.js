var DBVERBOSITYCONSTANTS = createverbosityconstants();
var DBSTATE = { level: DBVERBOSITYCONSTANTS.DEBUG };

var ROOTKEY = 'FRAMEWORKDBACTORMAP';
var MAXKEYS = 200;
var MAXENTRYBYTES = 6 * 1024 * 1024;

function GETSTORAGE() {
  try {
    var STORAGE = typeof localStorage !== 'undefined' ? localStorage :
      (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
    if (STORAGE && typeof STORAGE.getItem === 'function' && typeof STORAGE.setItem === 'function') return STORAGE;
  } catch (E) {}
  return null;
}

function ENSUREDBSLICE(ENV) {
  return ENSUREENVSLICE(ENV, 'db', function() { return { STORE: {} }; });
}

function SERIALIZEFORPERSISTENCE(VALUE, SEEN, REFMAP) {
  if (SEEN === undefined) SEEN = [];
  if (REFMAP === undefined) REFMAP = [];
  if (VALUE === null) return null;
  var T = typeof VALUE;
  if (T === 'string' || T === 'boolean') return VALUE;
  if (T === 'number') return (isNaN(VALUE) || !isFinite(VALUE)) ? String(VALUE) : VALUE;
  if (T === 'undefined') return { TYPEMARKER: 'undefined' };
  if (T === 'function') return { TYPEMARKER: 'function', SOURCE: VALUE.toString() };
  if (typeof HTMLElement !== 'undefined' && VALUE instanceof HTMLElement) return { TYPEMARKER: 'dom', TAG: VALUE.tagName, ID: VALUE.id || null };
  if (typeof Node !== 'undefined' && VALUE instanceof Node) return { TYPEMARKER: 'node', NODENAME: VALUE.nodeName };
  if (typeof EventTarget !== 'undefined' && VALUE instanceof EventTarget) return { TYPEMARKER: 'eventtarget' };
  if (VALUE instanceof Date) return { TYPEMARKER: 'date', ISO: VALUE.toISOString() };
  if (Object.prototype.toString.call(VALUE) === '[object RegExp]') return { TYPEMARKER: 'regexp', SOURCE: VALUE.source, FLAGS: VALUE.flags || '' };
  if (VALUE instanceof Error) return { TYPEMARKER: 'error', NAME: VALUE.name, MESSAGE: VALUE.message, STACK: VALUE.stack };
  if (typeof Map !== 'undefined' && VALUE instanceof Map) {
    var MAPOBJ = { TYPEMARKER: 'map', ENTRIES: [] };
    VALUE.forEach(function(VAL, KEY) { MAPOBJ.ENTRIES.push([SERIALIZEFORPERSISTENCE(KEY, SEEN, REFMAP), SERIALIZEFORPERSISTENCE(VAL, SEEN, REFMAP)]); });
    return MAPOBJ;
  }
  if (typeof Set !== 'undefined' && VALUE instanceof Set) {
    var SETARR = [];
    VALUE.forEach(function(ITEM) { SETARR.push(SERIALIZEFORPERSISTENCE(ITEM, SEEN, REFMAP)); });
    return { TYPEMARKER: 'set', VALUES: SETARR };
  }
  if (typeof VALUE === 'object') {
    var REFINDEX = REFMAP.indexOf(VALUE);
    if (REFINDEX !== -1) return { TYPEMARKER: 'ref', REFINDEX: REFINDEX };
    if (SEEN.indexOf(VALUE) !== -1) return { TYPEMARKER: 'circular' };
    REFMAP.push(VALUE);
    SEEN.push(VALUE);
    var RESULT;
    if (Array.isArray(VALUE)) RESULT = VALUE.map(function(ITEM) { return SERIALIZEFORPERSISTENCE(ITEM, SEEN, REFMAP); });
    else {
      RESULT = {};
      Object.keys(VALUE).forEach(function(KEY) { RESULT[KEY] = SERIALIZEFORPERSISTENCE(VALUE[KEY], SEEN, REFMAP); });
    }
    SEEN.pop();
    return RESULT;
  }
  return VALUE;
}

function PERSISTATTEMPT(STORE, ROOT, STORAGE) {
  try { STORAGE.setItem(ROOTKEY, JSON.stringify(SERIALIZEFORPERSISTENCE(ROOT))); return true; }
  catch (ERR) { logwarn(DBSTATE, '[DBACTOR]', 'PERSIST FAILED:', ERR && ERR.message ? ERR.message : String(ERR)); return false; }
}

function PERSIST(STORE) {
  var ROOT = { NAMESPACE: 'FRAMEWORKDBACTORV1', UPDATEDAT: Date.now(), KEYS: STORE };
  var STORAGE = GETSTORAGE();
  if (!STORAGE) return false;
  return PERSISTATTEMPT(STORE, ROOT, STORAGE);
}

// ==================== DNA FUNCTION SERIALIZATION ====================

function DNAREPLACER(KEY, VALUE) { if (typeof VALUE === 'function') return { SERIALIZEDFUNCTION: true, SOURCE: VALUE.toString() }; return VALUE; }

function DNAREVIVER(KEY, VALUE) {
  if (VALUE && typeof VALUE === 'object' && VALUE.SERIALIZEDFUNCTION === true) {
    try {
      if (VALUE.DEPS) {
        var DEPS = VALUE.DEPS;
        var REVIVED = new Function('return (' + VALUE.SOURCE + ')')();
        return function() { var ARGS = Array.prototype.slice.call(arguments); return REVIVED.apply(null, ARGS.concat([DEPS])); };
      }
      return new Function('return (' + VALUE.SOURCE + ')')();
    } catch (ERR) { return function() { throw new Error('revived function failed'); }; }
  }
  return VALUE;
}

var SERIALIZEDNA = function(DNA) { return JSON.stringify(DNA, DNAREPLACER); };
var DESERIALIZEDNA = function(JSONSTR) { return JSON.parse(JSONSTR, DNAREVIVER); };

// ==================== PROPERTY PAIR STORE ====================

var PAIRSTORE = {};
var PAIRCOUNTER = 0;

function PAIRIDENTITY(KEY, VALUE) {
  var NORMALIZED;
  if (typeof VALUE === 'function') NORMALIZED = 'function:' + VALUE.toString();
  else if (typeof VALUE === 'object' && VALUE !== null) {
    try { NORMALIZED = 'json:' + JSON.stringify(VALUE); }
    catch (E) { NORMALIZED = 'object:' + (VALUE.constructor && VALUE.constructor.name ? VALUE.constructor.name : 'Object'); }
  } else NORMALIZED = typeof VALUE + ':' + String(VALUE);
  return KEY + '\u0000' + NORMALIZED;
}

function STOREPAIR(KEY, VALUE) {
  var IDENTITY = PAIRIDENTITY(KEY, VALUE);
  var REFID = PAIRSTORE[IDENTITY];
  if (!REFID) {
    PAIRCOUNTER += 1;
    REFID = 'PAIR' + PAIRCOUNTER;
    PAIRSTORE[IDENTITY] = REFID;
    PAIRSTORE['REF:' + REFID] = { KEY: KEY, VALUE: VALUE };
  }
  return REFID;
}

function CONSOLIDATEGRAPH(NODE) {
  if (NODE === null || NODE === undefined) return NODE;
  if (typeof NODE === 'object') {
    if (NODE.PAIRREFERENCE) return NODE;
    if (Array.isArray(NODE)) return NODE.map(CONSOLIDATEGRAPH);
    if (NODE.BRIEFCASE && typeof NODE.BRIEFCASE === 'object') {
      var BRIEFCASE = NODE.BRIEFCASE;
      Object.keys(BRIEFCASE).forEach(function(KEY) { var REFID = STOREPAIR(KEY, BRIEFCASE[KEY]); BRIEFCASE[KEY] = { PAIRREFERENCE: REFID }; });
    }
    if (NODE.ELEMENT === 'BLOCK') {
      Object.keys(NODE).forEach(function(KEY) { if (KEY === 'ELEMENTS') return; var REFID = STOREPAIR(KEY, NODE[KEY]); NODE[KEY] = { PAIRREFERENCE: REFID }; });
      return NODE;
    }
    Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = CONSOLIDATEGRAPH(NODE[KEY]); });
    return NODE;
  }
  return NODE;
}

function RESTOREGRAPH(NODE) {
  if (NODE === null || NODE === undefined) return NODE;
  if (typeof NODE === 'object') {
    var REFID = NODE.PAIRREFERENCE;
    if (REFID) { var ENTRY = PAIRSTORE['REF:' + REFID]; return ENTRY ? ENTRY.VALUE : undefined; }
    if (Array.isArray(NODE)) return NODE.map(RESTOREGRAPH);
    Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = RESTOREGRAPH(NODE[KEY]); });
    return NODE;
  }
  return NODE;
}

function SERIALIZEPAIRSTORE() {
  var OUTPUT = {};
  Object.keys(PAIRSTORE).forEach(function(KEY) { OUTPUT[KEY] = PAIRSTORE[KEY]; });
  return JSON.stringify(OUTPUT, DNAREPLACER);
}

function DESERIALIZEPAIRSTORE(JSONSTR) {
  if (!JSONSTR) return;
  var PARSED;
  try { PARSED = JSON.parse(JSONSTR, DNAREVIVER); }
  catch (ERR) { return; }
  Object.keys(PAIRSTORE).forEach(function(KEY) { delete PAIRSTORE[KEY]; });
  Object.keys(PARSED || {}).forEach(function(KEY) { PAIRSTORE[KEY] = PARSED[KEY]; });
}

function MEASURELENGTH(OBJ) { return JSON.stringify(OBJ).length; }

function OPTIMIZESERIALIZEDDNA(JSONSTRING) {
  Object.keys(PAIRSTORE).forEach(function(KEY) { delete PAIRSTORE[KEY]; });
  PAIRCOUNTER = 0;
  var OBJ = JSON.parse(JSONSTRING);

  var PASSOBJECTPAIRDEDUP = function(NODE) {
    if (Array.isArray(NODE)) return NODE.map(PASSOBJECTPAIRDEDUP);
    if (NODE && typeof NODE === 'object') {
      if (NODE.PAIRREFERENCE || NODE.pairReference) return NODE;
      if (NODE.ELEMENT === 'BLOCK') {
        Object.keys(NODE).forEach(function(KEY) {
          if (KEY === 'ELEMENTS') return;
          var IDENTITY = PAIRIDENTITY(KEY, NODE[KEY]);
          var REFID = PAIRSTORE[IDENTITY];
          if (!REFID) { PAIRCOUNTER += 1; REFID = 'PAIR' + PAIRCOUNTER; PAIRSTORE[IDENTITY] = REFID; PAIRSTORE['REF:' + REFID] = { KEY: KEY, VALUE: NODE[KEY] }; }
          NODE[KEY] = { PAIRREFERENCE: REFID };
        });
        return NODE;
      }
      if (NODE.BRIEFCASE && typeof NODE.BRIEFCASE === 'object') {
        Object.keys(NODE.BRIEFCASE).forEach(function(KEY) {
          var IDENTITY = PAIRIDENTITY(KEY, NODE.BRIEFCASE[KEY]);
          var REFID = PAIRSTORE[IDENTITY];
          if (!REFID) { PAIRCOUNTER += 1; REFID = 'PAIR' + PAIRCOUNTER; PAIRSTORE[IDENTITY] = REFID; PAIRSTORE['REF:' + REFID] = { KEY: KEY, VALUE: NODE.BRIEFCASE[KEY] }; }
          NODE.BRIEFCASE[KEY] = { PAIRREFERENCE: REFID };
        });
      }
      Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = PASSOBJECTPAIRDEDUP(NODE[KEY]); });
      return NODE;
    }
    return NODE;
  };

  var PASSINNERDEDUP = function(NODE) {
    if (Array.isArray(NODE)) return NODE.map(PASSINNERDEDUP);
    if (NODE && typeof NODE === 'object') {
      if ((NODE.SERIALIZEDFUNCTION === true || NODE.serializedFunction === true) && typeof NODE.SOURCE === 'string') return NODE;
      Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = PASSINNERDEDUP(NODE[KEY]); });
      return NODE;
    }
    return NODE;
  };

  function OPTIMIZECYCLE(CURRENT) {
    var BEFORE = MEASURELENGTH(CURRENT);
    var CANDIDATE = PASSINNERDEDUP(PASSOBJECTPAIRDEDUP(JSON.parse(JSON.stringify(CURRENT))));
    if (MEASURELENGTH(CANDIDATE) < BEFORE) return OPTIMIZECYCLE(CANDIDATE);
    return CURRENT;
  }

  var OPTIMIZED = OPTIMIZECYCLE(OBJ);
  OPTIMIZED.FRAMEWORKPAIRSTORE = SERIALIZEPAIRSTORE();
  return JSON.stringify(OPTIMIZED);
}

function DEOPTIMIZESERIALIZEDDNA(JSONSTRING) {
  var OBJ = JSON.parse(JSONSTRING);
  var STOREDATA = OBJ.FRAMEWORKPAIRSTORE;
  if (STOREDATA) { DESERIALIZEPAIRSTORE(STOREDATA); delete OBJ.FRAMEWORKPAIRSTORE; }
  var RESOLVENODE = function(NODE) {
    if (Array.isArray(NODE)) return NODE.map(RESOLVENODE);
    if (NODE && typeof NODE === 'object') {
      var REFID = NODE.PAIRREFERENCE;
      if (REFID) { var ENTRY = PAIRSTORE['REF:' + REFID]; return ENTRY ? ENTRY.VALUE : undefined; }
      Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = RESOLVENODE(NODE[KEY]); });
      return NODE;
    }
    return NODE;
  };
  return JSON.stringify(RESOLVENODE(OBJ));
}

// ============================================================
// §2 — Message handlers (P-ACTOR-FLOW-002)
// ============================================================
// Every handler returns { ENV, RESPONSE } or ENV. No SENDRESPONSE, no
// SENDINSTRUCTION(UPDATE), no callback-side mutation.
// Response channel = framework mailbox, not the removed store mailbox.

function DBBEHAVIORSTORE(ENV, MESSAGE) {
  logdebug(ENV, '[DBACTOR]', 'ACTION STORE KEY:', MESSAGE.KEY);
  var NEXTENV = ENSUREDBSLICE(ENV);
  var STORE = NEXTENV.db.STORE;

  try {
    var SERIALIZED = JSON.stringify(SERIALIZEFORPERSISTENCE(MESSAGE.VALUE));
    if (SERIALIZED.length > MAXENTRYBYTES) {
      return { ENV: NEXTENV, RESPONSE: { ERROR: 'value too large' } };
    }
  } catch (E) {
    return { ENV: NEXTENV, RESPONSE: { ERROR: E.message || String(E) } };
  }
  var KEYS = Object.keys(STORE);
  if (KEYS.length >= MAXKEYS && !STORE[MESSAGE.KEY]) {
    var OLDEST = KEYS[0];
    if (OLDEST) delete STORE[OLDEST];
  }
  STORE[MESSAGE.KEY] = MESSAGE.VALUE;
  var PERSISTED = PERSIST(STORE);
  return { ENV: NEXTENV, RESPONSE: PERSISTED ? { RESULT: true } : { ERROR: 'persist failed' } };
}

function DBBEHAVIORRESTORE(ENV, MESSAGE) {
  var NEXTENV = ENSUREDBSLICE(ENV);
  var STORE = NEXTENV.db.STORE;
  var RESTOREDVALUE = STORE[MESSAGE.KEY] !== undefined ? STORE[MESSAGE.KEY] : null;
  return { ENV: NEXTENV, RESPONSE: { RESULT: RESTOREDVALUE } };
}

function DBBEHAVIORLIST(ENV, MESSAGE) {
  var NEXTENV = ENSUREDBSLICE(ENV);
  var STORE = NEXTENV.db.STORE;
  return { ENV: NEXTENV, RESPONSE: { RESULT: Object.keys(STORE) } };
}

function DBBEHAVIORDELETE(ENV, MESSAGE) {
  var NEXTENV = ENSUREDBSLICE(ENV);
  var STORE = NEXTENV.db.STORE;
  delete STORE[MESSAGE.KEY];
  var PERSISTEDDEL = PERSIST(STORE);
  return { ENV: NEXTENV, RESPONSE: PERSISTEDDEL ? { RESULT: true } : { ERROR: 'persist failed' } };
}

function DBBEHAVIORDEFAULT(ENV, MESSAGE) {
  logwarn(ENV, '[DBACTOR]', 'UNKNOWN ACTION:', MESSAGE.TYPE);
  return { ENV: ENV, RESPONSE: { ERROR: '[DBACTOR] unknown message type' } };
}

// ============================================================
// §3 — Dispatcher surface
// ============================================================

var DBBEHAVIORDISPATCH = MAKEACTORDISPATCHSURFACE('DBACTOR', [
  MAKETYPEDDISPATCH(MESSAGETYPES.STORE, DBBEHAVIORSTORE),
  MAKETYPEDDISPATCH(MESSAGETYPES.RESTORE, DBBEHAVIORRESTORE),
  MAKETYPEDDISPATCH(MESSAGETYPES.LIST, DBBEHAVIORLIST),
  MAKETYPEDDISPATCH(MESSAGETYPES.DELETE, DBBEHAVIORDELETE),
  DBBEHAVIORDEFAULT
]);

function DBBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[DBACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);
  return DBBEHAVIORDISPATCH.DISPATCH(ENV, MESSAGE);
}

REGISTERACTORSURFACE('DBACTOR', DBBEHAVIORDISPATCH);
REGISTERAGGREGATEBEHAVIOR('DBACTOR', DBBEHAVIOR);
ACTORCONSUMERS['DBACTOR'] = DBBEHAVIOR;

// ============================================================
// §4 — Direct DB API (unified with framework mailbox)
// ============================================================

function DBSTORE(KEY, VALUE) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DBACTOR', MESSAGETYPES.STORE, { KEY: KEY, VALUE: VALUE }, TAG, 'WORLDMAPACTOR', { responsetype: 'DBRESULT' });
  return WAITFORMAILBOX({ TAG: TAG, SENDER: 'DBACTOR' }, mailboxresolve('storewaittimeout'))
    .then(function(ENV) { return ENV && ENV.PAYLOAD ? ENV.PAYLOAD.RESULT : undefined; });
}

function DBRESTORE(KEY) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DBACTOR', MESSAGETYPES.RESTORE, { KEY: KEY }, TAG, 'WORLDMAPACTOR', { responsetype: 'DBRESULT' });
  return WAITFORMAILBOX({ TAG: TAG, SENDER: 'DBACTOR' }, mailboxresolve('storewaittimeout'))
    .then(function(ENV) { return ENV && ENV.PAYLOAD ? ENV.PAYLOAD.RESULT : undefined; });
}

function DBLIST() {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DBACTOR', MESSAGETYPES.LIST, {}, TAG, 'WORLDMAPACTOR', { responsetype: 'DBRESULT' });
  return WAITFORMAILBOX({ TAG: TAG, SENDER: 'DBACTOR' }, mailboxresolve('storewaittimeout'))
    .then(function(ENV) { return ENV && ENV.PAYLOAD ? ENV.PAYLOAD.RESULT : undefined; });
}

function DBDELETE(KEY) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DBACTOR', MESSAGETYPES.DELETE, { KEY: KEY }, TAG, 'WORLDMAPACTOR', { responsetype: 'DBRESULT' });
  return WAITFORMAILBOX({ TAG: TAG, SENDER: 'DBACTOR' }, mailboxresolve('storewaittimeout'))
    .then(function(ENV) { return ENV && ENV.PAYLOAD ? ENV.PAYLOAD.RESULT : undefined; });
}

// ============================================================
// §5 — Actor handle surface (unchanged)
// ============================================================

var DBACTORHANDLE = null;

function DBACTORHANDLEINSTANCE() {
  if (!DBACTORHANDLE) DBACTORHANDLE = CREATEACTORHANDLE('DBACTOR');
  return DBACTORHANDLE;
}

function SUBMIT(ACTION) { return DBACTORHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return DBACTORHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return DBACTORHANDLEINSTANCE().GETACTIONRESULT(ID); }

// ============================================================
// §6 — Start function
// ============================================================

function STARTDBACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS : (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) { var ENV = GETACTORSTATE('WORLDMAPACTOR'); if (ENV) ENV.VERBOSITY = LVL; }
  }
  return {
    GETSTATE: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    DISPATCH: function(MESSAGE) { return DISPATCHTOACTOR('DBACTOR', DBBEHAVIOR, MESSAGE); },
    SUBMIT: SUBMIT, EXPECT: EXPECT, GETACTIONRESULT: GETACTIONRESULT
  };
}
