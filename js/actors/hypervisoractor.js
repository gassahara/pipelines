// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Change applied: PURE FUNCTION REFACTOR
//   - No message interface definitions.
//   - No MESSAGEREGISTRY references.
//   - No createactor object construction.
//   - Exports only createInitialHypervisorState, hypervisorbehavior,
//     enqueue producers, and internal helpers.
//   - Actor state owned by the runtime (actorkernel.js).
// ============================================================

var hypervisorVerbosityConstants = createVerbosityConstants();
var hypervisorState = Object.freeze({ level: hypervisorVerbosityConstants.DEBUG });

function createHypervisorErrorContext(label) {
  return function(err) {
    if (!err) err = new Error('unknown hypervisor error');
    if (!err.diagnostic) err.diagnostic = {};
    err.diagnostic.hypervisorstage = label;
    throw err;
  };
}

function createInitialHypervisorState(verbosity) {
  return {
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
    nextStageMessages: {},
    verbosity: verbosity !== undefined ? verbosity : hypervisorVerbosityConstants.DEBUG,
    savedAt: Date.now()
  };
}

function persistHypervisorState(state) {
  state.savedAt = Date.now();
  logdebug(hypervisorState, '[HYPERVISOR]', 'persistHypervisorState saving state to db');
  enqueueDbStore('actor:state:hypervisor', state).catch(function(err) {
    logwarn(hypervisorState, '[HYPERVISOR]', 'state persist failed:', err);
  });
}

function recoverHypervisorState(verbosity) {
  logdebug(hypervisorState, '[HYPERVISOR]', 'recoverHypervisorState start');
  return enqueueDbRestore('actor:state:hypervisor').then(function(saved) {
    if (saved && typeof saved === 'object') {
      if (verbosity !== undefined) saved.verbosity = verbosity;
      return saved;
    }
    var initial = createInitialHypervisorState(verbosity);
    return enqueueDbStore('actor:state:hypervisor', initial).then(function() { return initial; });
  });
}

// executeStage — direct global function call; no self-message.
function executeStage(descriptor, env, mode, eventPayload) {
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
    env || {},
    options
  );
  return orchestrateStage(compiled.stage, compiled.elementFunctions, descriptor.pipelineId, env || {}, stagePath, options, null).then(function(finalEnv) {
    return { env: finalEnv };
  });
}

// Directly register pipeline without self-message
function registerHypervisorPipeline(state, pipelineId) {
  if (!state.activePipelines) state.activePipelines = [];
  if (state.activePipelines.indexOf(pipelineId) === -1) {
    state.activePipelines.push(pipelineId);
    persistHypervisorState(state);
  }
}

// Directly compile and orchestrate a stage
function compileAndOrchestrate(state, message) {
  var result = compileStageRequestToElements(message.pipeline, message.stageIndex, message.stagePath, message.briefcase, message.env || {}, message.options || {});
  return orchestrateStage(result.stage, result.elementFunctions, message.pipelineId, message.env || {}, message.stagePath || [], message.options || {}, result.nextStageMessage).then(function() {
    return { started: true };
  }).catch(function(err) {
    return { error: err.message };
  });
}

// Directly handle stage completed without self-message
function handleStageCompleted(state, message) {
  var key = message.pipelineId + ':' + message.stageId;
  loginfo(hypervisorState, '[HYPERVISOR]', 'action STAGE_COMPLETED:', key);
  if (message.env !== undefined && message.env !== null) {
    if (!state.envByPipeline) state.envByPipeline = {};
    if (!state.envByPipeline[message.pipelineId]) state.envByPipeline[message.pipelineId] = {};
    state.envByPipeline[message.pipelineId].__root__ = { __root__: { env: message.env, updatedAt: Date.now() } };
    persistHypervisorState(state);
  }
  var nextMsg = message.nextStageMessage || (state.nextStageMessages ? state.nextStageMessages[key] : null);
  if (nextMsg) {
    if (state.nextStageMessages && state.nextStageMessages[key]) delete state.nextStageMessages[key];
    if (!nextMsg.env) {
      var rootEntry = state.envByPipeline && state.envByPipeline[message.pipelineId] && state.envByPipeline[message.pipelineId].__root__ && state.envByPipeline[message.pipelineId].__root__.__root__;
      nextMsg.env = rootEntry ? rootEntry.env : (message.env || {});
    }
    // Directly compile and orchestrate next stage
    var nextResult = compileStageRequestToElements(nextMsg.pipeline, nextMsg.stageIndex, nextMsg.stagePath, nextMsg.briefcase, nextMsg.env, nextMsg.options);
    orchestrateStage(nextResult.stage, nextResult.elementFunctions, nextMsg.pipelineId, nextMsg.env || {}, nextMsg.stagePath || [], nextMsg.options || {}, nextResult.nextStageMessage).then(function() {
      // Next stage will send its own stage_completed
    }).catch(function(err) {
      logwarn(hypervisorState, '[HYPERVISOR]', 'next stage orchestration failed:', err);
    });
  } else {
    if (state.activePipelines) {
      state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      persistHypervisorState(state);
    }
    // Pipeline booted: send response to original boot_pipeline tag
    if (message.sender && message.tag) {
      sendResponse(message.sender, message.tag, { pipelineId: message.pipelineId }, 'hypervisoractor');
    }
  }
}

