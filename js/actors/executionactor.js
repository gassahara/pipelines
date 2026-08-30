// ============================================================
// UPDATED FILE: js/actors/executionactor.js
// Changes applied:
//   P13: persist combined state (tasks, pipelines, taskCounter)
//   P15: stopTask rejects promise and consumers
// ============================================================

import { createactor } from './actorkernel.js';
import {
  enqueueDbStore,
  enqueueDbRestore,
  enqueueDbDelete,
  serializeDna,
  deserializeDna,
  consolidateGraph,
  restoreGraph,
  serializePairStore,
  deserializePairStore
} from './dbactor.js';
import {
  createVerbosityConstants,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';

var executionVerbosityConstants = createVerbosityConstants();
var executionState = Object.freeze({ level: executionVerbosityConstants.DEBUG });

var EXECUTIONMESSAGETYPES = Object.freeze({
  PIPELINE_LOADED: 'pipeline_loaded',
  ENV_UPDATED: 'env_updated',
  GET_STATUS: 'get_status',
  EXECUTE_ELEMENT: 'execute_element',
  AWAIT_TASK: 'await_task',
  GET_TASKS: 'get_tasks',
  GET_TASK_STATUS: 'get_task_status',
  CANCEL_TASK: 'cancel_task',
  STOP_TASK: 'stop_task',
  CCC_ABORT: 'ccc_abort',
  CCC_CONTINUE: 'ccc_continue',
  CCC_RETRY: 'ccc_retry',
  TASK_SETTLED: 'task_settled',
  RECOVER: 'recover',
  REGISTER_PIPELINE: 'register_pipeline',
  PING: 'ping'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.PIPELINE_LOADED] = { pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.ENV_UPDATED] = { pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_STATUS] = { pipelineid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT] = { pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object', executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?', programRef: 'string?', elementId: 'string?', origin: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.AWAIT_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASKS] = { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASK_STATUS] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CANCEL_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STOP_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_ABORT] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_CONTINUE] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CCC_RETRY] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.TASK_SETTLED] = { taskid: 'string', status: 'string', result: 'any', error: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.RECOVER] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.REGISTER_PIPELINE] = { pipelineid: 'string', dna: 'object?', env: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.PING] = { resolve: 'function?', reject: 'function?' };
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
    htmlSnapshot: null,
    taskCounter: 0
  };
}

// P13: persist combined state object so all live fields are saved
function persistExecutionWorldmap(state) {
  logdebug(executionState, '[EXECUTIONACTOR]', 'persistExecutionWorldmap saving combined state to db');
  var persistable = {
    pipelines: state.pipelines || {},
    tasks: state.tasks || {},
    taskCounter: state.taskCounter || 0,
    htmlSnapshot: state.htmlSnapshot || null,
    worldmap: state.worldmap || {}
  };
  enqueueDbStore('actor:state:execution', persistable).catch(function(e) {
    logwarn(executionState, '[EXECUTIONACTOR]', 'state persist failed:', e);
  });
}

function nextTaskId(state) {
  state.taskCounter = (state.taskCounter || 0) + 1;
  return 'task_' + Date.now() + '_' + state.taskCounter + '_' + Math.random().toString(36).slice(2, 8);
}

function makeTask(state, descriptor) {
  var taskid = nextTaskId(state);
  var task = {
    taskid: taskid,
    kind: 'element',
    pipelineid: descriptor.pipelineid || null,
    elementid: descriptor.elementid || null,
    parentTaskid: null,
    childTaskIds: [],
    status: 'WAITING',
    resolveTask: null,
    rejectTask: null,
    promise: null,
    serialized: descriptor.serialized || null,
    programRef: descriptor.programRef || null,
    origin: descriptor.origin || null,
    consumers: [],
    result: null,
    error: null
  };
  task.promise = new Promise(function(resolve, reject) {
    task.resolveTask = resolve;
    task.rejectTask = reject;
  });
  state.tasks[taskid] = task;
  logdebug(executionState, '[EXECUTIONACTOR]', 'makeTask created element task:', taskid, 'pipelineid:', task.pipelineid, 'elementid:', task.elementid);
  return task;
}

function cancelTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  logdebug(executionState, '[EXECUTIONACTOR]', 'cancelTask cancelling task:', taskid);
  task.status = 'CANCELLED';
  (task.childTaskIds || []).forEach(function(childId) { cancelTask(state, childId); });
  if (task.rejectTask) task.rejectTask(new Error('Task cancelled: ' + taskid));
  (task.consumers || []).forEach(function(consumer) {
    if (consumer.reject) consumer.reject(new Error('Task cancelled: ' + taskid));
  });
  task.consumers = [];
}

