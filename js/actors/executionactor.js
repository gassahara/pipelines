import { createactor, createMessageValidator } from './actorkernel.js';

export const EXECUTIONMESSAGETYPES = Object.freeze({
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart',
  CONTINUE: 'continue',
  SAVE_STATUS: 'save_status',
  GET: 'get',
  SET: 'set'
});

const MESSAGEINTERFACES = Object.freeze({
  [EXECUTIONMESSAGETYPES.START]: {
    stageid: 'string',
    inputs: 'object?',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.STOP]: {
    stageid: 'string',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.RESTART]: {
    stageid: 'string',
    inputs: 'object?',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CONTINUE]: {
    stageid: 'string',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.SAVE_STATUS]: {
    stageid: 'string',
    status: 'string?',
    outputs: 'object?',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GET]: {
    stageid: 'string',
    key: 'string?',
    resolve: 'function?',
    reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.SET]: {
    stageid: 'string',
    key: 'string',
    value: 'any',
    resolve: 'function?',
    reject: 'function?'
  }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const executionbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    if (typeof message.reject === 'function') {
      message.reject(new Error('[EXECUTIONACTOR:INVALID] ' + check.error));
    } else {
      console.error('[EXECUTIONACTOR:INVALID]', check.error);
    }
    return state;
  }

  const map = new Map(state.map);

  switch (message.type) {
    case EXECUTIONMESSAGETYPES.START: {
      map.set(message.stageid, {
        stageid: message.stageid,
        status: 'running',
        inputs: message.inputs || {},
        outputs: {},
        updatedAt: Date.now()
      });
      if (typeof message.resolve === 'function') message.resolve(true);
      break;
    }

    case EXECUTIONMESSAGETYPES.STOP: {
      const record = map.get(message.stageid);
      if (record) {
        map.set(message.stageid, {
          ...record,
          status: 'stopped',
          updatedAt: Date.now()
        });
      }
      if (typeof message.resolve === 'function') message.resolve(true);
      break;
    }

    case EXECUTIONMESSAGETYPES.RESTART: {
      const existing = map.get(message.stageid);
      map.set(message.stageid, {
        stageid: message.stageid,
        status: 'running',
        inputs: message.inputs || existing?.inputs || {},
        outputs: {},
        updatedAt: Date.now()
      });
      if (typeof message.resolve === 'function') message.resolve(true);
      break;
    }

    case EXECUTIONMESSAGETYPES.CONTINUE: {
      const record = map.get(message.stageid);
      if (record && (record.status === 'stopped' || record.status === 'awaiting')) {
        map.set(message.stageid, {
          ...record,
          status: 'running',
          updatedAt: Date.now()
        });
      }
      if (typeof message.resolve === 'function') message.resolve(true);
      break;
    }

    case EXECUTIONMESSAGETYPES.SAVE_STATUS: {
      const record = map.get(message.stageid);
      if (record) {
        map.set(message.stageid, {
          ...record,
          status: message.status || record.status,
          outputs: message.outputs || record.outputs || {},
          updatedAt: Date.now()
        });
      }
      if (typeof message.resolve === 'function') message.resolve(true);
      break;
    }

    case EXECUTIONMESSAGETYPES.GET: {
      const record = map.get(message.stageid);
      if (typeof message.resolve === 'function') {
        if (!record) {
          message.resolve(null);
        } else if (message.key) {
          message.resolve(record[message.key] !== undefined ? record[message.key] : null);
        } else {
          message.resolve(record);
        }
      }
      break;
    }

    case EXECUTIONMESSAGETYPES.SET: {
      const existing = map.get(message.stageid) || {
        stageid: message.stageid,
        status: 'unknown',
        inputs: {},
        outputs: {},
        updatedAt: Date.now()
      };
      const updated = {
        ...existing,
        [message.key]: message.value,
        updatedAt: Date.now()
      };
      map.set(message.stageid, updated);
      if (typeof message.resolve === 'function') {
        message.resolve(updated[message.key]);
      }
      break;
    }
  }

  return { map };
};

export const EXECUTIONACTOR = createactor(executionbehavior, { map: new Map() });

export const enqueueExecutionStart = (stageid, inputs) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.START,
      stageid,
      inputs,
      resolve,
      reject
    })
  );

export const enqueueExecutionStop = (stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.STOP,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionRestart = (stageid, inputs) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.RESTART,
      stageid,
      inputs,
      resolve,
      reject
    })
  );

export const enqueueExecutionContinue = (stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CONTINUE,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionSaveStatus = (stageid, status, outputs) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.SAVE_STATUS,
      stageid,
      status,
      outputs,
      resolve,
      reject
    })
  );

export const enqueueExecutionGet = (stageid, key) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.GET,
      stageid,
      key,
      resolve,
      reject
    })
  );

export const enqueueExecutionSet = (stageid, key, value) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.SET,
      stageid,
      key,
      value,
      resolve,
      reject
    })
  );
