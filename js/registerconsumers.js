var registeredconsumers = true;

// APIACTOR
messageregistry.register('APIACTOR', MESSAGETYPES.API, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, APIBEHAVIOR);

messageregistry.register('APIACTOR', MESSAGETYPES.FETCH, {
  endpoint: 'string', method: 'string', payload: 'object?', token: 'string?', sender: 'string', tag: 'string'
}, APIBEHAVIOR);

// DEBUGACTOR
messageregistry.register('DEBUGACTOR', MESSAGETYPES.INITOVERLAY, { sender: 'string?', tag: 'string?' }, DEBUGBEHAVIOR);

messageregistry.register('DEBUGACTOR', MESSAGETYPES.SHOW, { error: 'object', continuation: 'object?', sender: 'string?', tag: 'string?' }, DEBUGBEHAVIOR);

messageregistry.register('DEBUGACTOR', MESSAGETYPES.HIDE, { sender: 'string?', tag: 'string?' }, DEBUGBEHAVIOR);

messageregistry.register('DEBUGACTOR', MESSAGETYPES.RECOVER, { sender: 'string?', tag: 'string?' }, DEBUGBEHAVIOR);

messageregistry.register('DEBUGACTOR', MESSAGETYPES.PING, { sender: 'string?', tag: 'string?' }, DEBUGBEHAVIOR);

messageregistry.register('DEBUGACTOR', MESSAGETYPES.LOGLINE, {
  level: 'string',
  message: 'string',
  data: 'object?',
  timestamp: 'number',
  prefix: 'string?'
}, DEBUGBEHAVIOR);

// EXECUTIONACTOR
messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.PIPELINELOADED, { pipelineid: 'string', env: 'object?' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.ENVUPDATED, { pipelineid: 'string', env: 'object' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.GETSTATUS, { pipelineid: 'string?' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.EXECUTEELEMENT, {
  pipelineid: 'string', path: 'array', elementid: 'string', env: 'object', signature: 'object',
  executor: 'function', properties: 'object?', async: 'boolean?', serialized: 'object?',
  programRef: 'string?', elementId: 'string?', origin: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.AWAITTASK, { taskid: 'string' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.GETTASKS, { pipelineid: 'string?', stageid: 'string?', elementid: 'string?', kind: 'string?' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.GETTASKSTATUS, { taskid: 'string' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.CANCELTASK, { taskid: 'string' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.STOPTASK, { taskid: 'string' }, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.CCCABORT, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.CCCCONTINUE, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.CCCRETRY, {
  pipelineid: 'string', path: 'array', elementid: 'string', continuation: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.TASKSETTLED, {
  taskid: 'string', status: 'string', result: 'any', error: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.RECOVER, {}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.REGISTERPIPELINE, {
  pipelineid: 'string', dna: 'object?', env: 'object?'
}, EXECUTIONBEHAVIOR);

messageregistry.register('EXECUTIONACTOR', MESSAGETYPES.PING, {}, EXECUTIONBEHAVIOR);

// HYPERVISORACTOR
messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.LOAD, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SAVE, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETENV, { pipelineId: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SETENV, { pipelineId: 'string', env: 'object', stageId: 'string?', elementId: 'string?' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETLATESTENV, { pipelineId: 'string', stageId: 'string', elementId: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETRENDERHTML, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SETRENDERHTML, { html: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETEXECUTIONSTACK, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SETEXECUTIONSTACK, { stack: 'array' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETROUTE, { key: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SETROUTE, { key: 'string', route: 'object?' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETACTIVEPIPELINES, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.REGISTERPIPELINE, { pipelineId: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.UNREGISTERPIPELINE, { pipelineId: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.BOOTDNA, {
  dna: 'object',
  pipelineId: 'string',
  options: 'object?',
  sender: 'string',
  tag: 'string'
}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.SETPROGRAM, { programKey: 'string', programSource: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.GETPROGRAM, { programKey: 'string' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.MARKBOOT, { boot: 'boolean' }, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.EVENTTRIGGERED, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', eventPayload: 'object'
}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.PING, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.RECOVER, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.ACTIVATEACTORS, {}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.COMPILESTAGE, {
  pipeline: 'object', pipelineId: 'string', stageIndex: 'number', stagePath: 'array', briefcase: 'object', env: 'object?', options: 'object?'
}, HYPERVISORBEHAVIOR);

messageregistry.register('HYPERVISORACTOR', MESSAGETYPES.STAGECOMPLETED, {
  pipelineId: 'string', stageId: 'string', env: 'object?', nextStageMessage: 'object?'
}, HYPERVISORBEHAVIOR);

// RENDERACTOR
messageregistry.register('RENDERACTOR', MESSAGETYPES.RENDER, { id: 'string', renderer: 'function', data: 'any', env: 'object' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.CLEAR, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.HTML, { id: 'string', markup: 'string', append: 'boolean' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.REMOVE, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETSTYLES, { id: 'string', styles: 'object' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETATTR, { id: 'string', name: 'string', value: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.TOGGLECLASS, { id: 'string', classname: 'string', force: 'boolean?' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.CRYPTO, { bytes: 'number' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GEOLOCATION, { enablehighaccuracy: 'boolean', timeout: 'number' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.PERSISTENCE, { action: 'string', key: 'string?', value: 'string?' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.CREATEELEMENT, { tag: 'string', props: 'object?' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.CREATECONTAINER, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.CREATEFROMHTML, { html: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.PROPERTY, { id: 'string', name: 'string', arguments: 'array?' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETHTML, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETVALUE, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETSTYLE, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETPOSITION, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETLAYOUT, { id: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETHTML, { id: 'string', value: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETPOSITION, { id: 'string', value: 'object' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETSTYLE, { id: 'string', value: 'object' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETVALUE, { id: 'string', value: 'any' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.SETLAYOUT, { id: 'string', value: 'object' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETVIEWPORT, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETSCREEN, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.MATCHMEDIA, { query: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.GETBODYHTML, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.RESTOREBODYHTML, { html: 'string' }, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.RECOVER, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.PING, {}, RENDERBEHAVIOR);

messageregistry.register('RENDERACTOR', MESSAGETYPES.REGISTEREVENTLISTENER, {
  pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string',
  control: 'object', elements: 'array', briefcase: 'object?', options: 'object?'
}, RENDERBEHAVIOR);

// WORLDMAPACTOR
messageregistry.register('WORLDMAPACTOR', MESSAGETYPES.UPDATE, { updates: 'array' }, WORLDMAPBEHAVIOR);

messageregistry.register('WORLDMAPACTOR', MESSAGETYPES.UPDATEFN, { fn: 'function' }, WORLDMAPBEHAVIOR);

messageregistry.register('WORLDMAPACTOR', MESSAGETYPES.OBSERVE, { observer: 'function' }, WORLDMAPBEHAVIOR);

messageregistry.register('WORLDMAPACTOR', MESSAGETYPES.UNOBSERVE, { observer: 'function' }, WORLDMAPBEHAVIOR);

messageregistry.register('WORLDMAPACTOR', MESSAGETYPES.GETWORLDMAP, {}, WORLDMAPBEHAVIOR);

// MAILACTOR
messageregistry.register('MAILACTOR', MESSAGETYPES.SEND, { recipient: 'string', message: 'object' }, MAILBEHAVIOR);
messageregistry.register('MAILACTOR', MESSAGETYPES.ACK, { recipient: 'string', ids: 'array' }, MAILBEHAVIOR);
