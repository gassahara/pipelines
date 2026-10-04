REGISTERMESSAGETYPE('PING');
REGISTERMESSAGETYPE('CRYPTO');
REGISTERMESSAGETYPE('PERSISTENCE');
REGISTERMESSAGETYPE('CREATEELEMENT');
REGISTERMESSAGETYPE('CREATECONTAINER');
REGISTERMESSAGETYPE('CREATEFROMHTML');
REGISTERMESSAGETYPE('PROPERTY');
REGISTERMESSAGETYPE('GEOLOCATION');
REGISTERMESSAGETYPE('LOADSCRIPT');
REGISTERMESSAGETYPE('RECOVER');
REGISTERMESSAGETYPE('LOADINGINDICATOR');
REGISTERMESSAGETYPE('REGISTEREVENTLISTENER');

// ---------- Synchronous handlers — return { RESPONSE: value } ----------

function RENDERHANDLER_PING(ENV, ARGS) { return true; }

function RENDERHANDLER_CRYPTO(ENV, ARGS) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var ARRAY = new Uint8Array(ARGS.BYTES);
  WIN.crypto.getRandomValues(ARRAY);
  return { RESPONSE: Array.prototype.slice.call(ARRAY) };
}

function RENDERHANDLER_PERSISTENCE(ENV, ARGS) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var STORAGE = WIN.localStorage;
  if (!STORAGE) return { RESPONSE: { ERROR: 'localStorage unavailable' } };
  try {
    if (ARGS.ACTION === 'getItem') return { RESPONSE: { VALUE: STORAGE.getItem(ARGS.KEY) } };
    else if (ARGS.ACTION === 'setItem') { STORAGE.setItem(ARGS.KEY, ARGS.VALUE); return { RESPONSE: { SUCCESS: true } }; }
    else if (ARGS.ACTION === 'removeItem') { STORAGE.removeItem(ARGS.KEY); return { RESPONSE: { SUCCESS: true } }; }
    else if (ARGS.ACTION === 'clear') { STORAGE.clear(); return { RESPONSE: { SUCCESS: true } }; }
    else return { RESPONSE: { ERROR: 'unknown persistence action: ' + ARGS.ACTION } };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
}

