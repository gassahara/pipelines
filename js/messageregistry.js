var MESSAGETYPES = Object.freeze({
  RENDER: 'RENDER',
  CLEAR: 'CLEAR',
  HTML: 'HTML',
  REMOVE: 'REMOVE',
  SETSTYLES: 'SETSTYLES',
  SETATTR: 'SETATTR',
  TOGGLECLASS: 'TOGGLECLASS',
  CRYPTO: 'CRYPTO',
  GEOLOCATION: 'GEOLOCATION',
  PERSISTENCE: 'PERSISTENCE',
  CREATEELEMENT: 'CREATEELEMENT',
  CREATECONTAINER: 'CREATECONTAINER',
  CREATEFROMHTML: 'CREATEFROMHTML',
  PROPERTY: 'PROPERTY',
  GETHTML: 'GETHTML',
  GETVALUE: 'GETVALUE',
  GETSTYLE: 'GETSTYLE',
  GETPOSITION: 'GETPOSITION',
  GETLAYOUT: 'GETLAYOUT',
  SETHTML: 'SETHTML',
  SETPOSITION: 'SETPOSITION',
  SETSTYLE: 'SETSTYLE',
  SETVALUE: 'SETVALUE',
  SETLAYOUT: 'SETLAYOUT',
  GETVIEWPORT: 'GETVIEWPORT',
  GETSCREEN: 'GETSCREEN',
  MATCHMEDIA: 'MATCHMEDIA',
  GETBODYHTML: 'GETBODYHTML',
  RESTOREBODYHTML: 'RESTOREBODYHTML',
  RECOVER: 'RECOVER',
  PING: 'PING',
  REGISTEREVENTLISTENER: 'REGISTEREVENTLISTENER',
  API: 'API',
  FETCH: 'FETCH',
  SEND: 'SEND',
  ACK: 'ACK',
  STORE: 'STORE',
  RESTORE: 'RESTORE',
  LIST: 'LIST',
  DELETE: 'DELETE',
  INITOVERLAY: 'INITOVERLAY',
  SHOW: 'SHOW',
  HIDE: 'HIDE',
  PIPELINELOADED: 'PIPELINELOADED',
  ENVUPDATED: 'ENVUPDATED',
  GETSTATUS: 'GETSTATUS',
  EXECUTEELEMENT: 'EXECUTEELEMENT',
  AWAITTASK: 'AWAITTASK',
  GETTASKS: 'GETTASKS',
  GETTASKSTATUS: 'GETTASKSTATUS',
  CANCELTASK: 'CANCELTASK',
  STOPTASK: 'STOPTASK',
  CCCABORT: 'CCCABORT',
  CCCCONTINUE: 'CCCCONTINUE',
  CCCRETRY: 'CCCRETRY',
  TASKSETTLED: 'TASKSETTLED',
  REGISTERPIPELINE: 'REGISTERPIPELINE',
  LOAD: 'LOAD',
  SAVE: 'SAVE',
  GETENV: 'GETENV',
  SETENV: 'SETENV',
  GETLATESTENV: 'GETLATESTENV',
  GETRENDERHTML: 'GETRENDERHTML',
  SETRENDERHTML: 'SETRENDERHTML',
  GETEXECUTIONSTACK: 'GETEXECUTIONSTACK',
  SETEXECUTIONSTACK: 'SETEXECUTIONSTACK',
  GETROUTE: 'GETROUTE',
  SETROUTE: 'SETROUTE',
  GETACTIVEPIPELINES: 'GETACTIVEPIPELINES',
  UNREGISTERPIPELINE: 'UNREGISTERPIPELINE',
  SETPROGRAM: 'SETPROGRAM',
  GETPROGRAM: 'GETPROGRAM',
  MARKBOOT: 'MARKBOOT',
  EVENTTRIGGERED: 'EVENTTRIGGERED',
  ACTIVATEACTORS: 'ACTIVATEACTORS',
  // BOOTPIPELINE: 'BOOTPIPELINE', // REMOVED (no longer used)
  COMPILESTAGE: 'COMPILESTAGE',
  STAGECOMPLETED: 'STAGECOMPLETED',
  UPDATE: 'UPDATE',
  UPDATEFN: 'UPDATEFN',
  OBSERVE: 'OBSERVE',
  UNOBSERVE: 'UNOBSERVE',
  GETWORLDMAP: 'GETWORLDMAP',
  RESPONSE: 'RESPONSE',
  APIRESULT: 'APIRESULT',
  FETCHRESULT: 'FETCHRESULT',
  TASKRESULT: 'TASKRESULT',
  PIPELINEBOOTED: 'PIPELINEBOOTED',
  DOMRESULT: 'DOMRESULT',
  STAGECOMPLETEDACK: 'STAGECOMPLETEDACK',
  DBRESULT: 'DBRESULT',
  EVENTLISTENERREGISTERED: 'EVENTLISTENERREGISTERED',
  BOOTDNA: 'BOOTDNA',
  LOGLINE: 'LOGLINE'
});

