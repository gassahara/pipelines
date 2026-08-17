import { createactor } from './actorkernel.js';
import {
  enqueueDbStore,
  enqueueDbRestore,
  serializeDna,
  deserializeDna,
  consolidateGraph,
  restoreGraph,
  serializePairStore,
  deserializePairStore
} from './dbactor.js';

var EXECUTIONMESSAGETYPES = Object.freeze({
  PIPELINE_LOADED: 'pipeline_loaded',
  STAGE_STATE: 'stage_state',
  ENV_UPDATED: 'env_updated',
  GET_STATUS: 'get_status',
  EXECUTE_ELEMENT: 'execute_element',
  EXECUTE_STAGE: 'execute_stage',
  AWAIT_TASK: 'await_task',
  GET_TASKS: 'get_tasks',
  GET_TASK_STATUS: 'get_task_status',
  CANCEL_TASK: 'cancel_task',
  STOP_TASK: 'stop_task',
  SPAWN_PIPELINE: 'spawn_pipeline',
  STOP_STAGE: 'stop_stage',
  CANCEL_STAGE: 'cancel_stage',
  BREAK_STAGE: 'break_stage',
  RESTART_STAGE: 'restart_stage',
  CONTINUE_STAGE: 'continue_stage',
  CCC_ABORT: 'ccc_abort',
  CCC_CONTINUE: 'ccc_continue',
  CCC_RETRY: 'ccc_retry',
  TASK_SETTLED: 'task_settled',
  RECOVER: 'recover',
  REGISTER_PIPELINE: 'register_pipeline'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.PIPELINE_LOADED] = { pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STAGE_STATE] = { pipelineid: 'string', stageid: 'string', state: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.ENV_UPDATED] = { pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_STATUS] = { pipelineid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT] = { pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object', executor: 'function', properties: 'object?', async: 'boolean?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.EXECUTE_STAGE] = { pipelineid: 'string', path: 'array', stageid: 'string', stageExecutor: 'function', env: 'object', parentTaskid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.AWAIT_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASKS] = { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASK_STATUS] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CANCEL_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STOP_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.SPAWN_PIPELINE] = { parentPipelineId: 'string', childPipelineId: 'string', childRunner: 'function', childEnv: 'object', containerref: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STOP_STAGE] = { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CANCEL_STAGE] = { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.BREAK_STAGE] = { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.RESTART_STAGE] = { pipelineid: 'string', stageid: 'string', elementid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CONTINUE_STAGE] = { pipelineid: 'string', stageid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_ABORT] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_CONTINUE] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_RETRY] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.TASK_SETTLED] = { taskid: 'string', status: 'string', result: 'any', error: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.RECOVER] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.REGISTER_PIPELINE] = { pipelineid: 'string', dna: 'object?', env: 'object?', resolve: 'function?', reject: 'function?' };
Object.freeze(MESSAGEINTERFACES);

function resolveMessage(message, value) {
  if (value === undefined) value = true;
  if (message && typeof message.resolve === 'function') message.resolve(value);
}

function rejectMessage(message, error) {
  if (message && typeof message.reject === 'function') message.reject(error);
}

function sanitizeForState(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return '[DOM_NODE]';
  if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM_NODE]';
  if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) return '[EventTarget]';
  if (typeof value !== 'object') return value;
  if (seen === undefined) seen = [];
  if (seen.indexOf(value) !== -1) return '[Circular]';
  seen.push(value);
  if (Array.isArray(value)) {
    var arr = value.map(function(item) { return sanitizeForState(item, seen); });
    seen.pop();
    return arr;
  }
  var out = {};
  Object.keys(value).forEach(function(key) {
    out[key] = sanitizeForState(value[key], seen);
  });
  seen.pop();
  return out;
}

function createInitialExecutionWorldmap() {
  return {
    pipelines: {},
    tasks: {},
    stageStatuses: {},
    htmlSnapshot: null
  };
}

