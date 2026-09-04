var DBVERBOSITYCONSTANTS = createVerbosityConstants();
var DBSTATE = Object.freeze({ level: DBVERBOSITYCONSTANTS.DEBUG });

var ROOTKEY = 'FRAMEWORK_DBACTOR_MAP';
var MAXKEYS = 100;
var MAXENTRYBYTES = 2 * 1024 * 1024;

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

// ==================== ACTOR BEHAVIOR (PURE FUNCTION, RETURNS ENV) ====================

var dbbehavior = function(env, message) {
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
          sendResponse(message.sender, message.tag, { error: 'value too large' }, 'DBACTOR');
          return env;
        }
      } catch (e) {
        sendResponse(message.sender, message.tag, { error: e.message || String(e) }, 'DBACTOR');
        return env;
      }
      var keys = Object.keys(store);
      if (keys.length >= MAXKEYS && !store[message.key]) {
        var oldest = keys[0];
        if (oldest) delete store[oldest];
      }
      store[message.key] = message.value;
      var persisted = persist(store);
      if (persisted) sendResponse(message.sender, message.tag, true, 'DBACTOR');
      else sendResponse(message.sender, message.tag, { error: 'persist failed' }, 'DBACTOR');
      return env;

    case MESSAGETYPES.RESTORE:
      logdebug(env, '[DBACTOR]', 'action RESTORE key:', message.key, 'exists:', store[message.key] !== undefined);
      sendResponse(message.sender, message.tag, store[message.key] !== undefined ? store[message.key] : null, 'DBACTOR');
      return env;

    case MESSAGETYPES.LIST:
      logdebug(env, '[DBACTOR]', 'action LIST count:', Object.keys(store).length);
      sendResponse(message.sender, message.tag, Object.keys(store), 'DBACTOR');
      return env;

    case MESSAGETYPES.DELETE:
      logdebug(env, '[DBACTOR]', 'action DELETE key:', message.key);
      delete store[message.key];
      var persistedDel = persist(store);
      if (persistedDel) sendResponse(message.sender, message.tag, true, 'DBACTOR');
      else sendResponse(message.sender, message.tag, { error: 'persist failed' }, 'DBACTOR');
      return env;

    default:
      logwarn(env, '[DBACTOR]', 'unknown action:', message.type);
      sendResponse(message.sender, message.tag, { error: '[DBACTOR] unknown message type' }, 'DBACTOR');
      return env;
  }
};

var enqueue = function(type, payload) {
  var tag = generateTag();
  sendInstruction('DBACTOR', type, payload, tag, 'system');
};

var enqueueDbStore = function(key, value) { enqueue(MESSAGETYPES.STORE, { key: key, value: value }); };
var enqueueDbRestore = function(key) { enqueue(MESSAGETYPES.RESTORE, { key: key }); };
var enqueueDbList = function() { enqueue(MESSAGETYPES.LIST); };
var enqueueDbDelete = function(key) { enqueue(MESSAGETYPES.DELETE, { key: key }); };

function startDbActor(options) {
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
    dispatch: function(message) { return dispatchToActor('DBACTOR', dbbehavior, message); }
  };
}
