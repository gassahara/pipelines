var DBVERBOSITYCONSTANTS = createverbosityconstants();
var DBSTATE = { level: DBVERBOSITYCONSTANTS.DEBUG };

var ROOTKEY = 'FRAMEWORK_DBACTOR_MAP';
var MAXKEYS = 100;
var MAXENTRYBYTES = 2 * 1024 * 1024;

// Dedicated store mailbox (independent from main MAILBOX)
var STOREMAILBOX = [];
var STORE_MAILBOX = STOREMAILBOX;

// DBACTOR's own consumer registry
var DBACTORCONSUMERS = {};
var DBACTOR_CONSUMERS = DBACTORCONSUMERS;

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

function getstorage() {
  try {
    var storage = typeof localStorage !== 'undefined' ? localStorage :
      (typeof globalthis !== 'undefined' ? globalthis.localStorage : null);
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
  } catch (e) {}
  return null;
}

function ensuredbslice(env) {
  return ensureenvslice(env, 'db', function() { return { store: {} }; });
}

// full recursive serializer with per-case handlers and deduplication
function serializeforpersistence(value, seen, refmap) {
  if (seen === undefined) seen = [];
  if (refmap === undefined) refmap = [];
  if (value === null) return null;
  var t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    return (isNaN(value) || !isFinite(value)) ? String(value) : value;
  }
  if (t === 'undefined') return { typemarker: 'undefined' };
  if (t === 'function') return { typemarker: 'function', source: value.toString() };
  if (typeof HTMLELEMENT !== 'undefined' && value instanceof HTMLELEMENT) {
    return { typemarker: 'dom', tag: value.tagName, id: value.id || null };
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return { typemarker: 'node', nodename: value.nodeName };
  }
  if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) {
    return { typemarker: 'eventtarget' };
  }
  if (value instanceof Date) return { typemarker: 'date', iso: value.toISOString() };
  if (Object.prototype.toString.call(value) === '[object RegExp]') {
    return { typemarker: 'regexp', source: value.source, flags: value.flags || '' };
  }
  if (value instanceof Error) {
    return { typemarker: 'error', name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    var mapobj = { typemarker: 'map', entries: [] };
    value.forEach(function(val, key) {
      mapobj.entries.push([serializeforpersistence(key, seen, refmap), serializeforpersistence(val, seen, refmap)]);
    });
    return mapobj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    var setarr = [];
    value.forEach(function(item) { setarr.push(serializeforpersistence(item, seen, refmap)); });
    return { typemarker: 'set', values: setarr };
  }
  if (typeof value === 'object') {
    var refindex = refmap.indexOf(value);
    if (refindex !== -1) return { typemarker: 'ref', refindex: refindex };
    if (seen.indexOf(value) !== -1) return { typemarker: 'circular' };
    refmap.push(value);
    seen.push(value);
    var result;
    if (Array.isArray(value)) {
      result = value.map(function(item) { return serializeforpersistence(item, seen, refmap); });
    } else {
      result = {};
      Object.keys(value).forEach(function(key) {
        result[key] = serializeforpersistence(value[key], seen, refmap);
      });
    }
    seen.pop();
    return result;
  }
  return value;
}

function persistattempt(store, root, storage, attempt) {
  if (attempt > 2) return false;
  try {
    storage.setItem(ROOTKEY, JSON.stringify(serializeforpersistence(root)));
    return true;
  } catch (err) {
    var keys = Object.keys(store);
    if (!keys.length) return false;
    var removecount = Math.max(1, Math.floor(keys.length * 0.25));
    keys.slice(0, removecount).forEach(function(key) { delete store[key]; });
    root.keys = store;
    return persistattempt(store, root, storage, attempt + 1);
  }
}

function persist(store) {
  var root = { namespace: 'FRAMEWORK_DBACTOR_V1', updatedat: Date.now(), keys: store };
  var storage = getstorage();
  if (!storage) return false;
  return persistattempt(store, root, storage, 0);
}

// ==================== DNA FUNCTION SERIALIZATION ====================

var fntag = 'serializedfunction';

function dnareplacer(key, value) {
  if (typeof value === 'function') {
    return { serializedfunction: true, source: value.toString() };
  }
  return value;
}

