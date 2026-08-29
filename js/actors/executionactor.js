// ============================================================
// UPDATED FILE: js/actors/executionactor.js
// Change applied: removed createLogger; direct portable logging functions
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
  REGISTER_PIPELINE: 'register_pipeline',
  PING: 'ping'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.PIPELINE_LOADED] = { pipelineid: 'string', env: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STAGE_STATE] = { pipelineid: 'string', stageid: 'string', state: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.ENV_UPDATED] = { pipelineid: 'string', env: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_STATUS] = { pipelineid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT] = { pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object', executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?', programRef: 'string?', elementId: 'string?', origin: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.EXECUTE_STAGE] = { pipelineid: 'string', path: 'array', stageid: 'string', stageExecutor: 'function', env: 'object', parentTaskid: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.AWAIT_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASKS] = { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.GET_TASK_STATUS] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.CANCEL_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[EXECUTIONMESSAGETYPES.STOP_TASK] = { taskid: 'string', resolve: 'function?', reject: 'function?' };
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
    stageStatuses: {},
    htmlSnapshot: null,
    taskCounter: 0
  };
}

function persistExecutionWorldmap(state) {
  logdebug(executionState, '[EXECUTIONACTOR]', 'persistExecutionWorldmap saving state to db');
  enqueueDbStore('actor:state:execution', state.worldmap).catch(function(e) {
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
    kind: descriptor.kind || 'element',
    pipelineid: descriptor.pipelineid || null,
    stageid: descriptor.stageid || null,
    elementid: descriptor.elementid || null,
    parentTaskid: descriptor.parentTaskid || null,
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
  logdebug(executionState, '[EXECUTIONACTOR]', 'makeTask created task:', taskid, 'kind:', task.kind, 'pipelineid:', task.pipelineid, 'elementid:', task.elementid);
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

function stopTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  logdebug(executionState, '[EXECUTIONACTOR]', 'stopTask stopping task:', taskid);
  task.status = 'STOPPED';
}

function ensurePipeline(state, pipelineid) {
  if (!state.pipelines[pipelineid]) {
    logdebug(executionState, '[EXECUTIONACTOR]', 'ensurePipeline initializing pipeline tracking for:', pipelineid);
    state.pipelines[pipelineid] = {
      status: 'running',
      env: {},
      dna: null,
      stageStatuses: {},
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
      logdebug(executionState, '[EXECUTIONACTOR]', 'action PIPELINE_LOADED details:', message.pipelineid, message.env);
      var pipeline = ensurePipeline(nextState, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.STAGE_STATE: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action STAGE_STATE pipeline:', message.pipelineid, 'stage:', message.stageid, 'status:', message.state && message.state.status);
      var p2 = ensurePipeline(nextState, message.pipelineid);
      if (!p2.stageStatuses) p2.stageStatuses = {};
      if (message.state && message.state.status) p2.stageStatuses[message.stageid] = message.state.status;
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.ENV_UPDATED: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action ENV_UPDATED pipeline:', message.pipelineid);
      var p3 = ensurePipeline(nextState, message.pipelineid);
      p3.env = sanitizeForState(message.env || {});
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_STATUS: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action GET_STATUS pipeline:', message.pipelineid);
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
      loginfo(executionState, '[EXECUTIONACTOR]', 'action STOP_STAGE:', message.pipelineid, message.stageid);
      var p5 = ensurePipeline(nextState, message.pipelineid);
      if (!p5.stageStatuses) p5.stageStatuses = {};
      p5.stageStatuses[message.stageid] = 'stopped';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.CANCEL_STAGE: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action CANCEL_STAGE:', message.pipelineid, message.stageid);
      var p6 = ensurePipeline(nextState, message.pipelineid);
      if (!p6.stageStatuses) p6.stageStatuses = {};
      p6.stageStatuses[message.stageid] = 'cancelled';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.BREAK_STAGE: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action BREAK_STAGE:', message.pipelineid, message.stageid);
      var p7 = ensurePipeline(nextState, message.pipelineid);
      if (!p7.stageStatuses) p7.stageStatuses = {};
      p7.stageStatuses[message.stageid] = 'awaiting';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.RESTART_STAGE: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action RESTART_STAGE:', message.pipelineid, message.stageid);
      var p8 = ensurePipeline(nextState, message.pipelineid);
      if (!p8.stageStatuses) p8.stageStatuses = {};
      p8.stageStatuses[message.stageid] = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.CONTINUE_STAGE: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action CONTINUE_STAGE:', message.pipelineid, message.stageid);
      var p9 = ensurePipeline(nextState, message.pipelineid);
      if (!p9.stageStatuses) p9.stageStatuses = {};
      var currentStatus = p9.stageStatuses[message.stageid];
      if (currentStatus === 'stopped' || currentStatus === 'awaiting') p9.stageStatuses[message.stageid] = 'running';
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.EXECUTE_ELEMENT: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action EXECUTE_ELEMENT element:', message.elementid, 'pipeline:', message.pipelineid, 'path:', message.path);
      var task = makeTask(nextState, {
        kind: 'element',
        pipelineid: message.pipelineid,
        stageid: message.path && message.path.length > 1 ? message.path[message.path.length - 2] : null,
        elementid: message.elementid,
        serialized: message.serialized || null,
        programRef: message.programRef || null,
        origin: message.origin || null
      });
      runElementTask(task.taskid, message);
      resolveMessage(message, { taskid: task.taskid });
      break;
    }
    case EXECUTIONMESSAGETYPES.EXECUTE_STAGE: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action EXECUTE_STAGE stage:', message.stageid, 'pipeline:', message.pipelineid, 'path:', message.path);
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
      logdebug(executionState, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = nextState.tasks[message.taskid];
      if (!awaitTask) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK unknown task:', message.taskid);
        rejectMessage(message, new Error('[EXECUTIONACTOR] unknown task: ' + message.taskid));
        break;
      }

      if (awaitTask.status === 'EXECUTED') {
        logdebug(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK already EXECUTED:', message.taskid);
        resolveMessage(message, awaitTask.result || {});
      } else if (awaitTask.status === 'FAILED') {
        logdebug(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK already FAILED:', message.taskid);
        rejectMessage(message, awaitTask.error || new Error('task failed'));
      } else if (awaitTask.status === 'CANCELLED') {
        logdebug(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK already CANCELLED:', message.taskid);
        rejectMessage(message, awaitTask.error || new Error('task cancelled'));
      } else {
        logdebug(executionState, '[EXECUTIONACTOR]', 'AWAIT_TASK registered consumer for:', message.taskid);
        if (!awaitTask.consumers) awaitTask.consumers = [];
        awaitTask.consumers.push({
          resolve: message.resolve,
          reject: message.reject
        });
      }
      break;
    }
    case EXECUTIONMESSAGETYPES.GET_TASKS: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action GET_TASKS filters:', message.pipelineid, message.stageid, message.elementid, message.kind);
      var result = [];
      Object.keys(nextState.tasks).forEach(function(tid) {
        var t = nextState.tasks[tid];
        if (message.pipelineid && t.pipelineid !== message.pipelineid) return;
        if (message.stageid && t.stageid !== message.stageid) return;
        if (message.elementid && t.elementid !== message.elementid) return;
        if (message.kind && t.kind !== message.kind) return;
        result.push({
          taskid: t.taskid,
          kind: t.kind,
          pipelineid: t.pipelineid,
          stageid: t.stageid,
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
      logdebug(executionState, '[EXECUTIONACTOR]', 'action GET_TASK_STATUS task:', message.taskid);
      var t2 = nextState.tasks[message.taskid];
      resolveMessage(message, t2 ? {
        taskid: t2.taskid,
        kind: t2.kind,
        pipelineid: t2.pipelineid,
        stageid: t2.stageid,
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
      loginfo(executionState, '[EXECUTIONACTOR]', 'action CANCEL_TASK:', message.taskid);
      cancelTask(nextState, message.taskid);
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.STOP_TASK: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action STOP_TASK:', message.taskid);
      stopTask(nextState, message.taskid);
      resolveMessage(message, true);
      break;
    }
    case EXECUTIONMESSAGETYPES.CCC_ABORT:
    case EXECUTIONMESSAGETYPES.CCC_CONTINUE:
    case EXECUTIONMESSAGETYPES.CCC_RETRY: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action CCC message:', message.type, message.pipelineid, message.elementid);
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
      logdebug(executionState, '[EXECUTIONACTOR]', 'action RECOVER execution state');
      enqueueDbRestore('actor:state:execution').then(function(saved) {
        if (saved) {
          nextState.worldmap = saved;
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
        logdebug(executionState, '[EXECUTIONACTOR]', 'execution state recovery complete');
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
      logdebug(executionState, '[EXECUTIONACTOR]', 'action PING');
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
        worldmap: saved,
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

    try {
      EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: result || {} });
    } catch (err) {
      logwarn(executionState, '[EXECUTIONACTOR]', 'task settled send failed:', err);
    }
  } catch (err) {
    logerror(executionState, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    try {
      EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err, result: false });
    } catch (sendErr) {
      logwarn(executionState, '[EXECUTIONACTOR]', 'task settled send failed:', sendErr);
    }
  }
}

async function runStageTask(taskid, descriptor) {
  try {
    logdebug(executionState, '[EXECUTIONACTOR]', 'runStageTask executing:', taskid, descriptor.stageid, descriptor.path);
    await descriptor.stageExecutor(descriptor.env);
    logdebug(executionState, '[EXECUTIONACTOR]', 'runStageTask completed:', taskid, descriptor.stageid);
    try {
      EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'EXECUTED', result: true });
      var hypervisorMod = await import('./hypervisoractor.js');
      hypervisorMod.enqueueHypervisorStageCompleted(descriptor.pipelineid, descriptor.stageid).catch(function(e) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'stage completed notification failed:', e);
      });
    } catch (err) {
      logwarn(executionState, '[EXECUTIONACTOR]', 'task settled send failed:', err);
    }
  } catch (err) {
    logerror(executionState, '[EXECUTIONACTOR]', 'runStageTask failed:', taskid, descriptor.stageid, err);
    try {
      EXECUTIONACTOR.send({ type: EXECUTIONMESSAGETYPES.TASK_SETTLED, taskid: taskid, status: 'FAILED', error: err, result: false });
    } catch (sendErr) {
      logwarn(executionState, '[EXECUTIONACTOR]', 'task settled send failed:', sendErr);
    }
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
  enqueueExecutionRegisterPipeline,
  enqueueExecutionRecover,
  enqueueExecutionPing,
  startExecutionActor,
  ensureExecutionActorReady
};
