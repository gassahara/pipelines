var RENDERVERBOSITYCONSTANTS = createverbosityconstants();

function ENSURERENDERSLICE(ENV) {
  return ensureenvslice(ENV, 'render', function() {
    return {
      HTML: '',
      VIEWPORT: null,
      ACTORREGISTRY: null,
      GC: (typeof CREATEGARBAGECOLLECTOR === 'function' ? CREATEGARBAGECOLLECTOR() : (typeof CREATEGARBAGECOLLECTOR === 'function' ? CREATEGARBAGECOLLECTOR() : {})),
      TRIGGEROBSERVERINSTALLED: false,
      TRIGGERGCSCHEDULED: false,
      SCRIPTTAGS: []
    };
  });
}

function CREATERENDERERRORCONTEXT(LABEL) {
  return function(ERR) {
    if (!ERR) ERR = new Error('unknown render error');
    if (!ERR.DIAGNOSTIC) ERR.DIAGNOSTIC = {};
    ERR.DIAGNOSTIC.RENDERSTAGE = LABEL;
    throw ERR;
  };
}

function WITHELEMENT(ID, REJECT, FN) {
  if (!ID || typeof ID !== 'string') {
    if (typeof REJECT === 'function') REJECT(new Error('[RENDERACTOR] id must be a non-empty string'));
    return null;
  }
  var EL = document.getElementById(ID);
  if (!EL) {
    if (typeof REJECT === 'function') REJECT(new Error('[RENDERACTOR] element not found: ' + ID));
    return null;
  }
  return FN(EL);
}

function WITHELEMENTRETRY(ID, REJECT, FN, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = 5000;
  var EXISTING = document.getElementById(ID);
  if (EXISTING) return FN(EXISTING);
  return new Promise(function(RESOLVE, REJECTPROMISE) {
    var OBSERVER = null;
    var TIMEOUTID = setTimeout(function() {
      if (OBSERVER) OBSERVER.disconnect();
      REJECTPROMISE(new Error('[RENDERACTOR] element not found after timeout: ' + ID));
    }, TIMEOUT);
    OBSERVER = new MutationObserver(function() {
      var EL = document.getElementById(ID);
      if (EL) {
        clearTimeout(TIMEOUTID);
        OBSERVER.disconnect();
        try { RESOLVE(FN(EL)); } catch (ERR) { REJECTPROMISE(ERR); }
      }
    });
    OBSERVER.observe(document.body, { childList: true, subtree: true });
  });
}

function WAITFORDOMREADY() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.readyState === 'loading') {
    return new Promise(function(RESOLVE) { document.addEventListener('DOMContentLoaded', RESOLVE, { once: true }); });
  }
  if (document.readyState !== 'complete') {
    return new Promise(function(RESOLVE) { window.addEventListener('load', RESOLVE, { once: true }); });
  }
  return Promise.resolve();
}

function CREATEEVENTPRODUCERCONSUMER(MSG) {
  return {
    PRODUCER: { TYPE: 'domevent', ID: MSG.SOURCEID, EVENT: MSG.EVENT },
    CONSUMER: { TYPE: 'eventtrigger', PIPELINEID: MSG.PIPELINEID || MSG.pipelineId, STAGEID: MSG.STAGEID || MSG.stageId },
    METADATA: { STAGEPATH: MSG.STAGEPATH || MSG.stagePath || [], CONTROL: MSG.CONTROL, CHILDREN: MSG.ELEMENTS, ENV: MSG.ENV || {} }
  };
}

function SCHEDULEGCCYCLE(RENDERSLICE) {
  if (!RENDERSLICE) return;
  var SCHEDULED = RENDERSLICE.TRIGGERGCSCHEDULED || RENDERSLICE.triggerGcScheduled;
  if (SCHEDULED) return;
  RENDERSLICE.TRIGGERGCSCHEDULED = true;
  RENDERSLICE.triggerGcScheduled = true;
  setTimeout(function() {
    RENDERSLICE.TRIGGERGCSCHEDULED = false;
    RENDERSLICE.triggerGcScheduled = false;
    var GC = RENDERSLICE.GC || RENDERSLICE.gc;
    if (GC) {
      if (typeof COLLECTENDED === 'function') COLLECTENDED(GC);
      else if (typeof COLLECTENDED === 'function') COLLECTENDED(GC);
    }
  }, 0);
}

