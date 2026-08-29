// ============================================================
// UPDATED FILE: js/actors/hypervisoractor.js
// Changes applied:
//   P9: defensive validation consumer for validatePipelineBriefcase
//   P10-ter: removed createLogger; direct portable logging functions
//   P15: STAGE_COMPLETED accepts env and nextStageMessage; persists env and dispatches next stage directly
// ============================================================

import { createactor, pingActor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete, startDbActor } from './dbactor.js';
import { executeStage, validatePipelineBriefcase, createTriggerRegistrationFromStage } from '../factory/blockcompiler.js';
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
import { enqueueExecutionSubmitStage, enqueueExecutionPing, enqueueExecutionPipelineLoaded, enqueueExecutionRegisterPipeline, startExecutionActor } from './executionactor.js';
import { startRenderActor, enqueueRenderPing, enqueueRenderRecover, enqueueRenderRegisterTriggerExpectation } from './renderactor.js';
import { startDebugActor, enqueueDebugPing, enqueueDebugRecover } from './debugactor.js';
import { startApiActor } from './apiactor.js';
import { startWorldmapActor } from './worldmapactor.js';

var hypervisorVerbosityConstants = createVerbosityConstants();
var hypervisorState = Object.freeze({ level: hypervisorVerbosityConstants.DEBUG });

function createHypervisorErrorContext(label) {
  return function(err) {
    if (!err) {
      err = new Error('unknown hypervisor error');
    }
    if (!err.diagnostic) {
      err.diagnostic = {};
    }
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
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.BOOT_PIPELINE] = { pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.COMPILE_STAGE] = { pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', resolve: 'function?', reject: 'function?' };
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
    return enqueueDbStore('actor:state:hypervisor', initial).then(function() {
      return initial;
    });
  });
}

var renderModulePromise = null;
function getRenderModule() {
  if (!renderModulePromise) {
    renderModulePromise = import('./renderactor.js');
  }
  return renderModulePromise;
}

var executionModulePromise = null;
function getExecutionModule() {
  if (!executionModulePromise) {
    executionModulePromise = import('./executionactor.js');
  }
  return executionModulePromise;
}

var debugModulePromise = null;
function getDebugModule() {
  if (!debugModulePromise) {
    debugModulePromise = import('./debugactor.js');
  }
  return debugModulePromise;
}

function ensureActorAlive(name, pingFn, startFn, retries) {
  if (retries === undefined) retries = 3;

  function safePing() {
    return Promise.resolve().then(pingFn).then(function(alive) {
      return alive === true;
    }).catch(function() {
      return false;
    });
  }

  return safePing().then(function(alive) {
    if (alive) {
      logdebug(hypervisorState, '[HYPERVISOR]', 'ensureActorAlive actor is alive:', name);
      return true;
    }

    if (retries <= 0) {
      logerror(hypervisorState, '[HYPERVISOR]', 'ensureActorAlive actor unreachable:', name);
      throw new Error('[activateManagedActors] ' + name + ' actor not reachable');
    }

    logdebug(hypervisorState, '[HYPERVISOR]', 'ensureActorAlive restarting actor:', name, 'retries left:', retries);
    return Promise.resolve().then(startFn).then(function() {
      return ensureActorAlive(name, pingFn, startFn, retries - 1);
    });
  });
}

