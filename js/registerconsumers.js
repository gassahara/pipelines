var REGISTERED_CONSUMERS = true;

// ------------------------------------------------------------------
// 1. Register request interfaces and actor consumers
// ------------------------------------------------------------------

// APIACTOR
MESSAGEREGISTRY.register('APIACTOR', MESSAGETYPES.API, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, apibehavior);
ACTORCONSUMERS['APIACTOR:api'] = apibehavior;

MESSAGEREGISTRY.register('APIACTOR', MESSAGETYPES.FETCH, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, apibehavior);
ACTORCONSUMERS['APIACTOR:fetch'] = apibehavior;

// DEBUGACTOR
MESSAGEREGISTRY.register('DEBUGACTOR', MESSAGETYPES.INIT_OVERLAY, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['DEBUGACTOR:init_overlay'] = debugbehavior;

MESSAGEREGISTRY.register('DEBUGACTOR', MESSAGETYPES.SHOW, { error: 'object', continuation: 'object?', sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['DEBUGACTOR:show'] = debugbehavior;

MESSAGEREGISTRY.register('DEBUGACTOR', MESSAGETYPES.HIDE, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['DEBUGACTOR:hide'] = debugbehavior;

MESSAGEREGISTRY.register('DEBUGACTOR', MESSAGETYPES.RECOVER, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['DEBUGACTOR:recover'] = debugbehavior;

MESSAGEREGISTRY.register('DEBUGACTOR', MESSAGETYPES.PING, { sender: 'string?', tag: 'string?' }, debugbehavior);
ACTORCONSUMERS['DEBUGACTOR:ping'] = debugbehavior;

// EXECUTIONACTOR
MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: 'string', env: 'object?' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:pipeline_loaded'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.ENV_UPDATED, { pipelineid: 'string', env: 'object' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:env_updated'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.GET_STATUS, { pipelineid: 'string?' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:get_status'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.EXECUTE_ELEMENT, {
  pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object',
  executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?',
  programRef: 'string?', elementId: 'string?', origin: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:execute_element'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.AWAIT_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:await_task'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.GET_TASKS, { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:get_tasks'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.GET_TASK_STATUS, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:get_task_status'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.CANCEL_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:cancel_task'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.STOP_TASK, { taskid: 'string' }, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:stop_task'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.CCC_ABORT, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:ccc_abort'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.CCC_CONTINUE, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:ccc_continue'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.CCC_RETRY, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:ccc_retry'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.TASK_SETTLED, {
  taskid: 'string', status: 'string', result: 'any', error: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:task_settled'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.RECOVER, {}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:recover'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.REGISTER_PIPELINE, {
  pipelineid: 'string', dna: 'object?', env: 'object?'
}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:register_pipeline'] = executionbehavior;

MESSAGEREGISTRY.register('EXECUTIONACTOR', MESSAGETYPES.PING, {}, executionbehavior);
ACTORCONSUMERS['EXECUTIONACTOR:ping'] = executionbehavior;

// HYPERVISORACTOR
MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.LOAD, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:load'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SAVE, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:save'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_ENV, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_ENV, { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_LATEST_ENV, { pipelineId: 'string', stageId: 'string', elementId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_latest_env'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_RENDER_HTML, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_render_html'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_RENDER_HTML, { html: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_render_html'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_EXECUTION_STACK, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_execution_stack'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_EXECUTION_STACK, { stack: 'array' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_execution_stack'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_ROUTE, { key: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_route'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_ROUTE, { key: 'string', route: 'object?' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_route'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_ACTIVE_PIPELINES, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_active_pipelines'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:register_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:unregister_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_PROGRAM, { programKey: 'string', programSource: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_program'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_PROGRAM, { programKey: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_program'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.MARK_BOOT, { boot: 'boolean' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:mark_boot'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.SET_STAGE_DESCRIPTOR, { pipelineId: 'string', stageId: 'string', descriptor: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:set_stage_descriptor'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.GET_TRIGGER_RECIPIENT_STATUS, { pipelineId: 'string', stageId: 'string' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:get_trigger_recipient_status'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.TRIGGER_EVENT, { pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object' }, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:trigger_event'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.PING, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:ping'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.RECOVER, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:recover'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.ACTIVATE_ACTORS, {}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:activate_actors'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.BOOT_PIPELINE, {
  dna: 'object', accessors: 'object?', sinks: 'array', pipelineId: 'string', options: 'object?', firstStage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:boot_pipeline'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.COMPILE_STAGE, {
  pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:compile_stage'] = hypervisorbehavior;

MESSAGEREGISTRY.register('HYPERVISORACTOR', MESSAGETYPES.STAGE_COMPLETED, {
  pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?'
}, hypervisorbehavior);
ACTORCONSUMERS['HYPERVISORACTOR:stage_completed'] = hypervisorbehavior;

// RENDERACTOR
MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.RENDER, { id: 'string', renderer: 'function', data: 'any', env: 'object' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:render'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.CLEAR, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:clear'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.HTML, { id: 'string', markup: 'string', append: 'boolean' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:html'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.REMOVE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:remove'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETSTYLES, { id: 'string', styles: 'object' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setstyles'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETATTR, { id: 'string', name: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setattr'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.TOGGLECLASS, { id: 'string', classname: 'string', force: 'boolean?' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:toggleclass'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.CRYPTO, { bytes: 'number' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:crypto'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GEOLOCATION, { enablehighaccuracy: 'boolean', timeout: 'number' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:geolocation'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.PERSISTENCE, { action: 'string', key: 'string?', value: 'string?' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:persistence'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.CREATEELEMENT, { tag: 'string', props: 'object?' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:createelement'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.CREATECONTAINER, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:createcontainer'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.CREATEFROMHTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:createfromhtml'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.PROPERTY, { id: 'string', name: 'string', arguments: 'array?' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:property'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETHTML, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:gethtml'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETVALUE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getvalue'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETSTYLE, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getstyle'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETPOSITION, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getposition'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETLAYOUT, { id: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getlayout'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETHTML, { id: 'string', value: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:sethtml'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETPOSITION, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setposition'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETSTYLE, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setstyle'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETVALUE, { id: 'string', value: 'any' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setvalue'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.SETLAYOUT, { id: 'string', value: 'object' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:setlayout'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETVIEWPORT, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getviewport'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GETSCREEN, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:getscreen'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.MATCHMEDIA, { query: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:matchmedia'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.GET_BODY_HTML, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:get_body_html'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.RESTORE_BODY_HTML, { html: 'string' }, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:restore_body_html'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.RECOVER, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:recover'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.PING, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:ping'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.REGISTER_TRIGGER, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array'
}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:register_trigger'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array', output: 'string?'
}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:register_trigger_expectation'] = renderbehavior;

MESSAGEREGISTRY.register('RENDERACTOR', MESSAGETYPES.REVALIDATE_TRIGGERS, {}, renderbehavior);
ACTORCONSUMERS['RENDERACTOR:revalidate_triggers'] = renderbehavior;

// WORLDMAPACTOR
MESSAGEREGISTRY.register('WORLDMAPACTOR', MESSAGETYPES.UPDATE, { updates: 'array' }, worldmapbehavior);
ACTORCONSUMERS['WORLDMAPACTOR:update'] = worldmapbehavior;

MESSAGEREGISTRY.register('WORLDMAPACTOR', MESSAGETYPES.UPDATE_FN, { fn: 'function' }, worldmapbehavior);
ACTORCONSUMERS['WORLDMAPACTOR:update_fn'] = worldmapbehavior;

MESSAGEREGISTRY.register('WORLDMAPACTOR', MESSAGETYPES.OBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['WORLDMAPACTOR:observe'] = worldmapbehavior;

MESSAGEREGISTRY.register('WORLDMAPACTOR', MESSAGETYPES.UNOBSERVE, { observer: 'function' }, worldmapbehavior);
ACTORCONSUMERS['WORLDMAPACTOR:unobserve'] = worldmapbehavior;

MESSAGEREGISTRY.register('WORLDMAPACTOR', MESSAGETYPES.GET_WORLDMAP, {}, worldmapbehavior);
ACTORCONSUMERS['WORLDMAPACTOR:get_worldmap'] = worldmapbehavior;

// DBACTOR
MESSAGEREGISTRY.register('DBACTOR', MESSAGETYPES.STORE, { key: 'string', value: 'any', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('DBACTOR', MESSAGETYPES.RESTORE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('DBACTOR', MESSAGETYPES.LIST, { resolve: 'function?', reject: 'function?' }, dbbehavior);
MESSAGEREGISTRY.register('DBACTOR', MESSAGETYPES.DELETE, { key: 'string', resolve: 'function?', reject: 'function?' }, dbbehavior);

// MAILACTOR
MESSAGEREGISTRY.register('MAILACTOR', MESSAGETYPES.SEND, { recipient: 'string', message: 'object' }, mailbehavior);
MESSAGEREGISTRY.register('MAILACTOR', MESSAGETYPES.ACK, { recipient: 'string', ids: 'array' }, mailbehavior);

// ------------------------------------------------------------------
// 2. Response consumers removed – no RESPONSECONSUMERS registrations.
// ------------------------------------------------------------------