function persistExecutionWorldmap(state) {
  enqueueDbStore('actor:state:execution', state.worldmap).catch(function(e) {
    console.warn('[EXECUTIONACTOR] state persist failed:', e);
  });
}

async function loadInitialState() {
  try {
    var saved = await enqueueDbRestore('actor:state:execution');
    if (saved) {
      return {
        pipelines: saved.pipelines || {},
        htmlSnapshot: saved.htmlSnapshot || null,
        tasks: saved.tasks || {},
        taskCounter: saved.taskCounter || 0,
        worldmap: saved,
        debugState: { currentContinuation: null }
      };
    }
  } catch (err) {
    console.warn('[EXECUTIONACTOR] state restore failed:', err);
  }
  return {
    pipelines: {},
    htmlSnapshot: null,
    tasks: {},
    taskCounter: 0,
    worldmap: createInitialExecutionWorldmap(),
    debugState: { currentContinuation: null }
  };
}

var initialState = await loadInitialState();
var EXECUTIONACTOR = createactor(executionbehavior, initialState, MESSAGEINTERFACES);

function nextTaskId(state) {
  state.taskCounter += 1;
  return 'task_' + Date.now() + '_' + state.taskCounter + '_' + Math.random().toString(36).slice(2, 8);
}

function makeTask(state, descriptor) {
  var taskid = nextTaskId(state);
  var task = {
    taskid: taskid,
    kind: descriptor.kind || 'element',
    pipelineid: descriptor.pipelineid || null,
    stageid: descriptor.stageid || null,
    elementid: descriptor.elementid || null,
    parentTaskid: descriptor.parentTaskid || null,
    childTaskIds: [],
    status: 'WAITING',
    resolveTask: null,
    rejectTask: null,
    promise: null
  };
  task.promise = new Promise(function(resolve, reject) {
    task.resolveTask = resolve;
    task.rejectTask = reject;
  });
  state.tasks[taskid] = task;
  return task;
}

async function runElementTask(taskid, descriptor) {
  try {
    var executionContext = {
      env: descriptor.env,
      inputs: descriptor.signature && descriptor.signature.inputs ? descriptor.signature.inputs : [],
      outputs: descriptor.signature && descriptor.signature.outputs ? descriptor.signature.outputs : {},
      properties: descriptor.properties || {}
    };
    var result = await descriptor.executor(executionContext);
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: result || {} }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  } catch (err) {
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  }
}

async function runStageTask(taskid, descriptor) {
  try {
    await descriptor.stageExecutor(descriptor.env);
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: true }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  } catch (err) {
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  }
}

async function runSpawnTask(taskid, descriptor) {
  try {
    await descriptor.childRunner({
      id: descriptor.childPipelineId,
      env: descriptor.childEnv || {}
    });
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: true }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  } catch (err) {
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err }).catch(function(e) { console.warn('[EXECUTIONACTOR] task settled send failed:', e); });
  }
}

function cancelTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  task.status = 'CANCELLED';
  (task.childTaskIds || []).forEach(function(childId) { cancelTask(state, childId); });
  if (task.rejectTask) task.rejectTask(new Error('Task cancelled: ' + taskid));
}

function stopTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  task.status = 'STOPPED';
}

function ensurePipeline(state, pipelineid) {
  if (!state.pipelines[pipelineid]) {
    state.pipelines[pipelineid] = {
      status: 'running', env: {}, dna: null, stageStatuses: {}
    };
  }
  return state.pipelines[pipelineid];
}

