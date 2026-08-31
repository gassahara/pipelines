// ============================================================
// UPDATED FILE: js/actors/dbactor.js
// Change applied: FINAL SWEEP
//   - No self-registration (moved to registerconsumers.js)
//   - createactor receives dbactorINTERFACES directly
//   - retains memory mailbox for persistence
//   - enqueueDb* functions remain fire-and-forget with callbacks
// ============================================================


var dbVerbosityConstants = createVerbosityConstants();
var dbState = Object.freeze({ level: dbVerbosityConstants.DEBUG });


var dbactorINTERFACES = {};
dbactorINTERFACES[MESSAGETYPES.STORE] = { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' };
dbactorINTERFACES[MESSAGETYPES.RESTORE] = { key: 'string', resolve: 'function?', reject: 'function?' };
dbactorINTERFACES[MESSAGETYPES.LIST] = { resolve: 'function?', reject: 'function?' };
dbactorINTERFACES[MESSAGETYPES.DELETE] = { key: 'string', resolve: 'function?', reject: 'function?' };
Object.freeze(dbactorINTERFACES);

var ROOT_KEY = 'FRAMEWORK_DBACTOR_MAP';
var MAX_KEYS = 100;
var MAX_ENTRY_BYTES = 2 * 1024 * 1024;

function getStorage() {
  try {
    var storage = typeof localStorage !== 'undefined' ? localStorage : (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
  } catch (e) {}
  return null;
}

function loadInitialState() {
  try {
    var storage = getStorage();
    var raw = storage && storage.getItem(ROOT_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      var keys = parsed.keys || {};
      logdebug(dbState, '[DBACTOR]', 'loadInitialState loaded', Object.keys(keys).length, 'keys');
      return { store: Object.keys(keys).reduce(function(acc, k) { acc[k] = keys[k]; return acc; }, {}), verbosity: dbVerbosityConstants.DEBUG };
    }
  } catch (err) {
    logwarn(dbState, '[DBACTOR]', 'loadInitialState failed:', err);
  }
  return { store: {}, verbosity: dbVerbosityConstants.DEBUG };
}

function persistAttempt(store, root, storage, attempt) {
  if (attempt > 2) return false;
  try {
    storage.setItem(ROOT_KEY, JSON.stringify(root));
    return true;
  } catch (err) {
    var keys = Object.keys(store);
    if (!keys.length) return false;
    var removeCount = Math.max(1, Math.floor(keys.length * 0.25));
    keys.slice(0, removeCount).forEach(function(key) { delete store[key]; });
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

var FN_TAG = '__fn__';

function dnaReplacer(key, value) {
  if (typeof value === 'function') {
    return { __fn__: true, source: value.toString() };
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
      logwarn(dbState, '[DBACTOR]', '[DNA] failed to revive function using new Function:', err);
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
  if (typeof value === 'function') {
    normalized = 'function:' + value.toString();
  } else if (typeof value === 'object' && value !== null) {
    try {
      normalized = 'json:' + JSON.stringify(value);
    } catch (e) {
      normalized = 'object:' + (value.constructor && value.constructor.name ? value.constructor.name : 'Object');
    }
  } else {
    normalized = typeof value + ':' + String(value);
  }
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
    if (node.__pairref) return node;

    if (Array.isArray(node)) {
      return node.map(consolidateGraph);
    }

    if (node.briefcase && typeof node.briefcase === 'object') {
      var briefcase = node.briefcase;
      Object.keys(briefcase).forEach(function(key) {
        var refId = storePair(key, briefcase[key]);
        briefcase[key] = { __pairref: refId };
      });
    }

    if (node.element === 'BLOCK') {
      Object.keys(node).forEach(function(key) {
        if (key === 'elements') return;
        var refId = storePair(key, node[key]);
        node[key] = { __pairref: refId };
      });
      return node;
    }

    Object.keys(node).forEach(function(key) {
      node[key] = consolidateGraph(node[key]);
    });
    return node;
  }

  return node;
}

function restoreGraph(node) {
  if (node === null || node === undefined) return node;

  if (typeof node === 'object') {
    if (node.__pairref) {
      var entry = PAIRSTORE['ref:' + node.__pairref];
      return entry ? entry.value : undefined;
    }

    if (Array.isArray(node)) {
      return node.map(restoreGraph);
    }

    Object.keys(node).forEach(function(key) {
      node[key] = restoreGraph(node[key]);
    });
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
  try {
    parsed = JSON.parse(json, dnaReviver);
  } catch (err) {
    logwarn(dbState, '[DBACTOR]', 'deserializePairStore failed:', err);
    return;
  }

  Object.keys(PAIRSTORE).forEach(function(key) { delete PAIRSTORE[key]; });
  Object.keys(parsed || {}).forEach(function(key) {
    PAIRSTORE[key] = parsed[key];
  });
}

// ==================== POST-SERIALIZATION OPTIMIZATION ====================

function measureLength(obj) { return JSON.stringify(obj).length; }

function optimizeSerializedDna(jsonString) {
  // P9: reset global pair store and counter to avoid cross-call contamination
  Object.keys(PAIRSTORE).forEach(function(key) { delete PAIRSTORE[key]; });
  pairCounter = 0;

  logdebug(dbState, '[DBACTOR]', 'optimizeSerializedDna start, input length:', jsonString.length);
  var obj = JSON.parse(jsonString);

  var passObjectPairDedup = function(node) {
    if (Array.isArray(node)) {
      return node.map(passObjectPairDedup);
    }
    if (node && typeof node === 'object') {
      if (node.__pairref) return node;
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
          node[key] = { __pairref: refId };
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
          node.briefcase[key] = { __pairref: refId };
        });
      }
      Object.keys(node).forEach(function(key) {
        node[key] = passObjectPairDedup(node[key]);
      });
      return node;
    }
    return node;
  };

  var passInnerDedup = function(node) {
    if (Array.isArray(node)) {
      return node.map(passInnerDedup);
    }
    if (node && typeof node === 'object') {
      if (node.__fn__ === true && typeof node.source === 'string') {
        return node;
      }
      Object.keys(node).forEach(function(key) {
        node[key] = passInnerDedup(node[key]);
      });
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
    if (measureLength(candidate) < before) {
      optimized = candidate;
    } else {
      break;
    }
  } while (true);

  optimized.__FRAMEWORK_PAIRSTORE__ = serializePairStore();
  var finalResult = JSON.stringify(optimized);
  logdebug(dbState, '[DBACTOR]', 'optimizeSerializedDna completed, output length:', finalResult.length);
  return finalResult;
}

function deoptimizeSerializedDna(jsonString) {
  logdebug(dbState, '[DBACTOR]', 'deoptimizeSerializedDna start, input length:', jsonString.length);
  var obj = JSON.parse(jsonString);

  if (obj.__FRAMEWORK_PAIRSTORE__) {
    deserializePairStore(obj.__FRAMEWORK_PAIRSTORE__);
    delete obj.__FRAMEWORK_PAIRSTORE__;
  }

  var resolveNode = function(node) {
    if (Array.isArray(node)) return node.map(resolveNode);
    if (node && typeof node === 'object') {
      if (node.__pairref) {
        var entry = PAIRSTORE['ref:' + node.__pairref];
        return entry ? entry.value : undefined;
      }
      Object.keys(node).forEach(function(key) { node[key] = resolveNode(node[key]); });
      return node;
    }
    return node;
  };

  var finalResult = JSON.stringify(resolveNode(obj));
  logdebug(dbState, '[DBACTOR]', 'deoptimizeSerializedDna completed, output length:', finalResult.length);
  return finalResult;
}

// ==================== ACTOR BEHAVIOR ====================

var dbbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : dbVerbosityConstants.DEBUG;
  dbState = Object.freeze({ level: v });

  logdebug(dbState, '[DBACTOR]', 'behavior handling action:', message.type);

  var store = Object.keys(state.store || {}).reduce(function(acc, k) { acc[k] = state.store[k]; return acc; }, {});
  var resolve = function(val) { if (typeof message.resolve === 'function') message.resolve(val); };

  switch (message.type) {
    case MESSAGETYPES.STORE: {
      logdebug(dbState, '[DBACTOR]', 'action STORE key:', message.key);
      try {
        var serialized = JSON.stringify(message.value);
        if (serialized.length > MAX_ENTRY_BYTES) {
          logwarn(dbState, '[DBACTOR]', 'value too large for key:', message.key, 'bytes:', serialized.length);
          resolve(false);
          return state;
        }
      } catch (e) {
        resolve(false);
        return state;
      }

      var keys = Object.keys(store);
      if (keys.length >= MAX_KEYS && !store[message.key]) {
        var oldest = keys[0];
        if (oldest) delete store[oldest];
      }
      store[message.key] = message.value;
      resolve(persist(store));
      break;
    }
    case MESSAGETYPES.RESTORE:
      logdebug(dbState, '[DBACTOR]', 'action RESTORE key:', message.key, 'exists:', store[message.key] !== undefined);
      resolve(store[message.key] !== undefined ? store[message.key] : null);
      break;
    case MESSAGETYPES.LIST:
      logdebug(dbState, '[DBACTOR]', 'action LIST count:', Object.keys(store).length);
      resolve(Object.keys(store));
      break;
    case MESSAGETYPES.DELETE: {
      logdebug(dbState, '[DBACTOR]', 'action DELETE key:', message.key);
      delete store[message.key];
      resolve(persist(store));
      break;
    }
    default:
      logwarn(dbState, '[DBACTOR]', 'unknown action:', message.type);
      if (typeof message.reject === 'function') message.reject(new Error('[DBACTOR] unknown message type'));
      break;
  }

  return { store: store, verbosity: v };
};

// NOTE: No MESSAGEREGISTRY.register loop. Centralized in registerconsumers.js.

var DBACTOR = createactor(
  dbbehavior,
  loadInitialState(),
  dbactorINTERFACES,
  { actorName: 'dbactor', mailboxType: 'memory', verbosity: dbVerbosityConstants.DEBUG }
);

function startDbActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      dbState = Object.freeze({ level: lvl });
      if (DBACTOR && DBACTOR.getstate()) {
        DBACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return DBACTOR;
}

var enqueue = function(type, payload) {
  return new Promise(function(resolve, reject) {
    var message = {};
    if (payload) {
      Object.keys(payload).forEach(function(k) { message[k] = payload[k]; });
    }
    message.type = type;
    message.resolve = resolve;
    message.reject = reject;
    DBACTOR.send(message);
  });
};

var enqueueDbStore = function(key, value) { return enqueue(MESSAGETYPES.STORE, { key: key, value: value }); };
var enqueueDbRestore = function(key) { return enqueue(MESSAGETYPES.RESTORE, { key: key }); };
var enqueueDbList = function() { return enqueue(MESSAGETYPES.LIST); };
var enqueueDbDelete = function(key) { return enqueue(MESSAGETYPES.DELETE, { key: key }); };