// Pure behavior function: (state, message) -> state
function hypervisorbehavior(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : hypervisorVerbosityConstants.DEBUG;
  hypervisorState = Object.freeze({ level: v });
  logdebug(hypervisorState, '[HYPERVISOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case MESSAGETYPES.LOAD:
      return state;
    case MESSAGETYPES.SAVE:
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.GET_ENV: {
      var p = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var root = p && p.__root__ && p.__root__.__root__;
      var result = root ? root.env : (p || null);
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, result, 'hypervisoractor');
      return state;
    }
    case MESSAGETYPES.SET_ENV: {
      if (!state.envByPipeline) state.envByPipeline = {};
      if (!state.envByPipeline[message.pipelineId]) state.envByPipeline[message.pipelineId] = {};
      var stageId = message.stageId || '__root__';
      var elementId = message.elementId || '__root__';
      if (!state.envByPipeline[message.pipelineId][stageId]) state.envByPipeline[message.pipelineId][stageId] = {};
      state.envByPipeline[message.pipelineId][stageId][elementId] = { env: message.env || {}, updatedAt: Date.now() };
      if (stageId !== '__root__' || elementId !== '__root__') {
        state.envByPipeline[message.pipelineId].__root__ = { __root__: { env: message.env || {}, updatedAt: Date.now() } };
      }
      persistHypervisorState(state);
      return state;
    }
    case MESSAGETYPES.GET_LATEST_ENV: {
      var pState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      var latest = eState ? eState.env : (pState && pState.__root__ && pState.__root__.__root__ ? pState.__root__.__root__.env : null);
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, latest, 'hypervisoractor');
      return state;
    }
    case MESSAGETYPES.GET_RENDER_HTML:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, state.renderHtml || '', 'hypervisoractor');
      return state;
    case MESSAGETYPES.SET_RENDER_HTML:
      state.renderHtml = message.html || '';
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.GET_EXECUTION_STACK:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, state.executionStack || [], 'hypervisoractor');
      return state;
    case MESSAGETYPES.SET_EXECUTION_STACK:
      state.executionStack = message.stack || [];
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.GET_ROUTE:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, state.routes && message.key ? (state.routes[message.key] || null) : null, 'hypervisoractor');
      return state;
    case MESSAGETYPES.SET_ROUTE:
      if (!state.routes) state.routes = {};
      state.routes[message.key] = message.route || null;
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.GET_ACTIVE_PIPELINES:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, (state.activePipelines || []).slice(), 'hypervisoractor');
      return state;
    case MESSAGETYPES.REGISTER_PIPELINE:
      registerHypervisorPipeline(state, message.pipelineId);
      return state;
    case MESSAGETYPES.UNREGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      if (state.triggerRecipients) {
        Object.keys(state.triggerRecipients).forEach(function(key) {
          if (key.indexOf(message.pipelineId + ':') === 0) delete state.triggerRecipients[key];
        });
      }
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.SET_PROGRAM:
      if (!state.programs) state.programs = {};
      state.programs[message.programKey] = message.programSource;
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.GET_PROGRAM:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, state.programs && message.programKey ? (state.programs[message.programKey] || null) : null, 'hypervisoractor');
      return state;
    case MESSAGETYPES.MARK_BOOT:
      state.boot = message.boot !== false;
      persistHypervisorState(state);
      return state;
    case MESSAGETYPES.SET_STAGE_DESCRIPTOR: {
      if (!state.stageDescriptors) state.stageDescriptors = {};
      if (!state.triggerRecipients) state.triggerRecipients = {};
      var key = message.pipelineId + ':' + message.stageId;
      state.stageDescriptors[key] = message.descriptor;
      state.triggerRecipients[key] = true;
      persistHypervisorState(state);
      return state;
    }
    case MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      var status = state.triggerRecipients && state.triggerRecipients[recipientKey] === true;
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, status, 'hypervisoractor');
      return state;
    }
    case MESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };
      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];
      if (!descriptor) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: 'missing trigger descriptor: ' + descriptorKey }, 'hypervisoractor');
        return state;
      }
      state.routes['pipeline:' + pipelineId] = { stageId: stageId, stagePath: message.stagePath || [stageId] };
      persistHypervisorState(state);
      callwithstack(EVALSTACK, 'hypervisor-trigger:' + pipelineId + ':' + stageId, 'async-await', function() {
        return executeStage(descriptor, env, 'trigger', message.eventPayload);
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createHypervisorErrorContext('trigger') }).then(function(result) {
        var updatedEnv = result && result.env ? result.env : env;
        if (!state.envByPipeline[pipelineId]) state.envByPipeline[pipelineId] = {};
        state.envByPipeline[pipelineId].__root__ = { __root__: { env: updatedEnv, updatedAt: Date.now() } };
        persistHypervisorState(state);
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'trigger failed:', err);
      });
      return state;
    }
    case MESSAGETYPES.PING:
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, true, 'hypervisoractor');
      return state;
    case MESSAGETYPES.RECOVER:
      recoverHypervisorState(state.verbosity).then(function(saved) {
        state.envByPipeline = saved.envByPipeline || state.envByPipeline;
        state.renderHtml = saved.renderHtml || state.renderHtml;
        state.executionStack = saved.executionStack || state.executionStack;
        state.routes = saved.routes || state.routes;
        state.activePipelines = saved.activePipelines || state.activePipelines;
        state.programs = saved.programs || state.programs;
        state.stageDescriptors = saved.stageDescriptors || state.stageDescriptors;
        state.triggerRecipients = saved.triggerRecipients || state.triggerRecipients;
        state.loadedPipelines = saved.loadedPipelines || state.loadedPipelines;
        state.nextStageMessages = saved.nextStageMessages || state.nextStageMessages;
        persistHypervisorState(state);
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, state, 'hypervisoractor');
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', err);
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: err.message || String(err) }, 'hypervisoractor');
      });
      return state;
    case MESSAGETYPES.ACTIVATE_ACTORS:
      activateManagedActors({ verbosity: state.verbosity }).then(function() {}).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', err); });
      return state;
    case MESSAGETYPES.BOOT_PIPELINE: {
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) bootOptions.autorun = true;
      if (bootOptions.verbosity === undefined && state.verbosity !== undefined) bootOptions.verbosity = state.verbosity;
      var pipelineBriefcase = message.pipeline && message.pipeline.briefcase ? message.pipeline.briefcase : {};
      var briefcaseCheck = validatePipelineBriefcase(pipelineBriefcase);
      var briefcaseErrors = Array.isArray(briefcaseCheck) ? briefcaseCheck : (briefcaseCheck.errors || []);
      var briefcaseValid = Array.isArray(briefcaseCheck) ? briefcaseCheck.length === 0 : Boolean(briefcaseCheck.valid);
      if (!briefcaseValid) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, { error: '[HYPERVISOR] briefcase validation failed: ' + briefcaseErrors.join(', ') }, 'hypervisoractor');
        return state;
      }
      state.loadedPipelines = state.loadedPipelines || {};
      state.loadedPipelines[message.pipelineId] = { pipeline: message.pipeline, accessors: message.accessors || null, sinks: message.sinks || [], options: bootOptions };
      var savedRoot = state.envByPipeline && state.envByPipeline[message.pipelineId] && state.envByPipeline[message.pipelineId].__root__ && state.envByPipeline[message.pipelineId].__root__.__root__;
      var initialEnv = savedRoot ? savedRoot.env : (bootOptions.baseEnv || {});
      registerHypervisorPipeline(state, message.pipelineId);
      sendInstruction('executionactor', 'pipeline_loaded', { pipelineid: message.pipelineId, env: {} }, null, 'hypervisoractor');
      sendInstruction('executionactor', 'register_pipeline', { pipelineid: message.pipelineId, dna: null, env: {} }, null, 'hypervisoractor');
      var firstStage = message.firstStage || { stageIndex: 0, stagePath: [], briefcase: pipelineBriefcase };
      var compileResult = compileStageRequestToElements(message.pipeline, firstStage.stageIndex, firstStage.stagePath || [], firstStage.briefcase || pipelineBriefcase, initialEnv, bootOptions);
      orchestrateStage(compileResult.stage, compileResult.elementFunctions, message.pipelineId, initialEnv, firstStage.stagePath || [], bootOptions, compileResult.nextStageMessage).then(function() {
        // Stage completion handled by orchestrateStage sending stage_completed message
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'boot pipeline orchestration failed:', err);
      });
      if (message.sender && message.tag) sendResponse(message.sender, message.tag, { started: true, pipelineId: message.pipelineId }, 'hypervisoractor');
      return state;
    }
    case MESSAGETYPES.COMPILE_STAGE: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action COMPILE_STAGE:', message.pipelineId, 'stageIndex:', message.stageIndex);
      compileAndOrchestrate(state, message).then(function(res) {
        if (message.sender && message.tag) sendResponse(message.sender, message.tag, res, 'hypervisoractor');
      });
      return state;
    }
    case MESSAGETYPES.STAGE_COMPLETED: {
      handleStageCompleted(state, message);
      return state;
    }
    default:
      logwarn(hypervisorState, '[HYPERVISOR]', 'unknown message type:', message.type);
      return state;
  }
}

// Register initial state with runtime.
registerActorState('hypervisoractor', createInitialHypervisorState());

// Compatibility handle (stateless) for enqueue producers.
var HYPERVISOR = {
  getstate: function() { return getActorState('hypervisoractor'); },
  dispatch: function(message) { return dispatchToActor('hypervisoractor', hypervisorbehavior, message); }
};

var hypervisorStartPromise = null;

function startHypervisorActor(options) {
  var verbosity = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));
  hypervisorState = Object.freeze({ level: verbosity });
  var current = getActorState('hypervisoractor');
  if (current) current.verbosity = verbosity;
  return Promise.resolve(HYPERVISOR);
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
