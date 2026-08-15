import { createactor, createMessageValidator } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore } from './dbactor.js';

// -- Message Types --
// Lean set: Task Runner + Global Snapshot + Pipeline Registry
export const EXECUTIONMESSAGETYPES = Object.freeze({
  // Pipeline lifecycle
  PIPELINE_LOADED: 'pipeline_loaded',
  STAGE_STATE: 'stage_state',
  ENV_UPDATED: 'env_updated',
  GET_STATUS: 'get_status',

  // Task runner (kept: blockcompiler uses these to execute elements/stages)
  EXECUTE_ELEMENT: 'execute_element',
  EXECUTE_STAGE: 'execute_stage',
  AWAIT_TASK: 'await_task',
  GET_TASKS: 'get_tasks',
  GET_TASK_STATUS: 'get_task_status',
  CANCEL_TASK: 'cancel_task',
  STOP_TASK: 'stop_task',
  SPAWN_PIPELINE: 'spawn_pipeline',

  // Stage control (kept: blockcompiler executionquery block uses these)
  STOP_STAGE: 'stop_stage',
  CANCEL_STAGE: 'cancel_stage',
  BREAK_STAGE: 'break_stage',
  RESTART_STAGE: 'restart_stage',
  CONTINUE_STAGE: 'continue_stage',

  // CCC error handling (kept: blockcompiler uses these)
  CCC_ABORT: 'ccc_abort',
  CCC_CONTINUE: 'ccc_continue',
  CCC_RETRY: 'ccc_retry',

  // Global Snapshot (NEW)
  GLOBAL_SNAPSHOT: 'global_snapshot',
  RECOVER: 'recover',

  // Pipeline registration for Global Snapshot (NEW)
  REGISTER_PIPELINE: 'register_pipeline'
});

const MESSAGEINTERFACES = Object.freeze({
  [EXECUTIONMESSAGETYPES.PIPELINE_LOADED]: {
    pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.STAGE_STATE]: {
    pipelineid: 'string', stageid: 'string', state: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.ENV_UPDATED]: {
    pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GET_STATUS]: {
    pipelineid: 'string?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT]: {
    pipelineid: 'string', path: 'array', elementid: 'string',
    env: 'object', signature: 'object', executor: 'function',
    properties: 'object?', async: 'boolean?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.EXECUTE_STAGE]: {
    pipelineid: 'string', path: 'array', stageid: 'string',
    stageExecutor: 'function', env: 'object', parentTaskid: 'string?',
    resolve: 'function?', reject: 'function?'
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
  [EXECUTIONMESSAGETYPES.CCC_ABORT]: {
    pipelineid: 'string', path: 'array', elementid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CCC_CONTINUE]: {
    pipelineid: 'string', path: 'array', elementid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.CCC_RETRY]: {
    pipelineid: 'string', path: 'array', elementid: 'string', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.GLOBAL_SNAPSHOT]: {
    html: 'string?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.RECOVER]: {
    resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.REGISTER_PIPELINE]: {
    pipelineid: 'string', dnaRef: 'string?', env: 'object?', resolve: 'function?', reject: 'function?'
  }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);
const DB_KEY = 'GLOBAL_SNAPSHOT_V1';

const resolveMessage = (message, value = true) => {
  if (message && typeof message.resolve === 'function') message.resolve(value);
};

const rejectMessage = (message, error) => {
  if (message && typeof message.reject === 'function') message.reject(error);
};

// -- Sanitizer (strip DOM/functions for DB persistence) --
const sanitizeForState = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return '[DOM_NODE]';
  if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM_NODE]';
  if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) return '[EventTarget]';
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitizeForState(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = sanitizeForState(item, seen);
  }
  seen.delete(value);
  return out;
};

// -- Global Snapshot Persistence --
const persistGlobalSnapshot = async (state) => {
  try {
    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      pipelines: {},
      htmlSnapshot: state.htmlSnapshot || null
    };

    for (const [pid, pdata] of Object.entries(state.pipelines)) {
      snapshot.pipelines[pid] = {
        status: pdata.status,
        env: sanitizeForState(pdata.env || {}),
        dnaRef: pdata.dnaRef || pid,
        stageStatuses: pdata.stageStatuses || {}
      };
    }

    await enqueueDbStore(DB_KEY, snapshot);
  } catch (err) {
    console.warn('[EXECUTIONACTOR] global snapshot persist failed:', err);
  }
};

