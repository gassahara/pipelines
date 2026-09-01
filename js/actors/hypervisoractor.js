// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Change applied: STATELESS PURE FUNCTION + MESSAGE-BASED UPDATES
//   - No interface definitions, no MESSAGEREGISTRY, no createactor.
//   - Behavior signature: hypervisorbehavior(env, message) -> env
//   - Uses env.hypervisor slice for pipeline orchestration state.
//   - When state changes, sends UPDATE message to worldmapactor via
//     sendInstruction; does not return a modified env.
//   - Direct helpers compileStageRequestToElements, orchestrateStage,
//     etc. remain.
// ============================================================

var hypervisorVerbosityConstants = createVerbosityConstants();

function createHypervisorErrorContext(label) {
  return function(err) {
    if (!err) err = new Error('unknown hypervisor error');
    if (!err.diagnostic) err.diagnostic = {};
    err.diagnostic.hypervisorstage = label;
    throw err;
  };
}

function registerHypervisorPipeline(hyperSlice, pipelineId) {
  if (!hyperSlice.activePipelines) hyperSlice.activePipelines = [];
  if (hyperSlice.activePipelines.indexOf(pipelineId) === -1) {
    hyperSlice.activePipelines.push(pipelineId);
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      patch: { hypervisor: hyperSlice }
    }, generateTag(), 'hypervisoractor');
  }
}

function compileAndOrchestrate(hyperSlice, message) {
  var result = compileStageRequestToElements(
    message.pipeline,
    message.stageIndex,
    message.stagePath,
    message.briefcase,
    message.env || {},
    message.options || {}
  );
  return orchestrateStage(
    result.stage,
    result.elementFunctions,
    message.pipelineId,
    message.env || {},
    message.stagePath || [],
    message.options || {},
    result.nextStageMessage
  ).then(function() {
    return { started: true };
  }).catch(function(err) {
    return { error: err.message };
  });
}

function handleStageCompleted(hyperSlice, message) {
  var key = message.pipelineId + ':' + message.stageId;
  loginfo(hyperSlice, '[HYPERVISOR]', 'action STAGE_COMPLETED:', key);
  if (message.env !== undefined && message.env !== null) {
    if (!hyperSlice.envByPipeline) hyperSlice.envByPipeline = {};
    if (!hyperSlice.envByPipeline[message.pipelineId]) hyperSlice.envByPipeline[message.pipelineId] = {};
    hyperSlice.envByPipeline[message.pipelineId].__root__ = {
      __root__: { env: message.env, updatedAt: Date.now() }
    };
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      patch: { hypervisor: hyperSlice }
    }, generateTag(), 'hypervisoractor');
  }
  var nextMsg = message.nextStageMessage || (hyperSlice.nextStageMessages ? hyperSlice.nextStageMessages[key] : null);
  if (nextMsg) {
    if (hyperSlice.nextStageMessages && hyperSlice.nextStageMessages[key]) delete hyperSlice.nextStageMessages[key];
    if (!nextMsg.env) {
      var rootEntry = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId] &&
        hyperSlice.envByPipeline[message.pipelineId].__root__ &&
        hyperSlice.envByPipeline[message.pipelineId].__root__.__root__;
      nextMsg.env = rootEntry ? rootEntry.env : (message.env || {});
    }
    var nextResult = compileStageRequestToElements(
      nextMsg.pipeline,
      nextMsg.stageIndex,
      nextMsg.stagePath,
      nextMsg.briefcase,
      nextMsg.env,
      nextMsg.options
    );
    orchestrateStage(
      nextResult.stage,
      nextResult.elementFunctions,
      nextMsg.pipelineId,
      nextMsg.env || {},
      nextMsg.stagePath || [],
      nextMsg.options || {},
      nextResult.nextStageMessage
    ).then(function() {
      // Next stage will send its own stage_completed
    }).catch(function(err) {
      logwarn(hyperSlice, '[HYPERVISOR]', 'next stage orchestration failed:', err);
    });
  } else {
    if (hyperSlice.activePipelines) {
      hyperSlice.activePipelines = hyperSlice.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
    }
    if (message.sender && message.tag) {
      sendResponse(message.sender, message.tag, { pipelineId: message.pipelineId }, 'hypervisoractor');
    }
  }
}