function ENSUREEVENTOBSERVER(RENDERSLICE) {
  var INSTALLED = RENDERSLICE && (RENDERSLICE.TRIGGEROBSERVERINSTALLED || RENDERSLICE.triggerObserverInstalled);
  if (!RENDERSLICE || INSTALLED) return;
  if (typeof document === 'undefined') return;
  RENDERSLICE.TRIGGEROBSERVERINSTALLED = true;
  RENDERSLICE.triggerObserverInstalled = true;
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'INSTALLING GLOBAL DOM EVENT OBSERVER FOR EVENT STAGES');

  var HANDLER = function(EVENT) {
    var TARGET = EVENT.target;
    var TARGETID = TARGET && TARGET.id;
    var GC = RENDERSLICE.GC || RENDERSLICE.gc;
    if (!TARGETID || !GC) return;

    var LISTFN = (typeof LISTOBJECTS === 'function') ? LISTOBJECTS : LISTOBJECTS;
    var INCSENTFN = (typeof INCREMENTSENT === 'function') ? INCREMENTSENT : INCREMENTSENT;
    var MATCHINGOBJECTS = LISTFN(GC).filter(function(GCOBJ) {
      var PRODUCER = GCOBJ.PRODUCER || {};
      return (PRODUCER.TYPE === 'domevent' || PRODUCER.TYPE === 'dom-event') &&
             PRODUCER.ID === TARGETID &&
             PRODUCER.EVENT === EVENT.type;
    });

    if (MATCHINGOBJECTS.length === 0) return;

    var FIRSTCONSUMER = MATCHINGOBJECTS[0].CONSUMER || {};
    loginfo(RENDERSLICE, '[RENDERACTOR]', 'EVENT OBSERVED:', {
      SOURCEID: TARGETID,
      EVENT: EVENT.type,
      PIPELINEID: FIRSTCONSUMER.PIPELINEID || FIRSTCONSUMER.pipelineId,
      STAGEID: FIRSTCONSUMER.STAGEID || FIRSTCONSUMER.stageId
    });

    MATCHINGOBJECTS.forEach(function(GCOBJ) {
      INCSENTFN(GC, GCOBJ.ID, 1);

      var CONSUMER = GCOBJ.CONSUMER || {};
      var METADATA = GCOBJ.METADATA || {};
      var PIPELINEID = CONSUMER.PIPELINEID || CONSUMER.pipelineId;
      var STAGEID = CONSUMER.STAGEID || CONSUMER.stageId;
      var STAGEPATH = METADATA.STAGEPATH || METADATA.stagePath || [STAGEID];

      var EVENTTRIGGERPAYLOAD = {
        PIPELINEID: PIPELINEID,
        STAGEID: STAGEID,
        STAGEPATH: STAGEPATH,
        EVENTPAYLOAD: { TYPE: EVENT.type, TARGETID: TARGETID }
      };

      var MSGTYPE = MESSAGETYPES.EVENTTRIGGERED || MESSAGETYPES.EVENTTRIGGERED;
      SENDINSTRUCTION('HYPERVISORACTOR', MSGTYPE, EVENTTRIGGERPAYLOAD, null, 'RENDERACTOR');

      logdebug(RENDERSLICE, '[RENDERACTOR]', 'EVENTTRIGGERED SENT TO HYPERVISORACTOR FOR', STAGEID);
    });
  };

  document.addEventListener('click', HANDLER, true);
  document.addEventListener('input', HANDLER, true);
  document.addEventListener('change', HANDLER, true);
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'GLOBAL EVENT OBSERVER INSTALLED FOR CLICK/INPUT/CHANGE');
}