function RENDERHANDLER_CREATEELEMENT(ENV, ARGS) {
  try {
    var EL = document.createElement(ARGS.TAG);
    if (ARGS.PROPS) Object.keys(ARGS.PROPS).forEach(function(PROP) { EL[PROP] = ARGS.PROPS[PROP]; });
    var REG = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN(EL, REG) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
}

function RENDERHANDLER_CREATECONTAINER(ENV, ARGS) {
  try {
    var REG2 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN2 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN2(document.createElement('div'), REG2) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
}

function RENDERHANDLER_CREATEFROMHTML(ENV, ARGS) {
  try {
    var WRAPPER = document.createElement('div');
    WRAPPER.innerHTML = ARGS.HTML;
    var CHILD = WRAPPER.firstElementChild || WRAPPER;
    var REG3 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN3 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN3(CHILD, REG3) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
}

function RENDERHANDLER_PROPERTY(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var FN = EL[ARGS.NAME];
  if (typeof FN !== 'function') return { RESPONSE: { ERROR: 'property "' + ARGS.NAME + '" is not a function' } };
  try { return { RESPONSE: FN.apply(EL, ARGS.ARGUMENTS || []) }; } catch (E) { return { RESPONSE: { ERROR: E.message } }; }
}

// ---------- Async handlers — return Promise<{RESPONSE: value}> ----------

function RENDERHANDLER_GEOLOCATION(ENV, ARGS) {
  return new Promise(function(RESOLVE) {
    var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
    var GEO = WIN.navigator && WIN.navigator.geolocation;
    if (!GEO) { RESOLVE({ RESPONSE: { ERROR: 'geolocation API unavailable' } }); return; }
    GEO.getCurrentPosition(
      function(POS) { RESOLVE({ RESPONSE: { LATITUDE: POS.coords.latitude, LONGITUDE: POS.coords.longitude, ACCURACY: POS.coords.accuracy } }); },
      function(ERR) { RESOLVE({ RESPONSE: { ERROR: 'geolocation failed: ' + ERR.message } }); },
      { enableHighAccuracy: ARGS.ENABLEHIGHACCURACY || false, timeout: ARGS.TIMEOUT || 5000 }
    );
  });
}

function RENDERHANDLER_LOADSCRIPT(ENV, ARGS) {
  return new Promise(function(RESOLVE) {
    if (!ARGS.SRC || typeof ARGS.SRC !== 'string') {
      RESOLVE({ RESPONSE: { LOADED: false, ERROR: 'LOADSCRIPT requires SRC as a non-empty string' } });
      return;
    }
    if (typeof document === 'undefined' || !document.head) {
      RESOLVE({ RESPONSE: { LOADED: false, ERROR: 'document.head unavailable' } });
      return;
    }
    var SETTLED = false;
    var TIMER = null;
    function settle(PAYLOAD) {
      if (SETTLED) return;
      SETTLED = true;
      if (TIMER !== null) clearTimeout(TIMER);
      RESOLVE({ RESPONSE: PAYLOAD });
    }
    var S = document.createElement('script');
    S.src = ARGS.SRC;
    S.addEventListener('load', function() { settle({ LOADED: true }); }, { once: true });
    S.addEventListener('error', function() { settle({ LOADED: false, ERROR: 'failed to load ' + ARGS.SRC }); }, { once: true });
    TIMER = setTimeout(function() {
      settle({ LOADED: false, ERROR: 'load-timeout: ' + ARGS.SRC });
    }, GETSCRIPTLOADTIMEOUT());
    document.head.appendChild(S);
  });
}

function RENDERHANDLER_RECOVER(ENV, ARGS) {
  return WAITFORDOMREADY().then(function() {
    return DBRESTORE('actor:state:render').then(function(SAVED) {
      var NEXTENV = {};
      Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
      NEXTENV.RENDER = (SAVED !== null && SAVED !== undefined) ? SAVED : { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      SCHEDULEGCCYCLE(NEXTENV.RENDER);
      REINJECTSCRIPTTAGS(NEXTENV.RENDER.SCRIPTTAGS || NEXTENV.RENDER.scriptTags || []);
      SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
        UPDATES: [{ PATH: 'RENDER', VALUE: NEXTENV.RENDER }]
      }, GENERATETAG(), 'RENDERACTOR');
      return NEXTENV;
    }).catch(function(E) {
      var NEXTENV = {};
      Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
      NEXTENV.RENDER = { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
        UPDATES: [{ PATH: 'RENDER', VALUE: NEXTENV.RENDER }]
      }, GENERATETAG(), 'RENDERACTOR');
      return NEXTENV;
    });
  });
}

function RENDERHANDLER_LOADINGINDICATOR(ENV, ARGS) {
  var action = ARGS.ACTION;
  var id = (typeof ARGS.ID === 'string' && ARGS.ID.length > 0) ? ARGS.ID : 'loadingindicator';
  if (action === 'SHOW') {
    var defaultmarkup = '<span role="status" aria-live="polite"></span>';
    var markup = (typeof ARGS.MARKUP === 'string' && ARGS.MARKUP.length > 0) ? ARGS.MARKUP : defaultmarkup;
    var existing = document.getElementById(id);
    if (!existing) {
      var container = document.createElement('div');
      container.id = id;
      container.innerHTML = markup;
      document.body.appendChild(container);
      return { RESPONSE: { APPLIED: true, ID: id, ACTION: 'SHOW', CREATED: true } };
    }
    existing.innerHTML = markup;
    return { RESPONSE: { APPLIED: true, ID: id, ACTION: 'SHOW', CREATED: false } };
  }
  if (action === 'HIDE') {
    var el = document.getElementById(id);
    if (el && el.parentNode) { el.parentNode.removeChild(el); return { RESPONSE: { APPLIED: true, ID: id, ACTION: 'HIDE', REMOVED: true } }; }
    return { RESPONSE: { APPLIED: true, ID: id, ACTION: 'HIDE', REMOVED: false } };
  }
  return { RESPONSE: { ERROR: 'LOADINGINDICATOR requires ACTION SHOW|HIDE' } };
}

// @proposal=P-COMPILER-TYPE-LITERALS — REGLISTENERKEY is a literal.
var REGLISTENERKEY = 'REGISTEREVENTLISTENER';

function RENDERHANDLER_REGISTEREVENTLISTENER(ENV, ARGS) {
  var NEXTENV = ENSURERENDERSLICE(ENV);
  var RENDERSLICE = NEXTENV.render;
  var GC = RENDERSLICE.GC;
  if (!GC) {
    GC = (typeof CREATEGARBAGECOLLECTOR === 'function') ? CREATEGARBAGECOLLECTOR() : {};
    RENDERSLICE.GC = GC;
  }
  loginfo(ENV, '[RENDERACTOR]', 'REGISTEREVENTLISTENER START:', {
    SOURCEID: ARGS.SOURCEID, EVENT: ARGS.EVENT, PIPELINEID: ARGS.PIPELINEID, STAGEID: ARGS.STAGEID
  });
  var PC = CREATEEVENTPRODUCERCONSUMER(ARGS);
  var LISTFN = (typeof LISTOBJECTS === 'function') ? LISTOBJECTS : function() { return []; };
  var REGOBJFN = (typeof REGISTEROBJECT === 'function') ? REGISTEROBJECT : function() {};
  var INCRECVFN = (typeof INCREMENTRECEIVED === 'function') ? INCREMENTRECEIVED : function() {};
  var EXISTING = LISTFN(GC).filter(function(OBJ) {
    var P = OBJ.PRODUCER || {};
    var C = OBJ.CONSUMER || {};
    return P.ID === PC.PRODUCER.ID && P.EVENT === PC.PRODUCER.EVENT &&
      C.PIPELINEID === PC.CONSUMER.PIPELINEID && C.STAGEID === PC.CONSUMER.STAGEID;
  })[0];
  if (EXISTING) {
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER ALREADY REGISTERED FOR', ARGS.SOURCEID, ARGS.EVENT);
    EXISTING.METADATA = PC.METADATA;
    EXISTING.STATUS = 'EXPECTING';
    EXISTING.SENTCOUNT = 0;
    EXISTING.RECEIVEDCOUNT = 1;
  } else {
    var GCOBJECT = { PRODUCER: PC.PRODUCER, CONSUMER: PC.CONSUMER, METADATA: PC.METADATA, STATUS: 'EXPECTING', SENTCOUNT: 0, RECEIVEDCOUNT: 0 };
    REGOBJFN(GC, GCOBJECT);
    INCRECVFN(GC, GCOBJECT.ID, 1);
    ENSUREEVENTOBSERVER(RENDERSLICE);
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER REGISTERED:', ARGS.SOURCEID, ARGS.EVENT, 'FOR STAGE', ARGS.STAGEID);
  }
  SCHEDULEGCCYCLE(RENDERSLICE);
  SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
    UPDATES: [{ PATH: 'RENDER', VALUE: RENDERSLICE }]
  }, GENERATETAG(), 'RENDERACTOR');
  return { RESPONSE: { REGISTERED: true, SOURCEID: ARGS.SOURCEID, EVENT: ARGS.EVENT } };
}