var mailboxfiltertypes = Object.freeze({
  RESPONSE: MESSAGETYPES.RESPONSE,
  APIRESULT: MESSAGETYPES.APIRESULT,
  FETCHRESULT: MESSAGETYPES.FETCHRESULT,
  TASKRESULT: MESSAGETYPES.TASKRESULT,
  PIPELINEBOOTED: MESSAGETYPES.PIPELINEBOOTED,
  DOMRESULT: MESSAGETYPES.DOMRESULT,
  STAGECOMPLETEDACK: MESSAGETYPES.STAGECOMPLETEDACK,
  DBRESULT: MESSAGETYPES.DBRESULT,
  EVENTLISTENERREGISTERED: MESSAGETYPES.EVENTLISTENERREGISTERED
});

var messageregistrystore = {};

var messageregistry = {
  register: function(owner, type, iface, handler) {
    var entry = messageregistrystore[owner];
    if (!entry) {
      entry = {};
      messageregistrystore[owner] = entry;
    }
    entry[type] = { iface: iface, handler: handler };
    if (typeof ACTORCONSUMERS !== 'undefined') {
      ACTORCONSUMERS[owner + ':' + type] = handler;
      ACTORCONSUMERS[owner + ':' + String(type).toLowerCase()] = handler;
    }
  },
  getinterfaces: function(owner) {
    var entry = messageregistrystore[owner] || {};
    var map = {};
    Object.keys(entry).forEach(function(type) {
      map[type] = entry[type].iface;
    });
    return map;
  },
  gethandler: function(owner, type) {
    var entry = messageregistrystore[owner];
    if (entry && entry[type]) return entry[type].handler;
    return undefined;
  },
  validate: function(owner, message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'message must be a non-null object', type: 'null' };
    }
    var type = message.TYPE || message.type;
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'message type must be a string, got: ' + typeof type, type: String(type) };
    }
    var entry = messageregistrystore[owner];
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
      var val = message[key] !== undefined ? message[key] :
        (message[key.toLowerCase()] !== undefined ? message[key.toLowerCase()] :
        message[key.toUpperCase()]);
      if (val === undefined || val === null) {
        if (!optional) {
          invalid = { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
        }
        return;
      }
      if (expectedtype === 'any') return;
      if (expectedtype === 'array') {
        if (!Array.isArray(val)) {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected array got ' + (Array.isArray(val) ? 'array' : typeof val), type: type };
        }
      } else if (expectedtype === 'object') {
        if (val === null || typeof val !== 'object') {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected object got ' + (val === null ? 'null' : typeof val), type: type };
        }
      } else {
        var actualtype = typeof val;
        if (actualtype !== expectedtype) {
          invalid = { valid: false, error: 'type "' + type + '" field "' + key + '" expected ' + expectedtype + ' got ' + actualtype, type: type };
        }
      }
    });
    if (invalid) return invalid;
    return { valid: true, error: null, type: type };
  }
};