function dnareviver(key, value) {
  if (value && typeof value === 'object' && (value.serializedfunction === true || value.serializedFunction === true)) {
    try {
      if (value.deps) {
        var deps = value.deps;
        var revived = new Function('return (' + value.source + ')')();
        return function() {
          var args = Array.prototype.slice.call(arguments);
          return revived.apply(null, args.concat([deps]));
        };
      }
      return new Function('return (' + value.source + ')')();
    } catch (err) {
      logwarn(DBSTATE, '[DBACTOR]', '[DNA] failed to revive function using new Function:', err);
      return function() { throw new Error('revived function failed'); };
    }
  }
  return value;
}

var serializedna = function(dna) { return JSON.stringify(dna, dnareplacer); };
var deserializedna = function(json) { return JSON.parse(json, dnareviver); };

// ==================== PROPERTY PAIR STORE ====================

var pairstore = {};
var paircounter = 0;

function pairidentity(key, value) {
  var normalized;
  if (typeof value === 'function') normalized = 'function:' + value.toString();
  else if (typeof value === 'object' && value !== null) {
    try { normalized = 'json:' + JSON.stringify(value); }
    catch (e) { normalized = 'object:' + (value.constructor && value.constructor.name ? value.constructor.name : 'Object'); }
  } else normalized = typeof value + ':' + String(value);
  return key + '\u0000' + normalized;
}

function storepair(key, value) {
  var identity = pairidentity(key, value);
  var refid = pairstore[identity];
  if (!refid) {
    paircounter += 1;
    refid = 'pair' + paircounter;
    pairstore[identity] = refid;
    pairstore['ref:' + refid] = { key: key, value: value };
  }
  return refid;
}

function consolidategraph(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'object') {
    if (node.pairreference || node.pairReference) return node;
    if (Array.isArray(node)) return node.map(consolidategraph);
    if (node.briefcase && typeof node.briefcase === 'object') {
      var briefcase = node.briefcase;
      Object.keys(briefcase).forEach(function(key) {
        var refid = storepair(key, briefcase[key]);
        briefcase[key] = { pairreference: refid };
      });
    }
    if (node.element === 'BLOCK') {
      Object.keys(node).forEach(function(key) {
        if (key === 'elements') return;
        var refid = storepair(key, node[key]);
        node[key] = { pairreference: refid };
      });
      return node;
    }
    Object.keys(node).forEach(function(key) { node[key] = consolidategraph(node[key]); });
    return node;
  }
  return node;
}

function restoregraph(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'object') {
    var refid = node.pairreference || node.pairReference;
    if (refid) {
      var entry = pairstore['ref:' + refid];
      return entry ? entry.value : undefined;
    }
    if (Array.isArray(node)) return node.map(restoregraph);
    Object.keys(node).forEach(function(key) { node[key] = restoregraph(node[key]); });
    return node;
  }
  return node;
}

function serializepairstore() {
  var output = {};
  Object.keys(pairstore).forEach(function(key) { output[key] = pairstore[key]; });
  return JSON.stringify(output, dnareplacer);
}

function deserializepairstore(json) {
  if (!json) return;
  var parsed;
  try { parsed = JSON.parse(json, dnareviver); }
  catch (err) { logwarn(DBSTATE, '[DBACTOR]', 'deserializepairstore failed:', err); return; }
  Object.keys(pairstore).forEach(function(key) { delete pairstore[key]; });
  Object.keys(parsed || {}).forEach(function(key) { pairstore[key] = parsed[key]; });
}

// ==================== POST-SERIALIZATION OPTIMIZATION ====================

function measurelength(obj) { return JSON.stringify(obj).length; }

