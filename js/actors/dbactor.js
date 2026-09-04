var DBVERBOSITYCONSTANTS = createVerbosityConstants();
var DBSTATE = Object.freeze({ level: DBVERBOSITYCONSTANTS.DEBUG });

var ROOTKEY = 'FRAMEWORK_DBACTOR_MAP';
var MAXKEYS = 100;
var MAXENTRYBYTES = 2 * 1024 * 1024;

// Dedicated store mailbox (independent from main MAILBOX)
var STORE_MAILBOX = [];

// DBACTOR's own consumer registry
var DBACTOR_CONSUMERS = {};

// ------------------------------------------------------------------
// Storage helpers
// ------------------------------------------------------------------

function getStorage() {
  try {
    var storage = typeof localStorage !== 'undefined' ? localStorage :
      (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
  } catch (e) {}
  return null;
}

function ensureDbSlice(env) {
  return ensureEnvSlice(env, 'db', function() { return { store: {} }; });
}

// P28-rev + P33: full recursive serializer with per-case handlers and deduplication.
function serializeForPersistence(value, seen, refMap) {
  if (seen === undefined) seen = [];
  if (refMap === undefined) refMap = [];
  if (value === null) return null;
  var t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    return (isNaN(value) || !isFinite(value)) ? String(value) : value;
  }
  if (t === 'undefined') return { typeMarker: 'undefined' };
  if (t === 'function') return { typeMarker: 'function', source: value.toString() };
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
    return { typeMarker: 'dom', tag: value.tagName, id: value.id || null };
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return { typeMarker: 'node', nodeName: value.nodeName };
  }
  if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) {
    return { typeMarker: 'eventtarget' };
  }
  if (value instanceof Date) return { typeMarker: 'date', iso: value.toISOString() };
  if (value instanceof RegExp) return { typeMarker: 'regexp', source: value.source, flags: value.flags };
  if (value instanceof Error) {
    return { typeMarker: 'error', name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    var mapobj = { typeMarker: 'map', entries: [] };
    value.forEach(function(val, key) {
      mapobj.entries.push([serializeForPersistence(key, seen, refMap), serializeForPersistence(val, seen, refMap)]);
    });
    return mapobj;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    var setarr = [];
    value.forEach(function(item) { setarr.push(serializeForPersistence(item, seen, refMap)); });
    return { typeMarker: 'set', values: setarr };
  }
  if (typeof value === 'object') {
    var refIndex = refMap.indexOf(value);
    if (refIndex !== -1) return { typeMarker: 'ref', refIndex: refIndex };
    if (seen.indexOf(value) !== -1) return { typeMarker: 'circular' };
    refMap.push(value);
    seen.push(value);
    var result;
    if (Array.isArray(value)) {
      result = value.map(function(item) { return serializeForPersistence(item, seen, refMap); });
    } else {
      result = {};
      Object.keys(value).forEach(function(key) {
        result[key] = serializeForPersistence(value[key], seen, refMap);
      });
    }
    seen.pop();
    return result;
  }
  return value;
}

function persistAttempt(store, root, storage, attempt) {
  if (attempt > 2) return false;
  try {
    storage.setItem(ROOTKEY, JSON.stringify(serializeForPersistence(root)));
    return true;
  } catch (err) {
    var keys = Object.keys(store);
    if (!keys.length) return false;
    var removecount = Math.max(1, Math.floor(keys.length * 0.25));
    keys.slice(0, removecount).forEach(function(key) { delete store[key]; });
    root.keys = store;
    return persistAttempt(store, root, storage, attempt + 1);
  }
}

function persist(store) {
  var root = { namespace: 'FRAMEWORK_DBACTOR_V1', updatedAt: Date.now(), keys: store };
  var storage = getStorage();
  if (!storage) return false;
  return persistAttempt(store, root, storage, 0);
}

// ==================== DNA FUNCTION SERIALIZATION ====================

var FN_TAG = 'serializedFunction';

