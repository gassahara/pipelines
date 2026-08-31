// ============================================================
// UPDATED FILE: js/actors/executionactor.js
// Change applied: PURE FUNCTION REFACTOR
//   - No message interface definitions.
//   - No MESSAGEREGISTRY references.
//   - No createactor object construction.
//   - Exports only createInitialExecutionState, executionbehavior,
//     enqueue producers, and task helpers.
//   - Actor state owned by the runtime (actorkernel.js).
// ============================================================

var executionVerbosityConstants = createVerbosityConstants();
var executionState = Object.freeze({ level: executionVerbosityConstants.DEBUG });

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

function createInitialExecutionState() {
  return {
    pipelines: {},
    htmlSnapshot: null,
    tasks: {},
    taskCounter: 0,
    worldmap: {
      pipelines: {},
      tasks: {},
      htmlSnapshot: null,
      taskCounter: 0
    },
    debugState: { currentContinuation: null },
    verbosity: executionVerbosityConstants.DEBUG
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

// Pure behavior function: (state, message) -> state
function executionbehavior(state, message) {
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
      return nextState;
    }
    case MESSAGETYPES.ENV_UPDATED: {
      var p3 = ensurePipeline(nextState, message.pipelineid);
      p3.env = sanitizeForState(message.env || {});
      return nextState;
    }
    case MESSAGETYPES.GET_STATUS: {
      var status = message.pipelineid ? (nextState.pipelines[message.pipelineid] || null) : nextState.pipelines;
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, status, 'executionactor');
      }
      return nextState;
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
      return nextState;
    }
    case MESSAGETYPES.AWAIT_TASK: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = nextState.tasks[message.taskid];
      if (!awaitTask) {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, { error: '[EXECUTIONACTOR] unknown task: ' + message.taskid }, 'executionactor');
        }
        return nextState;
      }
      if (awaitTask.status === 'EXECUTED') {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, awaitTask.result || {}, 'executionactor');
        }
      } else if (awaitTask.status === 'FAILED') {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, { error: awaitTask.error ? awaitTask.error.message : 'task failed' }, 'executionactor');
        }
      } else if (awaitTask.status === 'CANCELLED') {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, { error: awaitTask.error ? awaitTask.error.message : 'task cancelled' }, 'executionactor');
        }
      } else if (awaitTask.status === 'STOPPED') {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, { error: 'task stopped' }, 'executionactor');
        }
      } else {
        if (!awaitTask.consumers) awaitTask.consumers = [];
        awaitTask.consumers.push({ sender: message.sender, tag: message.tag });
      }
      return nextState;
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
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, result, 'executionactor');
      }
      return nextState;
    }
    case MESSAGETYPES.GET_TASK_STATUS: {
      var t2 = nextState.tasks[message.taskid];
      var statusResult = t2 ? {
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
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, statusResult, 'executionactor');
      }
      return nextState;
    }
    case MESSAGETYPES.CANCEL_TASK: {
      cancelTask(nextState, message.taskid);
      return nextState;
    }
    case MESSAGETYPES.STOP_TASK: {
      stopTask(nextState, message.taskid);
      return nextState;
    }
    case MESSAGETYPES.CCC_ABORT:
    case MESSAGETYPES.CCC_CONTINUE:
    case MESSAGETYPES.CCC_RETRY: {
      return nextState;
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
      return nextState;
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
          nextState.worldmap = createInitialExecutionState().worldmap;
          nextState.pipelines = {};
          nextState.tasks = {};
          nextState.htmlSnapshot = null;
          nextState.taskCounter = 0;
        }
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, nextState, 'executionactor');
      }).catch(function(e) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: e.message || String(e) }, 'executionactor');
      });
      return nextState;
    }
    case MESSAGETYPES.REGISTER_PIPELINE: {
      logdebug(executionState, '[EXECUTIONACTOR]', 'action REGISTER_PIPELINE:', message.pipelineid);
      var p10 = ensurePipeline(nextState, message.pipelineid);
      p10.usesElementSnapshots = true;
      if (message.env) p10.env = sanitizeForState(message.env);
      return nextState;
    }
    case MESSAGETYPES.PING: {
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, true, 'executionactor');
      }
      return nextState;
    }
    default: {
      logwarn(executionState, '[EXECUTIONACTOR]', 'unknown message type:', message.type);
      return nextState;
    }
  }
}

// Internal task settlement: direct call, no self-message
function settleTask(taskid, status, result, error) {
  var currentActorState = getActorState('executionactor');
  if (!currentActorState || !currentActorState.tasks) return;
  var task = currentActorState.tasks[taskid];
  if (!task) return;
  task.status = status;
  task.result = result || null;
  task.error = error || null;
  var consumers = task.consumers || [];
  if (status === 'EXECUTED') {
    consumers.forEach(function(consumer) {
      sendResponse(consumer.sender, consumer.tag, result || {}, 'executionactor');
    });
  } else if (status === 'FAILED') {
    consumers.forEach(function(consumer) {
      sendResponse(consumer.sender, consumer.tag, { error: error ? error.message : 'task failed' }, 'executionactor');
    });
  }
  task.consumers = [];
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

  runWithProgram().then(function(result) {
    logdebug(executionState, '[EXECUTIONACTOR]', 'runElementTask completed:', taskid, descriptor.elementid);
    settleTask(taskid, 'EXECUTED', result || {});
  }).catch(function(err) {
    logerror(executionState, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    settleTask(taskid, 'FAILED', null, err);
  });
}

// Register initial state with runtime.
registerActorState('executionactor', createInitialExecutionState());

// Compatibility handle (stateless) for enqueue producers.
var EXECUTIONACTOR = {
  getstate: function() { return getActorState('executionactor'); },
  dispatch: function(message) { return dispatchToActor('executionactor', executionbehavior, message); }
};

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
      var execStateObj = getActorState('executionactor');
      if (execStateObj) execStateObj.verbosity = lvl;
    }
  }
  return EXECUTIONACTOR;
}

function ensureExecutionActorReady(options) {
  return Promise.resolve(startExecutionActor(options));
}