var HANDLERS = {};
HANDLERS[MESSAGETYPES.RENDER] = function(ENV, MSG) {
  var TARGET = MSG.ID ? document.getElementById(MSG.ID) : null;
  if (typeof MSG.RENDERER === 'function') {
    try { MSG.RENDERER(TARGET, MSG.DATA, MSG.ENV || {}); } catch (ERR) { console.error('[RENDERACTOR] Renderer error:', ERR); throw ERR; }
  }
  return true;
};
HANDLERS[MESSAGETYPES.CLEAR] = function(ENV, MSG) {
  WITHELEMENT(MSG.ID, null, function(EL) { EL.innerHTML = ''; });
  return true;
};
HANDLERS[MESSAGETYPES.HTML] = function(ENV, MSG) {
  WAITFORDOMREADY().then(function() {
    WITHELEMENTRETRY(MSG.ID, null, function(EL) {
      if (MSG.APPEND) EL.insertAdjacentHTML('beforeend', MSG.MARKUP);
      else EL.innerHTML = MSG.MARKUP;
    });
    RESPONDIFNEEDED(ENV, MSG, true);
  }).catch(function(ERR) {
    RESPONDIFNEEDED(ENV, MSG, { ERROR: ERR.message || String(ERR) });
  });
};
HANDLERS[MESSAGETYPES.REMOVE] = function(ENV, MSG) {
  WITHELEMENT(MSG.ID, null, function(EL) { EL.remove(); });
  return true;
};
HANDLERS[MESSAGETYPES.SETSTYLES] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.STYLES || {}).forEach(function(PROP) { EL.style[PROP] = MSG.STYLES[PROP]; });
  });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.SETATTR] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.setAttribute(MSG.NAME, MSG.VALUE); });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.classList.toggle(MSG.CLASSNAME, MSG.FORCE); });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.CRYPTO] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var ARRAY = new Uint8Array(MSG.BYTES);
  WIN.crypto.getRandomValues(ARRAY);
  return Array.prototype.slice.call(ARRAY);
};
HANDLERS[MESSAGETYPES.GEOLOCATION] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var GEO = WIN.navigator && WIN.navigator.geolocation;
  if (!GEO) {
    RESPONDIFNEEDED(ENV, MSG, { ERROR: 'geolocation API unavailable' });
    return;
  }
  GEO.getCurrentPosition(
    function(POS) { RESPONDIFNEEDED(ENV, MSG, { LATITUDE: POS.coords.latitude, LONGITUDE: POS.coords.longitude, ACCURACY: POS.coords.accuracy }); },
    function(ERR) { RESPONDIFNEEDED(ENV, MSG, { ERROR: 'geolocation failed: ' + ERR.message }); },
    { enableHighAccuracy: MSG.ENABLEHIGHACCURACY || false, timeout: MSG.TIMEOUT || 5000 }
  );
};
HANDLERS[MESSAGETYPES.PERSISTENCE] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var STORAGE = WIN.localStorage;
  if (!STORAGE) return { ERROR: 'localStorage unavailable' };
  try {
    if (MSG.ACTION === 'getItem') return { VALUE: STORAGE.getItem(MSG.KEY) };
    else if (MSG.ACTION === 'setItem') { STORAGE.setItem(MSG.KEY, MSG.VALUE); return { SUCCESS: true }; }
    else if (MSG.ACTION === 'removeItem') { STORAGE.removeItem(MSG.KEY); return { SUCCESS: true }; }
    else if (MSG.ACTION === 'clear') { STORAGE.clear(); return { SUCCESS: true }; }
    else return { ERROR: 'unknown persistence action: ' + MSG.ACTION };
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.CREATEELEMENT] = function(ENV, MSG) {
  try {
    var EL = document.createElement(MSG.TAG);
    if (MSG.PROPS) Object.keys(MSG.PROPS).forEach(function(PROP) { EL[PROP] = MSG.PROPS[PROP]; });
    var REG = ENV.render && (ENV.render.actorregistry || ENV.render.actorRegistry);
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : (typeof createdomref === 'function' ? createdomref : function(E) { return E; });
    return DOMREFFN(EL, REG);
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(ENV, MSG) {
  try {
    var REG2 = ENV.render && (ENV.render.actorregistry || ENV.render.actorRegistry);
    var DOMREFFN2 = (typeof createdomref === 'function') ? createdomref : (typeof createdomref === 'function' ? createdomref : function(E) { return E; });
    return DOMREFFN2(document.createElement('div'), REG2);
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(ENV, MSG) {
  try {
    var WRAPPER = document.createElement('div');
    WRAPPER.innerHTML = MSG.HTML;
    var CHILD = WRAPPER.firstElementChild || WRAPPER;
    var REG3 = ENV.render && (ENV.render.actorregistry || ENV.render.actorRegistry);
    var DOMREFFN3 = (typeof createdomref === 'function') ? createdomref : (typeof createdomref === 'function' ? createdomref : function(E) { return E; });
    return DOMREFFN3(CHILD, REG3);
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.PROPERTY] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  var FN = EL[MSG.NAME];
  if (typeof FN !== 'function') return { ERROR: 'property "' + MSG.NAME + '" is not a function' };
  try { return FN.apply(EL, MSG.ARGUMENTS || []); } catch (E) { return { ERROR: E.message }; }
};
HANDLERS[MESSAGETYPES.GETHTML] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  return { TAG: EL.tagName.toLowerCase(), INNERHTML: EL.innerHTML };
};
HANDLERS[MESSAGETYPES.GETVALUE] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  return EL.value;
};
HANDLERS[MESSAGETYPES.GETSTYLE] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  var COMPUTED = window.getComputedStyle(EL);
  var STYLEOBJ = Array.prototype.slice.call(COMPUTED).reduce(function(ACC, PROP) {
    ACC[PROP] = COMPUTED.getPropertyValue(PROP);
    return ACC;
  }, {});
  return STYLEOBJ;
};
HANDLERS[MESSAGETYPES.GETPOSITION] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  var RECT = EL.getBoundingClientRect();
  return { X: RECT.x, Y: RECT.y, WIDTH: RECT.width, HEIGHT: RECT.height, TOP: RECT.top, RIGHT: RECT.right, BOTTOM: RECT.bottom, LEFT: RECT.left };
};
HANDLERS[MESSAGETYPES.GETLAYOUT] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  return {
    OFFSETWIDTH: EL.offsetWidth, OFFSETHEIGHT: EL.offsetHeight,
    OFFSETLEFT: EL.offsetLeft, OFFSETTOP: EL.offsetTop,
    SCROLLWIDTH: EL.scrollWidth, SCROLLHEIGHT: EL.scrollHeight,
    CLIENTWIDTH: EL.clientWidth, CLIENTHEIGHT: EL.clientHeight
  };
};
HANDLERS[MESSAGETYPES.SETHTML] = function(ENV, MSG) {
  WAITFORDOMREADY().then(function() {
    WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.innerHTML = MSG.VALUE; });
    RESPONDIFNEEDED(ENV, MSG, true);
  }).catch(function(ERR) {
    RESPONDIFNEEDED(ENV, MSG, { ERROR: ERR.message || String(ERR) });
  });
};
HANDLERS[MESSAGETYPES.SETPOSITION] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; }); });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.SETSTYLE] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; }); });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.SETVALUE] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.value = MSG.VALUE; });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.SETLAYOUT] = function(ENV, MSG) {
  WITHELEMENTRETRY(MSG.ID, null, function(EL) { Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL[PROP] = MSG.VALUE[PROP]; }); });
  RESPONDIFNEEDED(ENV, MSG, true);
};
HANDLERS[MESSAGETYPES.GETVIEWPORT] = function(ENV, MSG) {
  var DOC = document.documentElement;
  return { VIEWPORTWIDTH: DOC.clientWidth, VIEWPORTHEIGHT: DOC.clientHeight };
};
HANDLERS[MESSAGETYPES.GETSCREEN] = function(ENV, MSG) {
  var SCR = window.screen;
  return { SCREENWIDTH: SCR.width, SCREENHEIGHT: SCR.height, AVAILWIDTH: SCR.availWidth, AVAILHEIGHT: SCR.availHeight };
};
HANDLERS[MESSAGETYPES.MATCHMEDIA] = function(ENV, MSG) {
  return { MATCHES: window.matchMedia(MSG.QUERY).matches };
};
HANDLERS[MESSAGETYPES.GETBODYHTML || MESSAGETYPES.GETBODYHTML] = function(ENV, MSG) {
  return document.body ? document.body.innerHTML : '';
};
HANDLERS[MESSAGETYPES.RESTOREBODYHTML || MESSAGETYPES.RESTOREBODYHTML] = function(ENV, MSG) {
  WAITFORDOMREADY().then(function() {
    if (document.body) document.body.innerHTML = MSG.HTML;
    RESPONDIFNEEDED(ENV, MSG, true);
  }).catch(function(ERR) {
    RESPONDIFNEEDED(ENV, MSG, { ERROR: ERR.message || String(ERR) });
  });
};
HANDLERS[MESSAGETYPES.RECOVER] = function(ENV, MSG) {
  WAITFORDOMREADY().then(function() {
    return DBRESTORE('actor:state:render').then(function(SAVED) {
      if (SAVED !== null && SAVED !== undefined) {
        ENV.render = SAVED;
      } else {
        ENV.render = { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      }
      SCHEDULEGCCYCLE(ENV.render);
      REINJECTSCRIPTTAGS(ENV.render.SCRIPTTAGS || ENV.render.scriptTags || []);
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'render', VALUE: ENV.render }]
      }, GENERATETAG(), 'RENDERACTOR');
      RESPONDIFNEEDED(ENV, MSG, ENV);
    }).catch(function(E) {
      ENV.render = { HTML: '', VIEWPORT: null, ACTORREGISTRY: null, SCRIPTTAGS: [] };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'render', VALUE: ENV.render }]
      }, GENERATETAG(), 'RENDERACTOR');
      RESPONDIFNEEDED(ENV, MSG, { ERROR: E.message || String(E) });
    });
  }).catch(function(ERR) {
    RESPONDIFNEEDED(ENV, MSG, { ERROR: ERR.message || String(ERR) });
  });
};
HANDLERS[MESSAGETYPES.PING] = function(ENV, MSG) { return true; };

