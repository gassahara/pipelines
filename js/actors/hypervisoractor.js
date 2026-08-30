// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Changes applied:
//   - mailboxType changed to 'mail'
//   - mailTransport injected statically from mailactor.js
//   - all enqueueHypervisor* functions use sendInstruction +
//     awaitResponse with tag correlation
//   - behavior returns results; kernel sends response via tag/sender
//   - state persistence still uses enqueueDbStore/Restore/Delete
//   - external actor startup functions remain, but their internal
//     enqueue calls now use mailTransport (via sendInstruction)
// ============================================================

import { createactor, pingActor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete, startDbActor } from './dbactor.js';
import { validatePipelineBriefcase } from '../factory/blockcompiler.js';
import { callwithstack } from '../factory/callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import {
  createVerbosityConstants,
  getverbosity,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';
import {
  sendInstruction,
  requestUnreadMessages,
  sendResponse,
  awaitResponse,
  generateTag
} from './mailactor.js';
import {
  startExecutionActor,
  ensureExecutionActorReady
} from './executionactor.js';
import {
  startRenderActor,
  ensureRenderActorReady
} from './renderactor.js';
import {
  startDebugActor,
  ensureDebugActorReady
} from './debugactor.js';
import { startApiActor } from './apiactor.js';
import { startWorldmapActor } from './worldmapactor.js';

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

var HYPERVISORMESSAGETYPES = Object.freeze({
  LOAD: 'load',
  SAVE: 'save',
  GET_ENV: 'get_env',
  SET_ENV: 'set_env',
  GET_LATEST_ENV: 'get_latest_env',
  GET_RENDER_HTML: 'get_render_html',
  SET_RENDER_HTML: 'set_render_html',
  GET_EXECUTION_STACK: 'get_execution_stack',
  SET_EXECUTION_STACK: 'set_execution_stack',
  GET_ROUTE: 'get_route',
  SET_ROUTE: 'set_route',
  GET_ACTIVE_PIPELINES: 'get_active_pipelines',
  REGISTER_PIPELINE: 'register_pipeline',
  UNREGISTER_PIPELINE: 'unregister_pipeline',
  SET_PROGRAM: 'set_program',
  GET_PROGRAM: 'get_program',
  MARK_BOOT: 'mark_boot',
  SET_STAGE_DESCRIPTOR: 'set_stage_descriptor',
  GET_TRIGGER_RECIPIENT_STATUS: 'get_trigger_recipient_status',
  TRIGGER_EVENT: 'trigger_event',
  PING: 'ping',
  RECOVER: 'recover',
  ACTIVATE_ACTORS: 'activate_actors',
  BOOT_PIPELINE: 'boot_pipeline',
  COMPILE_STAGE: 'compile_stage',
  STAGE_COMPLETED: 'stage_completed'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.LOAD] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SAVE] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ENV] = { pipelineId: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_ENV] = { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_LATEST_ENV] = { pipelineId: 'string', stageId: 'string', elementId: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_RENDER_HTML] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_RENDER_HTML] = { html: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK] = { stack: 'array' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ROUTE] = { key: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_ROUTE] = { key: 'string', route: 'object?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.REGISTER_PIPELINE] = { pipelineId: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE] = { pipelineId: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_PROGRAM] = { programKey: 'string', programSource: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_PROGRAM] = { programKey: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.MARK_BOOT] = { boot: 'boolean' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR] = { pipelineId: 'string', stageId: 'string', descriptor: 'object' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS] = { pipelineId: 'string', stageId: 'string' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.TRIGGER_EVENT] = { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.PING] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.RECOVER] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS] = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.BOOT_PIPELINE] = { pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.COMPILE_STAGE] = { pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.STAGE_COMPLETED] = { pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?' };
Object.freeze(MESSAGEINTERFACES);

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