const loadInitialState = async () => {
  try {
    const stored = await enqueueDbRestore(DB_KEY);
    if (stored && stored.version === 1 && stored.pipelines) {
      return {
        pipelines: stored.pipelines || {},
        htmlSnapshot: stored.htmlSnapshot || null
      };
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] load initial state failed:', err);
  }
  return { pipelines: {}, htmlSnapshot: null };
};

// -- Task Runner --
const tasks = new Map();
let taskCounter = 0;

const nextTaskId = () => {
  taskCounter += 1;
  return 'task_' + Date.now() + '_' + taskCounter + '_' + Math.random().toString(36).slice(2, 8);
};

const makeTask = (descriptor) => {
  let resolveTask, rejectTask;
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
    parentTaskid: descriptor.parentTaskid || null,
    childTaskIds: [],
    status: 'WAITING',
    resolveTask, rejectTask, promise
  };
};

const runElementTask = async (taskid, descriptor) => {
  const task = tasks.get(taskid);
  if (!task) return;
  try {
    task.status = 'RUNNING';
    const executionContext = {
      env: descriptor.env,
      inputs: descriptor.signature?.inputs || [],
      outputs: descriptor.signature?.outputs || {},
      properties: descriptor.properties || {}
    };
    const result = await descriptor.executor(executionContext);
    task.status = 'EXECUTED';
    task.resolveTask(result || {});
  } catch (err) {
    task.status = 'FAILED';
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
    task.status = 'FAILED';
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
    task.status = 'FAILED';
    task.rejectTask(err);
  }
};

const cancelTask = (taskid) => {
  const task = tasks.get(taskid);
  if (!task) return;
  task.status = 'CANCELLED';
  for (const childId of task.childTaskIds || []) cancelTask(childId);
  if (task.rejectTask) task.rejectTask(new Error('Task cancelled: ' + taskid));
};

const stopTask = (taskid) => {
  const task = tasks.get(taskid);
  if (!task) return;
  task.status = 'STOPPED';
};

// -- Ensure Pipeline (simple) --
const ensurePipeline = (state, pipelineid) => {
  if (!state.pipelines[pipelineid]) {
    state.pipelines[pipelineid] = {
      status: 'running', env: {}, dnaRef: null, stageStatuses: {}
    };
  }
  return state.pipelines[pipelineid];
};

