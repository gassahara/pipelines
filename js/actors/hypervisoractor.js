// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Changes applied:
//   P‑REFACTOR: forwards preprocessed firstStage in BOOT_PIPELINE.
//   COMPILE_STAGE calls BlockCompiler compileStageRequestToElements
//   and orchestrateStage. STAGE_COMPLETED persists env and dispatches next.
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
  enqueueExecutionSubmitStage,
  enqueueExecutionPing,
  enqueueExecutionPipelineLoaded,
  enqueueExecutionRegisterPipeline,
  startExecutionActor
} from './executionactor.js';
import {
  startRenderActor,
  enqueueRenderPing,
  enqueueRenderRecover,
  enqueueRenderRegisterTriggerExpectation
} from './renderactor.js';
import {
  startDebugActor,
  enqueueDebugPing,
  enqueueDebugRecover
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
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.LOAD] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SAVE] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ENV] = { pipelineId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_ENV] = { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_LATEST_ENV] = { pipelineId: 'string', stageId: 'string', elementId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_RENDER_HTML] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_RENDER_HTML] = { html: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK] = { stack: 'array', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ROUTE] = { key: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_ROUTE] = { key: 'string', route: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.REGISTER_PIPELINE] = { pipelineId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE] = { pipelineId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_PROGRAM] = { programKey: 'string', programSource: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_PROGRAM] = { programKey: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.MARK_BOOT] = { boot: 'boolean', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR] = { pipelineId: 'string', stageId: 'string', descriptor: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS] = { pipelineId: 'string', stageId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.TRIGGER_EVENT] = { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.PING] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.RECOVER] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.BOOT_PIPELINE] = { pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.COMPILE_STAGE] = { pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.STAGE_COMPLETED] = { pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?', resolve: 'function?', reject: 'function?' };
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

function resolveMessage(message, value) {
  if (typeof message.resolve === 'function') message.resolve(value);
}

function rejectMessage(message, error) {
  if (typeof message.reject === 'function') message.reject(error);
}

function recoverHypervisorState(verbosity) {
  logdebug(hypervisorState, '[HYPERVISOR]', 'recoverHypervisorState start');
  return enqueueDbRestore('actor:state:hypervisor').then(function(saved) {
    if (saved && typeof saved === 'object') {
      if (verbosity !== undefined) saved.verbosity = verbosity;
      logdebug(hypervisorState, '[HYPERVISOR]', 'recoverHypervisorState restored existing state');
      return saved;
    }
    logdebug(hypervisorState, '[HYPERVISOR]', 'recoverHypervisorState creating initial state');
    var initial = createInitialHypervisorState(verbosity);
    return enqueueDbStore('actor:state:hypervisor', initial).then(function() { return initial; });
  });
}

var renderModulePromise = null;
function getRenderModule() {
  if (!renderModulePromise) renderModulePromise = import('./renderactor.js');
  return renderModulePromise;
}

var executionModulePromise = null;
function getExecutionModule() {
  if (!executionModulePromise) executionModulePromise = import('./executionactor.js');
  return executionModulePromise;
}

var debugModulePromise = null;
function getDebugModule() {
  if (!debugModulePromise) debugModulePromise = import('./debugactor.js');
  return debugModulePromise;
}

function ensureActorAlive(name, pingFn, startFn, retries) {
  if (retries === undefined) retries = 3;
  function safePing() {
    return Promise.resolve().then(pingFn).then(function(alive) { return alive === true; }).catch(function() { return false; });
  }
  return safePing().then(function(alive) {
    if (alive) { logdebug(hypervisorState, '[HYPERVISOR]', 'ensureActorAlive actor alive:', name); return true; }
    if (retries <= 0) { logerror(hypervisorState, '[HYPERVISOR]', 'actor unreachable:', name); throw new Error('[activateManagedActors] ' + name + ' actor not reachable'); }
    return Promise.resolve().then(startFn).then(function() { return ensureActorAlive(name, pingFn, startFn, retries - 1); });
  });
}

async function activateManagedActors(options) {
  var verbosity = (options && options.verbosity !== undefined) ? options.verbosity : (typeof options === 'number' ? options : getverbosity(hypervisorState));
  var renderMod = await getRenderModule();
  await ensureActorAlive('renderactor', function() { return renderMod.enqueueRenderPing(); }, function() { return renderMod.startRenderActor({ verbosity: verbosity }); });
  await renderMod.enqueueRenderRecover().catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'render recover failed:', err); });
  var execMod = await getExecutionModule();
  await ensureActorAlive('executionactor', function() { return execMod.enqueueExecutionPing(); }, function() { return execMod.startExecutionActor({ verbosity: verbosity }); });
  await execMod.enqueueExecutionRecover().catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'execution recover failed:', err); });
  var debugMod = await getDebugModule();
  await ensureActorAlive('debugactor', function() { return debugMod.enqueueDebugPing(); }, function() { return debugMod.startDebugActor({ verbosity: verbosity }); });
  await debugMod.enqueueDebugRecover().catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'debug recover failed:', err); });
}

