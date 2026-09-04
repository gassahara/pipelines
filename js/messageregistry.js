var MESSAGETYPES = Object.freeze({
  // renderactor (33)
  RENDER: 'render',
  CLEAR: 'clear',
  HTML: 'html',
  REMOVE: 'remove',
  SETSTYLES: 'setstyles',
  SETATTR: 'setattr',
  TOGGLECLASS: 'toggleclass',
  CRYPTO: 'crypto',
  GEOLOCATION: 'geolocation',
  PERSISTENCE: 'persistence',
  CREATEELEMENT: 'createelement',
  CREATECONTAINER: 'createcontainer',
  CREATEFROMHTML: 'createfromhtml',
  PROPERTY: 'property',
  GETHTML: 'gethtml',
  GETVALUE: 'getvalue',
  GETSTYLE: 'getstyle',
  GETPOSITION: 'getposition',
  GETLAYOUT: 'getlayout',
  SETHTML: 'sethtml',
  SETPOSITION: 'setposition',
  SETSTYLE: 'setstyle',
  SETVALUE: 'setvalue',
  SETLAYOUT: 'setlayout',
  GETVIEWPORT: 'getviewport',
  GETSCREEN: 'getscreen',
  MATCHMEDIA: 'matchmedia',
  GET_BODY_HTML: 'get_body_html',
  RESTORE_BODY_HTML: 'restore_body_html',
  RECOVER: 'recover',
  PING: 'ping',
  REGISTER_TRIGGER: 'register_trigger',
  REGISTER_TRIGGER_EXPECTATION: 'register_trigger_expectation',
  REVALIDATE_TRIGGERS: 'revalidate_triggers',
  // apiactor (2)
  API: 'api',
  FETCH: 'fetch',
  // mailactor (2) — POLL removed
  SEND: 'send',
  ACK: 'ack',
  // dbactor (4)
  STORE: 'store',
  RESTORE: 'restore',
  LIST: 'list',
  DELETE: 'delete',
  // debugactor (5)
  INIT_OVERLAY: 'init_overlay',
  SHOW: 'show',
  HIDE: 'hide',
  // executionactor (16)
  PIPELINE_LOADED: 'pipeline_loaded',
  ENV_UPDATED: 'env_updated',
  GET_STATUS: 'get_status',
  EXECUTE_ELEMENT: 'execute_element',
  AWAIT_TASK: 'await_task',
  GET_TASKS: 'get_tasks',
  GET_TASK_STATUS: 'get_task_status',
  CANCEL_TASK: 'cancel_task',
  STOP_TASK: 'stop_task',
  CCC_ABORT: 'ccc_abort',
  CCC_CONTINUE: 'ccc_continue',
  CCC_RETRY: 'ccc_retry',
  TASK_SETTLED: 'task_settled',
  REGISTER_PIPELINE: 'register_pipeline',
  // hypervisoractor (26)
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
  UNREGISTER_PIPELINE: 'unregister_pipeline',
  SET_PROGRAM: 'set_program',
  GET_PROGRAM: 'get_program',
  MARK_BOOT: 'mark_boot',
  SET_STAGE_DESCRIPTOR: 'set_stage_descriptor',
  GET_TRIGGER_RECIPIENT_STATUS: 'get_trigger_recipient_status',
  TRIGGER_EVENT: 'trigger_event',
  ACTIVATE_ACTORS: 'activate_actors',
  BOOT_PIPELINE: 'boot_pipeline',
  COMPILE_STAGE: 'compile_stage',
  STAGE_COMPLETED: 'stage_completed',
  // worldmapactor (5)
  UPDATE: 'update',
  UPDATE_FN: 'update_fn',
  OBSERVE: 'observe',
  UNOBSERVE: 'unobserve',
  GET_WORLDMAP: 'get_worldmap',
  // response types (NEW)
  RESPONSE: 'response',
  API_RESULT: 'api_result',
  FETCH_RESULT: 'fetch_result',
  TASK_RESULT: 'task_result',
  PIPELINE_BOOTED: 'pipeline_booted',
  DOM_RESULT: 'dom_result',
  STAGE_COMPLETED_ACK: 'stage_completed_ack',
  DB_RESULT: 'db_result'
});

var MESSAGEREGISTRY_STORE = {};

var MESSAGEREGISTRY = {
  register: function(owner, type, iface, handler) {
    var entry = MESSAGEREGISTRY_STORE[owner];
    if (!entry) {
      entry = {};
      MESSAGEREGISTRY_STORE[owner] = entry;
    }
    entry[type] = { iface: iface, handler: handler };
  },
  getInterfaces: function(owner) {
    var entry = MESSAGEREGISTRY_STORE[owner] || {};
    var map = {};
    Object.keys(entry).forEach(function(type) {
      map[type] = entry[type].iface;
    });
    return map;
  },
  getHandler: function(owner, type) {
    var entry = MESSAGEREGISTRY_STORE[owner];
    if (entry && entry[type]) return entry[type].handler;
    return undefined;
  },
  validate: function(owner, message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'message must be a non-null object', type: 'null' };
    }
    var type = message.type;
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'message type must be a string, got: ' + typeof type, type: String(type) };
    }
    var entry = MESSAGEREGISTRY_STORE[owner];
    var iface = (entry && entry[type]) ? entry[type].iface : null;
    if (!iface) {
      return { valid: false, error: 'unknown message type: ' + type, type: type };
    }
    var keys = Object.keys(iface);
    var invalid = null;
    keys.forEach(function(key) {
      if (invalid) return;
      var spec = iface[key];
      var optional = spec.charAt(spec.length - 1) === '?';
      var expectedtype = optional ? spec.slice(0, -1) : spec;
      if (message[key] === undefined || message[key] === null) {
        if (!optional) {
          invalid = { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
        }
        return;
      }
      if (expectedtype === 'any') return;
      if (expectedtype === 'array') {
        if (!Array.isArray(message[key])) {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected array got ' + (Array.isArray(message[key]) ? 'array' : typeof message[key]), type: type };
        }
      } else if (expectedtype === 'object') {
        if (message[key] === null || typeof message[key] !== 'object') {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected object got ' + (message[key] === null ? 'null' : typeof message[key]), type: type };
        }
      } else {
        var actualtype = typeof message[key];
        if (actualtype !== expectedtype) {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected ' + expectedtype + ' got ' + actualtype, type: type };
        }
      }
    });
    if (invalid) return invalid;
    return { valid: true, error: null, type: type };
  }
};
