import { createactor, createMessageValidator } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore } from './dbactor.js';

export const EXECUTIONMESSAGETYPES = Object.freeze({
  PIPELINE_LOADED: 'pipeline_loaded',
  STAGE_STATE: 'stage_state',
  EXECUTE_ELEMENT: 'execute_element',
  ELEMENT_STATE: 'element_state',
  EXECUTE_STAGE: 'execute_stage',
  ENV_UPDATED: 'env_updated',
  SNAPSHOT: 'snapshot',
  RECOVER: 'recover',
  STOP_STAGE: 'stop_stage',
  CANCEL_STAGE: 'cancel_stage',
  BREAK_STAGE: 'break_stage',
  RESTART_STAGE: 'restart_stage',
  CONTINUE_STAGE: 'continue_stage',
  GET_STATUS: 'get_status',
  AWAIT_TASK: 'await_task',
  GET_TASKS: 'get_tasks',
  GET_TASK_STATUS: 'get_task_status',
  CANCEL_TASK: 'cancel_task',
  STOP_TASK: 'stop_task',
  SPAWN_PIPELINE: 'spawn_pipeline'
});

const MESSAGEINTERFACES = Object.freeze({
  [EXECUTIONMESSAGETYPES.PIPELINE_LOADED]: {
    pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.STAGE_STATE]: {
    pipelineid: 'string', stageid: 'string', state: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT]: {
    pipelineid: 'string', stageid: 'string', elementid: 'string',
    env: 'object', signature: 'object', executor: 'function',
    properties: 'object?', async: 'boolean?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.ELEMENT_STATE]: {
    pipelineid: 'string', stageid: 'string', elementid: 'string',
    state: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.EXECUTE_STAGE]: {
    pipelineid: 'string', stageid: 'string', stageExecutor: 'function',
    env: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.ENV_UPDATED]: {
    pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.SNAPSHOT]: {
    resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.RECOVER]: {
    pipelineid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.STOP_STAGE]: {
    pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CANCEL_STAGE]: {
    pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.BREAK_STAGE]: {
    pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.RESTART_STAGE]: {
    pipelineid: 'string', stageid: 'string', elementid: 'string?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CONTINUE_STAGE]: {
    pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GET_STATUS]: {
    pipelineid: 'string?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.AWAIT_TASK]: {
    taskid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GET_TASKS]: {
    pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?',
    resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GET_TASK_STATUS]: {
    taskid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CANCEL_TASK]: {
    taskid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.STOP_TASK]: {
    taskid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.SPAWN_PIPELINE]: {
    parentPipelineId: 'string', childPipelineId: 'string', childRunner: 'function',
    childEnv: 'object', containerref: 'string?', resolve: 'function?', reject: 'function?'
  }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);
const DB_KEY = 'global:executionstate';

const resolveMessage = (message, value = true) => {
  if (message && typeof message.resolve === 'function') message.resolve(value);
};

const rejectMessage = (message, error) => {
  if (message && typeof message.reject === 'function') message.reject(error);
};

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
      return {
        pipelines: stored.pipelines || {},
        snapshot: stored.snapshot || { lastSavedAt: null }
      };
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] load initial state failed:', err);
  }
  return { pipelines: {}, snapshot: { lastSavedAt: null } };
};

// In-memory execution task map. Not persisted.
const tasks = new Map();
let taskCounter = 0;

const nextTaskId = () => {
  taskCounter += 1;
  return 'task_' + Date.now() + '_' + taskCounter + '_' + Math.random().toString(36).slice(2, 8);
};

const makeTask = (descriptor) => {
  let resolveTask;
  let rejectTask;
  const promise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  return {
    taskid: nextTaskId(),
    kind: descriptor.kind || 'element',
    pipelineid: descriptor.pipelineid || null,
    stageid: descriptor.stageid || null,
    elementid: descriptor.elementid || null,
    status: 'WAITING',
    childTaskIds: [],
    resolveTask,
    rejectTask,
    promise
  };
};