var REGLISTENERKEY = MESSAGETYPES.REGISTEREVENTLISTENER || MESSAGETYPES.REGISTEREVENTLISTENER;
HANDLERS[REGLISTENERKEY] = function(ENV, MSG) {
  var RENDERSLICE = ENSURERENDERSLICE(ENV);
  var GC = RENDERSLICE.GC || RENDERSLICE.gc;
  if (!GC) {
    GC = (typeof CREATEGARBAGECOLLECTOR === 'function') ? CREATEGARBAGECOLLECTOR() : CREATEGARBAGECOLLECTOR();
    RENDERSLICE.GC = GC;
  }

  loginfo(ENV, '[RENDERACTOR]', 'REGISTEREVENTLISTENER START:', {
    SOURCEID: MSG.SOURCEID,
    EVENT: MSG.EVENT,
    PIPELINEID: MSG.PIPELINEID || MSG.pipelineId,
    STAGEID: MSG.STAGEID || MSG.stageId
  });

  var PC = CREATEEVENTPRODUCERCONSUMER(MSG);
  var LISTFN = (typeof LISTOBJECTS === 'function') ? LISTOBJECTS : LISTOBJECTS;
  var REGOBJFN = (typeof REGISTEROBJECT === 'function') ? REGISTEROBJECT : REGISTEROBJECT;
  var INCRECVFN = (typeof INCREMENTRECEIVED === 'function') ? INCREMENTRECEIVED : INCREMENTRECEIVED;

  var EXISTING = LISTFN(GC).filter(function(OBJ) {
    var P = OBJ.PRODUCER || {};
    var C = OBJ.CONSUMER || {};
    return P.ID === PC.PRODUCER.ID && P.EVENT === PC.PRODUCER.EVENT &&
      (C.PIPELINEID || C.pipelineId) === (PC.CONSUMER.PIPELINEID || PC.CONSUMER.pipelineId) &&
      (C.STAGEID || C.stageId) === (PC.CONSUMER.STAGEID || PC.CONSUMER.stageId);
  })[0];

  if (EXISTING) {
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER ALREADY REGISTERED FOR', MSG.SOURCEID, MSG.EVENT);
    EXISTING.METADATA = PC.METADATA;
    EXISTING.STATUS = 'EXPECTING';
    EXISTING.SENTCOUNT = 0;
    EXISTING.RECEIVEDCOUNT = 1;
  } else {
    var GCOBJECT = {
      PRODUCER: PC.PRODUCER,
      CONSUMER: PC.CONSUMER,
      METADATA: PC.METADATA,
      STATUS: 'EXPECTING',
      SENTCOUNT: 0,
      RECEIVEDCOUNT: 0
    };
    REGOBJFN(GC, GCOBJECT);
    INCRECVFN(GC, GCOBJECT.ID, 1);
    ENSUREEVENTOBSERVER(RENDERSLICE);
    loginfo(ENV, '[RENDERACTOR]', 'EVENT LISTENER REGISTERED:', MSG.SOURCEID, MSG.EVENT, 'FOR STAGE', MSG.STAGEID || MSG.stageId);
  }

  SCHEDULEGCCYCLE(RENDERSLICE);
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
    UPDATES: [{ PATH: 'render', VALUE: RENDERSLICE }]
  }, GENERATETAG(), 'RENDERACTOR');

  return { REGISTERED: true, SOURCEID: MSG.SOURCEID, EVENT: MSG.EVENT };
};