async function activateManagedActors(options) {
  var verbosity = (options && options.verbosity !== undefined)
    ? options.verbosity
    : (typeof options === 'number' ? options : getverbosity(hypervisorState));

  logdebug(hypervisorState, '[HYPERVISOR]', 'activateManagedActors booting managed actors with verbosity:', verbosity);

  var renderMod = await getRenderModule();
  await ensureActorAlive(
    'renderactor',
    function() { return renderMod.enqueueRenderPing(); },
    function() { return renderMod.startRenderActor({ verbosity: verbosity }); }
  );
  await renderMod.enqueueRenderRecover().catch(function(err) {
    logwarn(hypervisorState, '[HYPERVISOR]', 'render recover failed:', err);
  });

  var execMod = await getExecutionModule();
  await ensureActorAlive(
    'executionactor',
    function() { return execMod.enqueueExecutionPing(); },
    function() { return execMod.startExecutionActor({ verbosity: verbosity }); }
  );
  await execMod.enqueueExecutionRecover().catch(function(err) {
    logwarn(hypervisorState, '[HYPERVISOR]', 'execution recover failed:', err);
  });

  var debugMod = await getDebugModule();
  await ensureActorAlive(
    'debugactor',
    function() { return debugMod.enqueueDebugPing(); },
    function() { return debugMod.startDebugActor({ verbosity: verbosity }); }
  );
  await debugMod.enqueueDebugRecover().catch(function(err) {
    logwarn(hypervisorState, '[HYPERVISOR]', 'debug recover failed:', err);
  });
}

