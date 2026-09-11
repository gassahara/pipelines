var DBVERBOSITYCONSTANTS = createverbosityconstants();
var DBSTATE = { level: DBVERBOSITYCONSTANTS.DEBUG };

var ROOTKEY = 'FRAMEWORKDBACTORMAP';
var MAXKEYS = 100;
var MAXENTRYBYTES = 2 * 1024 * 1024;

// Dedicated store mailbox (independent from main MAILBOX)
var STOREMAILBOX = [];

// DBACTOR's own consumer registry
var DBACTORCONSUMERS = {};

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

function GETSTORAGE() {
  try {
    var STORAGE = typeof localStorage !== 'undefined' ? localStorage :
      (typeof globalthis !== 'undefined' ? globalthis.localStorage : null);
    if (STORAGE && typeof STORAGE.getItem === 'function' && typeof STORAGE.setItem === 'function') {
      return STORAGE;
    }
  } catch (E) {}
  return null;
}

function ENSUREDBSLICE(ENV) {
  return ENSUREENVSLICE(ENV, 'db', function() { return { STORE: {} }; });
}

// full recursive serializer with per-case handlers and deduplication
function SERIALIZEFORPERSISTENCE(VALUE, SEEN, REFMAP) {
  if (SEEN === undefined) SEEN = [];
  if (REFMAP === undefined) REFMAP = [];
  if (VALUE === null) return null;
  var T = typeof VALUE;
  if (T === 'string' || T === 'boolean') return VALUE;
  if (T === 'number') {
    return (isNaN(VALUE) || !isFinite(VALUE)) ? String(VALUE) : VALUE;
  }
  if (T === 'undefined') return { TYPEMARKER: 'undefined' };
  if (T === 'function') return { TYPEMARKER: 'function', SOURCE: VALUE.toString() };
  if (typeof HTMLELEMENT !== 'undefined' && VALUE instanceof HTMLELEMENT) {
    return { TYPEMARKER: 'dom', TAG: VALUE.tagName, ID: VALUE.id || null };
  }
  if (typeof Node !== 'undefined' && VALUE instanceof Node) {
    return { TYPEMARKER: 'node', NODENAME: VALUE.nodeName };
  }
  if (typeof EventTarget !== 'undefined' && VALUE instanceof EventTarget) {
    return { TYPEMARKER: 'eventtarget' };
  }
  if (VALUE instanceof Date) return { TYPEMARKER: 'date', ISO: VALUE.toISOString() };
  if (Object.prototype.toString.call(VALUE) === '[object RegExp]') {
    return { TYPEMARKER: 'regexp', SOURCE: VALUE.source, FLAGS: VALUE.flags || '' };
  }
  if (VALUE instanceof Error) {
    return { TYPEMARKER: 'error', NAME: VALUE.name, MESSAGE: VALUE.message, STACK: VALUE.stack };
  }
  if (typeof Map !== 'undefined' && VALUE instanceof Map) {
    var MAPOBJ = { TYPEMARKER: 'map', ENTRIES: [] };
    VALUE.forEach(function(VAL, KEY) {
      MAPOBJ.ENTRIES.push([SERIALIZEFORPERSISTENCE(KEY, SEEN, REFMAP), SERIALIZEFORPERSISTENCE(VAL, SEEN, REFMAP)]);
    });
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
    if (Array.isArray(VALUE)) {
      RESULT = VALUE.map(function(ITEM) { return SERIALIZEFORPERSISTENCE(ITEM, SEEN, REFMAP); });
    } else {
      RESULT = {};
      Object.keys(VALUE).forEach(function(KEY) {
        RESULT[KEY] = SERIALIZEFORPERSISTENCE(VALUE[KEY], SEEN, REFMAP);
      });
    }
    SEEN.pop();
    return RESULT;
  }
  return VALUE;
}

function PERSISTATTEMPT(STORE, ROOT, STORAGE, ATTEMPT) {
  if (ATTEMPT > 2) return false;
  try {
    STORAGE.setItem(ROOTKEY, JSON.stringify(SERIALIZEFORPERSISTENCE(ROOT)));
    return true;
  } catch (ERR) {
    var KEYS = Object.keys(STORE);
    if (!KEYS.length) return false;
    var REMOVECOUNT = Math.max(1, Math.floor(KEYS.length * 0.25));
    KEYS.slice(0, REMOVECOUNT).forEach(function(KEY) { delete STORE[KEY]; });
    ROOT.KEYS = STORE;
    return PERSISTATTEMPT(STORE, ROOT, STORAGE, ATTEMPT + 1);
  }
}

