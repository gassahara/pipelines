var EXECUTIONVERBOSITYCONSTANTS = createVerbosityConstants();

function SANITIZEFORSTATE(value, seen) {
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
    var arr = value.map(function(item) { return SANITIZEFORSTATE(item, seen); });
    seen.pop();
    return arr;
  }
  var out = {};
  Object.keys(value).forEach(function(key) {
    out[key] = SANITIZEFORSTATE(value[key], seen);
  });
  seen.pop();
  return out;
}

function ENSUREEXECUTIONSLICE(env) {
  return ensureEnvSlice(env, 'execution', function() {
    return {
      pipelines: {},
      tasks: {},
      taskCounter: 0,
      htmlSnapshot: null
    };
  });
}

function NEXTTASKID(execSlice) {
  execSlice.taskCounter = (execSlice.taskCounter || 0) + 1;
  return 'task_' + Date.now() + '_' + execSlice.taskCounter + '_' + Math.random().toString(36).slice(2, 8);
}

function MAKETASK(execSlice, descriptor) {
  var taskid = NEXTTASKID(execSlice);
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

function CANCELTASK(execSlice, taskid) {
  var task = execSlice.tasks[taskid];
  if (!task) return;
  logdebug(execSlice, '[EXECUTIONACTOR]', 'cancelTask cancelling task:', taskid);
  task.status = 'CANCELLED';
  (task.childTaskIds || []).forEach(function(childId) { CANCELTASK(execSlice, childId); });
  var err = { error: 'Task cancelled: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    SENDRESPONSE(consumer.sender, consumer.tag, err, 'EXECUTIONACTOR');
  });
  task.consumers = [];
}

function STOPTASK(execSlice, taskid) {
  var task = execSlice.tasks[taskid];
  if (!task) return;
  logdebug(execSlice, '[EXECUTIONACTOR]', 'stopTask stopping task:', taskid);
  task.status = 'STOPPED';
  var err = { error: 'Task stopped: ' + taskid };
  (task.consumers || []).forEach(function(consumer) {
    SENDRESPONSE(consumer.sender, consumer.tag, err, 'EXECUTIONACTOR');
  });
  task.consumers = [];
}

function ENSUREPIPELINE(execSlice, pipelineid) {
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

function SENDEXECUTIONUPDATE(execSlice) {
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
    updates: [{ path: 'execution', value: execSlice }]
  }, GENERATETAG(), 'EXECUTIONACTOR');
}

