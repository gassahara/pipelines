import { createactor, createMessageValidator } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore } from './dbactor.js';

export const EXECUTIONMESSAGETYPES = Object.freeze({
  PIPELINE_LOADED: 'pipeline_loaded',
  STAGE_STATE: 'stage_state',
  ELEMENT_STATE: 'element_state',
  ENV_UPDATED: 'env_updated',
  SNAPSHOT: 'snapshot',
  RECOVER: 'recover',
  STOP_STAGE: 'stop_stage',
  CANCEL_STAGE: 'cancel_stage',
  BREAK_STAGE: 'break_stage',
  RESTART_STAGE: 'restart_stage',
  CONTINUE_STAGE: 'continue_stage',
  GET_STATUS: 'get_status'
});

const MESSAGEINTERFACES = Object.freeze({
  [EXECUTIONMESSAGETYPES.PIPELINE_LOADED]: { pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.STAGE_STATE]: { pipelineid: 'string', stageid: 'string', state: 'object', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.ELEMENT_STATE]: { pipelineid: 'string', stageid: 'string', elementid: 'string', state: 'object', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.ENV_UPDATED]: { pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.SNAPSHOT]: { resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.RECOVER]: { pipelineid: 'string', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.STOP_STAGE]: { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.CANCEL_STAGE]: { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.BREAK_STAGE]: { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.RESTART_STAGE]: { pipelineid: 'string', stageid: 'string', elementid: 'string?', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.CONTINUE_STAGE]: { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' },
  [EXECUTIONMESSAGETYPES.GET_STATUS]: { pipelineid: 'string?', resolve: 'function?', reject: 'function?' }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const DB_KEY = 'global:executionstate';

const ensurePipeline = (state, pipelineid) => {
  if (!state.pipelines[pipelineid]) {
    state.pipelines[pipelineid] = {
      status: 'running',
      env: {},
      stages: {}
    };
  }
  return state.pipelines[pipelineid];
};

const ensureStage = (pipeline, stageid) => {
  if (!pipeline.stages[stageid]) {
    pipeline.stages[stageid] = {
      status: 'awaiting',
      elements: {}
    };
  }
  return pipeline.stages[stageid];
};

const persistState = async (state) => {
  try {
    await enqueueDbStore(DB_KEY, state);
  } catch (err) {
    console.warn('[EXECUTIONACTOR] persist failed:', err);
  }
};

const loadInitialState = async () => {
  try {
    const stored = await enqueueDbRestore(DB_KEY);
    if (stored && stored.pipelines) {
      return stored;
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] load initial state failed:', err);
  }
  return { pipelines: {}, snapshot: { lastSavedAt: null } };
};

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

  const nextState = {
    ...state,
    pipelines: { ...state.pipelines }
  };

  switch (message.type) {
    case EXECUTIONMESSAGETYPES.PIPELINE_LOADED: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) {
        pipeline.env = message.env;
      }
      pipeline.status = 'running';
      break;
    }

    case EXECUTIONMESSAGETYPES.STAGE_STATE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      if (message.state && typeof message.state === 'object') {
        if (message.state.elements) {
          const elements = { ...stage.elements };
          for (const [elementId, elementState] of Object.entries(message.state.elements)) {
            elements[elementId] = {
              status: elementState.status || 'WAITING',
              savedAt: elementState.savedAt || Date.now()
            };
          }
          stage.elements = elements;
        }
        if (message.state.status) {
          stage.status = message.state.status;
        }
      }
      break;
    }

    case EXECUTIONMESSAGETYPES.ELEMENT_STATE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      stage.elements = { ...stage.elements };
      stage.elements[message.elementid] = {
        status: message.state.status || 'RUNNING',
        savedAt: message.state.savedAt || Date.now(),
        startedAt: message.state.startedAt || null,
        completedAt: message.state.completedAt || null,
        outputs: message.state.outputs || null
      };
      break;
    }

    case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      pipeline.env = message.env || {};
      break;
    }

    case EXECUTIONMESSAGETYPES.SNAPSHOT: {
      nextState.snapshot = {
        ...nextState.snapshot,
        lastSavedAt: Date.now()
      };
      persistState(nextState);
      break;
    }

    case EXECUTIONMESSAGETYPES.RECOVER: {
      const pipeline = nextState.pipelines[message.pipelineid] || null;
      if (typeof message.resolve === 'function') {
        message.resolve(pipeline);
      }
      break;
    }

    case EXECUTIONMESSAGETYPES.STOP_STAGE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      stage.status = 'stopped';
      break;
    }

    case EXECUTIONMESSAGETYPES.CANCEL_STAGE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      stage.status = 'cancelled';
      break;
    }

    case EXECUTIONMESSAGETYPES.BREAK_STAGE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      stage.status = 'awaiting';
      break;
    }

    case EXECUTIONMESSAGETYPES.RESTART_STAGE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      stage.status = 'running';
      if (message.elementid) {
        stage.elements[message.elementid] = {
          status: 'RUNNING',
          savedAt: Date.now(),
          startedAt: Date.now(),
          completedAt: null,
          outputs: null
        };
      }
      break;
    }

    case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
      const pipeline = ensurePipeline(nextState, message.pipelineid);
      const stage = ensureStage(pipeline, message.stageid);
      if (stage.status === 'stopped' || stage.status === 'awaiting') {
        stage.status = 'running';
      }
      break;
    }

    case EXECUTIONMESSAGETYPES.GET_STATUS: {
      if (typeof message.resolve === 'function') {
        if (message.pipelineid) {
          message.resolve(nextState.pipelines[message.pipelineid] || null);
        } else {
          message.resolve(nextState.pipelines);
        }
      }
      break;
    }
  }

  persistState(nextState);
  return nextState;
};

export const EXECUTIONACTOR = createactor(executionbehavior, { pipelines: {}, snapshot: { lastSavedAt: null } });

// Initialize from DB asynchronously after export.
(async () => {
  const loaded = await loadInitialState();
  // Actor state already seeded; use replaceState if available? For now keep initial empty.
})();

export const enqueueExecutionPipelineLoaded = (pipelineid, env) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.PIPELINE_LOADED, pipelineid, env, resolve, reject })
  );

export const enqueueExecutionStageState = (pipelineid, stageid, state) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.STAGE_STATE, pipelineid, stageid, state, resolve, reject })
  );

export const enqueueExecutionElementState = (pipelineid, stageid, elementid, state) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.ELEMENT_STATE, pipelineid, stageid, elementid, state, resolve, reject })
  );

export const enqueueExecutionEnvUpdated = (pipelineid, env) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.ENV_UPDATED, pipelineid, env, resolve, reject })
  );

export const enqueueExecutionSnapshot = () =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.SNAPSHOT, resolve, reject })
  );

export const enqueueExecutionRecover = (pipelineid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.RECOVER, pipelineid, resolve, reject })
  );

export const enqueueExecutionStopStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.STOP_STAGE, pipelineid, stageid, resolve, reject })
  );

export const enqueueExecutionCancelStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.CANCEL_STAGE, pipelineid, stageid, resolve, reject })
  );

export const enqueueExecutionBreakStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.BREAK_STAGE, pipelineid, stageid, resolve, reject })
  );

export const enqueueExecutionRestartStage = (pipelineid, stageid, elementid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.RESTART_STAGE, pipelineid, stageid, elementid, resolve, reject })
  );

export const enqueueExecutionContinueStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.CONTINUE_STAGE, pipelineid, stageid, resolve, reject })
  );

export const enqueueExecutionGetStatus = (pipelineid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.GET_STATUS, pipelineid, resolve, reject })
  );
