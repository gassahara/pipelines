HANDLERS[MESSAGETYPES.PING] = function(ENV, MSG) { return true; };

// ---------- Synchronous responses — R-a: return {RESPONSE: value} ----------

HANDLERS[MESSAGETYPES.CRYPTO] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var ARRAY = new Uint8Array(MSG.BYTES);
  WIN.crypto.getRandomValues(ARRAY);
  return { RESPONSE: Array.prototype.slice.call(ARRAY) };
};
HANDLERS[MESSAGETYPES.PERSISTENCE] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var STORAGE = WIN.localStorage;
  if (!STORAGE) return { RESPONSE: { ERROR: 'localStorage unavailable' } };
  try {
    if (MSG.ACTION === 'getItem') return { RESPONSE: { VALUE: STORAGE.getItem(MSG.KEY) } };
    else if (MSG.ACTION === 'setItem') { STORAGE.setItem(MSG.KEY, MSG.VALUE); return { RESPONSE: { SUCCESS: true } }; }
    else if (MSG.ACTION === 'removeItem') { STORAGE.removeItem(MSG.KEY); return { RESPONSE: { SUCCESS: true } }; }
    else if (MSG.ACTION === 'clear') { STORAGE.clear(); return { RESPONSE: { SUCCESS: true } }; }
    else return { RESPONSE: { ERROR: 'unknown persistence action: ' + MSG.ACTION } };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
};
HANDLERS[MESSAGETYPES.CREATEELEMENT] = function(ENV, MSG) {
  try {
    var EL = document.createElement(MSG.TAG);
    if (MSG.PROPS) Object.keys(MSG.PROPS).forEach(function(PROP) { EL[PROP] = MSG.PROPS[PROP]; });
    var REG = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN(EL, REG) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
};
HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(ENV, MSG) {
  try {
    var REG2 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN2 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN2(document.createElement('div'), REG2) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
};
HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(ENV, MSG) {
  try {
    var WRAPPER = document.createElement('div');
    WRAPPER.innerHTML = MSG.HTML;
    var CHILD = WRAPPER.firstElementChild || WRAPPER;
    var REG3 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN3 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return { RESPONSE: DOMREFFN3(CHILD, REG3) };
  } catch (ERR) { return { RESPONSE: { ERROR: ERR.message } }; }
};
HANDLERS[MESSAGETYPES.PROPERTY] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var FN = EL[MSG.NAME];
  if (typeof FN !== 'function') return { RESPONSE: { ERROR: 'property "' + MSG.NAME + '" is not a function' } };
  try { return { RESPONSE: FN.apply(EL, MSG.ARGUMENTS || []) }; } catch (E) { return { RESPONSE: { ERROR: E.message } }; }
};

// ---------- Async responses — R-a: return Promise<{RESPONSE: value}> ----------
// @proposal=P-RENDERACTOR-FLOW-008 — every async exit path resolves to
// { RESPONSE: value }. No handler captures the received ENV.

HANDLERS[MESSAGETYPES.GEOLOCATION] = function(ENV, MSG) {
  return new Promise(function(RESOLVE) {
    var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
    var GEO = WIN.navigator && WIN.navigator.geolocation;
    if (!GEO) { RESOLVE({ RESPONSE: { ERROR: 'geolocation API unavailable' } }); return; }
    GEO.getCurrentPosition(
      function(POS) { RESOLVE({ RESPONSE: { LATITUDE: POS.coords.latitude, LONGITUDE: POS.coords.longitude, ACCURACY: POS.coords.accuracy } }); },
      function(ERR) { RESOLVE({ RESPONSE: { ERROR: 'geolocation failed: ' + ERR.message } }); },
      { enableHighAccuracy: MSG.ENABLEHIGHACCURACY || false, timeout: MSG.TIMEOUT || 5000 }
    );
  });
};

// @proposal=P-ACTOR-FLOW-002 / @proposal=P-FLOW-BOUND-001 — LOADSCRIPT
// resolves on every exit path via the settle-guarded resolver.
// @proposal=P-RENDERACTOR-FLOW-008 — the resolved payload is
// { RESPONSE: { LOADED: bool, ERROR?: string } }.
HANDLERS[MESSAGETYPES.LOADSCRIPT] = function(ENV, MSG) {
  return new Promise(function(RESOLVE) {
    if (!MSG.SRC || typeof MSG.SRC !== 'string') {
      RESOLVE({ RESPONSE: { LOADED: false, ERROR: 'LOADSCRIPT requires SRC as a non-empty string' } });
      return;
    }
    if (typeof document === 'undefined' || !document.head) {
      RESOLVE({ RESPONSE: { LOADED: false, ERROR: 'document.head unavailable' } });
      return;
    }
    var SETTLED = false;
    var TIMER = null;
    function settle(payload) {
      if (SETTLED) return;
      SETTLED = true;
      if (TIMER !== null) clearTimeout(TIMER);
      RESOLVE({ RESPONSE: payload });
    }
    var S = document.createElement('script');
    S.src = MSG.SRC;
    S.addEventListener('load', function() { settle({ LOADED: true }); }, { once: true });
    S.addEventListener('error', function() { settle({ LOADED: false, ERROR: 'failed to load ' + MSG.SRC }); }, { once: true });
    TIMER = setTimeout(function() {
      settle({ LOADED: false, ERROR: 'load-timeout: ' + MSG.SRC });
    }, GETSCRIPTLOADTIMEOUT());
    document.head.appendChild(S);
  });
};

// @proposal=P-ACTOR-FLOW-002 — RECOVER is state-only. It returns
// Promise<ENV> with a fresh render slice. No callback-side ENV mutation.
HANDLERS[MESSAGETYPES.RECOVER] = function(ENV, MSG) {
  return WAITFORDOMREADY().then(function() {
    return DBRESTORE('actor:state:render').then(function(SAVED) {
      var NEXTENV = {};
      Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
      NEXTENV.RENDER = (SAVED !== null && SAVED !== undefined) ? SAVED : { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      SCHEDULEGCCYCLE(NEXTENV.RENDER);
      REINJECTSCRIPTTAGS(NEXTENV.RENDER.SCRIPTTAGS || NEXTENV.RENDER.scriptTags || []);
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'RENDER', VALUE: NEXTENV.RENDER }]
      }, GENERATETAG(), 'RENDERACTOR');
      return NEXTENV;
    }).catch(function(E) {
      var NEXTENV = {};
      Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
      NEXTENV.RENDER = { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'RENDER', VALUE: NEXTENV.RENDER }]
      }, GENERATETAG(), 'RENDERACTOR');
      return NEXTENV;
    });
  });
};