async function bootActors(options) {
  if (options === undefined) options = {};
  var verbosity = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));
  loginfo(hypervisorState, '[HYPERVISOR]', 'bootActors starting with verbosity:', verbosity);
  var dbActor = startDbActor({ verbosity: verbosity });
  var worldmapActor = startWorldmapActor({ verbosity: verbosity });
  var apiActor = startApiActor({ verbosity: verbosity });
  var renderActor = startRenderActor({ verbosity: verbosity });
  var execActor = startExecutionActor({ verbosity: verbosity });
  var debugActor = startDebugActor({ verbosity: verbosity });
  var hypervisorActor = await startHypervisorActor({ verbosity: verbosity });
  var actorStatuses = {};
  var allAlive = true;
  actorStatuses.dbactor = !!dbActor; if (!dbActor) allAlive = false;
  actorStatuses.worldmapactor = !!worldmapActor; if (!worldmapActor) allAlive = false;
  actorStatuses.apiactor = !!apiActor; if (!apiActor) allAlive = false;
  try {
    actorStatuses.renderactor = await enqueueRenderPing().catch(function() { return false; }); if (!actorStatuses.renderactor) allAlive = false;
    await enqueueRenderRecover().catch(function() {});
    actorStatuses.executionactor = await enqueueExecutionPing().catch(function() { return false; }); if (!actorStatuses.executionactor) allAlive = false;
    await import('./executionactor.js').then(function(m) { return m.enqueueExecutionRecover(); }).catch(function() {});
    actorStatuses.debugactor = await enqueueDebugPing().catch(function() { return false; }); if (!actorStatuses.debugactor) allAlive = false;
    await enqueueDebugRecover().catch(function() {});
    actorStatuses.hypervisoractor = await enqueueHypervisorPing().catch(function() { return false; }); if (!actorStatuses.hypervisoractor) allAlive = false;
    await enqueueHypervisorActivateActors().catch(function() {});
    return { success: allAlive, status: allAlive ? 'BOOTED' : 'PARTIAL', actors: actorStatuses, timestamp: Date.now(), verbosity: verbosity };
  } catch (err) {
    logerror(hypervisorState, '[HYPERVISOR]', 'bootActors failed:', err);
    return { success: false, status: 'FAILED', error: err && err.message ? err.message : String(err), actors: actorStatuses, timestamp: Date.now() };
  }
}

var hypervisorbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : hypervisorVerbosityConstants.DEBUG;
  hypervisorState = Object.freeze({ level: v });
  logdebug(hypervisorState, '[HYPERVISOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case HYPERVISORMESSAGETYPES.LOAD:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action LOAD');
      resolveMessage(message, state);
      break;

    case HYPERVISORMESSAGETYPES.SAVE:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SAVE');
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ENV: {
      var pipelineState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var rootEntry = pipelineState && pipelineState.__root__ && pipelineState.__root__.__root__;
      resolveMessage(message, rootEntry ? rootEntry.env : (pipelineState || null));
      break;
    }

    case HYPERVISORMESSAGETYPES.SET_ENV: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_ENV pipeline:', message.pipelineId);
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
      resolveMessage(message, true);
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_LATEST_ENV: {
      var pState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      if (eState) resolveMessage(message, eState.env);
      else {
        var root = pState && pState.__root__ && pState.__root__.__root__;
        resolveMessage(message, root ? root.env : null);
      }
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_RENDER_HTML:
      resolveMessage(message, state.renderHtml || '');
      break;

    case HYPERVISORMESSAGETYPES.SET_RENDER_HTML:
      state.renderHtml = message.html || '';
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK:
      resolveMessage(message, state.executionStack || []);
      break;

    case HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK:
      state.executionStack = message.stack || [];
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ROUTE:
      resolveMessage(message, state.routes && message.key ? (state.routes[message.key] || null) : null);
      break;

    case HYPERVISORMESSAGETYPES.SET_ROUTE:
      if (!state.routes) state.routes = {};
      state.routes[message.key] = message.route || null;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES:
      resolveMessage(message, (state.activePipelines || []).slice());
      break;

    case HYPERVISORMESSAGETYPES.REGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      if (state.activePipelines.indexOf(message.pipelineId) === -1) { state.activePipelines.push(message.pipelineId); persistHypervisorState(state); }
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE:
      if (!state.activePipelines) state.activePipelines = [];
      state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      if (state.triggerRecipients) Object.keys(state.triggerRecipients).forEach(function(key) { if (key.indexOf(message.pipelineId + ':') === 0) delete state.triggerRecipients[key]; });
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.SET_PROGRAM:
      if (!state.programs) state.programs = {};
      state.programs[message.programKey] = message.programSource;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_PROGRAM:
      resolveMessage(message, state.programs && message.programKey ? (state.programs[message.programKey] || null) : null);
      break;

    case HYPERVISORMESSAGETYPES.MARK_BOOT:
      state.boot = message.boot !== false;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR: {
      if (!state.stageDescriptors) state.stageDescriptors = {};
      if (!state.triggerRecipients) state.triggerRecipients = {};
      var key = message.pipelineId + ':' + message.stageId;
      state.stageDescriptors[key] = message.descriptor;
      state.triggerRecipients[key] = true;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      var isLive = state.triggerRecipients && state.triggerRecipients[recipientKey] === true;
      resolveMessage(message, isLive);
      break;
    }

    case HYPERVISORMESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };
      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];
      if (!descriptor) { logwarn(hypervisorState, '[HYPERVISOR]', 'missing trigger descriptor:', descriptorKey); rejectMessage(message, new Error('missing trigger descriptor: ' + descriptorKey)); return state; }
      state.routes['pipeline:' + pipelineId] = { stageId: stageId, stagePath: message.stagePath || [stageId] };
      persistHypervisorState(state);
      callwithstack(EVALSTACK, 'hypervisor-trigger:' + pipelineId + ':' + stageId, 'async-await', function() { return executeStage(descriptor, env, 'trigger', message.eventPayload); }, [env], { context: { env: env }, capturecontinuation: true, errk: createHypervisorErrorContext('trigger') }).then(function(result) {
        var updatedEnv = result && result.env ? result.env : env;
        if (!state.envByPipeline[pipelineId]) state.envByPipeline[pipelineId] = {};
        state.envByPipeline[pipelineId].__root__ = { __root__: { env: updatedEnv, updatedAt: Date.now() } };
        persistHypervisorState(state);
        resolveMessage(message, updatedEnv);
      }).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'trigger failed:', err); rejectMessage(message, err); });
      return state;
    }

    case HYPERVISORMESSAGETYPES.PING:
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.RECOVER:
      recoverHypervisorState(state.verbosity).then(function(saved) {
        if (saved) {
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
        }
        state.savedAt = Date.now();
        persistHypervisorState(state);
        resolveMessage(message, state);
      }).catch(function(err) { rejectMessage(message, err); });
      return state;

    case HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS:
      activateManagedActors({ verbosity: state.verbosity }).then(function() { resolveMessage(message, true); }).catch(function(err) { rejectMessage(message, err); });
      return state;

    case HYPERVISORMESSAGETYPES.BOOT_PIPELINE: {
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) bootOptions.autorun = true;
      if (bootOptions.verbosity === undefined && state.verbosity !== undefined) bootOptions.verbosity = state.verbosity;
      var pipelineBriefcase = message.pipeline && message.pipeline.briefcase ? message.pipeline.briefcase : {};
      var briefcaseCheck = validatePipelineBriefcase(pipelineBriefcase);
      var briefcaseErrors = Array.isArray(briefcaseCheck) ? briefcaseCheck : (briefcaseCheck.errors || []);
      var briefcaseValid = Array.isArray(briefcaseCheck) ? briefcaseCheck.length === 0 : Boolean(briefcaseCheck.valid);
      if (!briefcaseValid) {
        logerror(hypervisorState, '[HYPERVISOR]', 'BOOT_PIPELINE briefcase validation failed:', briefcaseErrors);
        rejectMessage(message, new Error('[HYPERVISOR] briefcase validation failed: ' + briefcaseErrors.join(', ')));
        return state;
      }

      state.loadedPipelines = state.loadedPipelines || {};
      state.loadedPipelines[message.pipelineId] = { pipeline: message.pipeline, accessors: message.accessors || null, sinks: message.sinks || [], options: bootOptions };
      var savedRoot = state.envByPipeline && state.envByPipeline[message.pipelineId] && state.envByPipeline[message.pipelineId].__root__ && state.envByPipeline[message.pipelineId].__root__.__root__;
      var initialEnv = savedRoot ? savedRoot.env : (bootOptions.baseEnv || {});
      enqueueExecutionPipelineLoaded(message.pipelineId, {}).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'pipeline loaded notification failed:', err); });
      enqueueHypervisorRegisterPipeline(message.pipelineId).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'hypervisor register pipeline failed:', err); });
      enqueueExecutionRegisterPipeline(message.pipelineId, null, {}).catch(function(err) { logwarn(hypervisorState, '[HYPERVISOR]', 'execution register pipeline failed:', err); });

      var firstStage = message.firstStage || { stageIndex: 0, stagePath: [], briefcase: pipelineBriefcase };
      HYPERVISOR.send({
        type: HYPERVISORMESSAGETYPES.COMPILE_STAGE,
        pipeline: message.pipeline,
        pipelineId: message.pipelineId,
        stageIndex: firstStage.stageIndex,
        stagePath: firstStage.stagePath || [],
        briefcase: firstStage.briefcase || pipelineBriefcase,
        env: initialEnv,
        options: bootOptions,
        resolve: null,
        reject: null
      });
      resolveMessage(message, { started: true, pipelineId: message.pipelineId });
      return state;
    }

    case HYPERVISORMESSAGETYPES.COMPILE_STAGE: {
      var compileReq = message;
      logdebug(hypervisorState, '[HYPERVISOR]', 'action COMPILE_STAGE:', compileReq.pipelineId, 'stageIndex:', compileReq.stageIndex);
      import('../factory/blockcompiler.js').then(function(mod) {
        var result = mod.compileStageRequestToElements(compileReq.pipeline, compileReq.stageIndex, compileReq.stagePath, compileReq.briefcase, compileReq.env || {}, compileReq.options || {});
        return mod.orchestrateStage(result.stage, result.elementFunctions, compileReq.pipelineId, compileReq.env || {}, compileReq.stagePath || [], compileReq.options || {}, result.nextStageMessage).then(function() {
          logdebug(hypervisorState, '[HYPERVISOR]', 'COMPILE_STAGE orchestration started');
          resolveMessage(message, { started: true });
        });
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'compile stage orchestration failed:', err);
        rejectMessage(message, err);
      });
      return state;
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
        logdebug(hypervisorState, '[HYPERVISOR]', 'dispatching next stage:', nextMsg.stageIndex);
        HYPERVISOR.send(nextMsg);
      } else {
        loginfo(hypervisorState, '[HYPERVISOR]', 'pipeline complete:', message.pipelineId);
        if (state.activePipelines) {
          state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
          persistHypervisorState(state);
        }
      }
      resolveMessage(message, true);
      return state;
    }

    default:
      logwarn(hypervisorState, '[HYPERVISOR]', 'unknown message type:', message.type);
      rejectMessage(message, new Error('[HYPERVISOR] unknown message type: ' + message.type));
  }
  return state;
};