function RESPONDIFNEEDED(ENV, MESSAGE, RESULT) {
  if (MESSAGE.SENDER && MESSAGE.TAG) {
    var RESPONSESPEC = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
    var DOMRESULTTYPE = MESSAGETYPES.DOMRESULT || MESSAGETYPES.DOMRESULT;
    var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || DOMRESULTTYPE;
    SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, RESULT, 'RENDERACTOR', RESPONSETYPE);
  }
}

function REINJECTSCRIPTTAGS(SCRIPTTAGS) {
  if (!SCRIPTTAGS || !SCRIPTTAGS.length || typeof document === 'undefined') return;
  var EXISTINGSRCS = {};
  Array.prototype.slice.call(document.head.getElementsByTagName('script')).forEach(function(S) {
    if (S.src) EXISTINGSRCS[S.src] = true;
  });
  SCRIPTTAGS.forEach(function(SRC) {
    if (!EXISTINGSRCS[SRC]) {
      var SCRIPT = document.createElement('script');
      SCRIPT.src = SRC;
      document.head.appendChild(SCRIPT);
      loginfo({}, '[RENDERACTOR]', 'RE-INJECTED SCRIPT TAG:', SRC);
    }
  });
}

// Pure behavior function: (env, message) -> env
function RENDERBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[RENDERACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE, MESSAGE.ID || '');
  var RENDERSLICE = ENSURERENDERSLICE(ENV);
  var HANDLER = HANDLERS[MESSAGE.TYPE];
  if (HANDLER) {
    var RESULT = HANDLER(ENV, MESSAGE);
    if (RESULT !== undefined) {
      RESPONDIFNEEDED(ENV, MESSAGE, RESULT);
    }
  }
  return ENV;
}

