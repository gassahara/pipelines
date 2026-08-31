// ============================================================
// PROGRAM: js/registerconsumers.js
// CENTRAL REGISTRATION — loads after all actor programs.
// Registers all message types, interfaces, actor consumers,
// and response consumers in one place.
// This file does not define behaviors; it references global
// behavior functions and actor instances.
// ============================================================

var REGISTERED_CONSUMERS = true;

// ------------------------------------------------------------------
// 1. Register request interfaces and actor consumers
// ------------------------------------------------------------------

// apiactor
MESSAGEREGISTRY.register('apiactor', MESSAGETYPES.API, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, apibehavior);
ACTORCONSUMERS['apiactor:api'] = apibehavior;

MESSAGEREGISTRY.register('apiactor', MESSAGETYPES.FETCH, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, apibehavior);
ACTORCONSUMERS['apiactor:fetch'] = apibehavior;

// debugactor
MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.INIT_OVERLAY, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:init_overlay'] = debugbehavior;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.SHOW, { error: 'object', continuation: 'object?', sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:show'] = debugbehavior;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.HIDE, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:hide'] = debugbehavior;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.RECOVER, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:recover'] = debugbehavior;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.PING, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:ping'] = debugbehavior;

// executionactor
MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: 'string', env: 'object?' }, executionbehavior);
ACTORCONSUMERS['executionactor:pipeline_loaded'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.ENV_UPDATED, { pipelineid: 'string', env: 'object' }, executionbehavior);
ACTORCONSUMERS['executionactor:env_updated'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_STATUS, { pipelineid: 'string?' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_status'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.EXECUTE_ELEMENT, {
  pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object',
  executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?',
  programRef: 'string?', elementId: 'string?', origin: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:execute_element'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.AWAIT_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:await_task'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_TASKS, { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_tasks'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_TASK_STATUS, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_task_status'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CANCEL_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:cancel_task'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.STOP_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:stop_task'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_ABORT, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_abort'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_CONTINUE, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_continue'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_RETRY, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_retry'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.TASK_SETTLED, {
  taskid: 'string', status: 'string', result: 'any', error: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:task_settled'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.RECOVER, {}, executionbehavior);
ACTORCONSUMERS['executionactor:recover'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.REGISTER_PIPELINE, {
  pipelineid: 'string', dna: 'object?', env: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:register_pipeline'] = executionbehavior;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.PING, {}, executionbehavior);
ACTORCONSUMERS['executionactor:ping'] = executionbehavior;

// hypervisoractor
MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.LOAD, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:load'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SAVE, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:save'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ENV, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_ENV, { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_LATEST_ENV, { pipelineId: 'string', stageId: 'string', elementId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_latest_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_RENDER_HTML, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_render_html'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_RENDER_HTML, { html: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_render_html'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_EXECUTION_STACK, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_execution_stack'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_EXECUTION_STACK, { stack: 'array' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_execution_stack'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ROUTE, { key: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_route'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_ROUTE, { key: 'string', route: 'object?' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_route'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ACTIVE_PIPELINES, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_active_pipelines'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:register_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:unregister_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_PROGRAM, { programKey: 'string', programSource: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_program'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_PROGRAM, { programKey: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_program'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.MARK_BOOT, { boot: 'boolean' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:mark_boot'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId: 'string', stageId: 'string', descriptor: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_stage_descriptor'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId: 'string', stageId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_trigger_recipient_status'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.TRIGGER_EVENT, { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:trigger_event'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.PING, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:ping'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.RECOVER, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:recover'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.ACTIVATE_ACTORS, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:activate_actors'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.BOOT_PIPELINE, {
  pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:boot_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.COMPILE_STAGE, {
  pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:compile_stage'] = hypervisorbehavior;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.STAGE_COMPLETED, {
  pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:stage_completed'] = hypervisorbehavior;

// renderactor
MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RENDER, { id: 'string', renderer: 'function', data: 'any', env: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:render'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CLEAR, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:clear'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.HTML, { id: 'string', markup: 'string', append: 'boolean' }, renderbehavior);
ACTORCONSUMERS['renderactor:html'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REMOVE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:remove'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETSTYLES, { id: 'string', styles: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setstyles'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETATTR, { id: 'string', name: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:setattr'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.TOGGLECLASS, { id: 'string', classname: 'string', force: 'boolean?' }, renderbehavior);
ACTORCONSUMERS['renderactor:toggleclass'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CRYPTO, { bytes: 'number' }, renderbehavior);
ACTORCONSUMERS['renderactor:crypto'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GEOLOCATION, { enablehighaccuracy: 'boolean', timeout: 'number' }, renderbehavior);
ACTORCONSUMERS['renderactor:geolocation'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PERSISTENCE, { action: 'string', key: 'string?', value: 'string?' }, renderbehavior);
ACTORCONSUMERS['renderactor:persistence'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATEELEMENT, { tag: 'string', props: 'object?' }, renderbehavior);
ACTORCONSUMERS['renderactor:createelement'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATECONTAINER, {}, renderbehavior);
ACTORCONSUMERS['renderactor:createcontainer'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATEFROMHTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:createfromhtml'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PROPERTY, { id: 'string', name: 'string', arguments: 'array?' }, renderbehavior);
ACTORCONSUMERS['renderactor:property'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETHTML, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:gethtml'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETVALUE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getvalue'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETSTYLE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getstyle'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETPOSITION, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getposition'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETLAYOUT, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getlayout'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETHTML, { id: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:sethtml'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETPOSITION, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setposition'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETSTYLE, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setstyle'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETVALUE, { id: 'string', value: 'any' }, renderbehavior);
ACTORCONSUMERS['renderactor:setvalue'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETLAYOUT, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setlayout'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETVIEWPORT, {}, renderbehavior);
ACTORCONSUMERS['renderactor:getviewport'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETSCREEN, {}, renderbehavior);
ACTORCONSUMERS['renderactor:getscreen'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.MATCHMEDIA, { query: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:matchmedia'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GET_BODY_HTML, {}, renderbehavior);
ACTORCONSUMERS['renderactor:get_body_html'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RESTORE_BODY_HTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:restore_body_html'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RECOVER, {}, renderbehavior);
ACTORCONSUMERS['renderactor:recover'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PING, {}, renderbehavior);
ACTORCONSUMERS['renderactor:ping'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REGISTER_TRIGGER, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array'
}, renderbehavior);
ACTORCONSUMERS['renderactor:register_trigger'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array', output: 'string?'
}, renderbehavior);
ACTORCONSUMERS['renderactor:register_trigger_expectation'] = renderbehavior;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REVALIDATE_TRIGGERS, {}, renderbehavior);
ACTORCONSUMERS['renderactor:revalidate_triggers'] = renderbehavior;

// worldmapactor
MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UPDATE, { patch: 'object' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:update'] = worldmapbehavior;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UPDATE_FN, { fn: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:update_fn'] = worldmapbehavior;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.OBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:observe'] = worldmapbehavior;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UNOBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:unobserve'] = worldmapbehavior;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.GET_WORLDMAP, {}, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:get_worldmap'] = worldmapbehavior;

// dbactor (memory mailbox; interfaces registered for completeness)
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.STORE, { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.RESTORE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.LIST, { resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.DELETE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);

// mailactor (used for message routing, not registered as consumer? Interfaces registered)
MESSAGEREGISTRY.register('mailactor', MESSAGETYPES.SEND, {
  recipient: 'string', message: 'object'
}, mailbehavior);
MESSAGEREGISTRY.register('mailactor', MESSAGETYPES.ACK, {
  recipient: 'string', ids: 'array'
}, mailbehavior);

// ------------------------------------------------------------------
// 2. Register response consumers
// ------------------------------------------------------------------

RESPONSECONSUMERS[MESSAGETYPES.API_RESULT] = blockcompilerApiResult;
RESPONSECONSUMERS[MESSAGETYPES.FETCH_RESULT] = blockcompilerFetchResult;
RESPONSECONSUMERS[MESSAGETYPES.TASK_RESULT] = blockcompilerTaskResult;
RESPONSECONSUMERS[MESSAGETYPES.PIPELINE_BOOTED] = blockcompilerPipelineBooted;
RESPONSECONSUMERS[MESSAGETYPES.DOM_RESULT] = blockcompilerDomResult;
RESPONSECONSUMERS[MESSAGETYPES.STAGE_COMPLETED_ACK] = blockcompilerStageCompletedAck;