// ---------- Registration ----------

REGISTERACTORMESSAGE('RENDERACTOR', 'PING',
  {},
  RENDERHANDLER_PING);

REGISTERACTORMESSAGE('RENDERACTOR', 'CRYPTO',
  { BYTES: 'number' },
  RENDERHANDLER_CRYPTO);

REGISTERACTORMESSAGE('RENDERACTOR', 'PERSISTENCE',
  { ACTION: 'string', KEY: 'string?', VALUE: 'string?' },
  RENDERHANDLER_PERSISTENCE);

REGISTERACTORMESSAGE('RENDERACTOR', 'CREATEELEMENT',
  { TAG: 'string', PROPS: 'object?' },
  RENDERHANDLER_CREATEELEMENT);

REGISTERACTORMESSAGE('RENDERACTOR', 'CREATECONTAINER',
  {},
  RENDERHANDLER_CREATECONTAINER);

REGISTERACTORMESSAGE('RENDERACTOR', 'CREATEFROMHTML',
  { HTML: 'string' },
  RENDERHANDLER_CREATEFROMHTML);

REGISTERACTORMESSAGE('RENDERACTOR', 'PROPERTY',
  { ID: 'string', NAME: 'string', ARGUMENTS: 'array?' },
  RENDERHANDLER_PROPERTY);

REGISTERACTORMESSAGE('RENDERACTOR', 'GEOLOCATION',
  { ENABLEHIGHACCURACY: 'boolean', TIMEOUT: 'number' },
  RENDERHANDLER_GEOLOCATION);

REGISTERACTORMESSAGE('RENDERACTOR', 'LOADSCRIPT',
  { SRC: 'string' },
  RENDERHANDLER_LOADSCRIPT);

REGISTERACTORMESSAGE('RENDERACTOR', 'RECOVER',
  {},
  RENDERHANDLER_RECOVER);

REGISTERACTORMESSAGE('RENDERACTOR', 'LOADINGINDICATOR',
  { ACTION: 'string', MARKUP: 'string?', ID: 'string?' },
  RENDERHANDLER_LOADINGINDICATOR);

REGISTERACTORMESSAGE('RENDERACTOR', REGLISTENERKEY,
  { PIPELINEID: 'string', STAGEID: 'string', STAGEPATH: 'array', SOURCEID: 'string', EVENT: 'string',
    CONTROL: 'object', ELEMENTS: 'array', BRIEFCASE: 'object?', OPTIONS: 'object?' },
		     RENDERHANDLER_REGISTEREVENTLISTENER);