// P15: stopTask rejects promises and consumers to avoid hangs
function stopTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  logdebug(executionState, '[EXECUTIONACTOR]', 'stopTask stopping task:', taskid);
  task.status = 'STOPPED';
  var stoppedError = new Error('Task stopped: ' + taskid);
  if (task.rejectTask) {
    task.rejectTask(stoppedError);
  }
  if (task.consumers) {
    task.consumers.forEach(function(consumer) {
      if (consumer.reject) consumer.reject(stoppedError);
    });
    task.consumers = [];
  }
}

function ensurePipeline(state, pipelineid) {
  if (!state.pipelines[pipelineid]) {
    logdebug(executionState, '[EXECUTIONACTOR]', 'ensurePipeline initializing pipeline tracking for:', pipelineid);
    state.pipelines[pipelineid] = {
      status: 'running',
      env: {},
      dna: null,
      usesElementSnapshots: false
    };
  }
  return state.pipelines[pipelineid];
}

var executionbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : executionVerbosityConstants.DEBUG;
  executionState = Object.freeze({ level: v });

  logdebug(executionState, '[EXECUTIONACTOR]', 'behavior handling action:', message.type);

  var readOnly = [
    EXECUTIONMESSAGETYPES.GET_STATUS,
    EXECUTIONMESSAGETYPES.RECOVER,
    EXECUTIONMESSAGETYPES.AWAIT_TASK,
    EXECUTIONMESSAGETYPES.GET_TASKS,
    EXECUTIONMESSAGETYPES.GET_TASK_STATUS,
    EXECUTIONMESSAGETYPES.PING
  ];

  if (readOnly.indexOf(message.type) === -1) {
    persistExecutionWorldmap(state);
  }

  var nextState = state;

  switch (message.type) {
    case EXECUTIONMESSAGETYPES.PIPELINE_LOADED: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action PIPELINE_LOADED:', message.pipelineid);
      var pipeline = ensurePipeline(nextState, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
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
        resolveMessage(message, p4);
      } else {
        resolveMessage(message, nextState.pipelines);
      }
      break;
    }
    case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action EXECUTE_ELEMENT element:', message.elementid, 'pipeline:', message.pipelineid, 'path:', message.path);
      var task = makeTask(nextState, {
        kind: 'element',
        pipelineid: message.pipelineid,
        elementid: message.elementid,
        serialized: message.serialized || null,
        programRef: message.programRef || null,
        origin: message.origin || null
      });
      runElementTask(task.taskid, message);
      resolveMessage(message, { taskid: task.taskid });
      break;
    }
    case EXECUTIONMESSAGETYPES.AWAIT_TASK: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = nextState.tasks[message.taskid];
      if (!awaitTask) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK unknown task:', message.taskid);
        rejectMessage(message, new Error('[EXECUTIONACTOR] unknown task: ' + message.taskid));
        break;
      }

      if (awaitTask.status === 'EXECUTED') {
        resolveMessage(message, awaitTask.result || {});
      } else if (awaitTask.status === 'FAILED') {
        rejectMessage(message, awaitTask.error || new Error('task failed'));
      } else if (awaitTask.status === 'CANCELLED') {
        rejectMessage(message, awaitTask.error || new Error('task cancelled'));
      } else if (awaitTask.status === 'STOPPED') {
        rejectMessage(message, awaitTask.error || new Error('task stopped'));
      } else {
        if (!awaitTask.consumers) awaitTask.consumers = [];
        awaitTask.consumers.push({
          resolve: message.resolve,
          reject: message.reject
        });
      }
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_TASKS: {
      var result = [];
      Object.keys(nextState.tasks).forEach(function(tid) {
        var t = nextState.tasks[tid];
        if (message.pipelineid && t.pipelineid !== message.pipelineid) return;
        if (message.elementid && t.elementid !== message.elementid) return;
        if (message.kind && t.kind !== message.kind) return;
        result.push({
          taskid: t.taskid,
          kind: t.kind,
          pipelineid: t.pipelineid,
          elementid: t.elementid,
          parentTaskid: t.parentTaskid,
          status: t.status,
          origin: t.origin,
          programRef: t.programRef,
          serialized: t.serialized,
          consumerCount: (t.consumers || []).length
        });
      });
      resolveMessage(message, result);
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_TASK_STATUS: {
      var t2 = nextState.tasks[message.taskid];
      resolveMessage(message, t2 ? {
        taskid: t2.taskid,
        kind: t2.kind,
        pipelineid: t2.pipelineid,
        elementid: t2.elementid,
        parentTaskid: t2.parentTaskid,
        status: t2.status,
        origin: t2.origin,
        programRef: t2.programRef,
        serialized: t2.serialized,
        consumerCount: (t2.consumers || []).length
      } : null);
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
    case EXECUTIONMESSAGETYPES.CCC_ABORT:
    case EXECUTIONMESSAGETYPES.CCC_CONTINUE:
    case EXECUTIONMESSAGETYPES.CCC_RETRY: {
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.TASK_SETTLED: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action TASK_SETTLED task:', message.taskid, 'status:', message.status);
      var task4 = nextState.tasks[message.taskid];
      if (task4) {
        task4.status = message.status;
        task4.result = message.result || null;
        task4.error = message.error || null;

        var consumers = task4.consumers || [];
        if (message.status === 'EXECUTED') {
          if (task4.resolveTask) task4.resolveTask(message.result || {});
          consumers.forEach(function(consumer) {
            if (consumer.resolve) consumer.resolve(message.result || {});
          });
        } else if (message.status === 'FAILED') {
          var err = message.error || new Error('task failed');
          if (task4.rejectTask) task4.rejectTask(err);
          consumers.forEach(function(consumer) {
            if (consumer.reject) consumer.reject(err);
          });
        }
        task4.consumers = [];
      }
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.RECOVER: {
      enqueueDbRestore('actor:state:execution').then(function(saved) {
        if (saved) {
          nextState.worldmap = saved.worldmap || saved;
          nextState.pipelines = saved.pipelines || {};
          nextState.tasks = saved.tasks || {};
          nextState.htmlSnapshot = saved.htmlSnapshot || null;
          nextState.taskCounter = saved.taskCounter || 0;
        } else {
          nextState.worldmap = createInitialExecutionWorldmap();
          nextState.pipelines = nextState.worldmap.pipelines || {};
          nextState.tasks = nextState.worldmap.tasks || {};
          nextState.htmlSnapshot = nextState.worldmap.htmlSnapshot || null;
          nextState.taskCounter = nextState.worldmap.taskCounter || 0;
          enqueueDbStore('actor:state:execution', nextState.worldmap).catch(function(e) {
            logwarn(executionState, '[EXECUTIONACTOR]', 'default state persist failed:', e);
          });
        }
        resolveMessage(message, nextState);
      }).catch(function(e) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'state restore failed:', e);
        nextState.worldmap = createInitialExecutionWorldmap();
        nextState.pipelines = {};
        nextState.tasks = {};
        nextState.htmlSnapshot = null;
        nextState.taskCounter = 0;
        enqueueDbStore('actor:state:execution', nextState.worldmap).catch(function(e2) {
          logwarn(executionState, '[EXECUTIONACTOR]', 'default state persist failed:', e2);
        });
        resolveMessage(message, nextState);
      });
      return state;
    }
    case EXECUTIONMESSAGETYPES.REGISTER_PIPELINE: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action REGISTER_PIPELINE:', message.pipelineid);
      var p10 = ensurePipeline(nextState, message.pipelineid);
      p10.usesElementSnapshots = true;
      if (message.env) p10.env = sanitizeForState(message.env);
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.PING: {
      resolveMessage(message, true);
      break;
    }
    default: {
      logwarn(executionState, '[EXECUTIONACTOR]', 'unknown message type:', message.type);
      rejectMessage(message, new Error('[EXECUTIONACTOR] unknown message type'));
      return state;
    }
  }

  if (readOnly.indexOf(message.type) === -1) {
    persistExecutionWorldmap(nextState);
  }

  return nextState;
};