// Pure behavior function: (env, message) -> env
function EXECUTIONBEHAVIOR(env, message) {
  logdebug(env, '[EXECUTIONACTOR]', 'behavior handling action:', message.type);

  var execSlice = ENSUREEXECUTIONSLICE(env);

  switch (message.type) {
    case MESSAGETYPES.PIPELINE_LOADED: {
      loginfo(env, '[EXECUTIONACTOR]', 'action PIPELINE_LOADED:', message.pipelineid);
      var pipeline = ENSUREPIPELINE(execSlice, message.pipelineid);
      if (message.env && Object.keys(message.env).length > 0) pipeline.env = message.env;
      pipeline.status = 'running';
      SENDEXECUTIONUPDATE(execSlice);
      return env;
    }
    case MESSAGETYPES.ENV_UPDATED: {
      var p3 = ENSUREPIPELINE(execSlice, message.pipelineid);
      p3.env = SANITIZEFORSTATE(message.env || {});
      SENDEXECUTIONUPDATE(execSlice);
      return env;
    }
    case MESSAGETYPES.GET_STATUS: {
      var status = message.pipelineid ? (execSlice.pipelines[message.pipelineid] || null) : execSlice.pipelines;
      if (message.sender && message.tag) {
        SENDRESPONSE(message.sender, message.tag, status, 'EXECUTIONACTOR');
      }
      return env;
    }
    case MESSAGETYPES.EXECUTE_ELEMENT: {
      logdebug(env, '[EXECUTIONACTOR]', 'action EXECUTE_ELEMENT element:', message.elementid, 'pipeline:', message.pipelineid, 'path:', message.path);
      var task = MAKETASK(execSlice, {
        kind: 'element',
        pipelineid: message.pipelineid,
        elementid: message.elementid,
        serialized: message.serialized || null,
        programRef: message.programRef || null,
        origin: message.origin || null
      });
      if (message.sender && message.tag) {
        task.consumers = task.consumers || [];
        task.consumers.push({ sender: message.sender, tag: message.tag });
        logdebug(env, '[EXECUTIONACTOR]', 'registered consumer for task:', task.taskid, 'sender:', message.sender, 'tag:', message.tag);
      }
      SENDEXECUTIONUPDATE(execSlice);
      RUNELEMENTTASK(task.taskid, message, env);
      return env;
    }
    case MESSAGETYPES.AWAIT_TASK: {
      logdebug(env, '[EXECUTIONACTOR]', 'action AWAIT_TASK task:', message.taskid);
      var awaitTask = execSlice.tasks[message.taskid];
      if (!awaitTask) {
        if (message.sender && message.tag) {
          SENDRESPONSE(message.sender, message.tag, { error: '[EXECUTIONACTOR] unknown task: ' + message.taskid }, 'EXECUTIONACTOR');
        }
        return env;
      }
      if (awaitTask.status === 'EXECUTED') {
        if (message.sender && message.tag) {
          SENDRESPONSE(message.sender, message.tag, awaitTask.result || {}, 'EXECUTIONACTOR');
        }
      } else if (awaitTask.status === 'FAILED') {
        if (message.sender && message.tag) {
          SENDRESPONSE(message.sender, message.tag, { error: awaitTask.error ? awaitTask.error.message : 'task failed' }, 'EXECUTIONACTOR');
        }
      } else if (awaitTask.status === 'CANCELLED') {
        if (message.sender && message.tag) {
          SENDRESPONSE(message.sender, message.tag, { error: awaitTask.error ? awaitTask.error.message : 'task cancelled' }, 'EXECUTIONACTOR');
        }
      } else if (awaitTask.status === 'STOPPED') {
        if (message.sender && message.tag) {
          SENDRESPONSE(message.sender, message.tag, { error: 'task stopped' }, 'EXECUTIONACTOR');
        }
      } else {
        if (!awaitTask.consumers) awaitTask.consumers = [];
        awaitTask.consumers.push({ sender: message.sender, tag: message.tag });
        SENDEXECUTIONUPDATE(execSlice);
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
        SENDRESPONSE(message.sender, message.tag, result, 'EXECUTIONACTOR');
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
        SENDRESPONSE(message.sender, message.tag, statusResult, 'EXECUTIONACTOR');
      }
      return env;
    }
    case MESSAGETYPES.CANCEL_TASK: {
      CANCELTASK(execSlice, message.taskid);
      SENDEXECUTIONUPDATE(execSlice);
      return env;
    }
    case MESSAGETYPES.STOP_TASK: {
      STOPTASK(execSlice, message.taskid);
      SENDEXECUTIONUPDATE(execSlice);
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
            SENDRESPONSE(consumer.sender, consumer.tag, message.result || {}, 'EXECUTIONACTOR', MESSAGETYPES.TASK_RESULT);
          });
        } else if (message.status === 'FAILED') {
          consumers.forEach(function(consumer) {
            SENDRESPONSE(consumer.sender, consumer.tag, { error: message.error ? message.error.message : 'task failed' }, 'EXECUTIONACTOR', MESSAGETYPES.TASK_RESULT);
          });
        }
        task4.consumers = [];
        SENDEXECUTIONUPDATE(execSlice);
      }
      return env;
    }
    case MESSAGETYPES.RECOVER: {
      DBRESTORE('actor:state:execution').then(function(saved) {
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
        SENDEXECUTIONUPDATE(env.execution);
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, env, 'EXECUTIONACTOR');
      }).catch(function(e) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: e.message || String(e) }, 'EXECUTIONACTOR');
      });
      return env;
    }
    case MESSAGETYPES.REGISTER_PIPELINE: {
      logdebug(env, '[EXECUTIONACTOR]', 'action REGISTER_PIPELINE:', message.pipelineid);
      var p10 = ENSUREPIPELINE(execSlice, message.pipelineid);
      p10.usesElementSnapshots = true;
      if (message.env) p10.env = SANITIZEFORSTATE(message.env);
      SENDEXECUTIONUPDATE(execSlice);
      return env;
    }
    case MESSAGETYPES.PING: {
      if (message.sender && message.tag) {
        SENDRESPONSE(message.sender, message.tag, true, 'EXECUTIONACTOR');
      }
      return env;
    }
    default: {
      logwarn(env, '[EXECUTIONACTOR]', 'unknown message type:', message.type);
      return env;
    }
  }
}