function PERSIST(STORE) {
  var ROOT = { NAMESPACE: 'FRAMEWORKDBACTORV1', UPDATEDAT: Date.now(), KEYS: STORE };
  var STORAGE = GETSTORAGE();
  if (!STORAGE) return false;
  return PERSISTATTEMPT(STORE, ROOT, STORAGE, 0);
}

// ==================== DNA FUNCTION SERIALIZATION ====================

var FNTAG = 'serializedfunction';

function DNAREPLACER(KEY, VALUE) {
  if (typeof VALUE === 'function') {
    return { SERIALIZEDFUNCTION: true, SOURCE: VALUE.toString() };
  }
  return VALUE;
}

function DNAREVIVER(KEY, VALUE) {
  if (VALUE && typeof VALUE === 'object' && (VALUE.SERIALIZEDFUNCTION === true || VALUE.serializedFunction === true)) {
    try {
      if (VALUE.DEPS) {
        var DEPS = VALUE.DEPS;
        var REVIVED = new Function('return (' + VALUE.SOURCE + ')')();
        return function() {
          var ARGS = Array.prototype.slice.call(arguments);
          return REVIVED.apply(null, ARGS.concat([DEPS]));
        };
      }
      return new Function('return (' + VALUE.SOURCE + ')')();
    } catch (ERR) {
      logwarn(DBSTATE, '[DBACTOR]', '[DNA] failed to revive function using new Function:', ERR);
      return function() { throw new Error('revived function failed'); };
    }
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
    if (NODE.PAIRREFERENCE || NODE.pairReference) return NODE;
    if (Array.isArray(NODE)) return NODE.map(CONSOLIDATEGRAPH);
    if (NODE.BRIEFCASE && typeof NODE.BRIEFCASE === 'object') {
      var BRIEFCASE = NODE.BRIEFCASE;
      Object.keys(BRIEFCASE).forEach(function(KEY) {
        var REFID = STOREPAIR(KEY, BRIEFCASE[KEY]);
        BRIEFCASE[KEY] = { PAIRREFERENCE: REFID };
      });
    }
    if (NODE.ELEMENT === 'BLOCK') {
      Object.keys(NODE).forEach(function(KEY) {
        if (KEY === 'ELEMENTS') return;
        var REFID = STOREPAIR(KEY, NODE[KEY]);
        NODE[KEY] = { PAIRREFERENCE: REFID };
      });
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
    var REFID = NODE.PAIRREFERENCE || NODE.pairReference;
    if (REFID) {
      var ENTRY = PAIRSTORE['REF:' + REFID];
      return ENTRY ? ENTRY.VALUE : undefined;
    }
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
  catch (ERR) { logwarn(DBSTATE, '[DBACTOR]', 'DESERIALIZEPAIRSTORE FAILED:', ERR); return; }
  Object.keys(PAIRSTORE).forEach(function(KEY) { delete PAIRSTORE[KEY]; });
  Object.keys(PARSED || {}).forEach(function(KEY) { PAIRSTORE[KEY] = PARSED[KEY]; });
}

// ==================== POST-SERIALIZATION OPTIMIZATION ====================

function MEASURELENGTH(OBJ) { return JSON.stringify(OBJ).length; }

function OPTIMIZESERIALIZEDDNA(JSONSTRING) {
  Object.keys(PAIRSTORE).forEach(function(KEY) { delete PAIRSTORE[KEY]; });
  PAIRCOUNTER = 0;
  logdebug(DBSTATE, '[DBACTOR]', 'OPTIMIZESERIALIZEDDNA START, INPUT LENGTH:', JSONSTRING.length);
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
          if (!REFID) {
            PAIRCOUNTER += 1;
            REFID = 'PAIR' + PAIRCOUNTER;
            PAIRSTORE[IDENTITY] = REFID;
            PAIRSTORE['REF:' + REFID] = { KEY: KEY, VALUE: NODE[KEY] };
          }
          NODE[KEY] = { PAIRREFERENCE: REFID };
        });
        return NODE;
      }
      if (NODE.BRIEFCASE && typeof NODE.BRIEFCASE === 'object') {
        Object.keys(NODE.BRIEFCASE).forEach(function(KEY) {
          var IDENTITY = PAIRIDENTITY(KEY, NODE.BRIEFCASE[KEY]);
          var REFID = PAIRSTORE[IDENTITY];
          if (!REFID) {
            PAIRCOUNTER += 1;
            REFID = 'PAIR' + PAIRCOUNTER;
            PAIRSTORE[IDENTITY] = REFID;
            PAIRSTORE['REF:' + REFID] = { KEY: KEY, VALUE: NODE.BRIEFCASE[KEY] };
          }
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
    if (MEASURELENGTH(CANDIDATE) < BEFORE) {
      return OPTIMIZECYCLE(CANDIDATE);
    }
    return CURRENT;
  }

  var OPTIMIZED = OPTIMIZECYCLE(OBJ);
  OPTIMIZED.FRAMEWORKPAIRSTORE = SERIALIZEPAIRSTORE();
  var FINALRESULT = JSON.stringify(OPTIMIZED);
  logdebug(DBSTATE, '[DBACTOR]', 'OPTIMIZESERIALIZEDDNA COMPLETED, OUTPUT LENGTH:', FINALRESULT.length);
  return FINALRESULT;
}

function DEOPTIMIZESERIALIZEDDNA(JSONSTRING) {
  logdebug(DBSTATE, '[DBACTOR]', 'DEOPTIMIZESERIALIZEDDNA START, INPUT LENGTH:', JSONSTRING.length);
  var OBJ = JSON.parse(JSONSTRING);
  var STOREDATA = OBJ.FRAMEWORKPAIRSTORE || OBJ.frameworkPairStore;
  if (STOREDATA) {
    DESERIALIZEPAIRSTORE(STOREDATA);
    delete OBJ.FRAMEWORKPAIRSTORE;
    delete OBJ.frameworkPairStore;
  }
  var RESOLVENODE = function(NODE) {
    if (Array.isArray(NODE)) return NODE.map(RESOLVENODE);
    if (NODE && typeof NODE === 'object') {
      var REFID = NODE.PAIRREFERENCE || NODE.pairReference;
      if (REFID) {
        var ENTRY = PAIRSTORE['REF:' + REFID];
        return ENTRY ? ENTRY.VALUE : undefined;
      }
      Object.keys(NODE).forEach(function(KEY) { NODE[KEY] = RESOLVENODE(NODE[KEY]); });
      return NODE;
    }
    return NODE;
  };
  var FINALRESULT = JSON.stringify(RESOLVENODE(OBJ));
  logdebug(DBSTATE, '[DBACTOR]', 'DEOPTIMIZESERIALIZEDDNA COMPLETED, OUTPUT LENGTH:', FINALRESULT.length);
  return FINALRESULT;
}

// ==================== STORE MAILBOX & WAIT ====================

function STORESEND(RECIPIENT, TYPE, PAYLOAD, TAG, SENDER) {
  var ENVELOPE = {
    ID: 'STORE' + Date.now() + Math.random().toString(36).slice(2, 8),
    RECIPIENT: RECIPIENT,
    TYPE: TYPE,
    PAYLOAD: PAYLOAD,
    TAG: TAG,
    SENDER: SENDER,
    READ: 'UNREAD',
    TIMESTAMP: Date.now()
  };
  STOREMAILBOX.push(ENVELOPE);
  return ENVELOPE;
}

function STOREWAIT(FILTER, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = 20000;
  return new Promise(function(RESOLVE, REJECT) {
    var START = Date.now();
    function POLL() {
      var MATCHES = STOREMAILBOX.filter(function(ITEM) {
        if (FILTER.TAG !== undefined && ITEM.TAG !== FILTER.TAG) return false;
        if (FILTER.SENDER !== undefined && ITEM.SENDER !== FILTER.SENDER) return false;
        if (FILTER.RECIPIENT !== undefined && ITEM.RECIPIENT !== FILTER.RECIPIENT) return false;
        if (FILTER.TYPE !== undefined && ITEM.TYPE !== FILTER.TYPE) return false;
        if (FILTER.READ !== undefined && ITEM.READ !== FILTER.READ) return false;
        if (ITEM.READ === 'READ') return false;
        return true;
      });
      if (MATCHES.length > 0) {
        var ITEM = MATCHES[0];
        ITEM.READ = 'READ';
        RESOLVE(ITEM);
        return;
      }
      if (Date.now() - START > TIMEOUT) {
        REJECT(new Error('STORE wait timeout for filter: ' + JSON.stringify(FILTER)));
        return;
      }
      setTimeout(POLL, 50);
    }
    POLL();
  });
}

// ==================== DBACTOR BEHAVIOR ====================

var DBBEHAVIOR = function(ENV, MESSAGE) {
  logdebug(ENV, '[DBACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);
  var DBSLICE = ENSUREDBSLICE(ENV);
  var STORE = DBSLICE.STORE;

  switch (MESSAGE.TYPE) {
    case MESSAGETYPES.STORE:
      logdebug(ENV, '[DBACTOR]', 'ACTION STORE KEY:', MESSAGE.KEY);
      try {
        var SERIALIZED = JSON.stringify(SERIALIZEFORPERSISTENCE(MESSAGE.VALUE));
        if (SERIALIZED.length > MAXENTRYBYTES) {
          logwarn(ENV, '[DBACTOR]', 'VALUE TOO LARGE FOR KEY:', MESSAGE.KEY, 'BYTES:', SERIALIZED.length);
          STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { ERROR: 'value too large' }, MESSAGE.TAG, 'DBACTOR');
          return ENV;
        }
      } catch (E) {
        STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { ERROR: E.message || String(E) }, MESSAGE.TAG, 'DBACTOR');
        return ENV;
      }
      var KEYS = Object.keys(STORE);
      if (KEYS.length >= MAXKEYS && !STORE[MESSAGE.KEY]) {
        var OLDEST = KEYS[0];
        if (OLDEST) delete STORE[OLDEST];
      }
      STORE[MESSAGE.KEY] = MESSAGE.VALUE;
      var PERSISTED = PERSIST(STORE);
      if (PERSISTED) STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { RESULT: true }, MESSAGE.TAG, 'DBACTOR');
      else STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { ERROR: 'persist failed' }, MESSAGE.TAG, 'DBACTOR');
      return ENV;

    case MESSAGETYPES.RESTORE:
      logdebug(ENV, '[DBACTOR]', 'ACTION RESTORE KEY:', MESSAGE.KEY, 'EXISTS:', STORE[MESSAGE.KEY] !== undefined);
      var RESTOREDVALUE = STORE[MESSAGE.KEY] !== undefined ? STORE[MESSAGE.KEY] : null;
      STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { RESULT: RESTOREDVALUE }, MESSAGE.TAG, 'DBACTOR');
      return ENV;

    case MESSAGETYPES.LIST:
      logdebug(ENV, '[DBACTOR]', 'ACTION LIST COUNT:', Object.keys(STORE).length);
      STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { RESULT: Object.keys(STORE) }, MESSAGE.TAG, 'DBACTOR');
      return ENV;

    case MESSAGETYPES.DELETE:
      logdebug(ENV, '[DBACTOR]', 'ACTION DELETE KEY:', MESSAGE.KEY);
      delete STORE[MESSAGE.KEY];
      var PERSISTEDDEL = PERSIST(STORE);
      if (PERSISTEDDEL) STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { RESULT: true }, MESSAGE.TAG, 'DBACTOR');
      else STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { ERROR: 'persist failed' }, MESSAGE.TAG, 'DBACTOR');
      return ENV;

    default:
      logwarn(ENV, '[DBACTOR]', 'UNKNOWN ACTION:', MESSAGE.TYPE);
      STORESEND(MESSAGE.SENDER, MESSAGETYPES.DBRESULT, { ERROR: '[DBACTOR] unknown message type' }, MESSAGE.TAG, 'DBACTOR');
      return ENV;
  }
};