// -- Behavior (State Reducer) --
const executionbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    rejectMessage(message, new Error('[EXECUTIONACTOR:INVALID] ' + check.error));
    return state;
  }

  const nextState = {
    pipelines: { ...state.pipelines },
    htmlSnapshot: state.htmlSnapshot
  };

  try {
    switch (message.type) {

      // -- Pipeline Lifecycle --
      case EXECUTIONMESSAGETYPES.PIPELINE_LOADED: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
        pipeline.status = 'running';
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.STAGE_STATE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        if (message.state && message.state.status) {
          pipeline.stageStatuses[message.stageid] = message.state.status;
        }
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        pipeline.env = sanitizeForState(message.env || {});
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.GET_STATUS: {
        if (message.pipelineid) {
          const p = nextState.pipelines[message.pipelineid] || null;
          if (p && p.stageStatuses) {
            const stages = {};
            for (const [sid, status] of Object.entries(p.stageStatuses)) {
              stages[sid] = { status };
            }
            resolveMessage(message, { ...p, stages });
          } else {
            resolveMessage(message, p);
          }
        } else {
          resolveMessage(message, nextState.pipelines);
        }
        break;
      }

      // -- Stage Control --
      case EXECUTIONMESSAGETYPES.STOP_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        pipeline.stageStatuses[message.stageid] = 'stopped';
        resolveMessage(message, true);
        break;
      }
      case EXECUTIONMESSAGETYPES.CANCEL_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        pipeline.stageStatuses[message.stageid] = 'cancelled';
        resolveMessage(message, true);
        break;
      }
      case EXECUTIONMESSAGETYPES.BREAK_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        pipeline.stageStatuses[message.stageid] = 'awaiting';
        resolveMessage(message, true);
        break;
      }
      case EXECUTIONMESSAGETYPES.RESTART_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        pipeline.stageStatuses[message.stageid] = 'running';
        resolveMessage(message, true);
        break;
      }
      case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (!pipeline.stageStatuses) pipeline.stageStatuses = {};
        const current = pipeline.stageStatuses[message.stageid];
        if (current === 'stopped' || current === 'awaiting') {
          pipeline.stageStatuses[message.stageid] = 'running';
        }
        resolveMessage(message, true);
        break;
      }

      // -- Task Runner --
      case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
        const task = makeTask({
          kind: 'element',
          pipelineid: message.pipelineid,
          stageid: message.path?.[message.path.length - 2] || null,
          elementid: message.elementid
        });
        tasks.set(task.taskid, task);
        runElementTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      case EXECUTIONMESSAGETYPES.EXECUTE_STAGE: {
        const task = makeTask({
          kind: 'stage',
          pipelineid: message.pipelineid,
          stageid: message.stageid,
          parentTaskid: message.parentTaskid || null
        });
        if (message.parentTaskid) {
          const parentTask = tasks.get(message.parentTaskid);
          if (parentTask) parentTask.childTaskIds.push(task.taskid);
        }
        tasks.set(task.taskid, task);
        runStageTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
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
            taskid: task.taskid, kind: task.kind,
            pipelineid: task.pipelineid, stageid: task.stageid,
            elementid: task.elementid, parentTaskid: task.parentTaskid,
            status: task.status
          });
        }
        resolveMessage(message, result);
        break;
      }

      case EXECUTIONMESSAGETYPES.GET_TASK_STATUS: {
        const task = tasks.get(message.taskid);
        resolveMessage(message, task ? {
          taskid: task.taskid, kind: task.kind,
          pipelineid: task.pipelineid, stageid: task.stageid,
          elementid: task.elementid, parentTaskid: task.parentTaskid,
          status: task.status
        } : null);
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
          stageid: null, elementid: null
        });
        tasks.set(task.taskid, task);
        runSpawnTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      // -- CCC Error Handling (simplified: just resolve, no tree walking) --
      case EXECUTIONMESSAGETYPES.CCC_ABORT:
      case EXECUTIONMESSAGETYPES.CCC_CONTINUE:
      case EXECUTIONMESSAGETYPES.CCC_RETRY: {
        resolveMessage(message, true);
        break;
      }

      // -- Global Snapshot (NEW) --
      case EXECUTIONMESSAGETYPES.GLOBAL_SNAPSHOT: {
        if (message.html !== undefined) {
          nextState.htmlSnapshot = message.html;
        }
        persistGlobalSnapshot(nextState);
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.RECOVER: {
        resolveMessage(message, {
          pipelines: nextState.pipelines,
          htmlSnapshot: nextState.htmlSnapshot
        });
        break;
      }

      case EXECUTIONMESSAGETYPES.REGISTER_PIPELINE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        if (message.dnaRef) pipeline.dnaRef = message.dnaRef;
        if (message.env) pipeline.env = sanitizeForState(message.env);
        resolveMessage(message, true);
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

  const readOnly = [
    EXECUTIONMESSAGETYPES.GET_STATUS,
    EXECUTIONMESSAGETYPES.RECOVER,
    EXECUTIONMESSAGETYPES.AWAIT_TASK,
    EXECUTIONMESSAGETYPES.GET_TASKS,
    EXECUTIONMESSAGETYPES.GET_TASK_STATUS
  ];
  if (!readOnly.includes(message.type) && message.type !== EXECUTIONMESSAGETYPES.GLOBAL_SNAPSHOT) {
    persistGlobalSnapshot(nextState);
  }

  return nextState;
};

// -- Boot --
const initialState = await loadInitialState();
export const EXECUTIONACTOR = createactor(executionbehavior, initialState);

// -- Public Enqueue Functions --
const enqueue = (type, payload = {}) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({ type, ...payload, resolve, reject })
  );

export const enqueueExecutionPipelineLoaded = (pipelineid, env) =>
  enqueue(EXECUTIONMESSAGETYPES.PIPELINE_LOADED, { pipelineid, env });

export const enqueueExecutionStageState = (pipelineid, stageid, state) =>
  enqueue(EXECUTIONMESSAGETYPES.STAGE_STATE, { pipelineid, stageid, state });

