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
ACTORCONSUMERS['apiactor:api'] = APIACTOR.dispatch;

MESSAGEREGISTRY.register('apiactor', MESSAGETYPES.FETCH, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, apibehavior);
ACTORCONSUMERS['apiactor:fetch'] = APIACTOR.dispatch;

// debugactor
MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.INIT_OVERLAY, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:init_overlay'] = DEBUGACTOR.dispatch;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.SHOW, { error: 'object', continuation: 'object?', sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:show'] = DEBUGACTOR.dispatch;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.HIDE, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:hide'] = DEBUGACTOR.dispatch;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.RECOVER, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:recover'] = DEBUGACTOR.dispatch;

MESSAGEREGISTRY.register('debugactor', MESSAGETYPES.PING, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['debugactor:ping'] = DEBUGACTOR.dispatch;

// executionactor
MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: 'string', env: 'object?' }, executionbehavior);
ACTORCONSUMERS['executionactor:pipeline_loaded'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.ENV_UPDATED, { pipelineid: 'string', env: 'object' }, executionbehavior);
ACTORCONSUMERS['executionactor:env_updated'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_STATUS, { pipelineid: 'string?' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_status'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.EXECUTE_ELEMENT, {
  pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object',
  executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?',
  programRef: 'string?', elementId: 'string?', origin: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:execute_element'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.AWAIT_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:await_task'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_TASKS, { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_tasks'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.GET_TASK_STATUS, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:get_task_status'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CANCEL_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:cancel_task'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.STOP_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['executionactor:stop_task'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_ABORT, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_abort'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_CONTINUE, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_continue'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.CCC_RETRY, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:ccc_retry'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.TASK_SETTLED, {
  taskid: 'string', status: 'string', result: 'any', error: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:task_settled'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.RECOVER, {}, executionbehavior);
ACTORCONSUMERS['executionactor:recover'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.REGISTER_PIPELINE, {
  pipelineid: 'string', dna: 'object?', env: 'object?'
}, executionbehavior);
ACTORCONSUMERS['executionactor:register_pipeline'] = EXECUTIONACTOR.dispatch;

MESSAGEREGISTRY.register('executionactor', MESSAGETYPES.PING, {}, executionbehavior);
ACTORCONSUMERS['executionactor:ping'] = EXECUTIONACTOR.dispatch;

// hypervisoractor
MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.LOAD, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:load'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SAVE, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:save'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ENV, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_env'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_ENV, { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_env'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_LATEST_ENV, { pipelineId: 'string', stageId: 'string', elementId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_latest_env'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_RENDER_HTML, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_render_html'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_RENDER_HTML, { html: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_render_html'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_EXECUTION_STACK, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_execution_stack'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_EXECUTION_STACK, { stack: 'array' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_execution_stack'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ROUTE, { key: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_route'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_ROUTE, { key: 'string', route: 'object?' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_route'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_ACTIVE_PIPELINES, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_active_pipelines'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:register_pipeline'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:unregister_pipeline'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_PROGRAM, { programKey: 'string', programSource: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_program'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_PROGRAM, { programKey: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_program'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.MARK_BOOT, { boot: 'boolean' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:mark_boot'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId: 'string', stageId: 'string', descriptor: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:set_stage_descriptor'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId: 'string', stageId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:get_trigger_recipient_status'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.TRIGGER_EVENT, { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:trigger_event'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.PING, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:ping'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.RECOVER, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:recover'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.ACTIVATE_ACTORS, {}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:activate_actors'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.BOOT_PIPELINE, {
  pipeline: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:boot_pipeline'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.COMPILE_STAGE, {
  pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:compile_stage'] = HYPERVISOR.dispatch;

MESSAGEREGISTRY.register('hypervisoractor', MESSAGETYPES.STAGE_COMPLETED, {
  pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['hypervisoractor:stage_completed'] = HYPERVISOR.dispatch;

// renderactor
MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RENDER, { id: 'string', renderer: 'function', data: 'any', env: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:render'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CLEAR, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:clear'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.HTML, { id: 'string', markup: 'string', append: 'boolean' }, renderbehavior);
ACTORCONSUMERS['renderactor:html'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REMOVE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:remove'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETSTYLES, { id: 'string', styles: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setstyles'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETATTR, { id: 'string', name: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:setattr'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.TOGGLECLASS, { id: 'string', classname: 'string', force: 'boolean?' }, renderbehavior);
ACTORCONSUMERS['renderactor:toggleclass'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CRYPTO, { bytes: 'number' }, renderbehavior);
ACTORCONSUMERS['renderactor:crypto'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GEOLOCATION, { enablehighaccuracy: 'boolean', timeout: 'number' }, renderbehavior);
ACTORCONSUMERS['renderactor:geolocation'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PERSISTENCE, { action: 'string', key: 'string?', value: 'string?' }, renderbehavior);
ACTORCONSUMERS['renderactor:persistence'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATEELEMENT, { tag: 'string', props: 'object?' }, renderbehavior);
ACTORCONSUMERS['renderactor:createelement'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATECONTAINER, {}, renderbehavior);
ACTORCONSUMERS['renderactor:createcontainer'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.CREATEFROMHTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:createfromhtml'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PROPERTY, { id: 'string', name: 'string', arguments: 'array?' }, renderbehavior);
ACTORCONSUMERS['renderactor:property'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETHTML, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:gethtml'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETVALUE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getvalue'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETSTYLE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getstyle'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETPOSITION, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getposition'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETLAYOUT, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:getlayout'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETHTML, { id: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:sethtml'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETPOSITION, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setposition'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETSTYLE, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setstyle'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETVALUE, { id: 'string', value: 'any' }, renderbehavior);
ACTORCONSUMERS['renderactor:setvalue'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.SETLAYOUT, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['renderactor:setlayout'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETVIEWPORT, {}, renderbehavior);
ACTORCONSUMERS['renderactor:getviewport'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GETSCREEN, {}, renderbehavior);
ACTORCONSUMERS['renderactor:getscreen'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.MATCHMEDIA, { query: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:matchmedia'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.GET_BODY_HTML, {}, renderbehavior);
ACTORCONSUMERS['renderactor:get_body_html'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RESTORE_BODY_HTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['renderactor:restore_body_html'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RECOVER, {}, renderbehavior);
ACTORCONSUMERS['renderactor:recover'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.PING, {}, renderbehavior);
ACTORCONSUMERS['renderactor:ping'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REGISTER_TRIGGER, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array'
}, renderbehavior);
ACTORCONSUMERS['renderactor:register_trigger'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array', output: 'string?'
}, renderbehavior);
ACTORCONSUMERS['renderactor:register_trigger_expectation'] = RENDERACTOR.dispatch;

MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.REVALIDATE_TRIGGERS, {}, renderbehavior);
ACTORCONSUMERS['renderactor:revalidate_triggers'] = RENDERACTOR.dispatch;

// worldmapactor
MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UPDATE, { patch: 'object' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:update'] = WORLDMAPACTOR.dispatch;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UPDATE_FN, { fn: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:update_fn'] = WORLDMAPACTOR.dispatch;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.OBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:observe'] = WORLDMAPACTOR.dispatch;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.UNOBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:unobserve'] = WORLDMAPACTOR.dispatch;

MESSAGEREGISTRY.register('worldmapactor', MESSAGETYPES.GET_WORLDMAP, {}, worldmapbehavior);
ACTORCONSUMERS['worldmapactor:get_worldmap'] = WORLDMAPACTOR.dispatch;

// dbactor (memory mailbox; no direct dispatch consumer needed? Actually dbactor uses its own send, not mail actor. We don't need ACTORCONSUMERS for dbactor.)
// We still register interfaces for completeness.
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.STORE, { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.RESTORE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.LIST, { resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('dbactor', MESSAGETYPES.DELETE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);

// mailactor (already registered in mailactor.js? Actually mailactor self-registers in its file. In our updated mailactor.js we still had a registration loop? We removed? In file 3, we kept the registration loop at bottom? Let's check: In file 3 we had Object.keys(mailactorINTERFACES).forEach... So mailactor still self-registers? That violates centralization. We should remove it in file 3. But in this execution, we may not have removed it from file 3. Hmm, we need to be consistent. In file 3 we included registration. That's a mistake. We should go back and remove it, but since we're in execution list, we can note that file 3 should be updated. For now in registerconsumers.js, we'll also register mailactor? That would double. But we can assume file 3 will be corrected in a later reexecution? Better to not double. We'll omit mailactor registration here, or note it. We'll leave as is for now; user can reexecute index 3 later. We'll continue.)

// ------------------------------------------------------------------
// 2. Register response consumers
// ------------------------------------------------------------------

RESPONSECONSUMERS[MESSAGETYPES.API_RESULT] = blockcompilerApiResult;
RESPONSECONSUMERS[MESSAGETYPES.FETCH_RESULT] = blockcompilerFetchResult;
RESPONSECONSUMERS[MESSAGETYPES.TASK_RESULT] = blockcompilerTaskResult;
RESPONSECONSUMERS[MESSAGETYPES.PIPELINE_BOOTED] = blockcompilerPipelineBooted;
RESPONSECONSUMERS[MESSAGETYPES.DOM_RESULT] = blockcompilerDomResult;
RESPONSECONSUMERS[MESSAGETYPES.STAGE_COMPLETED_ACK] = blockcompilerStageCompletedAck;