function optimizeserializeddna(jsonstring) {
  Object.keys(pairstore).forEach(function(key) { delete pairstore[key]; });
  paircounter = 0;
  logdebug(DBSTATE, '[DBACTOR]', 'optimizeserializeddna start, input length:', jsonstring.length);
  var obj = JSON.parse(jsonstring);

  var passobjectpairdedup = function(node) {
    if (Array.isArray(node)) return node.map(passobjectpairdedup);
    if (node && typeof node === 'object') {
      if (node.pairreference || node.pairReference) return node;
      if (node.element === 'BLOCK') {
        Object.keys(node).forEach(function(key) {
          if (key === 'elements') return;
          var identity = pairidentity(key, node[key]);
          var refid = pairstore[identity];
          if (!refid) {
            paircounter += 1;
            refid = 'pair' + paircounter;
            pairstore[identity] = refid;
            pairstore['ref:' + refid] = { key: key, value: node[key] };
          }
          node[key] = { pairreference: refid };
        });
        return node;
      }
      if (node.briefcase && typeof node.briefcase === 'object') {
        Object.keys(node.briefcase).forEach(function(key) {
          var identity = pairidentity(key, node.briefcase[key]);
          var refid = pairstore[identity];
          if (!refid) {
            paircounter += 1;
            refid = 'pair' + paircounter;
            pairstore[identity] = refid;
            pairstore['ref:' + refid] = { key: key, value: node.briefcase[key] };
          }
          node.briefcase[key] = { pairreference: refid };
        });
      }
      Object.keys(node).forEach(function(key) { node[key] = passobjectpairdedup(node[key]); });
      return node;
    }
    return node;
  };

  var passinnerdedup = function(node) {
    if (Array.isArray(node)) return node.map(passinnerdedup);
    if (node && typeof node === 'object') {
      if ((node.serializedfunction === true || node.serializedFunction === true) && typeof node.source === 'string') return node;
      Object.keys(node).forEach(function(key) { node[key] = passinnerdedup(node[key]); });
      return node;
    }
    return node;
  };

  function optimizecycle(current) {
    var before = measurelength(current);
    var candidate = passinnerdedup(passobjectpairdedup(JSON.parse(JSON.stringify(current))));
    if (measurelength(candidate) < before) {
      return optimizecycle(candidate);
    }
    return current;
  }

  var optimized = optimizecycle(obj);
  optimized.frameworkpairstore = serializepairstore();
  var finalresult = JSON.stringify(optimized);
  logdebug(DBSTATE, '[DBACTOR]', 'optimizeserializeddna completed, output length:', finalresult.length);
  return finalresult;
}

function deoptimizeserializeddna(jsonstring) {
  logdebug(DBSTATE, '[DBACTOR]', 'deoptimizeserializeddna start, input length:', jsonstring.length);
  var obj = JSON.parse(jsonstring);
  var storedata = obj.frameworkpairstore || obj.frameworkPairStore;
  if (storedata) {
    deserializepairstore(storedata);
    delete obj.frameworkpairstore;
    delete obj.frameworkPairStore;
  }
  var resolvenode = function(node) {
    if (Array.isArray(node)) return node.map(resolvenode);
    if (node && typeof node === 'object') {
      var refid = node.pairreference || node.pairReference;
      if (refid) {
        var entry = pairstore['ref:' + refid];
        return entry ? entry.value : undefined;
      }
      Object.keys(node).forEach(function(key) { node[key] = resolvenode(node[key]); });
      return node;
    }
    return node;
  };
  var finalresult = JSON.stringify(resolvenode(obj));
  logdebug(DBSTATE, '[DBACTOR]', 'deoptimizeserializeddna completed, output length:', finalresult.length);
  return finalresult;
}

// ==================== STORE MAILBOX & WAIT ====================

function storesend(recipient, type, payload, tag, sender) {
  var envelope = {
    id: 'store' + Date.now() + Math.random().toString(36).slice(2, 8),
    recipient: recipient,
    type: type,
    payload: payload,
    tag: tag,
    sender: sender,
    read: 'UNREAD',
    timestamp: Date.now()
  };
  STOREMAILBOX.push(envelope);
  return envelope;
}

function storewait(filter, timeout) {
  if (timeout === undefined) timeout = 20000;
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function poll() {
      var matches = STOREMAILBOX.filter(function(item) {
        if (filter.tag !== undefined && item.tag !== filter.tag) return false;
        if (filter.sender !== undefined && item.sender !== filter.sender) return false;
        if (filter.recipient !== undefined && item.recipient !== filter.recipient) return false;
        if (filter.type !== undefined && item.type !== filter.type) return false;
        if (filter.read !== undefined && item.read !== filter.read) return false;
        if (item.read === 'READ') return false;
        return true;
      });
      if (matches.length > 0) {
        var item = matches[0];
        item.read = 'READ';
        resolve(item);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error('STORE wait timeout for filter: ' + JSON.stringify(filter)));
        return;
      }
      setTimeout(poll, 50);
    }
    poll();
  });
}

// ==================== DBACTOR BEHAVIOR ====================