export const enqueueExecutionSubmit = (descriptor) =>
  enqueue(EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT, descriptor);

export const enqueueExecutionSubmitStage = (descriptor) =>
  enqueue(EXECUTIONMESSAGETYPES.EXECUTE_STAGE, descriptor);

export const enqueueExecutionAwaitTask = (taskid) =>
  enqueue(EXECUTIONMESSAGETYPES.AWAIT_TASK, { taskid });

export const enqueueExecutionGetTasks = (filters = {}) =>
  enqueue(EXECUTIONMESSAGETYPES.GET_TASKS, filters);

export const enqueueExecutionGetTaskStatus = (taskid) =>
  enqueue(EXECUTIONMESSAGETYPES.GET_TASK_STATUS, { taskid });

export const enqueueExecutionCancelTask = (taskid) =>
  enqueue(EXECUTIONMESSAGETYPES.CANCEL_TASK, { taskid });

export const enqueueExecutionStopTask = (taskid) =>
  enqueue(EXECUTIONMESSAGETYPES.STOP_TASK, { taskid });

export const enqueueExecutionStopStage = (pipelineid, stageid) =>
  enqueue(EXECUTIONMESSAGETYPES.STOP_STAGE, { pipelineid, stageid });

export const enqueueExecutionCancelStage = (pipelineid, stageid) =>
  enqueue(EXECUTIONMESSAGETYPES.CANCEL_STAGE, { pipelineid, stageid });

export const enqueueExecutionBreakStage = (pipelineid, stageid) =>
  enqueue(EXECUTIONMESSAGETYPES.BREAK_STAGE, { pipelineid, stageid });

export const enqueueExecutionRestartStage = (pipelineid, stageid, elementid) =>
  enqueue(EXECUTIONMESSAGETYPES.RESTART_STAGE, { pipelineid, stageid, elementid });

export const enqueueExecutionContinueStage = (pipelineid, stageid) =>
  enqueue(EXECUTIONMESSAGETYPES.CONTINUE_STAGE, { pipelineid, stageid });

export const enqueueExecutionGetStatus = (pipelineid) =>
  enqueue(EXECUTIONMESSAGETYPES.GET_STATUS, { pipelineid });

export const enqueueExecutionEnvUpdated = (pipelineid, env) =>
  enqueue(EXECUTIONMESSAGETYPES.ENV_UPDATED, { pipelineid, env });

export const enqueueExecutionSnapshot = () =>
  enqueue(EXECUTIONMESSAGETYPES.GLOBAL_SNAPSHOT, {});

export const enqueueExecutionRecover = () =>
  enqueue(EXECUTIONMESSAGETYPES.RECOVER, {});

export const enqueueExecutionCccAbort = (pipelineid, path, elementid) =>
  enqueue(EXECUTIONMESSAGETYPES.CCC_ABORT, { pipelineid, path, elementid });

export const enqueueExecutionCccContinue = (pipelineid, path, elementid) =>
  enqueue(EXECUTIONMESSAGETYPES.CCC_CONTINUE, { pipelineid, path, elementid });

export const enqueueExecutionCccRetry = (pipelineid, path, elementid) =>
  enqueue(EXECUTIONMESSAGETYPES.CCC_RETRY, { pipelineid, path, elementid });

export const enqueueExecutionSpawnPipeline = (descriptor) =>
  enqueue(EXECUTIONMESSAGETYPES.SPAWN_PIPELINE, descriptor);

// Removed exports (no longer needed):
// enqueueExecutionGetInterruptedStage - Global Snapshot replaces this
export const enqueueExecutionGetInterruptedStage = () =>
  Promise.resolve(null);

// NEW: Register a pipeline's DNA reference and env for Global Snapshot recovery
export const enqueueExecutionRegisterPipeline = (pipelineid, dnaRef, env) =>
  enqueue(EXECUTIONMESSAGETYPES.REGISTER_PIPELINE, { pipelineid, dnaRef, env });

// NEW: Take a global snapshot (with optional HTML)
export const enqueueGlobalSnapshot = (html) =>
enqueue(EXECUTIONMESSAGETYPES.GLOBAL_SNAPSHOT, { html });
