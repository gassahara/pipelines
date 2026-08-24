import { createactor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import { executeStage } from '../factory/blockcompiler.js';
import { callwithstack } from '../factory/callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';

var hypervisorVerbosityConstants = createVerbosityConstants();
var hypervisorVerbosityFunctions = createVerbosityFunctions(hypervisorVerbosityConstants);
var hypervisorVerbosityState = Object.freeze({ level: hypervisorVerbosityConstants.DEBUG });

var hypervisorLogger = {
  debug: function() {
    hypervisorVerbosityFunctions.logdebug.apply(null, [hypervisorVerbosityState].concat(Array.prototype.slice.call(arguments)));
  },
  warn: function() {
    hypervisorVerbosityFunctions.logwarn.apply(null, [hypervisorVerbosityState].concat(Array.prototype.slice.call(arguments)));
  },
  info: function() {
    hypervisorVerbosityFunctions.loginfo.apply(null, [hypervisorVerbosityState].concat(Array.prototype.slice.call(arguments)));
  }
};

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
  BOOT_PIPELINE: 'boot_pipeline'
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
Object.freeze(MESSAGEINTERFACES);

function createInitialHypervisorState() {
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
    savedAt: Date.now()
  };
}

function persistHypervisorState(state) {
  state.savedAt = Date.now();
  enqueueDbStore('actor:state:hypervisor', state).catch(function(err) {
    hypervisorLogger.warn('[HYPERVISOR] state persist failed:', err);
  });
}

function resolveMessage(message, value) {
  if (typeof message.resolve === 'function') message.resolve(value);
}

function rejectMessage(message, error) {
  if (typeof message.reject === 'function') message.reject(error);
}

function recoverHypervisorState() {
  return enqueueDbRestore('actor:state:hypervisor').then(function(saved) {
    if (saved && typeof saved === 'object') {
      return saved;
    }
    var initial = createInitialHypervisorState();
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
      return true;
    }

    if (retries <= 0) {
      throw new Error('[activateManagedActors] ' + name + ' actor not reachable');
    }

    return Promise.resolve().then(startFn).then(function() {
      return ensureActorAlive(name, pingFn, startFn, retries - 1);
    });
  });
}

async function activateManagedActors() {
  var renderMod = await getRenderModule();
  await ensureActorAlive(
    'renderactor',
    function() { return renderMod.enqueueRenderPing(); },
    function() { return renderMod.startRenderActor(); }
  );
  await renderMod.enqueueRenderRecover().catch(function(err) {
    hypervisorLogger.warn('[HYPERVISOR] render recover failed:', err);
  });

  var execMod = await getExecutionModule();
  await ensureActorAlive(
    'executionactor',
    function() { return execMod.enqueueExecutionPing(); },
    function() { return execMod.startExecutionActor(); }
  );
  await execMod.enqueueExecutionRecover().catch(function(err) {
    hypervisorLogger.warn('[HYPERVISOR] execution recover failed:', err);
  });

  var debugMod = await getDebugModule();
  await ensureActorAlive(
    'debugactor',
    function() { return debugMod.enqueueDebugPing(); },
    function() { return debugMod.startDebugActor(); }
  );
  await debugMod.enqueueDebugRecover().catch(function(err) {
    hypervisorLogger.warn('[HYPERVISOR] debug recover failed:', err);
  });
}