var DBBEHAVIOR = function(env, message) {
  logdebug(env, '[DBACTOR]', 'behavior handling action:', message.type);
  var dbslice = ensuredbslice(env);
  var store = dbslice.store;

  switch (message.type) {
    case MESSAGETYPES.STORE:
      logdebug(env, '[DBACTOR]', 'action STORE key:', message.key);
      try {
        var serialized = JSON.stringify(serializeforpersistence(message.value));
        if (serialized.length > MAXENTRYBYTES) {
          logwarn(env, '[DBACTOR]', 'value too large for key:', message.key, 'bytes:', serialized.length);
          storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { error: 'value too large' }, message.tag, 'DBACTOR');
          return env;
        }
      } catch (e) {
        storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { error: e.message || String(e) }, message.tag, 'DBACTOR');
        return env;
      }
      var keys = Object.keys(store);
      if (keys.length >= MAXKEYS && !store[message.key]) {
        var oldest = keys[0];
        if (oldest) delete store[oldest];
      }
      store[message.key] = message.value;
      var persisted = persist(store);
      if (persisted) storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { result: true }, message.tag, 'DBACTOR');
      else storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { error: 'persist failed' }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.RESTORE:
      logdebug(env, '[DBACTOR]', 'action RESTORE key:', message.key, 'exists:', store[message.key] !== undefined);
      var restoredvalue = store[message.key] !== undefined ? store[message.key] : null;
      storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { result: restoredvalue }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.LIST:
      logdebug(env, '[DBACTOR]', 'action LIST count:', Object.keys(store).length);
      storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { result: Object.keys(store) }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.DELETE:
      logdebug(env, '[DBACTOR]', 'action DELETE key:', message.key);
      delete store[message.key];
      var persisteddel = persist(store);
      if (persisteddel) storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { result: true }, message.tag, 'DBACTOR');
      else storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { error: 'persist failed' }, message.tag, 'DBACTOR');
      return env;

    default:
      logwarn(env, '[DBACTOR]', 'unknown action:', message.type);
      storesend(message.sender, MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT, { error: '[DBACTOR] unknown message type' }, message.tag, 'DBACTOR');
      return env;
  }
};

// ==================== DIRECT DB API (actors only) ====================

function DBSTORE(key, value) {
  var tag = GENERATETAG();
  var dbresulttype = MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT;
  storesend('DBACTOR', MESSAGETYPES.STORE, { key: key, value: value }, tag, 'WORLDMAPACTOR');
  var msg = { type: MESSAGETYPES.STORE, key: key, value: value, sender: 'WORLDMAPACTOR', tag: tag };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), msg);
  return storewait({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DBRESTORE(key) {
  var tag = GENERATETAG();
  var dbresulttype = MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT;
  storesend('DBACTOR', MESSAGETYPES.RESTORE, { key: key }, tag, 'WORLDMAPACTOR');
  var msg = { type: MESSAGETYPES.RESTORE, key: key, sender: 'WORLDMAPACTOR', tag: tag };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), msg);
  return storewait({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DBLIST() {
  var tag = GENERATETAG();
  var dbresulttype = MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT;
  storesend('DBACTOR', MESSAGETYPES.LIST, {}, tag, 'WORLDMAPACTOR');
  var msg = { type: MESSAGETYPES.LIST, sender: 'WORLDMAPACTOR', tag: tag };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), msg);
  return storewait({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DBDELETE(key) {
  var tag = GENERATETAG();
  var dbresulttype = MESSAGETYPES.DBRESULT || MESSAGETYPES.DB_RESULT;
  storesend('DBACTOR', MESSAGETYPES.DELETE, { key: key }, tag, 'WORLDMAPACTOR');
  var msg = { type: MESSAGETYPES.DELETE, key: key, sender: 'WORLDMAPACTOR', tag: tag };
  DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), msg);
  return storewait({ tag: tag, sender: 'DBACTOR' }, 20000);
}

var DB_STORE = DBSTORE;
var DB_RESTORE = DBRESTORE;
var DB_LIST = DBLIST;
var DB_DELETE = DBDELETE;

// ==================== START FUNCTION ====================

function STARTDBACTOR(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : (options && options.verbosityLevel));
    if (lvl !== undefined) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    dispatch: function(message) { return DBBEHAVIOR(GETACTORSTATE('WORLDMAPACTOR'), message); }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DBBEHAVIOR: DBBEHAVIOR,
    DBSTORE: DBSTORE,
    DBRESTORE: DBRESTORE,
    DBLIST: DBLIST,
    DBDELETE: DBDELETE,
    DB_STORE: DBSTORE,
    DB_RESTORE: DBRESTORE,
    DB_LIST: DBLIST,
    DB_DELETE: DBDELETE,
    STARTDBACTOR: STARTDBACTOR,
    serializeforpersistence: serializeforpersistence,
    serializedna: serializedna,
    deserializedna: deserializedna,
    optimizeserializeddna: optimizeserializeddna,
    deoptimizeserializeddna: deoptimizeserializeddna
  };
}
