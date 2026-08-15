import { createactor, createMessageValidator } from './actorkernel.js';

export const DBMESSAGETYPES = Object.freeze({
  STORE: 'store',
  RESTORE: 'restore',
  LIST: 'list',
  DELETE: 'delete'
});

const MESSAGEINTERFACES = Object.freeze({
  [DBMESSAGETYPES.STORE]: {
    key: 'string',
    value: 'any',
    resolve: 'function?',
    reject: 'function?'
  },
  [DBMESSAGETYPES.RESTORE]: {
    key: 'string',
    resolve: 'function?',
    reject: 'function?'
  },
  [DBMESSAGETYPES.LIST]: {
    resolve: 'function?',
    reject: 'function?'
  },
  [DBMESSAGETYPES.DELETE]: {
    key: 'string',
    resolve: 'function?',
    reject: 'function?'
  }
});

const ROOT_KEY = 'FRAMEWORK_DBACTOR_MAP';
const MAX_KEYS = 100;
const MAX_ENTRY_BYTES = 512 * 1024; // 512 KB default per value cap
const HTML_MAX_ENTRY_BYTES = MAX_ENTRY_BYTES * 2; // 1 MB for HTML snapshots

const loadInitialState = () => {
  try {
    const raw = localStorage.getItem(ROOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        store: new Map(Object.entries(parsed.keys || {}))
      };
    }
  } catch (err) {
    console.warn('[DBACTOR] loadInitialState failed:', err);
  }
  return { store: new Map() };
};

const isQuotaError = (err) => {
  return err && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.name === 'DOMException'
  );
};

const persist = (store, maxRetries = 2) => {
  let root = {
    namespace: 'FRAMEWORK_DBACTOR_V1',
    updatedAt: Date.now(),
    keys: Object.fromEntries(store)
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      localStorage.setItem(ROOT_KEY, JSON.stringify(root));
      return true;
    } catch (err) {
      if (isQuotaError(err)) {
        const keys = [...store.keys()];
        if (keys.length === 0) return false;

        // Evict oldest 25% of keys.
        const removeCount = Math.max(1, Math.floor(keys.length * 0.25));
        for (let i = 0; i < removeCount; i++) {
          store.delete(keys[i]);
        }

        root = {
          namespace: 'FRAMEWORK_DBACTOR_V1',
          updatedAt: Date.now(),
          keys: Object.fromEntries(store)
        };
        continue;
      }

      console.warn('[DBACTOR] persist failed:', err);
      return false;
    }
  }

  return false;
};

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const dbbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    if (typeof message.reject === 'function') {
      message.reject(new Error('[DBACTOR:INVALID] ' + check.error));
    } else {
      console.error('[DBACTOR:INVALID]', check.error);
    }
    return state;
  }

  const store = new Map(state.store);

  switch (message.type) {
    case DBMESSAGETYPES.STORE: {
      let maxBytes = MAX_ENTRY_BYTES;
      if (message.key.includes(':html')) {
        maxBytes = HTML_MAX_ENTRY_BYTES;
      }

      let serializedValue;
      try {
        serializedValue = JSON.stringify(message.value);
      } catch (err) {
        console.warn('[DBACTOR] serialization failed:', err);
        if (typeof message.resolve === 'function') message.resolve(false);
        return state;
      }

      if (serializedValue.length > maxBytes) {
        if (message.key.includes('global:executionstate')) {
          console.warn('[DBACTOR] global execution state too large. Consider splitting env from execution status map. key=', message.key, 'bytes=', serializedValue.length);
        } else if (message.key.includes('global:htmlsnapshot')) {
          console.warn('[DBACTOR] global html snapshot too large. key=', message.key, 'bytes=', serializedValue.length);
        } else {
          console.warn('[DBACTOR] value too large for key:', message.key, 'bytes:', serializedValue.length);
        }
        if (typeof message.resolve === 'function') message.resolve(false);
        return state;
      }

      if (store.size >= MAX_KEYS && !store.has(message.key)) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }

      store.set(message.key, message.value);
      const success = persist(store);

      if (typeof message.resolve === 'function') {
        message.resolve(success);
      }
      break;
    }

    case DBMESSAGETYPES.RESTORE: {
      if (typeof message.resolve === 'function') {
        message.resolve(store.has(message.key) ? store.get(message.key) : null);
      }
      break;
    }

    case DBMESSAGETYPES.LIST: {
      if (typeof message.resolve === 'function') {
        message.resolve([...store.keys()]);
      }
      break;
    }

    case DBMESSAGETYPES.DELETE: {
      store.delete(message.key);
      const success = persist(store);
      if (typeof message.resolve === 'function') {
        message.resolve(success);
      }
      break;
    }
  }

  return { store };
};

export const DBACTOR = createactor(dbbehavior, loadInitialState());

export const enqueueDbStore = (key, value) =>
  new Promise((resolve, reject) =>
    DBACTOR.send({
      type: DBMESSAGETYPES.STORE,
      key,
      value,
      resolve,
      reject
    })
  );

export const enqueueDbRestore = (key) =>
  new Promise((resolve, reject) =>
    DBACTOR.send({
      type: DBMESSAGETYPES.RESTORE,
      key,
      resolve,
      reject
    })
  );

export const enqueueDbList = () =>
  new Promise((resolve, reject) =>
    DBACTOR.send({
      type: DBMESSAGETYPES.LIST,
      resolve,
      reject
    })
  );

export const enqueueDbDelete = (key) =>
  new Promise((resolve, reject) =>
    DBACTOR.send({
      type: DBMESSAGETYPES.DELETE,
      key,
      resolve,
      reject
    })
  );