const runElementTask = async (taskid, descriptor) => {
  const task = tasks.get(taskid);
  if (!task) return;

  try {
    await EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.ELEMENT_STATE,
      pipelineid: descriptor.pipelineid,
      stageid: descriptor.stageid,
      elementid: descriptor.elementid,
      state: { status: 'RUNNING', startedAt: Date.now() }
    });

    const executionContext = {
      env: descriptor.env,
      inputs: descriptor.signature?.inputs || [],
      outputs: descriptor.signature?.outputs || {},
      properties: descriptor.properties || {}
    };

    const result = await descriptor.executor(executionContext);

    await EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.ELEMENT_STATE,
      pipelineid: descriptor.pipelineid,
      stageid: descriptor.stageid,
      elementid: descriptor.elementid,
      state: {
        status: 'EXECUTED',
        completedAt: Date.now(),
        outputs: result || null
      }
    });

    task.status = 'EXECUTED';
    task.resolveTask(result || {});
  } catch (err) {
    try {
      await EXECUTIONACTOR.send({
        type: EXECUTIONMESSAGETYPES.ELEMENT_STATE,
        pipelineid: descriptor.pipelineid,
        stageid: descriptor.stageid,
        elementid: descriptor.elementid,
        state: {
          status: 'EXECUTED',
          completedAt: Date.now(),
          outputs: null
        }
      });
    } catch (persistError) {
      console.warn('[EXECUTIONACTOR] failed to persist executed state after rejection:', persistError);
    }
    task.status = 'EXECUTED';
    task.rejectTask(err);
  }
};

const runStageTask = async (taskid, descriptor) => {
  const task = tasks.get(taskid);
  if (!task) return;

  try {
    task.status = 'RUNNING';
    await descriptor.stageExecutor(descriptor.env);
    task.status = 'EXECUTED';
    task.resolveTask(true);
  } catch (err) {
    task.status = 'EXECUTED';
    task.rejectTask(err);
  }
};

const runSpawnTask = async (taskid, descriptor) => {
  const task = tasks.get(taskid);
  if (!task) return;

  try {
    task.status = 'RUNNING';
    await descriptor.childRunner({
      id: descriptor.childPipelineId,
      env: descriptor.childEnv || {}
    });
    task.status = 'EXECUTED';
    task.resolveTask(true);
  } catch (err) {
    task.status = 'EXECUTED';
    task.rejectTask(err);
  }
};

const cancelTask = (taskid) => {
  const task = tasks.get(taskid);
  if (!task) return;

  task.status = 'CANCELLED';
  for (const childId of task.childTaskIds || []) {
    cancelTask(childId);
  }

  if (task.rejectTask) {
    task.rejectTask(new Error('Task cancelled: ' + taskid));
  }
};

const stopTask = (taskid) => {
  const task = tasks.get(taskid);
  if (!task) return;
  task.status = 'STOPPED';
};

const executionbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    rejectMessage(message, new Error('[EXECUTIONACTOR:INVALID] ' + check.error));
    return state;
  }

  const nextState = {
    ...state,
    pipelines: { ...state.pipelines },
    snapshot: { ...state.snapshot }
  };

  try {
    switch (message.type) {
      case EXECUTIONMESSAGETYPES.PIPELINE_LOADED: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (message.env && Object.keys(message.env).length > 0) {
          pipeline.env = message.env;
        }
        pipeline.status = 'running';
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.STAGE_STATE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        if (message.state && typeof message.state === 'object') {
          if (message.state.status) stage.status = message.state.status;
          if (message.state.elements) {
            const elements = { ...stage.elements };
            for (const [elementId, elementState] of Object.entries(message.state.elements)) {
              elements[elementId] = {
                status: elementState.status || 'WAITING',
                savedAt: elementState.savedAt || Date.now(),
                startedAt: elementState.startedAt || null,
                completedAt: elementState.completedAt || null,
                outputs: elementState.outputs || null
              };
            }
            stage.elements = elements;
          }
        }
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);

        stage.elements = { ...stage.elements };
        stage.elements[message.elementid] = {
          status: 'WAITING',
          savedAt: Date.now(),
          startedAt: null,
          completedAt: null,
          outputs: null
        };

        const task = makeTask({
          kind: 'element',
          pipelineid: message.pipelineid,
          stageid: message.stageid,
          elementid: message.elementid
        });
        tasks.set(task.taskid, task);

        runElementTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      case EXECUTIONMESSAGETYPES.ELEMENT_STATE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        stage.elements = { ...stage.elements };

        const current = stage.elements[message.elementid] || {
          status: 'WAITING',
          savedAt: Date.now()
        };

        stage.elements[message.elementid] = {
          ...current,
          status: message.state.status || current.status,
          savedAt: message.state.savedAt || Date.now(),
          startedAt: message.state.startedAt || current.startedAt || null,
          completedAt: message.state.completedAt || current.completedAt || null,
          outputs: message.state.outputs !== undefined ? message.state.outputs : current.outputs
        };

        if (message.state.status === 'EXECUTED') {
          const allExecuted = Object.values(stage.elements).every((el) => el.status === 'EXECUTED');
          if (allExecuted) stage.status = 'executed';
        }

        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.EXECUTE_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        ensureStage(pipeline, message.stageid);

        const task = makeTask({
          kind: 'stage',
          pipelineid: message.pipelineid,
          stageid: message.stageid,
          elementid: null
        });
        tasks.set(task.taskid, task);

        runStageTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        pipeline.env = message.env || {};
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.SNAPSHOT: {
        nextState.snapshot = {
          ...nextState.snapshot,
          lastSavedAt: Date.now()
        };
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.RECOVER: {
        const pipeline = nextState.pipelines[message.pipelineid] || null;
        resolveMessage(message, pipeline);
        break;
      }

      case EXECUTIONMESSAGETYPES.STOP_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        stage.status = 'stopped';
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.CANCEL_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        stage.status = 'cancelled';
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.BREAK_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        stage.status = 'awaiting';
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.RESTART_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        stage.status = 'running';
        if (message.elementid) {
          stage.elements = { ...stage.elements };
          stage.elements[message.elementid] = {
            status: 'RUNNING',
            savedAt: Date.now(),
            startedAt: Date.now(),
            completedAt: null,
            outputs: null
          };
        }
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);
        if (stage.status === 'stopped' || stage.status === 'awaiting') {
          stage.status = 'running';
        }
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.GET_STATUS: {
        if (message.pipelineid) {
          resolveMessage(message, nextState.pipelines[message.pipelineid] || null);
        } else {
          resolveMessage(message, nextState.pipelines);
        }
        break;
      }

      case EXECUTIONMESSAGETYPES.AWAIT_TASK: {
        const task = tasks.get(message.taskid);
        if (!task) {
          rejectMessage(message, new Error('[EXECUTIONACTOR] unknown task: ' + message.taskid));
        } else {
          resolveMessage(message, task.promise);
        }
        break;
      }

      case EXECUTIONMESSAGETYPES.GET_TASKS: {
        const result = [];
        for (const task of tasks.values()) {
          if (message.pipelineid && task.pipelineid !== message.pipelineid) continue;
          if (message.stageid && task.stageid !== message.stageid) continue;
          if (message.elementid && task.elementid !== message.elementid) continue;
          if (message.kind && task.kind !== message.kind) continue;
          result.push({
            taskid: task.taskid,
            kind: task.kind,
            pipelineid: task.pipelineid,
            stageid: task.stageid,
            elementid: task.elementid,
            status: task.status
          });
        }
        resolveMessage(message, result);
        break;
      }

      case EXECUTIONMESSAGETYPES.GET_TASK_STATUS: {
        const task = tasks.get(message.taskid);
        if (!task) {
          resolveMessage(message, null);
        } else {
          resolveMessage(message, {
            taskid: task.taskid,
            kind: task.kind,
            pipelineid: task.pipelineid,
            stageid: task.stageid,
            elementid: task.elementid,
            status: task.status
          });
        }
        break;
      }

      case EXECUTIONMESSAGETYPES.CANCEL_TASK: {
        cancelTask(message.taskid);
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.STOP_TASK: {
        stopTask(message.taskid);
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.SPAWN_PIPELINE: {
        const task = makeTask({
          kind: 'spawn',
          pipelineid: message.childPipelineId,
          stageid: null,
          elementid: null
        });
        tasks.set(task.taskid, task);
        runSpawnTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      default:
        rejectMessage(message, new Error('[EXECUTIONACTOR] unknown message type'));
        return state;
    }
  } catch (err) {
    rejectMessage(message, err);
    return state;
  }

  if (
    message.type !== EXECUTIONMESSAGETYPES.GET_STATUS &&
    message.type !== EXECUTIONMESSAGETYPES.RECOVER &&
    message.type !== EXECUTIONMESSAGETYPES.AWAIT_TASK &&
    message.type !== EXECUTIONMESSAGETYPES.GET_TASKS &&
    message.type !== EXECUTIONMESSAGETYPES.GET_TASK_STATUS
  ) {
    persistState(nextState);
  }

  return nextState;
};

const initialState = await loadInitialState();
export const EXECUTIONACTOR = createactor(executionbehavior, initialState);

export const enqueueExecutionPipelineLoaded = (pipelineid, env) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.PIPELINE_LOADED,
      pipelineid,
      env,
      resolve,
      reject
    })
  );