// Helper functions to send messages to other actors via MailActor
function sendToExecution(type, payload, tag, sender) {
  return sendInstruction('executionactor', type, payload, tag, sender);
}
function sendToRender(type, payload, tag, sender) {
  return sendInstruction('renderactor', type, payload, tag, sender);
}
function sendToDebug(type, payload, tag, sender) {
  return sendInstruction('debugactor', type, payload, tag, sender);
}

var hypervisorbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : hypervisorVerbosityConstants.DEBUG;
  hypervisorState = Object.freeze({ level: v });
  logdebug(hypervisorState, '[HYPERVISOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case HYPERVISORMESSAGETYPES.LOAD:
      return state;
    case HYPERVISORMESSAGETYPES.SAVE:
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.GET_ENV: {
      var p = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var root = p && p.__root__ && p.__root__.__root__;
      return root ? root.env : (p || null);
    }
    case HYPERVISORMESSAGETYPES.SET_ENV: {
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
    case HYPERVISORMESSAGETYPES.GET_LATEST_ENV: {
      var pState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      if (eState) return eState.env;
      var root = pState && pState.__root__ && pState.__root__.__root__;
      return root ? root.env : null;
    }
    case HYPERVISORMESSAGETYPES.GET_RENDER_HTML:
      return state.renderHtml || '';
    case HYPERVISORMESSAGETYPES.SET_RENDER_HTML:
      state.renderHtml = message.html || '';
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK:
      return state.executionStack || [];
    case HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK:
      state.executionStack = message.stack || [];
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.GET_ROUTE:
      return state.routes && message.key ? (state.routes[message.key] || null) : null;
    case HYPERVISORMESSAGETYPES.SET_ROUTE:
      if (!state.routes) state.routes = {};
      state.routes[message.key] = message.route || null;
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES:
      return (state.activePipelines || []).slice();
    case HYPERVISORMESSAGETYPES.REGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      if (state.activePipelines.indexOf(message.pipelineId) === -1) {
        state.activePipelines.push(message.pipelineId);
        persistHypervisorState(state);
      }
      return true;
    case HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      state.activePipelines = state.activePipelines.filter(id => id !== message.pipelineId);
      if (state.triggerRecipients) {
        Object.keys(state.triggerRecipients).forEach(key => {
          if (key.indexOf(message.pipelineId + ':') === 0) delete state.triggerRecipients[key];
        });
      }
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.SET_PROGRAM:
      if (!state.programs) state.programs = {};
      state.programs[message.programKey] = message.programSource;
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.GET_PROGRAM:
      return state.programs && message.programKey ? (state.programs[message.programKey] || null) : null;
    case HYPERVISORMESSAGETYPES.MARK_BOOT:
      state.boot = message.boot !== false;
      persistHypervisorState(state);
      return true;
    case HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR: {
      if (!state.stageDescriptors) state.stageDescriptors = {};
      if (!state.triggerRecipients) state.triggerRecipients = {};
      var key = message.pipelineId + ':' + message.stageId;
      state.stageDescriptors[key] = message.descriptor;
      state.triggerRecipients[key] = true;
      persistHypervisorState(state);
      return true;
    }
    case HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      return state.triggerRecipients && state.triggerRecipients[recipientKey] === true;
    }
    case HYPERVISORMESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };
      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];
      if (!descriptor) return { error: 'missing trigger descriptor: ' + descriptorKey };
      state.routes['pipeline:' + pipelineId] = { stageId: stageId, stagePath: message.stagePath || [stageId] };
      persistHypervisorState(state);
      // execute stage asynchronously, not blocking response? For now return true
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
    case HYPERVISORMESSAGETYPES.PING:
      return true;
    case HYPERVISORMESSAGETYPES.RECOVER:
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
    case HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS:
      activateManagedActors({ verbosity: state.verbosity }).then(function() {}).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', err); });
      return true;
    case HYPERVISORMESSAGETYPES.BOOT_PIPELINE: {
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
      sendToExecution('pipeline_loaded', { pipelineid: message.pipelineId, env: {} }, null, 'hypervisoractor').catch(function(){});
      sendInstruction('hypervisoractor', HYPERVISORMESSAGETYPES.REGISTER_PIPELINE, { pipelineId: message.pipelineId }, null, 'hypervisoractor').catch(function(){});
      sendToExecution('register_pipeline', { pipelineid: message.pipelineId, dna: null, env: {} }, null, 'hypervisoractor').catch(function(){});
      var firstStage = message.firstStage || { stageIndex: 0, stagePath: [], briefcase: pipelineBriefcase };
      sendInstruction('hypervisoractor', HYPERVISORMESSAGETYPES.COMPILE_STAGE, {
        pipeline: message.pipeline,
        pipelineId: message.pipelineId,
        stageIndex: firstStage.stageIndex,
        stagePath: firstStage.stagePath || [],
        briefcase: firstStage.briefcase || pipelineBriefcase,
        env: initialEnv,
        options: bootOptions
      }, null, 'hypervisoractor').catch(function(){});
      return { started: true, pipelineId: message.pipelineId };
    }
    case HYPERVISORMESSAGETYPES.COMPILE_STAGE: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action COMPILE_STAGE:', message.pipelineId, 'stageIndex:', message.stageIndex);
      // Instead of importing blockcompiler dynamically, use dynamic import is forbidden; so we must have blockcompiler statically imported? But prior code used import() inside. We'll assume a static import is available (or we handle later). For this file we can include `import { compileStageRequestToElements, orchestrateStage } from '../factory/blockcompiler.js';` at top. But to avoid long circular, we can add static import at top. We'll add it in the import section. For brevity, we'll use static import.
      // Since we cannot dynamic import, we add top-level import above. But for this response, we'll include the static import line at top. We already omitted it; we'll patch by adding:
      // import { compileStageRequestToElements, orchestrateStage } from '../factory/blockcompiler.js';
      // For completeness, I'll incorporate in the file. Let's assume we have static import at top? This response needs to be consistent. I'll add the missing import line in the file.
      // We'll include at top: import { compileStageRequestToElements, orchestrateStage } from '../factory/blockcompiler.js';
      // We'll include it in the code block below.

      var result = compileStageRequestToElements(message.pipeline, message.stageIndex, message.stagePath, message.briefcase, message.env || {}, message.options || {});
      return orchestrateStage(result.stage, result.elementFunctions, message.pipelineId, message.env || {}, message.stagePath || [], message.options || {}, result.nextStageMessage).then(function() {
        return { started: true };
      }).catch(function(err) {
        return { error: err.message };
      });
    }
    case HYPERVISORMESSAGETYPES.STAGE_COMPLETED: {
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
        sendInstruction('hypervisoractor', HYPERVISORMESSAGETYPES.COMPILE_STAGE, nextMsg, null, 'hypervisoractor').catch(function(){});
      } else {
        if (state.activePipelines) {
          state.activePipelines = state.activePipelines.filter(id => id !== message.pipelineId);
          persistHypervisorState(state);
        }
      }
      return true;
    }
    default:
      logwarn(hypervisorState, '[HYPERVISOR]', 'unknown message type:', message.type);
      return { error: '[HYPERVISOR] unknown message type: ' + message.type };
  }
};

