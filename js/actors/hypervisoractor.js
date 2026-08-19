import { createactor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore } from './dbactor.js';

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
  MARK_BOOT: 'mark_boot'
});

function createInitialHypervisorState() {
  return {
    boot: true,
    env: {},
    renderHtml: '',
    executionStack: [],
    routes: {},
    activePipelines: [],
    programs: {},
    savedAt: Date.now()
  };
}

function persistHypervisorState(state) {
  state.savedAt = Date.now();
  enqueueDbStore('actor:state:hypervisor', state).catch(function(err) {
    console.warn('[HYPERVISOR] state persist failed:', err);
  });
}

function resolveMessage(message, value) {
  if (typeof message.resolve === 'function') message.resolve(value);
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
      resolveMessage(message, state.env || {});
      break;

    case HYPERVISORMESSAGETYPES.SET_ENV:
      state.env = message.env || {};
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

    default:
      if (typeof message.reject === 'function') {
        message.reject(new Error('[HYPERVISOR] unknown message type: ' + message.type));
      }
  }

  return state;
};

async function loadInitialHypervisorState() {
  try {
    var saved = await enqueueDbRestore('actor:state:hypervisor');
    if (saved) {
      saved.boot = false;
      saved.env = saved.env || {};
      saved.renderHtml = saved.renderHtml || '';
      saved.executionStack = saved.executionStack || [];
      saved.routes = saved.routes || {};
      saved.activePipelines = saved.activePipelines || [];
      saved.programs = saved.programs || {};
      saved.savedAt = Date.now();
      return saved;
    }
  } catch (err) {
    console.warn('[HYPERVISOR] state restore failed:', err);
  }

  var initialState = createInitialHypervisorState();
  enqueueDbStore('actor:state:hypervisor', initialState).catch(function(err) {
    console.warn('[HYPERVISOR] default state persist failed:', err);
  });
  return initialState;
}

var initialState = await loadInitialHypervisorState();
var HYPERVISOR = createactor(hypervisorbehavior, initialState);

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
var enqueueHypervisorGetEnv = function() { return enqueue(HYPERVISORMESSAGETYPES.GET_ENV); };
var enqueueHypervisorSetEnv = function(env) { return enqueue(HYPERVISORMESSAGETYPES.SET_ENV, { env: env }); };
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
  enqueueHypervisorMarkBoot
};