function CREATEENQUEUER(TYPE, IDREQUIRED, EXTRAPAYLOADFN) {
  return function() {
    var ARGS = Array.prototype.slice.call(arguments);
    var ID, REST;
    if (IDREQUIRED) { ID = ARGS[0]; REST = ARGS.slice(1); } else { ID = undefined; REST = ARGS; }
    var TAG = GENERATETAG();
    var PAYLOAD = IDREQUIRED ? { ID: ID } : {};
    if (EXTRAPAYLOADFN) {
      var EXTRA = EXTRAPAYLOADFN(REST);
      Object.keys(EXTRA).forEach(function(KEY) { PAYLOAD[KEY] = EXTRA[KEY]; });
    }
    var RESPONSESPEC = undefined;
    if (arguments.length > 0) {
      var LASTARG = arguments[arguments.length - 1];
      if (LASTARG && typeof LASTARG === 'object' && (LASTARG.responsetype || LASTARG.responseType)) {
        RESPONSESPEC = LASTARG;
      }
    }
    SENDINSTRUCTION('RENDERACTOR', TYPE, PAYLOAD, TAG, 'system', RESPONSESPEC);
  };
}

var ENQUEUERENDER = CREATEENQUEUER(MESSAGETYPES.RENDER, true, function(REST) { return { RENDERER: REST[0], DATA: REST[1], ENV: REST[2] }; });
var ENQUEUECLEAR = CREATEENQUEUER(MESSAGETYPES.CLEAR, true);
var ENQUEUEHTML = CREATEENQUEUER(MESSAGETYPES.HTML, true, function(REST) { return { MARKUP: REST[0], APPEND: REST[1] }; });
var ENQUEUEREMOVE = CREATEENQUEUER(MESSAGETYPES.REMOVE, true);
var ENQUEUESTYLES = CREATEENQUEUER(MESSAGETYPES.SETSTYLES, true, function(REST) { return { STYLES: REST[0] }; });
var ENQUEUESETATTR = CREATEENQUEUER(MESSAGETYPES.SETATTR, true, function(REST) { return { NAME: REST[0], VALUE: REST[1] }; });
var ENQUEUETOGGLECLASS = CREATEENQUEUER(MESSAGETYPES.TOGGLECLASS, true, function(REST) { return { CLASSNAME: REST[0], FORCE: REST[1] }; });
var ENQUEUECREATEELEMENT = CREATEENQUEUER(MESSAGETYPES.CREATEELEMENT, false, function(REST) { return { TAG: REST[0], PROPS: REST[1] }; });
var ENQUEUECREATECONTAINER = CREATEENQUEUER(MESSAGETYPES.CREATECONTAINER, false);
var ENQUEUECREATEFROMHTML = CREATEENQUEUER(MESSAGETYPES.CREATEFROMHTML, false, function(REST) { return { HTML: REST[0] }; });
var ENQUEUEGETHTML = CREATEENQUEUER(MESSAGETYPES.GETHTML, true);
var ENQUEUEGETVALUE = CREATEENQUEUER(MESSAGETYPES.GETVALUE, true);
var ENQUEUEGETSTYLE = CREATEENQUEUER(MESSAGETYPES.GETSTYLE, true);
var ENQUEUEGETPOSITION = CREATEENQUEUER(MESSAGETYPES.GETPOSITION, true);
var ENQUEUEGETLAYOUT = CREATEENQUEUER(MESSAGETYPES.GETLAYOUT, true);
var ENQUEUESETHTML = CREATEENQUEUER(MESSAGETYPES.SETHTML, true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETPOSITION = CREATEENQUEUER(MESSAGETYPES.SETPOSITION, true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETSTYLE = CREATEENQUEUER(MESSAGETYPES.SETSTYLE, true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETVALUE = CREATEENQUEUER(MESSAGETYPES.SETVALUE, true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUEPROPERTY = CREATEENQUEUER(MESSAGETYPES.PROPERTY, true, function(REST) { return { NAME: REST[0], ARGUMENTS: REST[1] }; });
var ENQUEUESETLAYOUT = CREATEENQUEUER(MESSAGETYPES.SETLAYOUT, true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUEGETVIEWPORT = CREATEENQUEUER(MESSAGETYPES.GETVIEWPORT, false);
var ENQUEUEGETSCREEN = CREATEENQUEUER(MESSAGETYPES.GETSCREEN, false);
var ENQUEUEMATCHMEDIA = CREATEENQUEUER(MESSAGETYPES.MATCHMEDIA, false, function(REST) { return { QUERY: REST[0] }; });

function ENQUEUERENDERREGISTERTRIGGER(REGISTRATION, RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERREGISTERTRIGGER; USE BLOCKCOMPILER REGISTEREVENTLISTENER INSTEAD');
  return undefined;
}
function ENQUEUERENDERREGISTERTRIGGEREXPECTATION(REGISTRATION, RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERREGISTERTRIGGEREXPECTATION; USE BLOCKCOMPILER REGISTEREVENTLISTENER INSTEAD');
  return undefined;
}
function ENQUEUERENDERREVALIDATETRIGGERS(RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERREVALIDATETRIGGERS; NO LONGER NEEDED');
  return undefined;
}
function ENQUEUERENDERPING(RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERPING; USE ENQUEUERENDER... OR DIRECT MESSAGE');
  return undefined;
}
function ENQUEUERENDERGETBODYHTML(RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERGETBODYHTML; USE GETBODYHTML MESSAGE DIRECTLY');
  return undefined;
}
function ENQUEUERENDERRESTOREBODYHTML(HTML, RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERRESTOREBODYHTML; USE RESTOREBODYHTML MESSAGE DIRECTLY');
  return undefined;
}
function ENQUEUERENDERRECOVER(RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERRECOVER; USE RECOVER MESSAGE DIRECTLY');
  return undefined;
}
function ENQUEUERENDERCRYPTO(BYTES, RESPONSESPEC) {
  logwarn({}, '[RENDERACTOR]', 'DEPRECATED ENQUEUER CALLED: ENQUEUERENDERCRYPTO; USE CRYPTO MESSAGE DIRECTLY');
  return undefined;
}

var STARTRENDERACTOR = function(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS :
      (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      if (ENV) ENV.VERBOSITY = LVL;
    }
  }
  return {
    GETSTATE: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    DISPATCH: function(MESSAGE) { return DISPATCHTOACTOR('RENDERACTOR', RENDERBEHAVIOR, MESSAGE); }
  };
};

var EXPECTELEMENT = function(ID, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = 30000;
  return new Promise(function(RESOLVE, REJECT) {
    var EXISTING = document.getElementById(ID);
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : (typeof createdomref === 'function' ? createdomref : function(E) { return E; });
    if (EXISTING) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      var REG = ENV && ENV.render && (ENV.render.actorregistry || ENV.render.actorRegistry);
      return RESOLVE(DOMREFFN(EXISTING, REG));
    }
    var OBSERVER = null;
    var TIMEOUTID = setTimeout(function() { if (OBSERVER) OBSERVER.disconnect(); REJECT(new Error('[EXPECTELEMENT] ELEMENT NOT FOUND: ' + ID)); }, TIMEOUT);
    OBSERVER = new MutationObserver(function() {
      var EL = document.getElementById(ID);
      if (EL) {
        clearTimeout(TIMEOUTID);
        OBSERVER.disconnect();
        var ENVNOW = GETACTORSTATE('WORLDMAPACTOR');
        var REGNOW = ENVNOW && ENVNOW.render && (ENVNOW.render.actorregistry || ENVNOW.render.actorRegistry);
        RESOLVE(DOMREFFN(EL, REGNOW));
      }
    });
    OBSERVER.observe(document.body, { childList: true, subtree: true });
  });
};

var EXPECTELEMENTALIAS = EXPECTELEMENT;

var HANDLEFILEREADERREQUEST = function(PAYLOAD) {
  return new Promise(function(RESOLVE, REJECT) {
    var READER = new FileReader();
    READER.onload = function(E) { RESOLVE({ TEXT: E.target.result }); };
    READER.onerror = function() { REJECT(new Error('[RENDERACTOR] FileReader error')); };
    READER.readAsText(PAYLOAD.FILE);
  });
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RENDERVERBOSITYCONSTANTS: RENDERVERBOSITYCONSTANTS,
    ENSURERENDERSLICE: ENSURERENDERSLICE,
    CREATERENDERERRORCONTEXT: CREATERENDERERRORCONTEXT,
    WITHELEMENT: WITHELEMENT,
    WITHELEMENTRETRY: WITHELEMENTRETRY,
    WAITFORDOMREADY: WAITFORDOMREADY,
    CREATEEVENTPRODUCERCONSUMER: CREATEEVENTPRODUCERCONSUMER,
    SCHEDULEGCCYCLE: SCHEDULEGCCYCLE,
    ENSUREEVENTOBSERVER: ENSUREEVENTOBSERVER,
    RENDERBEHAVIOR: RENDERBEHAVIOR,
    CREATEENQUEUER: CREATEENQUEUER,
    ENQUEUERENDER: ENQUEUERENDER,
    ENQUEUECLEAR: ENQUEUECLEAR,
    ENQUEUEHTML: ENQUEUEHTML,
    ENQUEUEREMOVE: ENQUEUEREMOVE,
    ENQUEUESTYLES: ENQUEUESTYLES,
    ENQUEUESETATTR: ENQUEUESETATTR,
    ENQUEUETOGGLECLASS: ENQUEUETOGGLECLASS,
    ENQUEUECREATEELEMENT: ENQUEUECREATEELEMENT,
    ENQUEUECREATECONTAINER: ENQUEUECREATECONTAINER,
    ENQUEUECREATEFROMHTML: ENQUEUECREATEFROMHTML,
    ENQUEUEGETHTML: ENQUEUEGETHTML,
    ENQUEUEGETVALUE: ENQUEUEGETVALUE,
    ENQUEUEGETSTYLE: ENQUEUEGETSTYLE,
    ENQUEUEGETPOSITION: ENQUEUEGETPOSITION,
    ENQUEUEGETLAYOUT: ENQUEUEGETLAYOUT,
    ENQUEUESETHTML: ENQUEUESETHTML,
    ENQUEUESETPOSITION: ENQUEUESETPOSITION,
    ENQUEUESETSTYLE: ENQUEUESETSTYLE,
    ENQUEUESETVALUE: ENQUEUESETVALUE,
    ENQUEUEPROPERTY: ENQUEUEPROPERTY,
    ENQUEUESETLAYOUT: ENQUEUESETLAYOUT,
    ENQUEUEGETVIEWPORT: ENQUEUEGETVIEWPORT,
    ENQUEUEGETSCREEN: ENQUEUEGETSCREEN,
    ENQUEUEMATCHMEDIA: ENQUEUEMATCHMEDIA,
    STARTRENDERACTOR: STARTRENDERACTOR,
    EXPECTELEMENT: EXPECTELEMENT,
    EXPECTELEMENTALIAS: EXPECTELEMENTALIAS,
    HANDLEFILEREADERREQUEST: HANDLEFILEREADERREQUEST
  };
}
