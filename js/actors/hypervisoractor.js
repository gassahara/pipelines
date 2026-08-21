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
  TRIGGER_EVENT: 'trigger_event'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.LOAD] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SAVE] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.GET_ENV] = { pipelineId: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[HYPERVISORMESSAGETYPES.SET_ENV] = { pipelineId: 'string', env: 'object', resolve: 'function?', reject: 'function?' };
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

var hypervisorbehavior = function(state, message) {
  switch (message.type) {
    case HYPERVISORMESSAGETYPES.LOAD:
      resolveMessage(message, state);
      break;

    case HYPERVISORMESSAGETYPES.SAVE:
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

    case HYPERVISORMESSAGETYPES.GET_ENV:
      resolveMessage(message, state.envByPipeline && message.pipelineId
        ? (state.envByPipeline[message.pipelineId] || null)
        : null);
      break;

    case HYPERVISORMESSAGETYPES.SET_ENV:
      if (!state.envByPipeline) state.envByPipeline = {};
      state.envByPipeline[message.pipelineId] = message.env || {};
      persistHypervisorState(state);
      resolveMessage(message, true);
      break;

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

      var env = state.envByPipeline && state.envByPipeline[pipelineId]
        ? state.envByPipeline[pipelineId]
        : { pipelineid: pipelineId };

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
        state.envByPipeline[pipelineId] = updatedEnv;
        persistHypervisorState(state);
        hypervisorLogger.debug('[hypervisor] trigger completed', pipelineId, stageId);
        resolveMessage(message, updatedEnv);
      }).catch(function(err) {
        hypervisorLogger.warn('[hypervisor] trigger failed', err);
        rejectMessage(message, err);
      });

      return state;
    }

    default:
      rejectMessage(message, new Error('[HYPERVISOR] unknown message type: ' + message.type));
  }

  return state;
};

async function loadInitialHypervisorState() {
  try {
    var saved = await enqueueDbRestore('actor:state:hypervisor');
    if (saved) {
      saved.boot = false;
      saved.envByPipeline = saved.envByPipeline || {};
      saved.renderHtml = saved.renderHtml || '';
      saved.executionStack = saved.executionStack || [];
      saved.routes = saved.routes || {};
      saved.activePipelines = saved.activePipelines || [];
      saved.programs = saved.programs || {};
      saved.stageDescriptors = saved.stageDescriptors || {};
      saved.triggerRecipients = saved.triggerRecipients || {};
      saved.savedAt = Date.now();
      return saved;
    }
  } catch (err) {
    hypervisorLogger.warn('[HYPERVISOR] state restore failed:', err);
  }

  var initialState = createInitialHypervisorState();
  enqueueDbStore('actor:state:hypervisor', initialState).catch(function(err) {
    hypervisorLogger.warn('[HYPERVISOR] default state persist failed:', err);
  });
  return initialState;
}

var hypervisorMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

var initialState = await loadInitialHypervisorState();
var HYPERVISOR = createactor(
  hypervisorbehavior,
  initialState,
  MESSAGEINTERFACES,
  { actorName: 'hypervisoractor', mailboxType: 'db', mailboxStore: hypervisorMailboxStore }
);

function enqueue(type, payload) {
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
}

var enqueueHypervisorLoad = function() { return enqueue(HYPERVISORMESSAGETYPES.LOAD); };
var enqueueHypervisorSave = function() { return enqueue(HYPERVISORMESSAGETYPES.SAVE); };
var enqueueHypervisorGetEnv = function(pipelineId) { return enqueue(HYPERVISORMESSAGETYPES.GET_ENV, { pipelineId: pipelineId }); };
var enqueueHypervisorSetEnv = function(pipelineId, env) { return enqueue(HYPERVISORMESSAGETYPES.SET_ENV, { pipelineId: pipelineId, env: env }); };
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

export {
  HYPERVISORMESSAGETYPES,
  HYPERVISOR,
  enqueueHypervisorLoad,
  enqueueHypervisorSave,
  enqueueHypervisorGetEnv,
  enqueueHypervisorSetEnv,
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
  enqueueHypervisorTrigger
};