var executionbehavior = function(state, message) {
  var readOnly = [
    EXECUTIONMESSAGETYPES.GET_STATUS,
    EXECUTIONMESSAGETYPES.RECOVER,
    EXECUTIONMESSAGETYPES.AWAIT_TASK,
    EXECUTIONMESSAGETYPES.GET_TASKS,
    EXECUTIONMESSAGETYPES.GET_TASK_STATUS
  ];

  if (readOnly.indexOf(message.type) === -1) {
    persistExecutionWorldmap(state); // PERSIST BEFORE action
  }

  var nextState = state;

  switch (message.type) {
    case EXECUTIONMESSAGETYPES.PIPELINE_LOADED: {
      var pipeline = ensurePipeline(nextState, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.STAGE_STATE: {
      var p2 = ensurePipeline(nextState, message.pipelineid);
      if (!p2.stageStatuses) p2.stageStatuses = {};
      if (message.state && message.state.status) p2.stageStatuses[message.stageid] = message.state.status;
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
      var p3 = ensurePipeline(nextState, message.pipelineid);
      p3.env = sanitizeForState(message.env || {});
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_STATUS: {
      if (message.pipelineid) {
        var p4 = nextState.pipelines[message.pipelineid] || null;
        if (p4 && p4.stageStatuses) {
          var stages = {};
          Object.keys(p4.stageStatuses).forEach(function(sid) { stages[sid] = { status: p4.stageStatuses[sid] }; });
          resolveMessage(message, { status: p4.status, env: p4.env, dna: p4.dna, stageStatuses: p4.stageStatuses, stages: stages });
        } else {
          resolveMessage(message, p4);
        }
      } else {
        resolveMessage(message, nextState.pipelines);
      }
      break;
    }
    case EXECUTIONMESSAGETYPES.STOP_STAGE: {
      var p5 = ensurePipeline(nextState, message.pipelineid);
      if (!p5.stageStatuses) p5.stageStatuses = {};
      p5.stageStatuses[message.stageid] = 'stopped';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.CANCEL_STAGE: {
      var p6 = ensurePipeline(nextState, message.pipelineid);
      if (!p6.stageStatuses) p6.stageStatuses = {};
      p6.stageStatuses[message.stageid] = 'cancelled';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.BREAK_STAGE: {
      var p7 = ensurePipeline(nextState, message.pipelineid);
      if (!p7.stageStatuses) p7.stageStatuses = {};
      p7.stageStatuses[message.stageid] = 'awaiting';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.RESTART_STAGE: {
      var p8 = ensurePipeline(nextState, message.pipelineid);
      if (!p8.stageStatuses) p8.stageStatuses = {};
      p8.stageStatuses[message.stageid] = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
      var p9 = ensurePipeline(nextState, message.pipelineid);
      if (!p9.stageStatuses) p9.stageStatuses = {};
      var currentStatus = p9.stageStatuses[message.stageid];
      if (currentStatus === 'stopped' || currentStatus === 'awaiting') p9.stageStatuses[message.stageid] = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
      var task = makeTask(nextState, {
        kind: 'element',
        pipelineid: message.pipelineid,
        stageid: message.path && message.path.length > 1 ? message.path[message.path.length - 2] : null,
        elementid: message.elementid
      });
      runElementTask(task.taskid, message);
      resolveMessage(message, { taskid: task.taskid });
      break;
    }
    case EXECUTIONMESSAGETYPES.EXECUTE_STAGE: {
      var task2 = makeTask(nextState, {
        kind: 'stage',
        pipelineid: message.pipelineid,
        stageid: message.stageid,
        parentTaskid: message.parentTaskid || null
      });
      if (message.parentTaskid) {
        var parentTask = nextState.tasks[message.parentTaskid];
        if (parentTask) parentTask.childTaskIds.push(task2.taskid);
      }
      runStageTask(task2.taskid, message);
      resolveMessage(message, { taskid: task2.taskid });
      break;
    }
    case EXECUTIONMESSAGETYPES.AWAIT_TASK: {
      var awaitTask = nextState.tasks[message.taskid];
      if (!awaitTask) rejectMessage(message, new Error('[EXECUTIONACTOR] unknown task: ' + message.taskid));
      else resolveMessage(message, awaitTask.promise);
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_TASKS: {
      var result = [];
      Object.keys(nextState.tasks).forEach(function(tid) {
        var t = nextState.tasks[tid];
        if (message.pipelineid && t.pipelineid !== message.pipelineid) return;
        if (message.stageid && t.stageid !== message.stageid) return;
        if (message.elementid && t.elementid !== message.elementid) return;
        if (message.kind && t.kind !== message.kind) return;
        result.push({ taskid: t.taskid, kind: t.kind, pipelineid: t.pipelineid, stageid: t.stageid, elementid: t.elementid, parentTaskid: t.parentTaskid, status: t.status });
      });
      resolveMessage(message, result);
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_TASK_STATUS: {
      var t2 = nextState.tasks[message.taskid];
      resolveMessage(message, t2 ? { taskid: t2.taskid, kind: t2.kind, pipelineid: t2.pipelineid, stageid: t2.stageid, elementid: t2.elementid, parentTaskid: t2.parentTaskid, status: t2.status } : null);
      break;
    }
    case EXECUTIONMESSAGETYPES.CANCEL_TASK: {
      cancelTask(nextState, message.taskid);
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.STOP_TASK: {
      stopTask(nextState, message.taskid);
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.SPAWN_PIPELINE: {
      var task3 = makeTask(nextState, { kind: 'spawn', pipelineid: message.childPipelineId, stageid: null, elementid: null });
      runSpawnTask(task3.taskid, message);
      resolveMessage(message, { taskid: task3.taskid });
      break;
    }
    case EXECUTIONMESSAGETYPES.CCC_ABORT:
    case EXECUTIONMESSAGETYPES.CCC_CONTINUE:
    case EXECUTIONMESSAGETYPES.CCC_RETRY: {
      // CCC behavior as consolidated in prior analysis; minimal here.
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.TASK_SETTLED: {
      var task4 = nextState.tasks[message.taskid];
      if (task4) {
        task4.status = message.status;
        if (message.status === 'EXECUTED') task4.resolveTask(message.result || {});
        else if (message.status === 'FAILED') task4.rejectTask(message.error || new Error('task failed'));
      }
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.RECOVER: {
      enqueueDbRestore('actor:state:execution').then(function(saved) {
        if (saved) {
          nextState.worldmap = saved;
          nextState.pipelines = saved.pipelines || {};
          nextState.tasks = saved.tasks || {};
          nextState.htmlSnapshot = saved.htmlSnapshot || null;
        }
        if (typeof message.resolve === 'function') message.resolve(nextState);
      }).catch(function(e) {
        console.warn('[EXECUTIONACTOR] state restore failed:', e);
        if (typeof message.resolve === 'function') message.resolve(nextState);
      });
      return state;
    }
    case EXECUTIONMESSAGETYPES.REGISTER_PIPELINE: {
      var p10 = ensurePipeline(nextState, message.pipelineid);
      if (message.dna) p10.dna = message.dna;
      if (message.env) p10.env = sanitizeForState(message.env);
      resolveMessage(message, true);
      break;
    }
    default: {
      rejectMessage(message, new Error('[EXECUTIONACTOR] unknown message type'));
      return state;
    }
  }

  if (readOnly.indexOf(message.type) === -1) {
    persistExecutionWorldmap(nextState); // PERSIST AFTER action
  }

  return nextState;
};

var enqueue = function(type, payload) {
  return new Promise(function(resolve, reject) {
    var message = {};
    if (payload) Object.keys(payload).forEach(function(k) { message[k] = payload[k]; });
    message.type = type;
    message.resolve = resolve;
    message.reject = reject;
    EXECUTIONACTOR.send(message);
  });
};

var enqueueExecutionPipelineLoaded = function(pipelineid, env) { return enqueue(EXECUTIONMESSAGETYPES.PIPELINE_LOADED, { pipelineid: pipelineid, env: env }); };
var enqueueExecutionStageState = function(pipelineid, stageid, state) { return enqueue(EXECUTIONMESSAGETYPES.STAGE_STATE, { pipelineid: pipelineid, stageid: stageid, state: state }); };
var enqueueExecutionSubmit = function(descriptor) { return enqueue(EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT, descriptor); };
var enqueueExecutionSubmitStage = function(descriptor) { return enqueue(EXECUTIONMESSAGETYPES.EXECUTE_STAGE, descriptor); };
var enqueueExecutionAwaitTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.AWAIT_TASK, { taskid: taskid }); };
var enqueueExecutionGetTasks = function(filters) { return enqueue(EXECUTIONMESSAGETYPES.GET_TASKS, filters || {}); };
var enqueueExecutionGetTaskStatus = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.GET_TASK_STATUS, { taskid: taskid }); };
var enqueueExecutionCancelTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.CANCEL_TASK, { taskid: taskid }); };
var enqueueExecutionStopTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.STOP_TASK, { taskid: taskid }); };
var enqueueExecutionStopStage = function(pipelineid, stageid) { return enqueue(EXECUTIONMESSAGETYPES.STOP_STAGE, { pipelineid: pipelineid, stageid: stageid }); };
var enqueueExecutionCancelStage = function(pipelineid, stageid) { return enqueue(EXECUTIONMESSAGETYPES.CANCEL_STAGE, { pipelineid: pipelineid, stageid: stageid }); };
var enqueueExecutionBreakStage = function(pipelineid, stageid) { return enqueue(EXECUTIONMESSAGETYPES.BREAK_STAGE, { pipelineid: pipelineid, stageid: stageid }); };
var enqueueExecutionRestartStage = function(pipelineid, stageid, elementid) { return enqueue(EXECUTIONMESSAGETYPES.RESTART_STAGE, { pipelineid: pipelineid, stageid: stageid, elementid: elementid }); };
var enqueueExecutionContinueStage = function(pipelineid, stageid) { return enqueue(EXECUTIONMESSAGETYPES.CONTINUE_STAGE, { pipelineid: pipelineid, stageid: stageid }); };
var enqueueExecutionGetStatus = function(pipelineid) { return enqueue(EXECUTIONMESSAGETYPES.GET_STATUS, { pipelineid: pipelineid }); };
var enqueueExecutionEnvUpdated = function(pipelineid, env) { return enqueue(EXECUTIONMESSAGETYPES.ENV_UPDATED, { pipelineid: pipelineid, env: env }); };
var enqueueExecutionCccAbort = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_ABORT, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionCccContinue = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_CONTINUE, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionCccRetry = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_RETRY, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionSpawnPipeline = function(descriptor) { return enqueue(EXECUTIONMESSAGETYPES.SPAWN_PIPELINE, descriptor); };
var enqueueExecutionRegisterPipeline = function(pipelineid, dna, env) { return enqueue(EXECUTIONMESSAGETYPES.REGISTER_PIPELINE, { pipelineid: pipelineid, dna: dna, env: env }); };
var enqueueExecutionRecover = function() { return enqueue(EXECUTIONMESSAGETYPES.RECOVER, {}); };

export {
  EXECUTIONMESSAGETYPES,
  EXECUTIONACTOR,
  enqueueExecutionPipelineLoaded,
  enqueueExecutionStageState,
  enqueueExecutionSubmit,
  enqueueExecutionSubmitStage,
  enqueueExecutionAwaitTask,
  enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus,
  enqueueExecutionCancelTask,
  enqueueExecutionStopTask,
  enqueueExecutionStopStage,
  enqueueExecutionCancelStage,
  enqueueExecutionBreakStage,
  enqueueExecutionRestartStage,
  enqueueExecutionContinueStage,
  enqueueExecutionGetStatus,
  enqueueExecutionEnvUpdated,
  enqueueExecutionCccAbort,
  enqueueExecutionCccContinue,
  enqueueExecutionCccRetry,
  enqueueExecutionSpawnPipeline,
  enqueueExecutionRegisterPipeline,
  enqueueExecutionRecover
};