var hypervisorMailboxStore = { store: enqueueDbStore, restore: enqueueDbRestore, delete: enqueueDbDelete };
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
      HYPERVISOR = createactor(hypervisorbehavior, initial, MESSAGEINTERFACES, { actorName: 'hypervisoractor', mailboxType: 'db', mailboxStore: hypervisorMailboxStore, verbosity: verbosity });
      return HYPERVISOR;
    });
  }
  return hypervisorStartPromise;
}

function enqueue(type, payload) {
  return startHypervisorActor().then(function() {
    return new Promise(function(resolve, reject) {
      var message = {};
      if (payload) Object.keys(payload).forEach(function(k) { message[k] = payload[k]; });
      message.type = type;
      message.resolve = resolve;
      message.reject = reject;
      HYPERVISOR.send(message);
    });
  });
}

var enqueueHypervisorLoad = function() { return enqueue(HYPERVISORMESSAGETYPES.LOAD); };
var enqueueHypervisorSave = function() { return enqueue(HYPERVISORMESSAGETYPES.SAVE); };
var enqueueHypervisorGetEnv = function(pipelineId) { return enqueue(HYPERVISORMESSAGETYPES.GET_ENV, { pipelineId: pipelineId }); };
var enqueueHypervisorSetEnv = function(pipelineId, env, stageId, elementId) { return enqueue(HYPERVISORMESSAGETYPES.SET_ENV, { pipelineId: pipelineId, env: env, stageId: stageId, elementId: elementId }); };
var enqueueHypervisorGetLatestEnv = function(pipelineId, stageId, elementId) { return enqueue(HYPERVISORMESSAGETYPES.GET_LATEST_ENV, { pipelineId: pipelineId, stageId: stageId, elementId: elementId }); };
var enqueueHypervisorGetRenderHtml = function() { return enqueue(HYPERVISORMESSAGETYPES.GET_RENDER_HTML); };
var enqueueHypervisorSetRenderHtml = function(html) { return enqueue(HYPERVISORMESSAGETYPES.SET_RENDER_HTML, { html: html }); };
var enqueueHypervisorGetExecutionStack = function() { return enqueue(HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK); };
var enqueueHypervisorSetExecutionStack = function(stack) { return enqueue(HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK, { stack: stack }); };
var enqueueHypervisorGetRoute = function(key) { return enqueue(HYPERVISORMESSAGETYPES.GET_ROUTE, { key: key }); };
var enqueueHypervisorSetRoute = function(key, route) { return enqueue(HYPERVISORMESSAGETYPES.SET_ROUTE, { key: key, route: route }); };
var enqueueHypervisorGetActivePipelines = function() { return enqueue(HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES); };
var enqueueHypervisorRegisterPipeline = function(pipelineId) { return enqueue(HYPERVISORMESSAGETYPES.REGISTER_PIPELINE, { pipelineId: pipelineId }); };
var enqueueHypervisorUnregisterPipeline = function(pipelineId) { return enqueue(HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: pipelineId }); };
var enqueueHypervisorSetProgram = function(programKey, programSource) { return enqueue(HYPERVISORMESSAGETYPES.SET_PROGRAM, { programKey: programKey, programSource: programSource }); };
var enqueueHypervisorGetProgram = function(programKey) { return enqueue(HYPERVISORMESSAGETYPES.GET_PROGRAM, { programKey: programKey }); };
var enqueueHypervisorMarkBoot = function(boot) { return enqueue(HYPERVISORMESSAGETYPES.MARK_BOOT, { boot: boot }); };
var enqueueHypervisorSetStageDescriptor = function(pipelineId, stageId, descriptor) { return enqueue(HYPERVISORMESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId: pipelineId, stageId: stageId, descriptor: descriptor }); };
var enqueueHypervisorGetTriggerRecipientStatus = function(pipelineId, stageId) { return enqueue(HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId: pipelineId, stageId: stageId }); };
var enqueueHypervisorTrigger = function(payload) { return enqueue(HYPERVISORMESSAGETYPES.TRIGGER_EVENT, payload); };
var enqueueHypervisorPing = function() { return enqueue(HYPERVISORMESSAGETYPES.PING); };
var enqueueHypervisorActivateActors = function() { return enqueue(HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS); };
var enqueueHypervisorBootPipeline = function(payload) { return enqueue(HYPERVISORMESSAGETYPES.BOOT_PIPELINE, payload); };
var enqueueHypervisorStageCompleted = function(pipelineId, stageId, nextStageMessage, env) {
  return enqueue(HYPERVISORMESSAGETYPES.STAGE_COMPLETED, { pipelineId: pipelineId, stageId: stageId, nextStageMessage: nextStageMessage || null, env: env });
};

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
