// ============================================================
// UPDATED FILE: js/actors/executionactor.js
// Change applied: DIRECT DISPATCH REFACTOR
//   - No mailTransport, no pollInterval (consumer registration in kernel)
//   - enqueueExecution* functions fire-and-forget, accept responseSpec
// ============================================================


var executionVerbosityConstants = createVerbosityConstants();
var executionState = Object.freeze({ level: executionVerbosityConstants.DEBUG });


var executionactorINTERFACES = {};
executionactorINTERFACES[MESSAGETYPES.PIPELINE_LOADED] = { pipelineid: 'string', env: 'object?' };
executionactorINTERFACES[MESSAGETYPES.ENV_UPDATED] = { pipelineid: 'string', env: 'object' };
executionactorINTERFACES[MESSAGETYPES.GET_STATUS] = { pipelineid: 'string?' };
executionactorINTERFACES[MESSAGETYPES.EXECUTE_ELEMENT] = { pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object', executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?', programRef: 'string?', elementId: 'string?', origin: 'object?' };
executionactorINTERFACES[MESSAGETYPES.AWAIT_TASK] = { taskid: 'string' };
executionactorINTERFACES[MESSAGETYPES.GET_TASKS] = { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?' };
executionactorINTERFACES[MESSAGETYPES.GET_TASK_STATUS] = { taskid: 'string' };
executionactorINTERFACES[MESSAGETYPES.CANCEL_TASK] = { taskid: 'string' };
executionactorINTERFACES[MESSAGETYPES.STOP_TASK] = { taskid: 'string' };
executionactorINTERFACES[MESSAGETYPES.CCC_ABORT] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?' };
executionactorINTERFACES[MESSAGETYPES.CCC_CONTINUE] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?' };
executionactorINTERFACES[MESSAGETYPES.CCC_RETRY] = { pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?' };
executionactorINTERFACES[MESSAGETYPES.TASK_SETTLED] = { taskid: 'string', status: 'string', result: 'any', error: 'object?' };
executionactorINTERFACES[MESSAGETYPES.RECOVER] = {};
executionactorINTERFACES[MESSAGETYPES.REGISTER_PIPELINE] = { pipelineid: 'string', dna: 'object?', env: 'object?' };
executionactorINTERFACES[MESSAGETYPES.PING] = {};
Object.freeze(executionactorINTERFACES);

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
    serialized: descriptor.serialized || null,
    programRef: descriptor.programRef || null,
    origin: descriptor.origin || null,
    consumers: [],
    result: null,
    error: null
  };
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
  var err = { error: 'Task cancelled: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    sendResponse(consumer.sender, consumer.tag, err, 'executionactor');
  });
  task.consumers = [];
}

