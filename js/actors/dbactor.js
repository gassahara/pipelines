import { createactor, createMessageValidator } from './actorkernel.js';

export const DBMESSAGETYPES = Object.freeze({
  STORE: 'store',
  RESTORE: 'restore',
  LIST: 'list',
  DELETE: 'delete'
});

const MESSAGEINTERFACES = Object.freeze({
  [DBMESSAGETYPES.STORE]: { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' },
  [DBMESSAGETYPES.RESTORE]: { key: 'string', resolve: 'function?', reject: 'function?' },
  [DBMESSAGETYPES.LIST]: { resolve: 'function?', reject: 'function?' },
  [DBMESSAGETYPES.DELETE]: { key: 'string', resolve: 'function?', reject: 'function?' }
});

const ROOT_KEY = 'FRAMEWORK_DBACTOR_MAP';
const MAX_KEYS = 100;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024; // 2MB unified cap

const loadInitialState = () => {
  try {
    const raw = (typeof localStorage !== 'undefined' ? localStorage : globalThis.localStorage)?.getItem(ROOT_KEY);
    if (raw) return { store: new Map(Object.entries(JSON.parse(raw).keys || {})) };
  } catch (err) {
    console.warn('[DBACTOR] loadInitialState failed:', err);
  }
  return { store: new Map() };
};

const persist = (store) => {
  const root = { namespace: 'FRAMEWORK_DBACTOR_V1', updatedAt: Date.now(), keys: Object.fromEntries(store) };
  const storage = typeof localStorage !== 'undefined' ? localStorage : globalThis.localStorage;
  if (!storage) return false;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      storage.setItem(ROOT_KEY, JSON.stringify(root));
      return true;
    } catch (err) {
      const keys = [...store.keys()];
      if (!keys.length) return false;
      const removeCount = Math.max(1, Math.floor(keys.length * 0.25));
      for (let i = 0; i < removeCount; i++) store.delete(keys[i]);
      root.keys = Object.fromEntries(store);
    }
  }
  return false;
};

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const dbbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    if (typeof message.reject === 'function') message.reject(new Error('[DBACTOR:INVALID] ' + check.error));
    return state;
  }

  const store = new Map(state.store);
  const resolve = (val) => typeof message.resolve === 'function' && message.resolve(val);

  switch (message.type) {
    case DBMESSAGETYPES.STORE: {
      try {
        const serialized = JSON.stringify(message.value);
        if (serialized.length > MAX_ENTRY_BYTES) {
          console.warn('[DBACTOR] value too large for key:', message.key, 'bytes:', serialized.length);
          resolve(false);
          return state;
        }
      } catch {
        resolve(false);
        return state;
      }

      if (store.size >= MAX_KEYS && !store.has(message.key)) {
        const oldest = store.keys().next().value;
        if (oldest) store.delete(oldest);
      }
      store.set(message.key, message.value);
      resolve(persist(store));
      break;
    }
    case DBMESSAGETYPES.RESTORE: resolve(store.has(message.key) ? store.get(message.key) : null); break;
    case DBMESSAGETYPES.LIST: resolve([...store.keys()]); break;
    case DBMESSAGETYPES.DELETE: {
      store.delete(message.key);
      resolve(persist(store));
      break;
    }
  }
  return { store };
};

export const DBACTOR = createactor(dbbehavior, loadInitialState());

const enqueue = (type, payload = {}) =>
  new Promise((resolve, reject) => DBACTOR.send({ type, ...payload, resolve, reject }));

export const enqueueDbStore = (key, value) => enqueue(DBMESSAGETYPES.STORE, { key, value });
export const enqueueDbRestore = (key) => enqueue(DBMESSAGETYPES.RESTORE, { key });
export const enqueueDbList = () => enqueue(DBMESSAGETYPES.LIST);
export const enqueueDbDelete = (key) => enqueue(DBMESSAGETYPES.DELETE, { key });