async function bootActors(options) {
  if (options === undefined) options = {};
  var verbosity = typeof options === 'number'
    ? options
    : (options && options.verbosity !== undefined
      ? options.verbosity
      : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));

  loginfo(hypervisorState, '[HYPERVISOR]', 'bootActors starting synchronized boot sequence with verbosity:', verbosity);

  var dbActor = startDbActor({ verbosity: verbosity });
  var worldmapActor = startWorldmapActor({ verbosity: verbosity });
  var apiActor = startApiActor({ verbosity: verbosity });
  var renderActor = startRenderActor({ verbosity: verbosity });
  var execActor = startExecutionActor({ verbosity: verbosity });
  var debugActor = startDebugActor({ verbosity: verbosity });
  var hypervisorActor = await startHypervisorActor({ verbosity: verbosity });

  var actorStatuses = {};
  var allAlive = true;

  try {
    var dbAlive = dbActor !== null && dbActor !== undefined;
    actorStatuses['dbactor'] = dbAlive;
    if (!dbAlive) allAlive = false;

    var worldmapAlive = worldmapActor !== null && worldmapActor !== undefined;
    actorStatuses['worldmapactor'] = worldmapAlive;
    if (!worldmapAlive) allAlive = false;

    var apiAlive = apiActor !== null && apiActor !== undefined;
    actorStatuses['apiactor'] = apiAlive;
    if (!apiAlive) allAlive = false;

    var renderAlive = await enqueueRenderPing().catch(function() { return false; });
    actorStatuses['renderactor'] = renderAlive;
    if (!renderAlive) allAlive = false;
    await enqueueRenderRecover().catch(function() {});

    var execAlive = await enqueueExecutionPing().catch(function() { return false; });
    actorStatuses['executionactor'] = execAlive;
    if (!execAlive) allAlive = false;
    await import('./executionactor.js').then(function(m) { return m.enqueueExecutionRecover(); }).catch(function() {});

    var debugAlive = await enqueueDebugPing().catch(function() { return false; });
    actorStatuses['debugactor'] = debugAlive;
    if (!debugAlive) allAlive = false;
    await enqueueDebugRecover().catch(function() {});

    var hyperAlive = await enqueueHypervisorPing().catch(function() { return false; });
    actorStatuses['hypervisoractor'] = hyperAlive;
    if (!hyperAlive) allAlive = false;
    await enqueueHypervisorActivateActors().catch(function() {});

    loginfo(hypervisorState, '[HYPERVISOR]', 'bootActors synchronized boot sequence completed, all alive:', allAlive);

    return {
      success: allAlive,
      status: allAlive ? 'BOOTED' : 'PARTIAL',
      actors: actorStatuses,
      timestamp: Date.now(),
      verbosity: verbosity
    };
  } catch (err) {
    logerror(hypervisorState, '[HYPERVISOR]', 'bootActors synchronized boot sequence failed:', err);
    return {
      success: false,
      status: 'FAILED',
      error: err && err.message ? err.message : String(err),
      actors: actorStatuses,
      timestamp: Date.now()
    };
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
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_ENV pipeline:', message.pipelineId);
      var pipelineState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var rootEntry = pipelineState && pipelineState.__root__ && pipelineState.__root__.__root__;
      resolveMessage(message, rootEntry ? rootEntry.env : (pipelineState || null));
      break;
    }

    case HYPERVISORMESSAGETYPES.SET_ENV: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_ENV pipeline:', message.pipelineId, 'stage:', message.stageId);
      if (!state.envByPipeline) state.envByPipeline = {};
      if (!state.envByPipeline[message.pipelineId]) state.envByPipeline[message.pipelineId] = {};

      var stageId = message.stageId || '__root__';
      var elementId = message.elementId || '__root__';
      if (!state.envByPipeline[message.pipelineId][stageId]) state.envByPipeline[message.pipelineId][stageId] = {};
      state.envByPipeline[message.pipelineId][stageId][elementId] = {
        env: message.env || {},
        updatedAt: Date.now()
      };

      if (stageId !== '__root__' || elementId !== '__root__') {
        state.envByPipeline[message.pipelineId].__root__ = {
          __root__: {
            env: message.env || {},
            updatedAt: Date.now()
          }
        };
      }

      persistHypervisorState(state);
      resolveMessage(message, true);
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_LATEST_ENV: {
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_LATEST_ENV pipeline:', message.pipelineId, 'stage:', message.stageId);
      var pState = state.envByPipeline && state.envByPipeline[message.pipelineId];
      var sState = pState && pState[message.stageId];
      var eState = sState && sState[message.elementId];
      if (eState) {
        resolveMessage(message, eState.env);
      } else {
        var rootEntry = pState && pState.__root__ && pState.__root__.__root__;
        resolveMessage(message, rootEntry ? rootEntry.env : null);
      }
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_RENDER_HTML:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_RENDER_HTML');
      resolveMessage(message, state.renderHtml || '');
      break;

    case HYPERVISORMESSAGETYPES.SET_RENDER_HTML:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_RENDER_HTML html length:', (message.html || '').length);
      state.renderHtml = message.html || '';
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_EXECUTION_STACK:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_EXECUTION_STACK count:', (state.executionStack || []).length);
      resolveMessage(message, state.executionStack || []);
      break;

    case HYPERVISORMESSAGETYPES.SET_EXECUTION_STACK:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_EXECUTION_STACK count:', (message.stack || []).length);
      state.executionStack = message.stack || [];
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ROUTE:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_ROUTE key:', message.key);
      resolveMessage(message, state.routes && message.key ? (state.routes[message.key] || null) : null);
      break;

    case HYPERVISORMESSAGETYPES.SET_ROUTE:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_ROUTE key:', message.key, 'route:', message.route);
      if (!state.routes) state.routes = {};
      state.routes[message.key] = message.route || null;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ACTIVE_PIPELINES:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_ACTIVE_PIPELINES count:', (state.activePipelines || []).length);
      resolveMessage(message, (state.activePipelines || []).slice());
      break;

    case HYPERVISORMESSAGETYPES.REGISTER_PIPELINE:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action REGISTER_PIPELINE:', message.pipelineId);
      if (!state.activePipelines) state.activePipelines = [];
      if (state.activePipelines.indexOf(message.pipelineId) === -1) {
        state.activePipelines.push(message.pipelineId);
        persistHypervisorState(state);
      }
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action UNREGISTER_PIPELINE:', message.pipelineId);
      if (!state.activePipelines) state.activePipelines = [];
      state.activePipelines = state.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      if (state.triggerRecipients) {
        Object.keys(state.triggerRecipients).forEach(function(key) {
          if (key.indexOf(message.pipelineId + ':') === 0) delete state.triggerRecipients[key];
        });
      }
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.SET_PROGRAM:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_PROGRAM key:', message.programKey);
      if (!state.programs) state.programs = {};
      state.programs[message.programKey] = message.programSource;
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_PROGRAM:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_PROGRAM key:', message.programKey);
      resolveMessage(message, state.programs && message.programKey ? (state.programs[message.programKey] || null) : null);
      break;

    case HYPERVISORMESSAGETYPES.MARK_BOOT:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action MARK_BOOT boot:', message.boot);
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

      logdebug(hypervisorState, '[HYPERVISOR]', 'action SET_STAGE_DESCRIPTOR stored key:', key);

      persistHypervisorState(state);
      resolveMessage(message, true);
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      var isLive = state.triggerRecipients && state.triggerRecipients[recipientKey] === true;
      logdebug(hypervisorState, '[HYPERVISOR]', 'action GET_TRIGGER_RECIPIENT_STATUS key:', recipientKey, 'isLive:', isLive);
      resolveMessage(message, isLive);
      break;
    }

    case HYPERVISORMESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var stagePath = message.stagePath || [stageId];

      logdebug(hypervisorState, '[HYPERVISOR]', 'action TRIGGER_EVENT pipeline:', pipelineId, 'stage:', stageId);

      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };

      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];

      if (!descriptor) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'missing trigger stage descriptor:', descriptorKey);
        rejectMessage(message, new Error('[HYPERVISOR] missing trigger stage descriptor: ' + descriptorKey));
        return state;
      }

      state.routes['pipeline:' + pipelineId] = {
        stageId: stageId,
        stagePath: stagePath
      };
      persistHypervisorState(state);

      callwithstack(
        EVALSTACK,
        'hypervisor-trigger:' + pipelineId + ':' + stageId,
        'async-await',
        function() {
          return executeStage(descriptor, env, 'trigger', message.eventPayload);
        },
        [env],
        {
          context: { env: env },
          capturecontinuation: true,
          errk: createHypervisorErrorContext('trigger')
        }
      ).then(function(result) {
        var updatedEnv = result && result.env ? result.env : env;
        if (!state.envByPipeline[pipelineId]) state.envByPipeline[pipelineId] = {};
        state.envByPipeline[pipelineId].__root__ = {
          __root__: {
            env: updatedEnv,
            updatedAt: Date.now()
          }
        };
        persistHypervisorState(state);
        logdebug(hypervisorState, '[HYPERVISOR]', 'trigger completed:', pipelineId, stageId);
        resolveMessage(message, updatedEnv);
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'trigger failed:', err);
        rejectMessage(message, err);
      });

      return state;
    }

    case HYPERVISORMESSAGETYPES.PING:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action PING');
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.RECOVER:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action RECOVER');
      recoverHypervisorState(state.verbosity).then(function(saved) {
        if (saved && saved.envByPipeline) state.envByPipeline = saved.envByPipeline;
        if (saved && saved.renderHtml) state.renderHtml = saved.renderHtml;
        if (saved && saved.executionStack) state.executionStack = saved.executionStack;
        if (saved && saved.routes) state.routes = saved.routes;
        if (saved && saved.activePipelines) state.activePipelines = saved.activePipelines;
        if (saved && saved.programs) state.programs = saved.programs;
        if (saved && saved.stageDescriptors) state.stageDescriptors = saved.stageDescriptors;
        if (saved && saved.triggerRecipients) state.triggerRecipients = saved.triggerRecipients;
        if (saved && saved.loadedPipelines) state.loadedPipelines = saved.loadedPipelines;
        if (saved && saved.nextStageMessages) state.nextStageMessages = saved.nextStageMessages;
        state.boot = saved.boot !== undefined ? saved.boot : true;
        state.savedAt = Date.now();
        persistHypervisorState(state);
        logdebug(hypervisorState, '[HYPERVISOR]', 'recovery completed');
        resolveMessage(message, state);
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'recover failed:', err);
        rejectMessage(message, err);
      });
      return state;

    case HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS:
      logdebug(hypervisorState, '[HYPERVISOR]', 'action ACTIVATE_ACTORS');
      activateManagedActors({ verbosity: state.verbosity }).then(function() {
        resolveMessage(message, true);
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'managed actor activation failed:', err);
        rejectMessage(message, err);
      });
      return state;

    case HYPERVISORMESSAGETYPES.BOOT_PIPELINE:
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) {
        bootOptions.autorun = true;
      }
      if (bootOptions.verbosity === undefined && state.verbosity !== undefined) {
        bootOptions.verbosity = state.verbosity;
      }

      loginfo(hypervisorState, '[HYPERVISOR]', 'action BOOT_PIPELINE pipelineId:', message.pipelineId);
      logdebug(hypervisorState, '[HYPERVISOR]', 'action BOOT_PIPELINE details:', message.pipelineId, bootOptions);

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
      state.loadedPipelines[message.pipelineId] = {
        pipeline: message.pipeline,
        accessors: message.accessors || null,
        sinks: message.sinks || [],
        options: bootOptions
      };

      enqueueExecutionPipelineLoaded(message.pipelineId, {}).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'pipeline loaded notification failed:', err);
      });
      enqueueHypervisorRegisterPipeline(message.pipelineId).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'hypervisor register pipeline failed:', err);
      });
      enqueueExecutionRegisterPipeline(message.pipelineId, null, {}).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'execution register pipeline failed:', err);
      });

      var firstStageIndex = 0;
      var firstStagePath = [];
      HYPERVISOR.send({
        type: HYPERVISORMESSAGETYPES.COMPILE_STAGE,
        pipeline: message.pipeline,
        pipelineId: message.pipelineId,
        stageIndex: firstStageIndex,
        stagePath: firstStagePath,
        briefcase: message.pipeline.briefcase || {},
        env: bootOptions.baseEnv || {},
        options: bootOptions,
        resolve: null,
        reject: null
      });
      resolveMessage(message, { started: true, pipelineId: message.pipelineId });
      return state;

    case HYPERVISORMESSAGETYPES.COMPILE_STAGE: {
      var compileReq = message;
      logdebug(hypervisorState, '[HYPERVISOR]', 'action COMPILE_STAGE:', compileReq.pipelineId, 'stageIndex:', compileReq.stageIndex);

      import('../factory/blockcompiler.js').then(function(mod) {
        var stageDef = compileReq.pipeline.elements[compileReq.stageIndex];
        var result = mod.compileStage(
          stageDef,
          compileReq.briefcase,
          compileReq.pipelineId,
          compileReq.stagePath,
          compileReq.pipeline,
          compileReq.options || { verbosity: state.verbosity }
        );

        if (result.compiledStage && result.compiledStage.isTrigger) {
          var reg = createTriggerRegistrationFromStage(result.compiledStage);
          logdebug(hypervisorState, '[HYPERVISOR]', 'registering trigger expectation for stage:', reg.stageId, 'source:', reg.sourceid, 'event:', reg.event);

          enqueueHypervisorSetStageDescriptor(
            reg.pipelineId,
            reg.stageId,
            {
              stageId: reg.stageId,
              stagePath: reg.stagePath,
              pipelineId: reg.pipelineId,
              children: reg.children,
              control: reg.control,
              output: reg.output || null
            }
          ).catch(function(err) {
            logwarn(hypervisorState, '[HYPERVISOR]', 'hypervisor stage descriptor failed:', err);
          });

          enqueueRenderRegisterTriggerExpectation(reg).catch(function(err) {
            logwarn(hypervisorState, '[HYPERVISOR]', 'trigger registration failed:', err);
          });
        }

        var isAsyncStage = result.isAsync === true || (stageDef && stageDef.async === true);

        if (isAsyncStage && result.nextStageMessage) {
          logdebug(hypervisorState, '[HYPERVISOR]', 'async stage: immediately dispatching next stage message');
          HYPERVISOR.send(result.nextStageMessage);
        } else {
          state.nextStageMessages = state.nextStageMessages || {};
          state.nextStageMessages[compileReq.pipelineId + ':' + result.compiledStage.id] = result.nextStageMessage;
        }

        return enqueueExecutionSubmitStage({
          pipelineid: compileReq.pipelineId,
          path: compileReq.stagePath && compileReq.stagePath.length ? compileReq.stagePath : [result.compiledStage.id],
          stageid: result.compiledStage.id,
          stageExecutor: result.compiledStage,
          env: compileReq.env || {}
        });
      }).then(function(submitted) {
        logdebug(hypervisorState, '[HYPERVISOR]', 'stage compilation submitted taskid:', submitted.taskid);
        resolveMessage(message, { taskid: submitted.taskid });
      }).catch(function(err) {
        logwarn(hypervisorState, '[HYPERVISOR]', 'stage compilation failed:', err);
        rejectMessage(message, err);
      });
      return state;
    }

    case HYPERVISORMESSAGETYPES.STAGE_COMPLETED: {
      var key = message.pipelineId + ':' + message.stageId;
      loginfo(hypervisorState, '[HYPERVISOR]', 'action STAGE_COMPLETED:', key);
      logdebug(hypervisorState, '[HYPERVISOR]', 'action STAGE_COMPLETED env:', message.env, 'nextStageMessage:', message.nextStageMessage);

      // P15: persist env if provided
      if (message.env !== undefined && message.env !== null) {
        if (!state.envByPipeline) state.envByPipeline = {};
        if (!state.envByPipeline[message.pipelineId]) state.envByPipeline[message.pipelineId] = {};
        state.envByPipeline[message.pipelineId].__root__ = {
          __root__: {
            env: message.env,
            updatedAt: Date.now()
          }
        };
        persistHypervisorState(state);
      }

      // P15: use provided nextStageMessage, fallback to map for backward compatibility
      var nextMsg = message.nextStageMessage || (state.nextStageMessages ? state.nextStageMessages[key] : null);

      if (nextMsg) {
        if (state.nextStageMessages && state.nextStageMessages[key]) delete state.nextStageMessages[key];

        // ensure env is set on next stage message
        if (!nextMsg.env) {
          var rootEntry = state.envByPipeline && state.envByPipeline[message.pipelineId] && state.envByPipeline[message.pipelineId].__root__ && state.envByPipeline[message.pipelineId].__root__.__root__;
          nextMsg.env = rootEntry ? rootEntry.env : (message.env || {});
        }

        logdebug(hypervisorState, '[HYPERVISOR]', 'dispatching next stage message:', nextMsg.type, 'stageIndex:', nextMsg.stageIndex);
        HYPERVISOR.send(nextMsg);
      } else {
        loginfo(hypervisorState, '[HYPERVISOR]', 'pipeline complete:', message.pipelineId);
        logdebug(hypervisorState, '[HYPERVISOR]', 'no next stage message, unregistering active pipeline:', message.pipelineId);
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

var hypervisorMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

var HYPERVISOR = null;
var hypervisorStartPromise = null;

function startHypervisorActor(options) {
  if (HYPERVISOR) {
    if (options !== undefined) {
      var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
      if (lvl !== undefined) {
        hypervisorState = Object.freeze({ level: lvl });
      }
    }
    return Promise.resolve(HYPERVISOR);
  }

  var verbosity = typeof options === 'number'
    ? options
    : (options && options.verbosity !== undefined
      ? options.verbosity
      : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : hypervisorVerbosityConstants.DEBUG));

  hypervisorState = Object.freeze({ level: verbosity });

  if (!hypervisorStartPromise) {
    hypervisorStartPromise = recoverHypervisorState(verbosity).then(function(initial) {
      if (HYPERVISOR) {
        return HYPERVISOR;
      }
      initial.verbosity = verbosity;
      HYPERVISOR = createactor(
        hypervisorbehavior,
        initial,
        MESSAGEINTERFACES,
        { actorName: 'hypervisoractor', mailboxType: 'db', mailboxStore: hypervisorMailboxStore, verbosity: verbosity }
      );
      return HYPERVISOR;
    });
  }

  return hypervisorStartPromise;
}

function enqueue(type, payload) {
  return startHypervisorActor().then(function() {
    return new Promise(function(resolve, reject) {
      var message = {};
      if (payload) {
        Object.keys(payload).forEach(function(k) { message[k] = payload[k]; });
      }
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
  return enqueue(HYPERVISORMESSAGETYPES.STAGE_COMPLETED, {
    pipelineId: pipelineId,
    stageId: stageId,
    nextStageMessage: nextStageMessage || null,
    env: env
  });
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
