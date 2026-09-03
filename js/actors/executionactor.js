var executionVerbosityConstants = createVerbosityConstants();

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

function ensureExecutionSlice(env) {
  return ensureEnvSlice(env, 'execution', function() {
    return {
      pipelines: {},
      tasks: {},
      taskCounter: 0,
      htmlSnapshot: null
    };
  });
}

function nextTaskId(execSlice) {
  execSlice.taskCounter = (execSlice.taskCounter || 0) + 1;
  return 'task_' + Date.now() + '_' + execSlice.taskCounter + '_' + Math.random().toString(36).slice(2, 8);
}

function makeTask(execSlice, descriptor) {
  var taskid = nextTaskId(execSlice);
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
  execSlice.tasks[taskid] = task;
  logdebug(execSlice, '[EXECUTIONACTOR]', 'makeTask created element task:', taskid, 'pipelineid:', task.pipelineid, 'elementid:', task.elementid);
  return task;
}

function cancelTask(execSlice, taskid) {
  var task = execSlice.tasks[taskid];
  if (!task) return;
  logdebug(execSlice, '[EXECUTIONACTOR]', 'cancelTask cancelling task:', taskid);
  task.status = 'CANCELLED';
  (task.childTaskIds || []).forEach(function(childId) { cancelTask(execSlice, childId); });
  var err = { error: 'Task cancelled: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    sendResponse(consumer.sender, consumer.tag, err, 'executionactor');
  });
  task.consumers = [];
}

function stopTask(execSlice, taskid) {
  var task = execSlice.tasks[taskid];
  if (!task) return;
  logdebug(execSlice, '[EXECUTIONACTOR]', 'stopTask stopping task:', taskid);
  task.status = 'STOPPED';
  var err = { error: 'Task stopped: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    sendResponse(consumer.sender, consumer.tag, err, 'executionactor');
  });
  task.consumers = [];
}

function ensurePipeline(execSlice, pipelineid) {
  if (!execSlice.pipelines[pipelineid]) {
    logdebug(execSlice, '[EXECUTIONACTOR]', 'ensurePipeline initializing pipeline tracking for:', pipelineid);
    execSlice.pipelines[pipelineid] = {
      status: 'running',
      env: {},
      dna: null,
      usesElementSnapshots: false
    };
  }
  return execSlice.pipelines[pipelineid];
}

function sendExecutionUpdate(execSlice) {
  sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
    updates: [{ path: 'execution', value: execSlice }]
  }, generateTag(), 'executionactor');
}

// Pure behavior function: (env, message) -> env
function executionbehavior(env, message) {
  logdebug(env, '[EXECUTIONACTOR]', 'behavior handling action:', message.type);

  var execSlice = ensureExecutionSlice(env);

  switch (message.type) {
    case MESSAGETYPES.PIPELINE_LOADED: {
      loginfo(env, '[EXECUTIONACTOR]', 'action PIPELINE_LOADED:', message.pipelineid);
      var pipeline = ensurePipeline(execSlice, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
      sendExecutionUpdate(execSlice);
      return env;
    }
    case MESSAGETYPES.ENV_UPDATED: {
      var p3 = ensurePipeline(execSlice, message.pipelineid);
      p3.env = sanitizeForState(message.env || {});
      sendExecutionUpdate(execSlice);
      return env;
    }
    case MESSAGETYPES.GET_STATUS: {
      var status = message.pipelineid ? (execSlice.pipelines[message.pipelineid] || null) : execSlice.pipelines;
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, status, 'executionactor');
      }
      return env;
    }
    case MESSAGETYPES.EXECUTE_ELEMENT: {
      logdebug(env, '[EXECUTIONACTOR]', 'action EXECUTE_ELEMENT element:', message.elementid, 'pipeline:', message.pipelineid, 'path:', message.path);
      var task = makeTask(execSlice, {
        kind: 'element',
        pipelineid: message.pipelineid,
        elementid: message.elementid,
        serialized: message.serialized || null,
        programRef: message.programRef || null,
        origin: message.origin || null
      });
      // P13: Register requester as consumer so settleTask can respond.
      if (message.sender && message.tag) {
        task.consumers = task.consumers || [];
        task.consumers.push({ sender: message.sender, tag: message.tag });
        logdebug(env, '[EXECUTIONACTOR]', 'registered consumer for task:', task.taskid, 'sender:', message.sender, 'tag:', message.tag);
      }
      sendExecutionUpdate(execSlice);
      runElementTask(task.taskid, message, env);
      return env;
    }
    case MESSAGETYPES.AWAIT_TASK: {
      logdebug(env, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = execSlice.tasks[message.taskid];
      if (!awaitTask) {
        if (message.sender && message.tag) {
          sendResponse(message.sender, message.tag, { error: '[EXECUTIONACTOR] unknown task: ' + message.taskid }, 'executionactor');
        }
        return env;
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
        sendExecutionUpdate(execSlice);
      }
      return env;
    }
    case MESSAGETYPES.GET_TASKS: {
      var result = [];
      Object.keys(execSlice.tasks).forEach(function(tid) {
        var t = execSlice.tasks[tid];
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
      return env;
    }
    case MESSAGETYPES.GET_TASK_STATUS: {
      var t2 = execSlice.tasks[message.taskid];
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
      return env;
    }
    case MESSAGETYPES.CANCEL_TASK: {
      cancelTask(execSlice, message.taskid);
      sendExecutionUpdate(execSlice);
      return env;
    }
    case MESSAGETYPES.STOP_TASK: {
      stopTask(execSlice, message.taskid);
      sendExecutionUpdate(execSlice);
      return env;
    }
    case MESSAGETYPES.CCC_ABORT:
    case MESSAGETYPES.CCC_CONTINUE:
    case MESSAGETYPES.CCC_RETRY: {
      return env;
    }
    case MESSAGETYPES.TASK_SETTLED: {
      logdebug(env, '[EXECUTIONACTOR]', 'action TASK_SETTLED task:', message.taskid, 'status:', message.status);
      var task4 = execSlice.tasks[message.taskid];
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
        sendExecutionUpdate(execSlice);
      }
      return env;
    }
    case MESSAGETYPES.RECOVER: {
      enqueueDbRestore('actor:state:execution').then(function(saved) {
        if (saved !== null && saved !== undefined) {
          env.execution = saved;
        } else {
          env.execution = {
            pipelines: {},
            tasks: {},
            taskCounter: 0,
            htmlSnapshot: null
          };
        }
        sendExecutionUpdate(env.execution);
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, env, 'executionactor');
      }).catch(function(e) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: e.message || String(e) }, 'executionactor');
      });
      return env;
    }
    case MESSAGETYPES.REGISTER_PIPELINE: {
      logdebug(env, '[EXECUTIONACTOR]', 'action REGISTER_PIPELINE:', message.pipelineid);
      var p10 = ensurePipeline(execSlice, message.pipelineid);
      p10.usesElementSnapshots = true;
      if (message.env) p10.env = sanitizeForState(message.env);
      sendExecutionUpdate(execSlice);
      return env;
    }
    case MESSAGETYPES.PING: {
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, true, 'executionactor');
      }
      return env;
    }
    default: {
      logwarn(env, '[EXECUTIONACTOR]', 'unknown message type:', message.type);
      return env;
    }
  }
}

