// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Change applied: DIRECT DISPATCH REFACTOR
//   - No mailTransport, no pollInterval (consumer registration in kernel)
//   - Directly calls compileStageRequestToElements and orchestrateStage
//   - enqueueHypervisor* functions fire-and-forget, accept responseSpec
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


var hypervisoractorINTERFACES = {};
hypervisoractorINTERFACES[MESSAGETYPES.LOAD] = {};
hypervisoractorINTERFACES[MESSAGETYPES.SAVE] = {};
hypervisoractorINTERFACES[MESSAGETYPES.GET_ENV] = { pipelineId: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.SET_ENV] = { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_LATEST_ENV] = { pipelineId: 'string', stageId: 'string', elementId: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_RENDER_HTML] = {};
hypervisoractorINTERFACES[MESSAGETYPES.SET_RENDER_HTML] = { html: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_EXECUTION_STACK] = {};
hypervisoractorINTERFACES[MESSAGETYPES.SET_EXECUTION_STACK] = { stack: 'array' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_ROUTE] = { key: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.SET_ROUTE] = { key: 'string', route: 'object?' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_ACTIVE_PIPELINES] = {};
hypervisoractorINTERFACES[MESSAGETYPES.REGISTER_PIPELINE] = { pipelineId: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.UNREGISTER_PIPELINE] = { pipelineId: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.SET_PROGRAM] = { programKey: 'string', programSource: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_PROGRAM] = { programKey: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.MARK_BOOT] = { boot: 'boolean' };
hypervisoractorINTERFACES[MESSAGETYPES.SET_STAGE_DESCRIPTOR] = { pipelineId: 'string', stageId: 'string', descriptor: 'object' };
hypervisoractorINTERFACES[MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS] = { pipelineId: 'string', stageId: 'string' };
hypervisoractorINTERFACES[MESSAGETYPES.TRIGGER_EVENT] = { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object' };
hypervisoractorINTERFACES[MESSAGETYPES.PING] = {};
hypervisoractorINTERFACES[MESSAGETYPES.RECOVER] = {};
hypervisoractorINTERFACES[MESSAGETYPES.ACTIVATE_ACTORS] = {};
hypervisoractorINTERFACES[MESSAGETYPES.BOOT_PIPELINE] = { pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?' };
hypervisoractorINTERFACES[MESSAGETYPES.COMPILE_STAGE] = { pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?' };
hypervisoractorINTERFACES[MESSAGETYPES.STAGE_COMPLETED] = { pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?' };
Object.freeze(hypervisoractorINTERFACES);

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

var hypervisorbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : hypervisorVerbosityConstants.DEBUG;
  hypervisorState = Object.freeze({ level: v });
  logdebug(hypervisorState, '[HYPERVISOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case MESSAGETYPES.LOAD:
      return state;
    case MESSAGETYPES.SAVE:
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.GET_ENV: {
      var p = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var root = p && p.__root__ && p.__root__.__root__;
      return root ? root.env : (p || null);
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
      return true;
    }
    case MESSAGETYPES.GET_LATEST_ENV: {
      var pState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      if (eState) return eState.env;
      var root = pState && pState.__root__ && pState.__root__.__root__;
      return root ? root.env : null;
    }
    case MESSAGETYPES.GET_RENDER_HTML:
      return state.renderHtml || '';
    case MESSAGETYPES.SET_RENDER_HTML:
      state.renderHtml = message.html || '';
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.GET_EXECUTION_STACK:
      return state.executionStack || [];
    case MESSAGETYPES.SET_EXECUTION_STACK:
      state.executionStack = message.stack || [];
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.GET_ROUTE:
      return state.routes && message.key ? (state.routes[message.key] || null) : null;
    case MESSAGETYPES.SET_ROUTE:
      if (!state.routes) state.routes = {};
      state.routes[message.key] = message.route || null;
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.GET_ACTIVE_PIPELINES:
      return (state.activePipelines || []).slice();
    case MESSAGETYPES.REGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      if (state.activePipelines.indexOf(message.pipelineId) === -1) {
        state.activePipelines.push(message.pipelineId);
        persistHypervisorState(state);
      }
      return true;
    case MESSAGETYPES.UNREGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      if (state.triggerRecipients) {
        Object.keys(state.triggerRecipients).forEach(function(key) {
          if (key.indexOf(message.pipelineId + ':') === 0) delete state.triggerRecipients[key];
        });
      }
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.SET_PROGRAM:
      if (!state.programs) state.programs = {};
      state.programs[message.programKey] = message.programSource;
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.GET_PROGRAM:
      return state.programs && message.programKey ? (state.programs[message.programKey] || null) : null;
    case MESSAGETYPES.MARK_BOOT:
      state.boot = message.boot !== false;
      persistHypervisorState(state);
      return true;
    case MESSAGETYPES.SET_STAGE_DESCRIPTOR: {
      if (!state.stageDescriptors) state.stageDescriptors = {};
      if (!state.triggerRecipients) state.triggerRecipients = {};
      var key = message.pipelineId + ':' + message.stageId;
      state.stageDescriptors[key] = message.descriptor;
      state.triggerRecipients[key] = true;
      persistHypervisorState(state);
      return true;
    }
    case MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      return state.triggerRecipients && state.triggerRecipients[recipientKey] === true;
    }
    case MESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };
      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];
      if (!descriptor) return { error: 'missing trigger descriptor: ' + descriptorKey };
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
      return true;
    }
    case MESSAGETYPES.PING:
      return true;
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
      }).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', err); });
      return null;
    case MESSAGETYPES.ACTIVATE_ACTORS:
      activateManagedActors({ verbosity: state.verbosity }).then(function() {}).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', err); });
      return true;
    case MESSAGETYPES.BOOT_PIPELINE: {
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) bootOptions.autorun = true;
      if (bootOptions.verbosity === undefined && state.verbosity !== undefined) bootOptions.verbosity = state.verbosity;
      var pipelineBriefcase = message.pipeline && message.pipeline.briefcase ? message.pipeline.briefcase : {};
      var briefcaseCheck = validatePipelineBriefcase(pipelineBriefcase);
      var briefcaseErrors = Array.isArray(briefcaseCheck) ? briefcaseCheck : (briefcaseCheck.errors || []);
      var briefcaseValid = Array.isArray(briefcaseCheck) ? briefcaseCheck.length === 0 : Boolean(briefcaseCheck.valid);
      if (!briefcaseValid) {
        return { error: '[HYPERVISOR] briefcase validation failed: ' + briefcaseErrors.join(', ') };
      }
      state.loadedPipelines = state.loadedPipelines || {};
      state.loadedPipelines[message.pipelineId] = { pipeline: message.pipeline, accessors: message.accessors || null, sinks: message.sinks || [], options: bootOptions };
      var savedRoot = state.envByPipeline && state.envByPipeline[message.pipelineId] && state.envByPipeline[message.pipelineId].__root__ && state.envByPipeline[message.pipelineId].__root__.__root__;
      var initialEnv = savedRoot ? savedRoot.env : (bootOptions.baseEnv || {});
      sendInstruction('executionactor', 'pipeline_loaded', { pipelineid: message.pipelineId, env: {} }, null, 'hypervisoractor');
      sendInstruction('hypervisoractor', MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: message.pipelineId }, null, 'hypervisoractor');
      sendInstruction('executionactor', 'register_pipeline', { pipelineid: message.pipelineId, dna: null, env: {} }, null, 'hypervisoractor');
      var firstStage = message.firstStage || { stageIndex: 0, stagePath: [], briefcase: pipelineBriefcase };
      // Directly compile and orchestrate first stage (no self-message)
      var compileResult = compileStageRequestToElements(message.pipeline, firstStage.stageIndex, firstStage.stagePath || [], firstStage.briefcase || pipelineBriefcase, initialEnv, bootOptions);
      orchestrateStage(compileResult.stage, compileResult.elementFunctions, message.pipelineId, initialEnv, firstStage.stagePath || [], bootOptions, compileResult.nextStageMessage).then(function() {
        // Stage completion handled by orchestrateStage sending stage_completed message
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'boot pipeline orchestration failed:', err);
      });
      return { started: true, pipelineId: message.pipelineId };
    }
    case MESSAGETYPES.COMPILE_STAGE: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action COMPILE_STAGE:', message.pipelineId, 'stageIndex:', message.stageIndex);
      var result = compileStageRequestToElements(message.pipeline, message.stageIndex, message.stagePath, message.briefcase, message.env || {}, message.options || {});
      return orchestrateStage(result.stage, result.elementFunctions, message.pipelineId, message.env || {}, message.stagePath || [], message.options || {}, result.nextStageMessage).then(function() {
        return { started: true };
      }).catch(function(err) {
        return { error: err.message };
      });
    }
    case MESSAGETYPES.STAGE_COMPLETED: {
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
        // Directly compile and orchestrate next stage (no self-message)
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
      return true;
    }
    default:
      logwarn(hypervisorState, '[HYPERVISOR]', 'unknown message type:', message.type);
      return { error: '[HYPERVISOR] unknown message type: ' + message.type };
  }
};