// Pure behavior function: (env, message) -> env
function hypervisorbehavior(env, message) {
  logdebug(env, '[HYPERVISOR]', 'behavior handling action:', message.type);

  var hyperSlice = env.hypervisor;

  switch (message.type) {
    case MESSAGETYPES.LOAD:
      return env;
    case MESSAGETYPES.SAVE:
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.GET_ENV: {
      var p = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId];
      var root = p && p.__root__ && p.__root__.__root__;
      var result = root ? root.env : (p || null);
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, result, 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.SET_ENV: {
      if (!hyperSlice.envByPipeline) hyperSlice.envByPipeline = {};
      if (!hyperSlice.envByPipeline[message.pipelineId]) hyperSlice.envByPipeline[message.pipelineId] = {};
      var stageId = message.stageId || '__root__';
      var elementId = message.elementId || '__root__';
      if (!hyperSlice.envByPipeline[message.pipelineId][stageId]) hyperSlice.envByPipeline[message.pipelineId][stageId] = {};
      hyperSlice.envByPipeline[message.pipelineId][stageId][elementId] = { env: message.env || {}, updatedAt: Date.now() };
      if (stageId !== '__root__' || elementId !== '__root__') {
        hyperSlice.envByPipeline[message.pipelineId].__root__ = { __root__: { env: message.env || {}, updatedAt: Date.now() } };
      }
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.GET_LATEST_ENV: {
      var pState = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      var latest = eState ? eState.env : (pState && pState.__root__ && pState.__root__.__root__ ? pState.__root__.__root__.env : null);
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, latest, 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.GET_RENDER_HTML:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, hyperSlice.renderHtml || '', 'hypervisoractor');
      return env;
    case MESSAGETYPES.SET_RENDER_HTML:
      hyperSlice.renderHtml = message.html || '';
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.GET_EXECUTION_STACK:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, hyperSlice.executionStack || [], 'hypervisoractor');
      return env;
    case MESSAGETYPES.SET_EXECUTION_STACK:
      hyperSlice.executionStack = message.stack || [];
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.GET_ROUTE:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, hyperSlice.routes && message.key ? (hyperSlice.routes[message.key] || null) : null, 'hypervisoractor');
      return env;
    case MESSAGETYPES.SET_ROUTE:
      if (!hyperSlice.routes) hyperSlice.routes = {};
      hyperSlice.routes[message.key] = message.route || null;
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.GET_ACTIVE_PIPELINES:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, (hyperSlice.activePipelines || []).slice(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.REGISTER_PIPELINE:
      registerHypervisorPipeline(hyperSlice, message.pipelineId);
      return env;
    case MESSAGETYPES.UNREGISTER_PIPELINE:
      if (!hyperSlice.activePipelines) hyperSlice.activePipelines = [];
      hyperSlice.activePipelines = hyperSlice.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      if (hyperSlice.triggerRecipients) {
        Object.keys(hyperSlice.triggerRecipients).forEach(function(key) {
          if (key.indexOf(message.pipelineId + ':') === 0) delete hyperSlice.triggerRecipients[key];
        });
      }
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.SET_PROGRAM:
      if (!hyperSlice.programs) hyperSlice.programs = {};
      hyperSlice.programs[message.programKey] = message.programSource;
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.GET_PROGRAM:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, hyperSlice.programs && message.programKey ? (hyperSlice.programs[message.programKey] || null) : null, 'hypervisoractor');
      return env;
    case MESSAGETYPES.MARK_BOOT:
      hyperSlice.boot = message.boot !== false;
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    case MESSAGETYPES.SET_STAGE_DESCRIPTOR: {
      if (!hyperSlice.stageDescriptors) hyperSlice.stageDescriptors = {};
      if (!hyperSlice.triggerRecipients) hyperSlice.triggerRecipients = {};
      var key = message.pipelineId + ':' + message.stageId;
      hyperSlice.stageDescriptors[key] = message.descriptor;
      hyperSlice.triggerRecipients[key] = true;
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      var status = hyperSlice.triggerRecipients && hyperSlice.triggerRecipients[recipientKey] === true;
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, status, 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var rootEntry = hyperSlice.envByPipeline && hyperSlice.envByPipeline[pipelineId] &&
        hyperSlice.envByPipeline[pipelineId].__root__ && hyperSlice.envByPipeline[pipelineId].__root__.__root__;
      var envForTrigger = rootEntry ? rootEntry.env : { pipelineid: pipelineId };
      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = hyperSlice.stageDescriptors && hyperSlice.stageDescriptors[descriptorKey];
      if (!descriptor) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: 'missing trigger descriptor: ' + descriptorKey }, 'hypervisoractor');
        return env;
      }
      hyperSlice.routes['pipeline:' + pipelineId] = { stageId: stageId, stagePath: message.stagePath || [stageId] };
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      callwithstack(EVALSTACK, 'hypervisor-trigger:' + pipelineId + ':' + stageId, 'async-await', function() {
        var stage = {
          id: descriptor.stageId || 'trigger_stage',
          elements: descriptor.elements || [],
          briefcase: descriptor.briefcase || {}
        };
        var stagePath = descriptor.stagePath || [stage.id];
        var options = descriptor.options || {};
        var compiled = compileStageRequestToElements(
          { elements: [stage] },
          0,
          stagePath,
          descriptor.briefcase || {},
          envForTrigger,
          options
        );
        return orchestrateStage(compiled.stage, compiled.elementFunctions, descriptor.pipelineId, envForTrigger, stagePath, options, null)
          .then(function(finalEnv) { return { env: finalEnv }; });
      }, [envForTrigger], { context: { env: envForTrigger }, capturecontinuation: true, errk: createHypervisorErrorContext('trigger') }).then(function(result) {
        var updatedEnv = result && result.env ? result.env : envForTrigger;
        if (!hyperSlice.envByPipeline[pipelineId]) hyperSlice.envByPipeline[pipelineId] = {};
        hyperSlice.envByPipeline[pipelineId].__root__ = { __root__: { env: updatedEnv, updatedAt: Date.now() } };
        sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
          patch: { hypervisor: hyperSlice }
        }, generateTag(), 'hypervisoractor');
      }).catch(function(err) {
        logwarn(env, '[HYPERVISOR]', 'trigger failed:', err);
      });
      return env;
    }
    case MESSAGETYPES.PING:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, true, 'hypervisoractor');
      return env;
    case MESSAGETYPES.RECOVER:
      enqueueDbRestore('actor:state:hypervisor').then(function(saved) {
        if (saved && typeof saved === 'object') {
          env.hypervisor = saved;
        } else {
          env.hypervisor = {
            boot: true,
            envByPipeline: {},
            renderHtml: '',
            executionStack: [],
            routes: {},
            activePipelines: [],
            programs: {},
            stageDescriptors: {},
            triggerRecipients: {},
            loadedPipelines: {},
            nextStageMessages: {}
          };
        }
        sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
          patch: { hypervisor: env.hypervisor }
        }, generateTag(), 'hypervisoractor');
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, env, 'hypervisoractor');
      }).catch(function(e) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: e.message || String(e) }, 'hypervisoractor');
      });
      return env;
    case MESSAGETYPES.ACTIVATE_ACTORS:
      // In pure function architecture, no actor activation is required.
      return env;
    case MESSAGETYPES.BOOT_PIPELINE: {
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) bootOptions.autorun = true;
      if (bootOptions.verbosity === undefined && env.verbosity !== undefined) bootOptions.verbosity = env.verbosity;
      var pipelineBriefcase = message.pipeline && message.pipeline.briefcase ? message.pipeline.briefcase : {};
      var briefcaseCheck = validatePipelineBriefcase(pipelineBriefcase);
      var briefcaseErrors = Array.isArray(briefcaseCheck) ? briefcaseCheck : (briefcaseCheck.errors || []);
      var briefcaseValid = Array.isArray(briefcaseCheck) ? briefcaseCheck.length === 0 : Boolean(briefcaseCheck.valid);
      if (!briefcaseValid) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: '[HYPERVISOR] briefcase validation failed: ' + briefcaseErrors.join(', ') }, 'hypervisoractor');
        return env;
      }
      hyperSlice.loadedPipelines = hyperSlice.loadedPipelines || {};
      hyperSlice.loadedPipelines[message.pipelineId] = { pipeline: message.pipeline, accessors: message.accessors || null, sinks: message.sinks || [], options: bootOptions };
      var savedRoot = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId] &&
        hyperSlice.envByPipeline[message.pipelineId].__root__ && hyperSlice.envByPipeline[message.pipelineId].__root__.__root__;
      var initialEnv = savedRoot ? savedRoot.env : (bootOptions.baseEnv || {});
      registerHypervisorPipeline(hyperSlice, message.pipelineId);
      sendInstruction('executionactor', 'pipeline_loaded', { pipelineid: message.pipelineId, env: {} }, null, 'hypervisoractor');
      sendInstruction('executionactor', 'register_pipeline', { pipelineid: message.pipelineId, dna: null, env: {} }, null, 'hypervisoractor');
      var firstStage = message.firstStage || { stageIndex: 0, stagePath: [], briefcase: pipelineBriefcase };
      var compileResult = compileStageRequestToElements(
        message.pipeline,
        firstStage.stageIndex,
        firstStage.stagePath || [],
        firstStage.briefcase || pipelineBriefcase,
        initialEnv,
        bootOptions
      );
      orchestrateStage(
        compileResult.stage,
        compileResult.elementFunctions,
        message.pipelineId,
        initialEnv,
        firstStage.stagePath || [],
        bootOptions,
        compileResult.nextStageMessage
      ).then(function() {}).catch(function(err) {
        logwarn(env, '[HYPERVISOR]', 'boot pipeline orchestration failed:', err);
      });
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        patch: { hypervisor: hyperSlice }
      }, generateTag(), 'hypervisoractor');
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, { started: true, pipelineId: message.pipelineId }, 'hypervisoractor');
      return env;
    }
    case MESSAGETYPES.COMPILE_STAGE: {
      logdebug(env, '[HYPERVISOR]', 'action COMPILE_STAGE:', message.pipelineId, 'stageIndex:', message.stageIndex);
      compileAndOrchestrate(hyperSlice, message).then(function(res) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, res, 'hypervisoractor');
      });
      return env;
    }
    case MESSAGETYPES.STAGE_COMPLETED: {
      handleStageCompleted(hyperSlice, message);
      return env;
    }
    default:
      logwarn(env, '[HYPERVISOR]', 'unknown message type:', message.type);
      return env;
  }
}