// ==================== DIRECT DB API (actors only) ====================

function DBSTORE(KEY, VALUE) {
  var TAG = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.STORE, { KEY: KEY, VALUE: VALUE }, TAG, 'WORLDMAPACTOR');
  var MSG = { TYPE: MESSAGETYPES.STORE, KEY: KEY, VALUE: VALUE, SENDER: 'WORLDMAPACTOR', TAG: TAG };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), MSG);
  return STOREWAIT({ TAG: TAG, SENDER: 'DBACTOR' }, 20000);
}

function DBRESTORE(KEY) {
  var TAG = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.RESTORE, { KEY: KEY }, TAG, 'WORLDMAPACTOR');
  var MSG = { TYPE: MESSAGETYPES.RESTORE, KEY: KEY, SENDER: 'WORLDMAPACTOR', TAG: TAG };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), MSG);
  return STOREWAIT({ TAG: TAG, SENDER: 'DBACTOR' }, 20000);
}

function DBLIST() {
  var TAG = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.LIST, {}, TAG, 'WORLDMAPACTOR');
  var MSG = { TYPE: MESSAGETYPES.LIST, SENDER: 'WORLDMAPACTOR', TAG: TAG };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), MSG);
  return STOREWAIT({ TAG: TAG, SENDER: 'DBACTOR' }, 20000);
}

function DBDELETE(KEY) {
  var TAG = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.DELETE, { KEY: KEY }, TAG, 'WORLDMAPACTOR');
  var MSG = { TYPE: MESSAGETYPES.DELETE, KEY: KEY, SENDER: 'WORLDMAPACTOR', TAG: TAG };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), MSG);
  return STOREWAIT({ TAG: TAG, SENDER: 'DBACTOR' }, 20000);
}

// ==================== START FUNCTION ====================

function STARTDBACTOR(OPTIONS) {
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
    DISPATCH: function(MESSAGE) { return DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), MESSAGE); }
  };
}