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
  GETELEMENTS: 'GETELEMENTS',
  CHECKOVERFLOW: 'CHECKOVERFLOW',
  CHECKSPACING: 'CHECKSPACING',
  CHECKOVERLAP: 'CHECKOVERLAP',
  CHECKSCROLLABILITY: 'CHECKSCROLLABILITY',
  CHECKCONTROLLEDOVERLAY: 'CHECKCONTROLLEDOVERLAY',
  CORRECTOVERFLOW: 'CORRECTOVERFLOW',
  CORRECTSPACING: 'CORRECTSPACING',
  CORRECTOVERLAP: 'CORRECTOVERLAP',
  CORRECTSCROLLABILITY: 'CORRECTSCROLLABILITY',
  CORRECTCONTROLLEDOVERLAY: 'CORRECTCONTROLLEDOVERLAY',
  REWRITESTYLEATTRS: 'REWRITESTYLEATTRS',
  CONSOLIDATESTYLES: 'CONSOLIDATESTYLES',
  PANELAYOUT: 'PANELAYOUT',
  PALETTEGENERATE: 'PALETTEGENERATE',
  SETACCENT: 'SETACCENT',
  OPTIMIZECONTRAST: 'OPTIMIZECONTRAST',
  OPTIMIZEHARMONY: 'OPTIMIZEHARMONY',
  OPTIMIZETEXTVISIBILITY: 'OPTIMIZETEXTVISIBILITY',
  OPTIMIZEBUTTONVISIBILITY: 'OPTIMIZEBUTTONVISIBILITY',
  VERIFYCONTRAST: 'VERIFYCONTRAST',
  VERIFYTEXTVISIBILITY: 'VERIFYTEXTVISIBILITY',
  VERIFYBUTTONVISIBILITY: 'VERIFYBUTTONVISIBILITY',
  VERIFYHARMONY: 'VERIFYHARMONY',
  CHECKFOCUSVISIBILITY: 'CHECKFOCUSVISIBILITY',
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
  UPDATE: 'UPDATE',
  UPDATEFN: 'UPDATEFN',
  OBSERVE: 'OBSERVE',
  UNOBSERVE: 'UNOBSERVE',
  GETWORLDMAP: 'GETWORLDMAP',
  RESPONSE: 'RESPONSE',
  APIRESULT: 'APIRESULT',
  FETCHRESULT: 'FETCHRESULT',
  TASKRESULT: 'TASKRESULT',
  DOMRESULT: 'DOMRESULT',
  DBRESULT: 'DBRESULT',
  EVENTLISTENERREGISTERED: 'EVENTLISTENERREGISTERED',
  LOADSCRIPT: 'LOADSCRIPT',
  SCRIPTLOADED: 'SCRIPTLOADED',
  LOADINGINDICATOR: 'LOADINGINDICATOR',
  LOGLINE: 'LOGLINE',
  BLOCKEXECUTED: 'BLOCKEXECUTED',
  BLOCKFAILED: 'BLOCKFAILED'
});

// @proposal=P65r2 — MAILBOXFILTERTYPES remains a boot-time frozen table.
// Mailbox-response filter types are the framework's reply-channel
// vocabulary and are declared once at load. Not extended at runtime.
var MAILBOXFILTERTYPES = Object.freeze({
  RESPONSE: MESSAGETYPES.RESPONSE,
  APIRESULT: MESSAGETYPES.APIRESULT,
  FETCHRESULT: MESSAGETYPES.FETCHRESULT,
  TASKRESULT: MESSAGETYPES.TASKRESULT,
  DOMRESULT: MESSAGETYPES.DOMRESULT,
  DBRESULT: MESSAGETYPES.DBRESULT,
  EVENTLISTENERREGISTERED: MESSAGETYPES.EVENTLISTENERREGISTERED,
  SCRIPTLOADED: MESSAGETYPES.SCRIPTLOADED
});

// ============================================================
// Dynamic message-type namespace (P65r2)
// ============================================================
//
// MESSAGETYPES is the frozen boot-time contract. DYNAMICMESSAGETYPES is a
// supplementary namespace whose value is Object.freeze'd and whose
// reference is replaced on registration. The pattern is the framework's
// own REGISTERTRIGGER precedent applied to the message-type namespace:
// the value never mutates; the reference is swapped atomically within
// the single-threaded JavaScript model.
//
// Readers (SENDINSTRUCTION's validation in mailactor.js, QUERYMAILBOX's
// filter validation) consult MESSAGETYPEEXISTS or GETDYNAMICMESSAGETYPES
// alongside MESSAGETYPES.

var DYNAMICMESSAGETYPESREF = { current: Object.freeze({}) };

function GETDYNAMICMESSAGETYPES() {
  return DYNAMICMESSAGETYPESREF.current;
}

function MESSAGETYPEEXISTS(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  if (MESSAGETYPES[TYPE] !== undefined) return true;
  var DYNAMIC = DYNAMICMESSAGETYPESREF.current;
  if (DYNAMIC && DYNAMIC[TYPE] !== undefined) return true;
  return false;
}

function REGISTERMESSAGETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERMESSAGETYPE] TYPE must be a non-empty string');
  }
  if (MESSAGETYPES[TYPE] !== undefined) return TYPE;
  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[TYPE] !== undefined) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = TYPE;
  DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}

function UNREGISTERMESSAGETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  if (MESSAGETYPES[TYPE] !== undefined) return false;
  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[TYPE] === undefined) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) {
    if (K !== TYPE) NEXT[K] = CURRENT[K];
  });
  DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
  return true;
}

var MESSAGEREGISTRYSTORE = {};

var MESSAGEREGISTRY = {
  register: function(owner, type, iface, handler) {
    var entry = MESSAGEREGISTRYSTORE[owner];
    if (!entry) {
      entry = {};
      MESSAGEREGISTRYSTORE[owner] = entry;
    }
    entry[type] = { iface: iface, handler: handler };
    // @proposal=P-AC-001g — unconditional write. ACTORCONSUMERS is
    // declared in actorcore.js (manifest position #13); register() runs
    // from registerconsumers.js (position #30), after every provider.
    ACTORCONSUMERS[owner + ':' + type] = handler;
    ACTORCONSUMERS[owner + ':' + String(type).toLowerCase()] = handler;
  },
  getinterfaces: function(owner) {
    var entry = MESSAGEREGISTRYSTORE[owner] || {};
    var map = {};
    Object.keys(entry).forEach(function(type) {
      map[type] = entry[type].iface;
    });
    return map;
  },
  gethandler: function(owner, type) {
    var entry = MESSAGEREGISTRYSTORE[owner];
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
    var entry = MESSAGEREGISTRYSTORE[owner];
    var iface = (entry && entry[type]) ? entry[type].iface : null;
    // @proposal=P65r2 — if the store has no iface for this type but the
    // type is a dynamically registered message type, proceed with an
    // empty iface: the type is routable, but no field-shape checks apply.
    // Boot types retain their iface-based validation.
    if (!iface) {
      if (MESSAGETYPEEXISTS(type)) {
        iface = {};
      } else {
        return { valid: false, error: 'unknown message type: ' + type, type: type };
      }
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