function stopTask(state, taskid) {
  var task = state.tasks[taskid];
  if (!task) return;
  logdebug(executionState, '[EXECUTIONACTOR]', 'stopTask stopping task:', taskid);
  task.status = 'STOPPED';
  var err = { error: 'Task stopped: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    sendResponse(consumer.sender, consumer.tag, err, 'executionactor');
  });
  task.consumers = [];
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
    MESSAGETYPES.GET_STATUS,
    MESSAGETYPES.RECOVER,
    MESSAGETYPES.AWAIT_TASK,
    MESSAGETYPES.GET_TASKS,
    MESSAGETYPES.GET_TASK_STATUS,
    MESSAGETYPES.PING
  ];

  if (readOnly.indexOf(message.type) === -1) {
    persistExecutionWorldmap(state);
  }

  var nextState = state;

  switch (message.type) {
    case MESSAGETYPES.PIPELINE_LOADED: {
      loginfo(executionState, '[EXECUTIONACTOR]', 'action PIPELINE_LOADED:', message.pipelineid);
      var pipeline = ensurePipeline(nextState, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
      return true;
    }
    case MESSAGETYPES.ENV_UPDATED: {
      var p3 = ensurePipeline(nextState, message.pipelineid);
      p3.env = sanitizeForState(message.env || {});
      return true;
    }
    case MESSAGETYPES.GET_STATUS: {
      return message.pipelineid ? (nextState.pipelines[message.pipelineid] || null) : nextState.pipelines;
    }
    case MESSAGETYPES.EXECUTE_ELEMENT: {
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
      return { taskid: task.taskid };
    }
    case MESSAGETYPES.AWAIT_TASK: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = nextState.tasks[message.taskid];
      if (!awaitTask) {
        return { error: '[EXECUTIONACTOR] unknown task: ' + message.taskid };
      }
      if (awaitTask.status === 'EXECUTED') {
        return awaitTask.result || {};
      } else if (awaitTask.status === 'FAILED') {
        return { error: awaitTask.error ? awaitTask.error.message : 'task failed' };
      } else if (awaitTask.status === 'CANCELLED') {
        return { error: awaitTask.error ? awaitTask.error.message : 'task cancelled' };
      } else if (awaitTask.status === 'STOPPED') {
        return { error: 'task stopped' };
      } else {
        if (!awaitTask.consumers) awaitTask.consumers = [];
        awaitTask.consumers.push({ sender: message.sender, tag: message.tag });
        return null; // no immediate response; will send when TASK_SETTLED
      }
    }
    case MESSAGETYPES.GET_TASKS: {
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
      return result;
    }
    case MESSAGETYPES.GET_TASK_STATUS: {
      var t2 = nextState.tasks[message.taskid];
      return t2 ? {
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
      } : null;
    }
    case MESSAGETYPES.CANCEL_TASK: {
      cancelTask(nextState, message.taskid);
      return true;
    }
    case MESSAGETYPES.STOP_TASK: {
      stopTask(nextState, message.taskid);
      return true;
    }
    case MESSAGETYPES.CCC_ABORT:
    case MESSAGETYPES.CCC_CONTINUE:
    case MESSAGETYPES.CCC_RETRY: {
      return true;
    }
    case MESSAGETYPES.TASK_SETTLED: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action TASK_SETTLED task:', message.taskid, 'status:', message.status);
      var task4 = nextState.tasks[message.taskid];
      if (task4) {
        task4.status = message.status;
        task4.result = message.result || null;
        task4.error = message.error || null;

        var consumers = task4.consumers || [];
        if (message.status === 'EXECUTED') {
          consumers.forEach(function(consumer) {
            sendResponse(consumer.sender, consumer.tag, message.result || {}, 'executionactor');
          });
        } else if (message.status === 'FAILED') {
          consumers.forEach(function(consumer) {
            sendResponse(consumer.sender, consumer.tag, { error: message.error ? message.error.message : 'task failed' }, 'executionactor');
          });
        }
        task4.consumers = [];
      }
      return null;
    }
    case MESSAGETYPES.RECOVER: {
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
        }
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, nextState, 'executionactor');
      }).catch(function(e) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: e.message || String(e) }, 'executionactor');
      });
      return null;
    }
    case MESSAGETYPES.REGISTER_PIPELINE: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action REGISTER_PIPELINE:', message.pipelineid);
      var p10 = ensurePipeline(nextState, message.pipelineid);
      p10.usesElementSnapshots = true;
      if (message.env) p10.env = sanitizeForState(message.env);
      return true;
    }
    case MESSAGETYPES.PING: {
      return true;
    }
    default: {
      logwarn(executionState, '[EXECUTIONACTOR]', 'unknown message type:', message.type);
      return { error: '[EXECUTIONACTOR] unknown message type' };
    }
  }
};

// Top-level await removed: sync default state + fire-and-forget restore-merge.
function createInitialExecutionState() {
  return {
    pipelines: {},
    htmlSnapshot: null,
    tasks: {},
    taskCounter: 0,
    worldmap: createInitialExecutionWorldmap(),
    debugState: { currentContinuation: null }
  };
}