function enqueueHypervisor(type, payload, responseSpec) {
  var tag = generateTag();
  sendInstruction('hypervisoractor', type, payload || {}, tag, 'system', responseSpec);
}

function enqueueHypervisorLoad(responseSpec) { return enqueueHypervisor(MESSAGETYPES.LOAD, {}, responseSpec); }
function enqueueHypervisorSave(responseSpec) { return enqueueHypervisor(MESSAGETYPES.SAVE, {}, responseSpec); }
function enqueueHypervisorGetEnv(pipelineId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_ENV, { pipelineId: pipelineId }, responseSpec); }
function enqueueHypervisorSetEnv(pipelineId, env, stageId, elementId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_ENV, { pipelineId: pipelineId, env: env, stageId: stageId, elementId: elementId }, responseSpec); }
function enqueueHypervisorGetLatestEnv(pipelineId, stageId, elementId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_LATEST_ENV, { pipelineId: pipelineId, stageId: stageId, elementId: elementId }, responseSpec); }
function enqueueHypervisorGetRenderHtml(responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_RENDER_HTML, {}, responseSpec); }
function enqueueHypervisorSetRenderHtml(html, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_RENDER_HTML, { html: html }, responseSpec); }
function enqueueHypervisorGetExecutionStack(responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_EXECUTION_STACK, {}, responseSpec); }
function enqueueHypervisorSetExecutionStack(stack, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_EXECUTION_STACK, { stack: stack }, responseSpec); }
function enqueueHypervisorGetRoute(key, responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_ROUTE, { key: key }, responseSpec); }
function enqueueHypervisorSetRoute(key, route, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_ROUTE, { key: key, route: route }, responseSpec); }
function enqueueHypervisorGetActivePipelines(responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_ACTIVE_PIPELINES, {}, responseSpec); }
function enqueueHypervisorRegisterPipeline(pipelineId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: pipelineId }, responseSpec); }
function enqueueHypervisorUnregisterPipeline(pipelineId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: pipelineId }, responseSpec); }
function enqueueHypervisorSetProgram(programKey, programSource, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_PROGRAM, { programKey: programKey, programSource: programSource }, responseSpec); }
function enqueueHypervisorGetProgram(programKey, responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_PROGRAM, { programKey: programKey }, responseSpec); }
function enqueueHypervisorMarkBoot(boot, responseSpec) { return enqueueHypervisor(MESSAGETYPES.MARK_BOOT, { boot: boot }, responseSpec); }
function enqueueHypervisorSetStageDescriptor(pipelineId, stageId, descriptor, responseSpec) { return enqueueHypervisor(MESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId: pipelineId, stageId: stageId, descriptor: descriptor }, responseSpec); }
function enqueueHypervisorGetTriggerRecipientStatus(pipelineId, stageId, responseSpec) { return enqueueHypervisor(MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId: pipelineId, stageId: stageId }, responseSpec); }
function enqueueHypervisorTrigger(payload, responseSpec) { return enqueueHypervisor(MESSAGETYPES.TRIGGER_EVENT, payload, responseSpec); }
function enqueueHypervisorPing(responseSpec) { return enqueueHypervisor(MESSAGETYPES.PING, {}, responseSpec); }
function enqueueHypervisorActivateActors(responseSpec) { return enqueueHypervisor(MESSAGETYPES.ACTIVATE_ACTORS, {}, responseSpec); }
function enqueueHypervisorBootPipeline(payload, responseSpec) { return enqueueHypervisor(MESSAGETYPES.BOOT_PIPELINE, payload, responseSpec); }
function enqueueHypervisorStageCompleted(pipelineId, stageId, nextStageMessage, env, responseSpec) { return enqueueHypervisor(MESSAGETYPES.STAGE_COMPLETED, { pipelineId: pipelineId, stageId: stageId, nextStageMessage: nextStageMessage, env: env }, responseSpec); }

function startHypervisorActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('hypervisoractor', hypervisorbehavior, message); }
  };
}
