// ============================================================
// UPDATED FILE: js/actors/dbactor.js
// Change applied: MONADIC DB ACTOR
//   - No callback resolve/reject; uses RIGHT/LEFT for mutations,
//     Maybe (JUST/NOTHING) for restore.
//   - dbbehavior remains pure; receives env and message, returns env.
//   - DNA serialization utilities retained.
// ============================================================

var dbVerbosityConstants = createVerbosityConstants();
var dbState = Object.freeze({ level: dbVerbosityConstants.DEBUG });

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
      return {
        store: Object.keys(keys).reduce(function(acc, k) { acc[k] = keys[k]; return acc; }, {}),
        verbosity: dbVerbosityConstants.DEBUG
      };
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

// ==================== MONADIC CONSTRUCTORS ====================

function RIGHT(value) {
  return { tag: 'RIGHT', value: value };
}

function LEFT(error) {
  return { tag: 'LEFT', error: error };
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

// ==================== ACTOR BEHAVIOR (PURE FUNCTION, MONADIC) ====================

var dbbehavior = function(env, message) {
  logdebug(env, '[DBACTOR]', 'behavior handling action:', message.type);

  if (!env.db || typeof env.db.store === 'undefined') {
    // This should not happen if worldmapactor initialized env correctly.
    env.db = { store: {} };
  }
  var store = env.db.store;

  switch (message.type) {
    case MESSAGETYPES.STORE: {
      logdebug(env, '[DBACTOR]', 'action STORE key:', message.key);
      try {
        var serialized = JSON.stringify(message.value);
        if (serialized.length > MAX_ENTRY_BYTES) {
          logwarn(env, '[DBACTOR]', 'value too large for key:', message.key, 'bytes:', serialized.length);
          return LEFT(new Error('value too large'));
        }
      } catch (e) {
        return LEFT(e);
      }

      var keys = Object.keys(store);
      if (keys.length >= MAX_KEYS && !store[message.key]) {
        var oldest = keys[0];
        if (oldest) delete store[oldest];
      }
      store[message.key] = message.value;
      var persisted = persist(store);
      if (persisted) {
        return RIGHT(store);
      } else {
        return LEFT(new Error('persist failed'));
      }
    }
    case MESSAGETYPES.RESTORE:
      logdebug(env, '[DBACTOR]', 'action RESTORE key:', message.key, 'exists:', store[message.key] !== undefined);
      return store[message.key] !== undefined ? JUST(store[message.key]) : NOTHING();
    case MESSAGETYPES.LIST:
      logdebug(env, '[DBACTOR]', 'action LIST count:', Object.keys(store).length);
      return RIGHT(Object.keys(store));
    case MESSAGETYPES.DELETE: {
      logdebug(env, '[DBACTOR]', 'action DELETE key:', message.key);
      delete store[message.key];
      var persistedDel = persist(store);
      return persistedDel ? RIGHT(store) : LEFT(new Error('persist failed'));
    }
    default:
      logwarn(env, '[DBACTOR]', 'unknown action:', message.type);
      return LEFT(new Error('unknown message type'));
  }
};

// No registerActorState for dbactor; state lives in global ENV under env.db.
// Dispatch uses dispatchToActor('dbactor', dbbehavior, message).

// Monadic producers: return Promise of RIGHT/LEFT or Maybe.
var enqueueDbStore = function(key, value) {
  return Promise.resolve(dispatchToActor('dbactor', dbbehavior, {
    type: MESSAGETYPES.STORE,
    key: key,
    value: value
  }));
};
var enqueueDbRestore = function(key) {
  return Promise.resolve(dispatchToActor('dbactor', dbbehavior, {
    type: MESSAGETYPES.RESTORE,
    key: key
  }));
};
var enqueueDbList = function() {
  return Promise.resolve(dispatchToActor('dbactor', dbbehavior, {
    type: MESSAGETYPES.LIST
  }));
};
var enqueueDbDelete = function(key) {
  return Promise.resolve(dispatchToActor('dbactor', dbbehavior, {
    type: MESSAGETYPES.DELETE,
    key: key
  }));
};

function startDbActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('dbactor', dbbehavior, message); }
  };
}