function dnaReplacer(key, value) {
  if (typeof value === 'function') {
    return { serializedFunction: true, source: value.toString() };
  }
  return value;
}

function dnaReviver(key, value) {
  if (value && typeof value === 'object' && value[FN_TAG] === true) {
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

var serializeDna = function(dna) { return JSON.stringify(dna, dnaReplacer); };
var deserializeDna = function(json) { return JSON.parse(json, dnaReviver); };

// ==================== PROPERTY PAIR STORE ====================

var PAIRSTORE = {};
var pairCounter = 0;

function pairIdentity(key, value) {
  var normalized;
  if (typeof value === 'function') normalized = 'function:' + value.toString();
  else if (typeof value === 'object' && value !== null) {
    try { normalized = 'json:' + JSON.stringify(value); }
    catch (e) { normalized = 'object:' + (value.constructor && value.constructor.name ? value.constructor.name : 'Object'); }
  } else normalized = typeof value + ':' + String(value);
  return key + '\u0000' + normalized;
}

function storePair(key, value) {
  var identity = pairIdentity(key, value);
  var refId = PAIRSTORE[identity];
  if (!refId) {
    pairCounter += 1;
    refId = 'pair_' + pairCounter;
    PAIRSTORE[identity] = refId;
    PAIRSTORE['ref:' + refId] = { key: key, value: value };
  }
  return refId;
}

function consolidateGraph(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'object') {
    if (node.pairReference) return node;
    if (Array.isArray(node)) return node.map(consolidateGraph);
    if (node.briefcase && typeof node.briefcase === 'object') {
      var briefcase = node.briefcase;
      Object.keys(briefcase).forEach(function(key) {
        var refId = storePair(key, briefcase[key]);
        briefcase[key] = { pairReference: refId };
      });
    }
    if (node.element === 'BLOCK') {
      Object.keys(node).forEach(function(key) {
        if (key === 'elements') return;
        var refId = storePair(key, node[key]);
        node[key] = { pairReference: refId };
      });
      return node;
    }
    Object.keys(node).forEach(function(key) { node[key] = consolidateGraph(node[key]); });
    return node;
  }
  return node;
}

function restoreGraph(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'object') {
    if (node.pairReference) {
      var entry = PAIRSTORE['ref:' + node.pairReference];
      return entry ? entry.value : undefined;
    }
    if (Array.isArray(node)) return node.map(restoreGraph);
    Object.keys(node).forEach(function(key) { node[key] = restoreGraph(node[key]); });
    return node;
  }
  return node;
}

function serializePairStore() {
  var output = {};
  Object.keys(PAIRSTORE).forEach(function(key) { output[key] = PAIRSTORE[key]; });
  return JSON.stringify(output, dnaReplacer);
}

function deserializePairStore(json) {
  if (!json) return;
  var parsed;
  try { parsed = JSON.parse(json, dnaReviver); }
  catch (err) { logwarn(DBSTATE, '[DBACTOR]', 'deserializePairStore failed:', err); return; }
  Object.keys(PAIRSTORE).forEach(function(key) { delete PAIRSTORE[key]; });
  Object.keys(parsed || {}).forEach(function(key) { PAIRSTORE[key] = parsed[key]; });
}

// ==================== POST-SERIALIZATION OPTIMIZATION ====================

function measureLength(obj) { return JSON.stringify(obj).length; }