export const enqueueExecutionStageState = (pipelineid, stageid, state) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.STAGE_STATE,
      pipelineid,
      stageid,
      state,
      resolve,
      reject
    })
  );

export const enqueueExecutionSubmit = (descriptor) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT,
      ...descriptor,
      resolve,
      reject
    })
  );

export const enqueueExecutionSubmitStage = (descriptor) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.EXECUTE_STAGE,
      ...descriptor,
      resolve,
      reject
    })
  );

export const enqueueExecutionAwaitTask = (taskid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.AWAIT_TASK,
      taskid,
      resolve,
      reject
    })
  );

export const enqueueExecutionGetTasks = (filters = {}) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.GET_TASKS,
      ...filters,
      resolve,
      reject
    })
  );

export const enqueueExecutionGetTaskStatus = (taskid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.GET_TASK_STATUS,
      taskid,
      resolve,
      reject
    })
  );

export const enqueueExecutionCancelTask = (taskid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CANCEL_TASK,
      taskid,
      resolve,
      reject
    })
  );

export const enqueueExecutionStopTask = (taskid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.STOP_TASK,
      taskid,
      resolve,
      reject
    })
  );

export const enqueueExecutionEnvUpdated = (pipelineid, env) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.ENV_UPDATED,
      pipelineid,
      env,
      resolve,
      reject
    })
  );

export const enqueueExecutionSnapshot = () =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.SNAPSHOT,
      resolve,
      reject
    })
  );

export const enqueueExecutionRecover = (pipelineid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.RECOVER,
      pipelineid,
      resolve,
      reject
    })
  );

export const enqueueExecutionStopStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.STOP_STAGE,
      pipelineid,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionCancelStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CANCEL_STAGE,
      pipelineid,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionBreakStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.BREAK_STAGE,
      pipelineid,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionRestartStage = (pipelineid, stageid, elementid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.RESTART_STAGE,
      pipelineid,
      stageid,
      elementid,
      resolve,
      reject
    })
  );

export const enqueueExecutionContinueStage = (pipelineid, stageid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CONTINUE_STAGE,
      pipelineid,
      stageid,
      resolve,
      reject
    })
  );

export const enqueueExecutionGetStatus = (pipelineid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.GET_STATUS,
      pipelineid,
      resolve,
      reject
    })
  );

export const enqueueExecutionSpawnPipeline = (descriptor) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.SPAWN_PIPELINE,
      ...descriptor,
      resolve,
      reject
    })
  );