function restoreExecutionStateInto(actor) {
  enqueueDbRestore('actor:state:execution').then(function(saved) {
    var live = actor.getstate();
    if (saved) {
      live.pipelines = saved.pipelines || {};
      live.htmlSnapshot = saved.htmlSnapshot || null;
      live.tasks = saved.tasks || {};
      live.taskCounter = saved.taskCounter || 0;
      live.worldmap = saved.worldmap || saved;
    } else {
      enqueueDbStore('actor:state:execution', live.worldmap).catch(function(e) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'default state persist failed:', e);
      });
    }
  }).catch(function(err) {
    logwarn(executionState, '[EXECUTIONACTOR]', 'state restore failed:', err);
  });
}

function runElementTask(taskid, descriptor) {
  var executionContext = {
    env: descriptor.env,
    inputs: descriptor.signature && descriptor.signature.inputs ? descriptor.signature.inputs : [],
    outputs: descriptor.signature && descriptor.signature.outputs ? descriptor.signature.outputs : {},
    properties: descriptor.properties || {}
  };

  function runWithProgram() {
    if (descriptor.programRef && descriptor.programSource) {
      try {
        var program = new Function('return ' + descriptor.programSource)();
        if (program && typeof program[descriptor.elementid] === 'function') {
          return Promise.resolve(program[descriptor.elementid]()).then(function(r) {
            return r;
          }).catch(function(err) {
            logwarn(executionState, '[EXECUTIONACTOR]', 'program restoration failed:', err);
            return descriptor.executor(executionContext);
          });
        }
      } catch (err) {
        logwarn(executionState, '[EXECUTIONACTOR]', 'program restoration failed:', err);
      }
    }
    return Promise.resolve(descriptor.executor(executionContext));
  }

  return runWithProgram().then(function(result) {
    logdebug(executionState, '[EXECUTIONACTOR]', 'runElementTask completed:', taskid, descriptor.elementid);
    return sendInstruction('executionactor', MESSAGETYPES.TASK_SETTLED, { taskid: taskid, status: 'EXECUTED', result: result || {} }, null, 'executionactor');
  }).catch(function(err) {
    logerror(executionState, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    return sendInstruction('executionactor', MESSAGETYPES.TASK_SETTLED, { taskid: taskid, status: 'FAILED', error: err, result: false }, null, 'executionactor');
  });
}

var executionInitialState = createInitialExecutionState();
Object.keys(executionactorINTERFACES).forEach(function(type) {
  MESSAGEREGISTRY.register('executionactor', type, executionactorINTERFACES[type], executionbehavior);
});

var EXECUTIONACTOR = createactor(
  executionbehavior,
  executionInitialState,
  MESSAGEREGISTRY.getInterfaces('executionactor'),
  {
    actorName: 'executionactor',
    mailboxType: 'mail',
    verbosity: executionVerbosityConstants.DEBUG
  }
);
restoreExecutionStateInto(EXECUTIONACTOR);

function enqueueExecutionPipelineLoaded(pipelineid, env, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: pipelineid, env: env }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionSubmit(descriptor, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.EXECUTE_ELEMENT, descriptor, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionAwaitTask(taskid, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.AWAIT_TASK, { taskid: taskid }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionGetTasks(filters, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.GET_TASKS, filters || {}, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionGetTaskStatus(taskid, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.GET_TASK_STATUS, { taskid: taskid }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionCancelTask(taskid, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.CANCEL_TASK, { taskid: taskid }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionStopTask(taskid, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.STOP_TASK, { taskid: taskid }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionGetStatus(pipelineid, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.GET_STATUS, { pipelineid: pipelineid }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionEnvUpdated(pipelineid, env, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.ENV_UPDATED, { pipelineid: pipelineid, env: env }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionCccAbort(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.CCC_ABORT, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionCccContinue(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.CCC_CONTINUE, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionCccRetry(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.CCC_RETRY, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionRegisterPipeline(pipelineid, dna, env, responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.REGISTER_PIPELINE, { pipelineid: pipelineid, dna: dna, env: env }, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionRecover(responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.RECOVER, {}, tag, 'blockcompiler', responseSpec);
}
function enqueueExecutionPing(responseSpec) {
  var tag = generateTag();
  sendInstruction('executionactor', MESSAGETYPES.PING, {}, tag, 'blockcompiler', responseSpec);
}

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