function optimizeSerializedDna(jsonString) {
  Object.keys(PAIRSTORE).forEach(function(key) { delete PAIRSTORE[key]; });
  pairCounter = 0;
  logdebug(DBSTATE, '[DBACTOR]', 'optimizeSerializedDna start, input length:', jsonString.length);
  var obj = JSON.parse(jsonString);

  var passObjectPairDedup = function(node) {
    if (Array.isArray(node)) return node.map(passObjectPairDedup);
    if (node && typeof node === 'object') {
      if (node.pairReference) return node;
      if (node.element === 'BLOCK') {
        Object.keys(node).forEach(function(key) {
          if (key === 'elements') return;
          var identity = pairIdentity(key, node[key]);
          var refId = PAIRSTORE[identity];
          if (!refId) {
            pairCounter += 1;
            refId = 'pair_' + pairCounter;
            PAIRSTORE[identity] = refId;
            PAIRSTORE['ref:' + refId] = { key: key, value: node[key] };
          }
          node[key] = { pairReference: refId };
        });
        return node;
      }
      if (node.briefcase && typeof node.briefcase === 'object') {
        Object.keys(node.briefcase).forEach(function(key) {
          var identity = pairIdentity(key, node.briefcase[key]);
          var refId = PAIRSTORE[identity];
          if (!refId) {
            pairCounter += 1;
            refId = 'pair_' + pairCounter;
            PAIRSTORE[identity] = refId;
            PAIRSTORE['ref:' + refId] = { key: key, value: node.briefcase[key] };
          }
          node.briefcase[key] = { pairReference: refId };
        });
      }
      Object.keys(node).forEach(function(key) { node[key] = passObjectPairDedup(node[key]); });
      return node;
    }
    return node;
  };

  var passInnerDedup = function(node) {
    if (Array.isArray(node)) return node.map(passInnerDedup);
    if (node && typeof node === 'object') {
      if (node.serializedFunction === true && typeof node.source === 'string') return node;
      Object.keys(node).forEach(function(key) { node[key] = passInnerDedup(node[key]); });
      return node;
    }
    return node;
  };

  var current = obj;
  var optimized = current;
  do {
    var before = measureLength(optimized);
    var candidate = JSON.parse(JSON.stringify(optimized));
    candidate = passObjectPairDedup(candidate);
    candidate = passInnerDedup(candidate);
    if (measureLength(candidate) < before) optimized = candidate;
    else break;
  } while (true);

  optimized.frameworkPairStore = serializePairStore();
  var finalResult = JSON.stringify(optimized);
  logdebug(DBSTATE, '[DBACTOR]', 'optimizeSerializedDna completed, output length:', finalResult.length);
  return finalResult;
}

function deoptimizeSerializedDna(jsonString) {
  logdebug(DBSTATE, '[DBACTOR]', 'deoptimizeSerializedDna start, input length:', jsonString.length);
  var obj = JSON.parse(jsonString);
  if (obj.frameworkPairStore) {
    deserializePairStore(obj.frameworkPairStore);
    delete obj.frameworkPairStore;
  }
  var resolveNode = function(node) {
    if (Array.isArray(node)) return node.map(resolveNode);
    if (node && typeof node === 'object') {
      if (node.pairReference) {
        var entry = PAIRSTORE['ref:' + node.pairReference];
        return entry ? entry.value : undefined;
      }
      Object.keys(node).forEach(function(key) { node[key] = resolveNode(node[key]); });
      return node;
    }
    return node;
  };
  var finalResult = JSON.stringify(resolveNode(obj));
  logdebug(DBSTATE, '[DBACTOR]', 'deoptimizeSerializedDna completed, output length:', finalResult.length);
  return finalResult;
}

// ==================== STORE MAILBOX & WAIT ====================

function STORESEND(recipient, type, payload, tag, sender) {
  var envelope = {
    id: 'store_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    recipient: recipient,
    type: type,
    payload: payload,
    tag: tag,
    sender: sender,
    read: 'UNREAD',
    timestamp: Date.now()
  };
  STORE_MAILBOX.push(envelope);
  return envelope;
}

