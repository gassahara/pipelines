import { createactor, createMessageValidator } from './actorkernel.js';

export const DBMESSAGETYPES = Object.freeze({
  STORE: 'store',
  RESTORE: 'restore',
  LIST: 'list'
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
  }
});

const ROOT_KEY = 'FRAMEWORK_DBACTOR_MAP';

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

const persist = (store) => {
  const root = {
    namespace: 'FRAMEWORK_DBACTOR_V1',
    updatedAt: Date.now(),
    keys: Object.fromEntries(store)
  };
  try {
    localStorage.setItem(ROOT_KEY, JSON.stringify(root));
  } catch (err) {
    console.warn('[DBACTOR] persist failed:', err);
  }
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
      store.set(message.key, message.value);
      persist(store);
      if (typeof message.resolve === 'function') {
        message.resolve(true);
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