async function loadInitialState() {
  try {
    var saved = await enqueueDbRestore('actor:state:execution');
    if (saved) {
      return {
        pipelines: saved.pipelines || {},
        htmlSnapshot: saved.htmlSnapshot || null,
        tasks: saved.tasks || {},
        taskCounter: saved.taskCounter || 0,
        worldmap: saved.worldmap || saved,
        debugState: { currentContinuation: null }
      };
    }
  } catch (err) {
    logwarn(executionState, '[EXECUTIONACTOR]', 'state restore failed:', err);
  }

  var defaultState = {
    pipelines: {},
    htmlSnapshot: null,
    tasks: {},
    taskCounter: 0,
    worldmap: createInitialExecutionWorldmap(),
    debugState: { currentContinuation: null }
  };
  enqueueDbStore('actor:state:execution', defaultState.worldmap).catch(function(e) {
    logwarn(executionState, '[EXECUTIONACTOR]', 'default state persist failed:', e);
  });
  return defaultState;
}

async function runElementTask(taskid, descriptor) {
  try {
    logdebug(executionState, '[EXECUTIONACTOR]', 'runElementTask executing:', taskid, descriptor.elementid, descriptor.path);
    var executionContext = {
      env: descriptor.env,
      inputs: descriptor.signature && descriptor.signature.inputs ? descriptor.signature.inputs : [],
      outputs: descriptor.signature && descriptor.signature.outputs ? descriptor.signature.outputs : {},
      properties: descriptor.properties || {}
    };

    var result;
    if (descriptor.programRef && descriptor.programSource) {
      try {
        var program = new Function('return ' + descriptor.programSource)();
        if (program && typeof program[descriptor.elementid] === 'function') {
          result = await program[descriptor.elementid]();
        } else {
          result = await descriptor.executor(executionContext);
        }
      } catch (err) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'program restoration failed:', err);
        result = await descriptor.executor(executionContext);
      }
    } else {
      result = await descriptor.executor(executionContext);
    }

    logdebug(executionState, '[EXECUTIONACTOR]', 'runElementTask completed:', taskid, descriptor.elementid);
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: result || {} });
  } catch (err) {
    logerror(executionState, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err, result: false });
  }
}