// Internal task settlement: direct call, then update worldmapactor.
function settleTask(taskid, status, result, error, env) {
  logdebug(env, '[EXECUTIONACTOR]', 'settleTask task:', taskid, 'status:', status, 'pipeline:', (env.execution && env.execution.tasks && env.execution.tasks[taskid] ? env.execution.tasks[taskid].pipelineid : 'unknown'));
  var execSlice = env.execution;
  var task = execSlice.tasks[taskid];
  if (!task) return;
  task.status = status;
  task.result = result || null;
  task.error = error || null;
  var consumers = task.consumers || [];

  var responsePayload;
  if (status === 'EXECUTED') {
    responsePayload = {
      taskid: taskid,
      pipelineid: task.pipelineid,
      elementid: task.elementid,
      result: result || {}
    };
    consumers.forEach(function(consumer) {
      sendResponse(consumer.sender, consumer.tag, responsePayload, 'executionactor', MESSAGETYPES.TASK_RESULT);
    });
  } else if (status === 'FAILED') {
    responsePayload = {
      taskid: taskid,
      pipelineid: task.pipelineid,
      elementid: task.elementid,
      error: error ? error.message : 'task failed'
    };
    consumers.forEach(function(consumer) {
      sendResponse(consumer.sender, consumer.tag, responsePayload, 'executionactor', MESSAGETYPES.TASK_RESULT);
    });
  }
  task.consumers = [];
  sendExecutionUpdate(execSlice);
  logdebug(env, '[EXECUTIONACTOR]', 'settleTask completed:', taskid, 'consumers notified:', consumers.length);
}

function runElementTask(taskid, descriptor, env) {
  var executionContext = {
    env: descriptor.env,
    inputs: descriptor.signature && descriptor.signature.inputs ? descriptor.signature.inputs : [],
    outputs: descriptor.signature && descriptor.signature.outputs ? descriptor.signature.outputs : {},
    properties: descriptor.properties || {}
  };

  logdebug(env, '[EXECUTIONACTOR]', 'runElementTask start:', taskid, descriptor.elementid, 'pipeline:', descriptor.pipelineid);

  function runWithProgram() {
    if (descriptor.programRef && descriptor.programSource) {
      try {
        var program = new Function('return ' + descriptor.programSource)();
        if (program && typeof program[descriptor.elementid] === 'function') {
          return Promise.resolve(program[descriptor.elementid]()).then(function(r) {
            return r;
          }).catch(function(err) {
            logwarn(env, '[EXECUTIONACTOR]', 'program restoration failed:', err);
            return descriptor.executor(executionContext);
          });
        }
      } catch (err) {
        logwarn(env, '[EXECUTIONACTOR]', 'program restoration failed:', err);
      }
    }
    return Promise.resolve(descriptor.executor(executionContext));
  }

  runWithProgram().then(function(result) {
    logdebug(env, '[EXECUTIONACTOR]', 'runElementTask completed:', taskid, descriptor.elementid);
    settleTask(taskid, 'EXECUTED', result || {}, null, env);
  }).catch(function(err) {
    logerror(env, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    settleTask(taskid, 'FAILED', null, err, env);
  });
}

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
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('executionactor', executionbehavior, message); }
  };
}

function ensureExecutionActorReady(options) {
  return Promise.resolve(startExecutionActor(options));
}
