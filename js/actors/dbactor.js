import { createactor } from './actorkernel.js';

var DBMESSAGETYPES = Object.freeze({
  STORE: 'store',
  RESTORE: 'restore',
  LIST: 'list',
  DELETE: 'delete'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[DBMESSAGETYPES.STORE] = { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DBMESSAGETYPES.RESTORE] = { key: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DBMESSAGETYPES.LIST] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DBMESSAGETYPES.DELETE] = { key: 'string', resolve: 'function?', reject: 'function?' };
Object.freeze(MESSAGEINTERFACES);

var ROOT_KEY = 'FRAMEWORK_DBACTOR_MAP';
var MAX_KEYS = 100;
var MAX_ENTRY_BYTES = 2 * 1024 * 1024;

function loadInitialState() {
  try {
    var storage = typeof localStorage !== 'undefined' ? localStorage : globalThis.localStorage;
    var raw = storage && storage.getItem(ROOT_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      var keys = parsed.keys || {};
      return { store: Object.keys(keys).reduce(function(acc, k) { acc[k] = keys[k]; return acc; }, {}) };
    }
  } catch (err) {
    console.warn('[DBACTOR] loadInitialState failed:', err);
  }
  return { store: {} };
}

function persist(store) {
  var root = { namespace: 'FRAMEWORK_DBACTOR_V1', updatedAt: Date.now(), keys: store };
  var storage = typeof localStorage !== 'undefined' ? localStorage : globalThis.localStorage;
  if (!storage) return false;

  for (var attempt = 0; attempt <= 2; attempt++) {
    try {
      storage.setItem(ROOT_KEY, JSON.stringify(root));
      return true;
    } catch (err) {
      var keys = Object.keys(store);
      if (!keys.length) return false;
      var removeCount = Math.max(1, Math.floor(keys.length * 0.25));
      for (var i = 0; i < removeCount; i++) delete store[keys[i]];
      root.keys = store;
    }
  }
  return false;
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
        return new Function('__deps', 'return (' + value.source + ')')(value.deps);
      }
      return new Function('return (' + value.source + ')')();
    } catch (err) {
      console.warn('[DNA] failed to revive function using new Function:', err);
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
    console.warn('[DBACTOR] deserializePairStore failed:', err);
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
  return JSON.stringify(optimized);
}

function deoptimizeSerializedDna(jsonString) {
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

  return JSON.stringify(resolveNode(obj));
}

// ==================== ACTOR BEHAVIOR ====================

var dbbehavior = function(state, message) {
  var store = Object.keys(state.store || {}).reduce(function(acc, k) { acc[k] = state.store[k]; return acc; }, {});
  var resolve = function(val) { if (typeof message.resolve === 'function') message.resolve(val); };

  switch (message.type) {
    case DBMESSAGETYPES.STORE: {
      try {
        var serialized = JSON.stringify(message.value);
        if (serialized.length > MAX_ENTRY_BYTES) {
          console.warn('[DBACTOR] value too large for key:', message.key, 'bytes:', serialized.length);
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
    case DBMESSAGETYPES.RESTORE:
      resolve(store[message.key] !== undefined ? store[message.key] : null);
      break;
    case DBMESSAGETYPES.LIST:
      resolve(Object.keys(store));
      break;
    case DBMESSAGETYPES.DELETE: {
      delete store[message.key];
      resolve(persist(store));
      break;
    }
  }

  return { store: store };
};

var DBACTOR = createactor(dbbehavior, loadInitialState(), MESSAGEINTERFACES);

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

var enqueueDbStore = function(key, value) { return enqueue(DBMESSAGETYPES.STORE, { key: key, value: value }); };
var enqueueDbRestore = function(key) { return enqueue(DBMESSAGETYPES.RESTORE, { key: key }); };
var enqueueDbList = function() { return enqueue(DBMESSAGETYPES.LIST); };
var enqueueDbDelete = function(key) { return enqueue(DBMESSAGETYPES.DELETE, { key: key }); };

export {
  DBMESSAGETYPES,
  DBACTOR,
  serializeDna,
  deserializeDna,
  consolidateGraph,
  restoreGraph,
  serializePairStore,
  deserializePairStore,
  optimizeSerializedDna,
  deoptimizeSerializedDna,
  enqueueDbStore,
  enqueueDbRestore,
  enqueueDbList,
  enqueueDbDelete
};