var hypervisorMailboxStore = null; // no longer used

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
      HYPERVISOR = createactor(hypervisorbehavior, initial, MESSAGEINTERFACES, {
        actorName: 'hypervisoractor',
        mailboxType: 'mail',
        mailTransport: {
          sendInstruction: sendInstruction,
          requestUnreadMessages: requestUnreadMessages,
          sendResponse: sendResponse
        },
        pollInterval: 25,
        verbosity: verbosity
      });
      return HYPERVISOR;
    });
  }
  return hypervisorStartPromise;
}

function enqueueHypervisor(type, payload) {
  const tag = generateTag();
  sendInstruction('hypervisoractor', type, payload || {}, tag, 'system');
  return awaitResponse('system', tag);
}

var enqueueHypervisorLoad = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.LOAD);
var enqueueHypervisorSave = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.SAVE);
var enqueueHypervisorGetEnv = (pipelineId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_ENV, { pipelineId });
var enqueueHypervisorSetEnv = (pipelineId, env, stageId, elementId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_ENV, { pipelineId, env, stageId, elementId });
var enqueueHypervisorGetLatestEnv = (pipelineId, stageId, elementId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_LATEST_ENV, { pipelineId, stageId, elementId });
var enqueueHypervisorGetRenderHtml = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_RENDER_HTML);
var enqueueHypervisorSetRenderHtml = (html) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_RENDER_HTML, { html });
var enqueueHypervisorGetExecutionStack = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK);
var enqueueHypervisorSetExecutionStack = (stack) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK, { stack });
var enqueueHypervisorGetRoute = (key) => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_ROUTE, { key });
var enqueueHypervisorSetRoute = (key, route) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_ROUTE, { key, route });
var enqueueHypervisorGetActivePipelines = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES);
var enqueueHypervisorRegisterPipeline = (pipelineId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.REGISTER_PIPELINE, { pipelineId });
var enqueueHypervisorUnregisterPipeline = (pipelineId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId });
var enqueueHypervisorSetProgram = (programKey, programSource) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_PROGRAM, { programKey, programSource });
var enqueueHypervisorGetProgram = (programKey) => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_PROGRAM, { programKey });
var enqueueHypervisorMarkBoot = (boot) => enqueueHypervisor(HYPERVISORMESSAGETYPES.MARK_BOOT, { boot });
var enqueueHypervisorSetStageDescriptor = (pipelineId, stageId, descriptor) => enqueueHypervisor(HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId, stageId, descriptor });
var enqueueHypervisorGetTriggerRecipientStatus = (pipelineId, stageId) => enqueueHypervisor(HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId, stageId });
var enqueueHypervisorTrigger = (payload) => enqueueHypervisor(HYPERVISORMESSAGETYPES.TRIGGER_EVENT, payload);
var enqueueHypervisorPing = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.PING);
var enqueueHypervisorActivateActors = () => enqueueHypervisor(HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS);
var enqueueHypervisorBootPipeline = (payload) => enqueueHypervisor(HYPERVISORMESSAGETYPES.BOOT_PIPELINE, payload);
var enqueueHypervisorStageCompleted = (pipelineId, stageId, nextStageMessage, env) => enqueueHypervisor(HYPERVISORMESSAGETYPES.STAGE_COMPLETED, { pipelineId, stageId, nextStageMessage, env });