function STOREWAIT(filter, timeout) {
  if (timeout === undefined) timeout = 20000;
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function poll() {
      var matches = STORE_MAILBOX.filter(function(item) {
        if (filter.tag !== undefined && item.tag !== filter.tag) return false;
        if (filter.sender !== undefined && item.sender !== filter.sender) return false;
        if (filter.recipient !== undefined && item.recipient !== filter.recipient) return false;
        if (filter.type !== undefined && item.type !== filter.type) return false;
        if (filter.read !== undefined && item.read !== filter.read) return false;
        if (item.read === 'READ') return false; // default unread only
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
  var dbSlice = ensureDbSlice(env);
  var store = dbSlice.store;

  switch (message.type) {
    case MESSAGETYPES.STORE:
      logdebug(env, '[DBACTOR]', 'action STORE key:', message.key);
      try {
        var serialized = JSON.stringify(serializeForPersistence(message.value));
        if (serialized.length > MAXENTRYBYTES) {
          logwarn(env, '[DBACTOR]', 'value too large for key:', message.key, 'bytes:', serialized.length);
          STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { error: 'value too large' }, message.tag, 'DBACTOR');
          return env;
        }
      } catch (e) {
        STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { error: e.message || String(e) }, message.tag, 'DBACTOR');
        return env;
      }
      var keys = Object.keys(store);
      if (keys.length >= MAXKEYS && !store[message.key]) {
        var oldest = keys[0];
        if (oldest) delete store[oldest];
      }
      store[message.key] = message.value;
      var persisted = persist(store);
      if (persisted) STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { result: true }, message.tag, 'DBACTOR');
      else STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { error: 'persist failed' }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.RESTORE:
      logdebug(env, '[DBACTOR]', 'action RESTORE key:', message.key, 'exists:', store[message.key] !== undefined);
      var restoredValue = store[message.key] !== undefined ? store[message.key] : null;
      STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { result: restoredValue }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.LIST:
      logdebug(env, '[DBACTOR]', 'action LIST count:', Object.keys(store).length);
      STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { result: Object.keys(store) }, message.tag, 'DBACTOR');
      return env;

    case MESSAGETYPES.DELETE:
      logdebug(env, '[DBACTOR]', 'action DELETE key:', message.key);
      delete store[message.key];
      var persistedDel = persist(store);
      if (persistedDel) STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { result: true }, message.tag, 'DBACTOR');
      else STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { error: 'persist failed' }, message.tag, 'DBACTOR');
      return env;

    default:
      logwarn(env, '[DBACTOR]', 'unknown action:', message.type);
      STORESEND(message.sender, MESSAGETYPES.DB_RESULT, { error: '[DBACTOR] unknown message type' }, message.tag, 'DBACTOR');
      return env;
  }
};

// Register consumers for DBACTOR's own mailbox
DBACTOR_CONSUMERS[MESSAGETYPES.STORE] = DBBEHAVIOR;
DBACTOR_CONSUMERS[MESSAGETYPES.RESTORE] = DBBEHAVIOR;
DBACTOR_CONSUMERS[MESSAGETYPES.LIST] = DBBEHAVIOR;
DBACTOR_CONSUMERS[MESSAGETYPES.DELETE] = DBBEHAVIOR;

// ==================== DIRECT DB API ====================

function DB_STORE(key, value) {
  var tag = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.STORE, { key: key, value: value }, tag, 'WORLDMAPACTOR');
  return STOREWAIT({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DB_RESTORE(key) {
  var tag = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.RESTORE, { key: key }, tag, 'WORLDMAPACTOR');
  return STOREWAIT({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DB_LIST() {
  var tag = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.LIST, {}, tag, 'WORLDMAPACTOR');
  return STOREWAIT({ tag: tag, sender: 'DBACTOR' }, 20000);
}

function DB_DELETE(key) {
  var tag = GENERATETAG();
  STORESEND('DBACTOR', MESSAGETYPES.DELETE, { key: key }, tag, 'WORLDMAPACTOR');
  return STOREWAIT({ tag: tag, sender: 'DBACTOR' }, 20000);
}

// ==================== START FUNCTION ====================

function STARTDBACTOR(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = getActorState('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('WORLDMAPACTOR'); },
    dispatch: function(message) { return DBBEHAVIOR(getActorState('WORLDMAPACTOR'), message); }
  };
}