// @proposal=P-RENDERACTOR-FLOW-008 — LOADINGINDICATOR returns
// { RESPONSE: { APPLIED, ID, ACTION, ... } } synchronously.
HANDLERS[MESSAGETYPES.LOADINGINDICATOR] = function(ENV, MSG) {
  var action = MSG.ACTION;
  var id = (typeof MSG.ID === 'string' && MSG.ID.length > 0) ? MSG.ID : 'loadingindicator';
  if (action === 'SHOW') {
    var defaultmarkup = '<span role="status" aria-live="polite"></span>';
    var markup = (typeof MSG.MARKUP === 'string' && MSG.MARKUP.length > 0) ? MSG.MARKUP : defaultmarkup;
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
};

// @proposal=P-RENDERACTOR-FLOW-008 — REGISTEREVENTLISTENER returns
// { RESPONSE: { REGISTERED, SOURCEID, EVENT } } synchronously.
var REGLISTENERKEY = MESSAGETYPES.REGISTEREVENTLISTENER;
HANDLERS[REGLISTENERKEY] = function(ENV, MSG) {
  var NEXTENV = ENSURERENDERSLICE(ENV);
  var RENDERSLICE = NEXTENV.render;
  var GC = RENDERSLICE.GC;
  if (!GC) {
    GC = (typeof CREATEGARBAGECOLLECTOR === 'function') ? CREATEGARBAGECOLLECTOR() : {};
    RENDERSLICE.GC = GC;
  }
  loginfo(ENV, '[RENDERACTOR]', 'REGISTEREVENTLISTENER START:', {
    SOURCEID: MSG.SOURCEID, EVENT: MSG.EVENT, PIPELINEID: MSG.PIPELINEID, STAGEID: MSG.STAGEID
  });
  var PC = CREATEEVENTPRODUCERCONSUMER(MSG);
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
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER ALREADY REGISTERED FOR', MSG.SOURCEID, MSG.EVENT);
    EXISTING.METADATA = PC.METADATA;
    EXISTING.STATUS = 'EXPECTING';
    EXISTING.SENTCOUNT = 0;
    EXISTING.RECEIVEDCOUNT = 1;
  } else {
    var GCOBJECT = { PRODUCER: PC.PRODUCER, CONSUMER: PC.CONSUMER, METADATA: PC.METADATA, STATUS: 'EXPECTING', SENTCOUNT: 0, RECEIVEDCOUNT: 0 };
    REGOBJFN(GC, GCOBJECT);
    INCRECVFN(GC, GCOBJECT.ID, 1);
    ENSUREEVENTOBSERVER(RENDERSLICE);
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER REGISTERED:', MSG.SOURCEID, MSG.EVENT, 'FOR STAGE', MSG.STAGEID);
  }
  SCHEDULEGCCYCLE(RENDERSLICE);
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
    UPDATES: [{ PATH: 'RENDER', VALUE: RENDERSLICE }]
  }, GENERATETAG(), 'RENDERACTOR');
  return { RESPONSE: { REGISTERED: true, SOURCEID: MSG.SOURCEID, EVENT: MSG.EVENT } };
};
