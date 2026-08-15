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
  GET_INTERRUPTED_STAGE: 'get_interrupted_stage',
  CCC_ABORT: 'ccc_abort',
  CCC_CONTINUE: 'ccc_continue',
  CCC_RETRY: 'ccc_retry',
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
    pipelineid: 'string', path: 'array', elementid: 'string',
    env: 'object', signature: 'object', executor: 'function',
    properties: 'object?', async: 'boolean?', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.ELEMENT_STATE]: {
    pipelineid: 'string', path: 'array', elementid: 'string',
    state: 'object', resolve: 'function?', reject: 'function?'
  },
  [EXECUTIONMESSAGETYPES.EXECUTE_STAGE]: {
    pipelineid: 'string', path: 'array', stageid: 'string',
    stageExecutor: 'function', env: 'object', parentTaskid: 'string?',
    resolve: 'function?', reject: 'function?'
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
  [EXECUTIONMESSAGETYPES.GET_INTERRUPTED_STAGE]: {
    pipelineid: 'string', resolve: 'function?', reject: 'function?'
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
  [EXECUTIONMESSAGETYPES.SPAWN_PIPELINE]: {
    parentPipelineId: 'string', childPipelineId: 'string', childRunner: 'function',
    childEnv: 'object', containerref: 'string?', resolve: 'function?', reject: 'function?'
  }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);
const DB_KEY = 'global:executionstate';
const STATE_VERSION = 2;

const resolveMessage = (message, value = true) => {
  if (message && typeof message.resolve === 'function') message.resolve(value);
};

const rejectMessage = (message, error) => {
  if (message && typeof message.reject === 'function') message.reject(error);
};

const newElementNode = (id, status = 'WAITING') => ({
  type: 'element',
  id,
  status,
  savedAt: Date.now(),
  startedAt: null,
  completedAt: null,
  outputs: null,
  handledByCcc: false
});

const newStageNode = (id, status = 'awaiting') => ({
  type: 'stage',
  id,
  status,
  children: []
});

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
    pipeline.stages[stageid] = newStageNode(stageid);
  }
  return pipeline.stages[stageid];
};

const ensureChildStage = (parentStage, stageid) => {
  let child = (parentStage.children || []).find(ch => ch.type === 'stage' && ch.id === stageid);
  if (!child) {
    child = newStageNode(stageid);
    parentStage.children.push(child);
  }
  return child;
};

const ensureChildElement = (stage, elementid) => {
  let child = (stage.children || []).find(ch => ch.type === 'element' && ch.id === elementid);
  if (!child) {
    child = newElementNode(elementid);
    stage.children.push(child);
  }
  return child;
};

const getStageByPath = (pipeline, path) => {
  if (!path || path.length === 0) return null;
  const topId = path[0];
  let stage = pipeline.stages[topId];
  if (!stage) return null;

  let idx = 1;
  while (idx < path.length) {
    const id = path[idx];
    const child = (stage.children || []).find(ch => ch.id === id);

    if (!child || child.type !== 'stage') return null;

    stage = child;
    idx += 1;
  }

  return stage;
};

const getNodeByPath = (pipeline, path) => {
  if (!path || path.length === 0) return null;
  const topId = path[0];
  let stage = pipeline.stages[topId];
  if (!stage) return null;

  let idx = 1;
  while (idx < path.length) {
    const id = path[idx];
    const child = (stage.children || []).find(ch => ch.id === id);

    if (!child) return null;

    if (idx === path.length - 1) {
      return child;
    }

    if (child.type !== 'stage') return null;

    stage = child;
    idx += 1;
  }

  return stage;
};

const sanitizeForState = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'function') return '[Function]';

  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return '[DOM_NODE]';
  if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM_NODE]';
  if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) return '[EventTarget]';

  if (typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForState(item, seen));
  }

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'continuation') continue;
    out[key] = sanitizeForState(item, seen);
  }
  seen.delete(value);
  return out;
};

const isStageComplete = (stage) => {
  if (!stage || stage.type !== 'stage') return false;
  if (stage.status === 'executed') return true;

  return (stage.children || []).every(child => {
    if (child.type === 'element') {
      if (child.status === 'EXECUTED') return true;
      if (child.status === 'FAILED' && child.handledByCcc === true) return true;
      return false;
    }

    if (child.type === 'stage') {
      return isStageComplete(child);
    }

    return false;
  });
};

const pruneCompletedTopLevelStages = (pipeline) => {
  if (!pipeline || !pipeline.stages) return;

  for (const [stageid, stage] of Object.entries(pipeline.stages)) {
    if (stage.status === 'executed' || stage.status === 'cancelled') {
      delete pipeline.stages[stageid];
    }
  }
};