function SETTLETASK(taskid, status, result, error, env) {
  logdebug(env, '[EXECUTIONACTOR]', 'settleTask task:', taskid, 'status:', status);
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
      SENDRESPONSE(consumer.sender, consumer.tag, responsePayload, 'EXECUTIONACTOR', MESSAGETYPES.TASK_RESULT);
    });
  } else if (status === 'FAILED') {
    responsePayload = {
      taskid: taskid,
      pipelineid: task.pipelineid,
      elementid: task.elementid,
      error: error ? error.message : 'task failed'
    };
    consumers.forEach(function(consumer) {
      SENDRESPONSE(consumer.sender, consumer.tag, responsePayload, 'EXECUTIONACTOR', MESSAGETYPES.TASK_RESULT);
    });
  }
  task.consumers = [];
  SENDEXECUTIONUPDATE(execSlice);
  logdebug(env, '[EXECUTIONACTOR]', 'settleTask completed:', taskid, 'consumers notified:', consumers.length);
}

function RUNELEMENTTASK(taskid, descriptor, env) {
  var executionContext = {
    env: descriptor.env,
    inputs: descriptor.signature && descriptor.signature.inputs ? descriptor.signature.inputs : [],
    outputs: descriptor.signature && descriptor.signature.outputs ? descriptor.signature.outputs : {},
    properties: descriptor.properties || {}
  };

  logdebug(env, '[EXECUTIONACTOR]', 'runElementTask start:', taskid, descriptor.elementid, 'pipeline:', descriptor.pipelineid);

  function RUNWITHPROGRAM() {
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

  var executionPromise;
  try {
    executionPromise = RUNWITHPROGRAM();
  } catch (syncErr) {
    executionPromise = Promise.reject(syncErr);
  }

  executionPromise.then(function(result) {
    logdebug(env, '[EXECUTIONACTOR]', 'runElementTask completed:', taskid, descriptor.elementid);
    SETTLETASK(taskid, 'EXECUTED', result || {}, null, env);
  }).catch(function(err) {
    logerror(env, '[EXECUTIONACTOR]', 'runElementTask failed:', taskid, descriptor.elementid, err);
    SETTLETASK(taskid, 'FAILED', null, err, env);
  });
}

function ENQUEUEEXECUTIONPIPELINELOADED(pipelineid, env, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: pipelineid, env: env }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONSUBMIT(descriptor, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.EXECUTE_ELEMENT, descriptor, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONAWAITTASK(taskid, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.AWAIT_TASK, { taskid: taskid }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONGETTASKS(filters, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.GET_TASKS, filters || {}, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONGETTASKSTATUS(taskid, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.GET_TASK_STATUS, { taskid: taskid }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONCANCELTASK(taskid, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.CANCEL_TASK, { taskid: taskid }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONSTOPTASK(taskid, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.STOP_TASK, { taskid: taskid }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONGETSTATUS(pipelineid, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.GET_STATUS, { pipelineid: pipelineid }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONENVUPDATED(pipelineid, env, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.ENV_UPDATED, { pipelineid: pipelineid, env: env }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONCCCABORT(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.CCC_ABORT, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONCCCCONTINUE(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.CCC_CONTINUE, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONCCCRETRY(pipelineid, path, elementid, continuation, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.CCC_RETRY, { pipelineid: pipelineid, path: path, elementid: elementid, continuation: continuation }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONREGISTERPIPELINE(pipelineid, dna, env, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.REGISTER_PIPELINE, { pipelineid: pipelineid, dna: dna, env: env }, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONRECOVER(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.RECOVER, {}, tag, 'BLOCKCOMPILER', responseSpec);
}
function ENQUEUEEXECUTIONPING(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.PING, {}, tag, 'BLOCKCOMPILER', responseSpec);
}

function STARTEXECUTIONACTOR(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    dispatch: function(message) { return DISPATCHTOACTOR('EXECUTIONACTOR', EXECUTIONBEHAVIOR, message); }
  };
}

function ENSUREEXECUTIONACTORREADY(options) {
  return Promise.resolve(STARTEXECUTIONACTOR(options));
}