var initialState = await loadInitialState();
var EXECUTIONACTOR = createactor(
  executionbehavior,
  initialState,
  MESSAGEINTERFACES,
  { actorName: 'executionactor', mailboxType: 'memory', verbosity: executionVerbosityConstants.DEBUG }
);

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
var enqueueExecutionSubmit = function(descriptor) { return enqueue(EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT, descriptor); };
var enqueueExecutionAwaitTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.AWAIT_TASK, { taskid: taskid }); };
var enqueueExecutionGetTasks = function(filters) { return enqueue(EXECUTIONMESSAGETYPES.GET_TASKS, filters || {}); };
var enqueueExecutionGetTaskStatus = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.GET_TASK_STATUS, { taskid: taskid }); };
var enqueueExecutionCancelTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.CANCEL_TASK, { taskid: taskid }); };
var enqueueExecutionStopTask = function(taskid) { return enqueue(EXECUTIONMESSAGETYPES.STOP_TASK, { taskid: taskid }); };
var enqueueExecutionGetStatus = function(pipelineid) { return enqueue(EXECUTIONMESSAGETYPES.GET_STATUS, { pipelineid: pipelineid }); };
var enqueueExecutionEnvUpdated = function(pipelineid, env) { return enqueue(EXECUTIONMESSAGETYPES.ENV_UPDATED, { pipelineid: pipelineid, env: env }); };
var enqueueExecutionCccAbort = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_ABORT, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionCccContinue = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_CONTINUE, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionCccRetry = function(pipelineid, path, elementid, continuation) { return enqueue(EXECUTIONMESSAGETYPES.CCC_RETRY, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }); };
var enqueueExecutionRegisterPipeline = function(pipelineid, dna, env) { return enqueue(EXECUTIONMESSAGETYPES.REGISTER_PIPELINE, { pipelineid: pipelineid, dna: dna, env: env }); };
var enqueueExecutionRecover = function() { return enqueue(EXECUTIONMESSAGETYPES.RECOVER, {}); };
var enqueueExecutionPing = function() { return enqueue(EXECUTIONMESSAGETYPES.PING); };

function startExecutionActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      executionState = Object.freeze({ level: lvl });
      if (EXECUTIONACTOR && EXECUTIONACTOR.getstate()) {
        EXECUTIONACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return EXECUTIONACTOR;
}

function ensureExecutionActorReady(options) {
  return Promise.resolve(startExecutionActor(options));
}

export {
  EXECUTIONMESSAGETYPES,
  EXECUTIONACTOR,
  enqueueExecutionPipelineLoaded,
  enqueueExecutionSubmit,
  enqueueExecutionAwaitTask,
  enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus,
  enqueueExecutionCancelTask,
  enqueueExecutionStopTask,
  enqueueExecutionGetStatus,
  enqueueExecutionEnvUpdated,
  enqueueExecutionCccAbort,
  enqueueExecutionCccContinue,
  enqueueExecutionCccRetry,
  enqueueExecutionRegisterPipeline,
  enqueueExecutionRecover,
  enqueueExecutionPing,
  startExecutionActor,
  ensureExecutionActorReady
};