var hypervisorbehavior = function(state, message) {
  switch (message.type) {
    case HYPERVISORMESSAGETYPES.LOAD:
      resolveMessage(message, state);
      break;

    case HYPERVISORMESSAGETYPES.SAVE:
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
      if (state.activePipelines.indexOf(message.pipelineId) === -1) {
        state.activePipelines.push(message.pipelineId);
        persistHypervisorState(state);
      }
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.UNREGISTER_PIPELINE:
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

      hypervisorLogger.debug('[hypervisor] stage descriptor stored', key);

      persistHypervisorState(state);
      resolveMessage(message, true);
      break;
    }

    case HYPERVISORMESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS: {
      var recipientKey = message.pipelineId + ':' + message.stageId;
      var isLive = Boolean(
        state.triggerRecipients && state.triggerRecipients[recipientKey]
      );
      hypervisorLogger.debug('[hypervisor] recipient status', recipientKey, isLive);
      resolveMessage(message, isLive);
      break;
    }

    case HYPERVISORMESSAGETYPES.TRIGGER_EVENT: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var stagePath = message.stagePath || [stageId];

      var rootEntry = state.envByPipeline && state.envByPipeline[pipelineId] && state.envByPipeline[pipelineId].__root__ && state.envByPipeline[pipelineId].__root__.__root__;
      var env = rootEntry ? rootEntry.env : { pipelineid: pipelineId };

      var descriptorKey = pipelineId + ':' + stageId;
      var descriptor = state.stageDescriptors && state.stageDescriptors[descriptorKey];

      if (!descriptor) {
        hypervisorLogger.warn('[hypervisor] missing trigger stage descriptor:', descriptorKey);
        rejectMessage(message, new Error('[HYPERVISOR] missing trigger stage descriptor: ' + descriptorKey));
        return state;
      }

      state.routes['pipeline:' + pipelineId] = {
        stageId: stageId,
        stagePath: stagePath
      };
      persistHypervisorState(state);

      hypervisorLogger.debug('[hypervisor] trigger event', pipelineId, stageId);

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
        hypervisorLogger.debug('[hypervisor] trigger completed', pipelineId, stageId);
        resolveMessage(message, updatedEnv);
      }).catch(function(err) {
        hypervisorLogger.warn('[hypervisor] trigger failed', err);
        rejectMessage(message, err);
      });

      return state;
    }

    case HYPERVISORMESSAGETYPES.PING:
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.RECOVER:
      recoverHypervisorState().then(function(saved) {
        if (saved && saved.envByPipeline) state.envByPipeline = saved.envByPipeline;
        if (saved && saved.renderHtml) state.renderHtml = saved.renderHtml;
        if (saved && saved.executionStack) state.executionStack = saved.executionStack;
        if (saved && saved.routes) state.routes = saved.routes;
        if (saved && saved.activePipelines) state.activePipelines = saved.activePipelines;
        if (saved && saved.programs) state.programs = saved.programs;
        if (saved && saved.stageDescriptors) state.stageDescriptors = saved.stageDescriptors;
        if (saved && saved.triggerRecipients) state.triggerRecipients = saved.triggerRecipients;
        state.boot = saved.boot !== undefined ? saved.boot : true;
        state.savedAt = Date.now();
        persistHypervisorState(state);
        resolveMessage(message, state);
      }).catch(function(err) {
        hypervisorLogger.warn('[HYPERVISOR] recover failed:', err);
        rejectMessage(message, err);
      });
      return state;

    case HYPERVISORMESSAGETYPES.ACTIVATE_ACTORS:
      activateManagedActors().then(function() {
        resolveMessage(message, true);
      }).catch(function(err) {
        hypervisorLogger.warn('[HYPERVISOR] managed actor activation failed:', err);
        rejectMessage(message, err);
      });
      return state;

    case HYPERVISORMESSAGETYPES.BOOT_PIPELINE:
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) {
        bootOptions.autorun = true;
      }

      hypervisorLogger.debug('[HYPERVISOR] child boot pipeline requested:', message.pipelineId);

      activateManagedActors().then(function() {
        return import('../factory/blockcompiler.js').then(function(mod) {
          return mod.compilepipeline(
            message.pipeline,
            message.accessors,
            message.sinks,
            message.pipelineId,
            bootOptions
          );
        });
      }).then(function(result) {
        resolveMessage(message, result);
      }).catch(function(err) {
        hypervisorLogger.warn('[HYPERVISOR] boot pipeline failed:', err);
        rejectMessage(message, err);
      });
      return state;

    default:
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

function startHypervisorActor() {
  if (HYPERVISOR) {
    return Promise.resolve(HYPERVISOR);
  }

  if (!hypervisorStartPromise) {
    hypervisorStartPromise = recoverHypervisorState().then(function(initial) {
      if (HYPERVISOR) {
        return HYPERVISOR;
      }
      HYPERVISOR = createactor(
        hypervisorbehavior,
        initial,
        MESSAGEINTERFACES,
        { actorName: 'hypervisoractor', mailboxType: 'db', mailboxStore: hypervisorMailboxStore }
      );
      return HYPERVISOR;
    });
  }

  return hypervisorStartPromise;
}

function startHypervisorWithPipeline(pipeline, accessors, sinks, pipelineId, options) {
  return startHypervisorActor().then(function(actor) {
    return new Promise(function(resolve, reject) {
      actor.send({
        type: HYPERVISORMESSAGETYPES.BOOT_PIPELINE,
        pipeline: pipeline,
        accessors: accessors,
        sinks: sinks,
        pipelineId: pipelineId,
        options: options,
        resolve: resolve,
        reject: reject
      });
    });
  });
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

export {
  HYPERVISORMESSAGETYPES,
  HYPERVISOR,
  startHypervisorActor,
  startHypervisorWithPipeline,
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
  enqueueHypervisorBootPipeline
};