const persistState = async (state) => {
  try {
    const stateToStore = {
      version: STATE_VERSION,
      pipelines: { ...state.pipelines },
      snapshot: state.snapshot
    };

    for (const pipeline of Object.values(stateToStore.pipelines)) {
      pruneCompletedTopLevelStages(pipeline);
    }

    const result = await enqueueDbStore(DB_KEY, {
      version: STATE_VERSION,
      pipelines: stateToStore.pipelines,
      snapshot: stateToStore.snapshot
    });

    if (result === false) {
      console.warn('[EXECUTIONACTOR] persist returned false');
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] persist failed:', err);
  }
};

const loadInitialState = async () => {
  try {
    const stored = await enqueueDbRestore(DB_KEY);
    if (stored && stored.version === STATE_VERSION && stored.pipelines) {
      return {
        version: STATE_VERSION,
        pipelines: stored.pipelines || {},
        snapshot: stored.snapshot || { lastSavedAt: null }
      };
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] load initial state failed:', err);
  }
  return {
    version: STATE_VERSION,
    pipelines: {},
    snapshot: { lastSavedAt: null }
  };
};

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
    parentTaskid: descriptor.parentTaskid || null,
    childTaskIds: [],
    status: 'WAITING',
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
      path: descriptor.path,
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
    const safeResult = sanitizeForState(result);

    await EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.ELEMENT_STATE,
      pipelineid: descriptor.pipelineid,
      path: descriptor.path,
      elementid: descriptor.elementid,
      state: {
        status: 'EXECUTED',
        completedAt: Date.now(),
        outputs: safeResult
      }
    });

    task.status = 'EXECUTED';
    task.resolveTask(result || {});
  } catch (err) {
    try {
      await EXECUTIONACTOR.send({
        type: EXECUTIONMESSAGETYPES.ELEMENT_STATE,
        pipelineid: descriptor.pipelineid,
        path: descriptor.path,
        elementid: descriptor.elementid,
        state: {
          status: 'FAILED',
          completedAt: Date.now(),
          outputs: null
        }
      });
    } catch (persistError) {
      console.warn('[EXECUTIONACTOR] failed to persist failed state:', persistError);
    }
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

const scanInterruptedPath = (stage, path) => {
  if (!stage || !Array.isArray(stage.children)) return null;

  for (const child of stage.children) {
    const childPath = [...path, child.id];

    if (child.type === 'element') {
      if (child.status !== 'EXECUTED') {
        return childPath;
      }
    }

    if (child.type === 'stage') {
      const subpath = scanInterruptedPath(child, childPath);
      if (subpath) return subpath;
    }
  }

  return null;
};

const executionbehavior = (state, message) => {
  const check = validatemessage(message);
  if (!check.valid) {
    rejectMessage(message, new Error('[EXECUTIONACTOR:INVALID] ' + check.error));
    return state;
  }

  const nextState = {
    version: STATE_VERSION,
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
        let stage = ensureStage(pipeline, message.stageid);

        if (message.state && typeof message.state === 'object') {
          if (message.state.status) stage.status = message.state.status;

          if (Array.isArray(message.state.children)) {
            stage.children = message.state.children.map(child => {
              if (child.type === 'element') {
                return {
                  type: 'element',
                  id: child.id,
                  status: child.status || 'WAITING',
                  savedAt: child.savedAt || Date.now(),
                  startedAt: child.startedAt || null,
                  completedAt: child.completedAt || null,
                  outputs: child.outputs || null,
                  handledByCcc: child.handledByCcc || false
                };
              }

              if (child.type === 'stage') {
                return newStageNode(child.id, child.status || 'awaiting');
              }

              return child;
            });
          }
        }
        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const elementid = message.elementid;
        const parentPath = path.slice(0, -1);
        const stage = getStageByPath(pipeline, parentPath);

        if (!stage) {
          rejectMessage(message, new Error('[EXECUTIONACTOR] invalid element path'));
          return state;
        }

        const child = ensureChildElement(stage, elementid);
        child.status = 'WAITING';
        child.savedAt = Date.now();
        child.startedAt = null;
        child.completedAt = null;
        child.outputs = null;
        child.handledByCcc = false;

        const task = makeTask({
          kind: 'element',
          pipelineid: message.pipelineid,
          stageid: path[path.length - 2] || null,
          elementid
        });
        tasks.set(task.taskid, task);

        runElementTask(task.taskid, message);
        resolveMessage(message, { taskid: task.taskid });
        break;
      }

      case EXECUTIONMESSAGETYPES.ELEMENT_STATE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const elementid = message.elementid;
        const parentPath = path.slice(0, -1);
        const stage = getStageByPath(pipeline, parentPath);

        if (!stage) {
          rejectMessage(message, new Error('[EXECUTIONACTOR] invalid element path'));
          return state;
        }

        const child = ensureChildElement(stage, elementid);

        child.status = message.state.status || child.status;
        child.savedAt = message.state.savedAt || Date.now();
        child.startedAt = message.state.startedAt || child.startedAt || null;
        child.completedAt = message.state.completedAt || child.completedAt || null;
        child.outputs = message.state.outputs !== undefined ? message.state.outputs : child.outputs;

        if (message.state.handledByCcc !== undefined) {
          child.handledByCcc = message.state.handledByCcc;
        }

        if (isStageComplete(stage)) {
          stage.status = 'executed';
        }

        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.EXECUTE_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const parentPath = path.slice(0, -1);
        const stageid = message.stageid || path[path.length - 1];

        let stage;
        if (path.length <= 1) {
          stage = ensureStage(pipeline, stageid);
        } else {
          const parentStage = getStageByPath(pipeline, parentPath);
          if (!parentStage) {
            rejectMessage(message, new Error('[EXECUTIONACTOR] invalid stage path'));
            return state;
          }
          stage = ensureChildStage(parentStage, stageid);
        }

        stage.status = 'running';

        const task = makeTask({
          kind: 'stage',
          pipelineid: message.pipelineid,
          stageid,
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

      case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        pipeline.env = sanitizeForState(message.env || {});
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

      case EXECUTIONMESSAGETYPES.STOP_STAGE:
      case EXECUTIONMESSAGETYPES.CANCEL_STAGE:
      case EXECUTIONMESSAGETYPES.BREAK_STAGE:
      case EXECUTIONMESSAGETYPES.RESTART_STAGE:
      case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const stage = ensureStage(pipeline, message.stageid);

        if (message.type === EXECUTIONMESSAGETYPES.STOP_STAGE) stage.status = 'stopped';
        else if (message.type === EXECUTIONMESSAGETYPES.CANCEL_STAGE) stage.status = 'cancelled';
        else if (message.type === EXECUTIONMESSAGETYPES.BREAK_STAGE) stage.status = 'awaiting';
        else if (message.type === EXECUTIONMESSAGETYPES.RESTART_STAGE) {
          stage.status = 'running';
          if (message.elementid) {
            const element = ensureChildElement(stage, message.elementid);
            element.status = 'RUNNING';
            element.savedAt = Date.now();
            element.startedAt = Date.now();
            element.completedAt = null;
            element.outputs = null;
            element.handledByCcc = false;
          }
        } else if (message.type === EXECUTIONMESSAGETYPES.CONTINUE_STAGE) {
          if (stage.status === 'stopped' || stage.status === 'awaiting') stage.status = 'running';
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
            parentTaskid: task.parentTaskid,
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
            parentTaskid: task.parentTaskid,
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

      case EXECUTIONMESSAGETYPES.GET_INTERRUPTED_STAGE: {
        const pipeline = nextState.pipelines[message.pipelineid];
        let result = null;

        if (pipeline && pipeline.stages) {
          for (const [topStageId, topStage] of Object.entries(pipeline.stages)) {
            const path = scanInterruptedPath(topStage, [topStageId]);
            if (path) {
              const node = getNodeByPath(pipeline, path);
              result = {
                path,
                env: pipeline.env || null,
                status: node ? node.status : null
              };
              break;
            }
          }
        }

        resolveMessage(message, result);
        break;
      }

      case EXECUTIONMESSAGETYPES.CCC_ABORT: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const topStageId = path[0];

        if (topStageId && pipeline.stages[topStageId]) {
          const node = getNodeByPath(pipeline, path);
          if (node && node.type === 'element') {
            node.status = 'FAILED';
            node.completedAt = Date.now();
            node.handledByCcc = true;
          }
          pipeline.stages[topStageId].status = 'cancelled';
        }

        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.CCC_CONTINUE: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const node = getNodeByPath(pipeline, path);

        if (node && node.type === 'element') {
          node.status = 'FAILED';
          node.completedAt = Date.now();
          node.handledByCcc = true;
        }

        resolveMessage(message, true);
        break;
      }

      case EXECUTIONMESSAGETYPES.CCC_RETRY: {
        const pipeline = ensurePipeline(nextState, message.pipelineid);
        const path = [...(message.path || [])];
        const node = getNodeByPath(pipeline, path);

        if (node && node.type === 'element') {
          node.status = 'RUNNING';
          node.startedAt = Date.now();
          node.completedAt = null;
          node.outputs = null;
          node.handledByCcc = false;
        }

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
    message.type !== EXECUTIONMESSAGETYPES.GET_TASK_STATUS &&
    message.type !== EXECUTIONMESSAGETYPES.GET_INTERRUPTED_STAGE
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

export const enqueueExecutionGetInterruptedStage = (pipelineid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.GET_INTERRUPTED_STAGE,
      pipelineid,
      resolve,
      reject
    })
  );

export const enqueueExecutionCccAbort = (pipelineid, path, elementid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CCC_ABORT,
      pipelineid,
      path,
      elementid,
      resolve,
      reject
    })
  );

export const enqueueExecutionCccContinue = (pipelineid, path, elementid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CCC_CONTINUE,
      pipelineid,
      path,
      elementid,
      resolve,
      reject
    })
  );

export const enqueueExecutionCccRetry = (pipelineid, path, elementid) =>
  new Promise((resolve, reject) =>
    EXECUTIONACTOR.send({
      type: EXECUTIONMESSAGETYPES.CCC_RETRY,
      pipelineid,
      path,
      elementid,
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