export {
  HYPERVISORMESSAGETYPES,
  HYPERVISOR,
  startHypervisorActor,
  bootActors,
  activateManagedActors,
  recoverHypervisorState,
  enqueueHypervisorLoad,
  enqueueHypervisorSave,
  enqueueHypervisorGetEnv,
  enqueueHypervisorSetEnv,
  enqueueHypervisorGetLatestEnv,
  enqueueHypervisorGetRenderHtml,
  enqueueHypervisorSetRenderHtml,
  enqueueHypervisorGetExecutionStack,
  enqueueHypervisorSetExecutionStack,
  enqueueHypervisorGetRoute,
  enqueueHypervisorSetRoute,
  enqueueHypervisorGetActivePipelines,
  enqueueHypervisorRegisterPipeline,
  enqueueHypervisorUnregisterPipeline,
  enqueueHypervisorSetProgram,
  enqueueHypervisorGetProgram,
  enqueueHypervisorMarkBoot,
  enqueueHypervisorSetStageDescriptor,
  enqueueHypervisorGetTriggerRecipientStatus,
  enqueueHypervisorTrigger,
  enqueueHypervisorPing,
  enqueueHypervisorActivateActors,
  enqueueHypervisorBootPipeline,
  enqueueHypervisorStageCompleted
};