// No renderactor import (cycle): renderActorReady injected via options.
Object.keys(hypervisoractorINTERFACES).forEach(function(type) {
  MESSAGEREGISTRY.register('hypervisoractor', type, hypervisoractorINTERFACES[type], hypervisorbehavior);
});

function activateManagedActors(options) {
  if (options === undefined) options = {};
  var verbosity = (options.verbosity !== undefined) ? options.verbosity : (typeof options === 'number' ? options : getverbosity(hypervisorState));
  var renderActorReady = options.renderActorReady || null;
  var chain = Promise.resolve(true);
  if (typeof renderActorReady === 'function') {
    chain = chain.then(function() { return renderActorReady({ verbosity: verbosity }); });
  }
  chain = chain.then(function() { return ensureExecutionActorReady({ verbosity: verbosity }); });
  chain = chain.then(function() { return startDebugActor({ verbosity: verbosity }); });
  return chain.then(function() { return true; });
}

// Local mail-based renderactor ping (no renderactor module import).
function enqueueRenderPing(responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', 'ping', {}, tag, 'system', responseSpec);
}

// No renderactor import: renderActorStart injected via options (bootstrap).
function bootActors(options) {
  if (options === undefined) options = {};
  var verbosity = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));
  var renderActorStart = options.renderActorStart || null;
  loginfo(hypervisorState, '[HYPERVISOR]', 'bootActors starting with verbosity:', verbosity);
  return Promise.resolve(startDbActor({ verbosity: verbosity })).then(function() {
    return startApiActor({ verbosity: verbosity });
  }).then(function() {
    return startWorldmapActor({ verbosity: verbosity });
  }).then(function() {
    if (typeof renderActorStart === 'function') return renderActorStart({ verbosity: verbosity });
    return undefined;
  }).then(function() {
    return startExecutionActor({ verbosity: verbosity });
  }).then(function() {
    return startDebugActor({ verbosity: verbosity });
  }).then(function() {
    return startHypervisorActor({ verbosity: verbosity });
  }).then(function() {
    var actorStatuses = {};
    var allAlive = true;
    actorStatuses.dbactor = true;
    actorStatuses.apiactor = true;
    actorStatuses.worldmapactor = true;
    actorStatuses.hypervisoractor = true;

    function pingStatus(key, pingFn) {
      return Promise.resolve(pingFn()).then(function() {
        actorStatuses[key] = true;
      }).catch(function() {
        actorStatuses[key] = false;
      });
    }

    return pingStatus('renderactor', enqueueRenderPing).then(function() {
      return pingStatus('executionactor', enqueueExecutionPing);
    }).then(function() {
      return pingStatus('debugactor', enqueueDebugPing);
    }).then(function() {
      Object.keys(actorStatuses).forEach(function(k) {
        if (!actorStatuses[k]) allAlive = false;
      });
      return { success: allAlive, status: allAlive ? 'BOOTED' : 'PARTIAL', actors: actorStatuses, timestamp: Date.now(), verbosity: verbosity };
    });
  });
}

var hypervisorMailboxStore = null;

var HYPERVISOR = null;
var hypervisorStartPromise = null;

function startHypervisorActor(options) {
  if (HYPERVISOR) {
    if (options !== undefined) {
      var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
      if (lvl !== undefined) hypervisorState = Object.freeze({ level: lvl });
    }
    return Promise.resolve(HYPERVISOR);
  }
  var verbosity = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));
  hypervisorState = Object.freeze({ level: verbosity });
  if (!hypervisorStartPromise) {
    hypervisorStartPromise = recoverHypervisorState(verbosity).then(function(initial) {
      if (HYPERVISOR) return HYPERVISOR;
      initial.verbosity = verbosity;
      HYPERVISOR = createactor(hypervisorbehavior, initial, MESSAGEREGISTRY.getInterfaces('hypervisoractor'), {
        actorName: 'hypervisoractor',
        mailboxType: 'mail',
        verbosity: verbosity
      });
      return HYPERVISOR;
    });
  }
  return hypervisorStartPromise;
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
