var DOMQUERYCOMMANDREGISTRY = {
  getters: [
    'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout',
    'getviewport', 'getscreen', 'matchmedia', 'getelements',
    'checkoverflow', 'checkspacing', 'checkoverlap',
    'checkscrollability', 'checkcontrolledoverlay',
    'verifycontrast', 'verifytextvisibility', 'verifybuttonvisibility',
    'verifyharmony', 'checkfocusvisibility'
  ],
  setters: [
    'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout',
    'toggleclass',
    'correctoverflow', 'correctspacing', 'correctoverlap',
    'correctscrollability', 'correctcontrolledoverlay',
    'rewritestyleattrs', 'consolidatestyles',
    'panelayout',
    'optimizecontrast', 'optimizeharmony',
    'optimizetextvisibility', 'optimizebuttonvisibility'
  ],
  messages: [
    'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout',
    'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout',
    'toggleclass', 'property', 'getelements',
    'checkoverflow', 'checkspacing', 'checkoverlap',
    'checkscrollability', 'checkcontrolledoverlay',
    'correctoverflow', 'correctspacing', 'correctoverlap',
    'correctscrollability', 'correctcontrolledoverlay',
    'rewritestyleattrs', 'consolidatestyles',
    'panelayout',
    'optimizecontrast', 'optimizeharmony',
    'optimizetextvisibility', 'optimizebuttonvisibility',
    'verifycontrast', 'verifytextvisibility', 'verifybuttonvisibility',
    'verifyharmony', 'checkfocusvisibility'
  ],
  id_exempt: ['getviewport', 'getscreen', 'matchmedia'],
  setter_reqs: {
    sethtml: ['value'],
    setposition: ['value'],
    setstyle: ['value'],
    setvalue: ['value'],
    setlayout: ['value'],
    toggleclass: ['classname'],
    rewritestyleattrs: ['rules']
  }
};

function validatedomquerycommand(cmd, props) {
  var errors = [];
  if (!cmd || typeof cmd !== 'string') {
    errors.push('requires command.COMMAND');
    return { valid: false, errors: errors };
  }
  if (DOMQUERYCOMMANDREGISTRY.messages.indexOf(cmd) === -1) {
    errors.push('unknown COMMAND: ' + cmd);
    return { valid: false, errors: errors };
  }
  if (DOMQUERYCOMMANDREGISTRY.id_exempt.indexOf(cmd) === -1) {
    if (!props || !props.id || typeof props.id !== 'string') {
      errors.push('requires command.properties.id');
    }
  }
  if (DOMQUERYCOMMANDREGISTRY.setters.indexOf(cmd) !== -1) {
    var reqs = DOMQUERYCOMMANDREGISTRY.setters_setter_reqs_helper;
  }
  return { valid: errors.length === 0, errors: errors };
}

function ENSURERENDERSLICE(ENV) {
  return ENSUREENVSLICE(ENV, 'render', function() {
    return {
      HTML: '',
      VIEWPORT: null,
      ACTORREGISTRY: null,
      GC: (typeof CREATEGARBAGECOLLECTOR === 'function' ? CREATEGARBAGECOLLECTOR() : {}),
      TRIGGEROBSERVERINSTALLED: false,
      TRIGGERGCSCHEDULED: false,
      SCRIPTTAGS: []
    };
  });
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
  if (EXISTING) {
    try { return Promise.resolve(FN(EXISTING)); }
    catch (ERR) { return Promise.reject(ERR); }
  }
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

function SU_detectviewportwidth() {
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth > 0) {
    return document.documentElement.clientWidth;
  }
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0) {
    return window.innerWidth;
  }
  if (typeof window !== 'undefined' && window.screen && typeof window.screen.width === 'number' && window.screen.width > 0) {
    var dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
    return Math.round(window.screen.width / dpr);
  }
  return null;
}

function SU_detectfontsize(node) {
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      if (node && typeof node === 'object' && node.nodeType === 1) {
        var cs = window.getComputedStyle(node);
        if (cs && cs.fontSize) {
          var v = parseFloat(cs.fontSize);
          if (isFinite(v) && v > 0) return v;
        }
      }
      if (typeof document !== 'undefined' && document.documentElement) {
        var csr = window.getComputedStyle(document.documentElement);
        if (csr && csr.fontSize) {
          var vr = parseFloat(csr.fontSize);
          if (isFinite(vr) && vr > 0) return vr;
        }
      }
    } catch (_) { /* non-fatal */ }
  }
  return 16;
}

function SU_detectviewportheight() {
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientHeight > 0) {
    return document.documentElement.clientHeight;
  }
  if (typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0) {
    return window.innerHeight;
  }
  if (typeof window !== 'undefined' && window.screen && typeof window.screen.height === 'number' && window.screen.height > 0) {
    var dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
    return Math.round(window.screen.height / dpr);
  }
  return null;
}

function LC_isintentionalclip(el) {
  if (!el || !el.style) return false;
  var ov = el.style.overflow;
  if (ov === 'hidden' || ov === 'clip') return true;
  return false;
}

var LC_CORRECTION_MAXITER = 32;

function CREATEEVENTPRODUCERCONSUMER(MSG) {
  return {
    PRODUCER: { TYPE: 'domevent', ID: MSG.SOURCEID, EVENT: MSG.EVENT },
    CONSUMER: { TYPE: 'eventtrigger', PIPELINEID: MSG.PIPELINEID, STAGEID: MSG.STAGEID },
    METADATA: {
      STAGEPATH: MSG.STAGEPATH || [],
      CONTROL: MSG.CONTROL,
      CHILDREN: MSG.ELEMENTS,
      STAGE: MSG.STAGE,
      ENV: MSG.ENV || {},
      OPTIONS: MSG.OPTIONS || {}
    }
  };
}

function SCHEDULEGCCYCLE(RENDERSLICE) {
  if (!RENDERSLICE) return;
  if (RENDERSLICE.TRIGGERGCSCHEDULED) return;
  RENDERSLICE.TRIGGERGCSCHEDULED = true;
  setTimeout(function() {
    RENDERSLICE.TRIGGERGCSCHEDULED = false;
    var GC = RENDERSLICE.GC;
    if (GC) {
      if (typeof COLLECTENDED === 'function') COLLECTENDED(GC);
    }
  }, 0);
}

function ENSUREEVENTOBSERVER(RENDERSLICE) {
  if (!RENDERSLICE || RENDERSLICE.TRIGGEROBSERVERINSTALLED) return;
  if (typeof document === 'undefined') return;
  RENDERSLICE.TRIGGEROBSERVERINSTALLED = true;
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'INSTALLING GLOBAL DOM EVENT OBSERVER FOR EVENT STAGES');

  var HANDLER = function(EVENT) {
    var TARGET = EVENT.target;
    var TARGETID = TARGET && TARGET.id;
    var GC = RENDERSLICE.GC;
    if (!TARGETID || !GC) return;

    var LISTFN = (typeof LISTOBJECTS === 'function') ? LISTOBJECTS : function() { return []; };
    var INCSENTFN = (typeof INCREMENTSENT === 'function') ? INCREMENTSENT : function() {};
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
      PIPELINEID: FIRSTCONSUMER.PIPELINEID,
      STAGEID: FIRSTCONSUMER.STAGEID
    });

    MATCHINGOBJECTS.forEach(function(GCOBJ) {
      INCSENTFN(GC, GCOBJ.ID, 1);

      var CONSUMER = GCOBJ.CONSUMER || {};
      var METADATA = GCOBJ.METADATA || {};
      var PIPELINEID = CONSUMER.PIPELINEID;
      var STAGEID = CONSUMER.STAGEID;
      var STAGEPATH = METADATA.STAGEPATH || [STAGEID];

      var EVENTTRIGGERPAYLOAD = {
        PIPELINEID: PIPELINEID,
        STAGEID: STAGEID,
        STAGEPATH: STAGEPATH,
        EVENTPAYLOAD: { TYPE: EVENT.type, TARGETID: TARGETID },
        STAGE: METADATA.STAGE,
        ENV: METADATA.ENV,
        OPTIONS: METADATA.OPTIONS
      };

      var MSGTYPE = MESSAGETYPES.EVENTTRIGGERED;
      SENDINSTRUCTION('HYPERVISORACTOR', MSGTYPE, EVENTTRIGGERPAYLOAD, null, 'RENDERACTOR');

      logdebug(RENDERSLICE, '[RENDERACTOR]', 'EVENTTRIGGERED SENT TO HYPERVISORACTOR FOR', STAGEID);
    });
  };

  document.addEventListener('click', HANDLER, true);
  document.addEventListener('input', HANDLER, true);
  document.addEventListener('change', HANDLER, true);
  loginfo(RENDERSLICE, '[RENDERACTOR]', 'GLOBAL EVENT OBSERVER INSTALLED FOR CLICK/INPUT/CHANGE');
}

// @proposal=P64 / @proposal=P-ACTOR-FLOW-002 — the wrapper still marks
// "handled" for the surface's fall-through; it does not emit responses.
function MAKERENDERHANDLER(TYPE, HANDLER) {
  var TYPECAP = TYPE;
  var HANDLERCAP = HANDLER;
  return function (ENV, MESSAGE) {
    if (!MESSAGE || MESSAGE.TYPE !== TYPECAP) return undefined;
    var RESULT = HANDLERCAP(ENV, MESSAGE);
    return { HANDLED: true, RESULT: RESULT };
  };
}

var HANDLERS = {};

// ---------- Fire-and-forget (sync, no response owed) ----------

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
HANDLERS[MESSAGETYPES.REMOVE] = function(ENV, MSG) {
  WITHELEMENT(MSG.ID, null, function(EL) { EL.remove(); });
  return true;
};
HANDLERS[MESSAGETYPES.PING] = function(ENV, MSG) { return true; };

// ---------- Synchronous responses (return value becomes RESPONSE) ----------

HANDLERS[MESSAGETYPES.CRYPTO] = function(ENV, MSG) {
  var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var ARRAY = new Uint8Array(MSG.BYTES);
  WIN.crypto.getRandomValues(ARRAY);
  return Array.prototype.slice.call(ARRAY);
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
    var REG = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return DOMREFFN(EL, REG);
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(ENV, MSG) {
  try {
    var REG2 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN2 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    return DOMREFFN2(document.createElement('div'), REG2);
  } catch (ERR) { return { ERROR: ERR.message }; }
};
HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(ENV, MSG) {
  try {
    var WRAPPER = document.createElement('div');
    WRAPPER.innerHTML = MSG.HTML;
    var CHILD = WRAPPER.firstElementChild || WRAPPER;
    var REG3 = ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
    var DOMREFFN3 = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
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
HANDLERS[MESSAGETYPES.GETBODYHTML] = function(ENV, MSG) {
  return document.body ? document.body.innerHTML : '';
};
HANDLERS[MESSAGETYPES.GETELEMENTS] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var TAGFILTER = MSG.TAGNAME ? String(MSG.TAGNAME).toLowerCase() : null;
  var LIMIT = (typeof MSG.LIMIT === 'number' && MSG.LIMIT > 0) ? MSG.LIMIT : Infinity;
  var DESCRIPTORS = [];
  function walk(EL) {
    if (DESCRIPTORS.length >= LIMIT) return;
    if (!EL || EL.nodeType !== 1) return;
    var TAG = EL.tagName.toLowerCase();
    if (!TAGFILTER || TAG === TAGFILTER) {
      DESCRIPTORS.push({ TAG: TAG, ID: EL.id || null, CLASS: (typeof EL.className === 'string' ? EL.className : null), INLINESTYLE: EL.getAttribute('style') || '', INDEX: DESCRIPTORS.length });
    }
    var CHILDREN = Array.prototype.slice.call(EL.children || []);
    for (var i = 0; i < CHILDREN.length; i++) { if (DESCRIPTORS.length >= LIMIT) return; walk(CHILDREN[i]); }
  }
  walk(ROOT);
  return { DESCRIPTORS: DESCRIPTORS };
};
HANDLERS[MESSAGETYPES.CHECKOVERFLOW] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var OPTS = MSG.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SU_detectviewportwidth();
  if (VW === null) return { SKIPPED: 'viewport-undetectable' };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { ERROR: 'stylizercore unavailable' };
  return { VIOLATIONS: LC_checkoverflowdoc(ROOT, VW, CW, SC) };
};
HANDLERS[MESSAGETYPES.CORRECTOVERFLOW] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var OPTS = MSG.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SU_detectviewportwidth();
  if (VW === null) return { SKIPPED: 'viewport-undetectable' };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { ERROR: 'stylizercore unavailable' };
  var RESULT = LC_correctoverflowdoc(ROOT, VW, CW, SC);
  return { APPLIED: RESULT.applied, CONVERGED: RESULT.converged };
};
HANDLERS[MESSAGETYPES.CHECKSPACING] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var OPTS = MSG.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { ERROR: 'stylizercore unavailable' };
  var V = LC_checkspacingdoc(ROOT, MINGAP, SC);
  return { VIOLATIONS: V.map(function(x) { return { ELEMENTA: x.elementa.tagName + (x.elementa.id ? '#' + x.elementa.id : ''), ELEMENTB: x.elementb.tagName + (x.elementb.id ? '#' + x.elementb.id : ''), GAP: x.gap }; }) };
};
HANDLERS[MESSAGETYPES.CORRECTSPACING] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var OPTS = MSG.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { ERROR: 'stylizercore unavailable' };
  var RESULT = LC_correctspacingdoc(ROOT, MINGAP, SC);
  return { APPLIED: RESULT.applied, CONVERGED: RESULT.converged };
};
HANDLERS[MESSAGETYPES.CHECKOVERLAP] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  return { VIOLATIONS: LC_checkoverlapdoc(ROOT) };
};
HANDLERS[MESSAGETYPES.CORRECTOVERLAP] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var RESULT = LC_correctoverlapdoc(ROOT);
  return { APPLIED: RESULT.applied, CONVERGED: RESULT.converged };
};
HANDLERS[MESSAGETYPES.CHECKSCROLLABILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  return { VIOLATIONS: LC_checkscrollabilitydoc(ROOT) };
};
HANDLERS[MESSAGETYPES.CORRECTSCROLLABILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var RESULT = LC_correctscrollabilitydoc(ROOT);
  return { APPLIED: RESULT.applied, CONVERGED: RESULT.converged };
};
HANDLERS[MESSAGETYPES.CHECKCONTROLLEDOVERLAY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  return { VIOLATIONS: LC_checkcontrolledoverlaydoc(ROOT) };
};
HANDLERS[MESSAGETYPES.CORRECTCONTROLLEDOVERLAY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var RESULT = LC_correctcontrolledoverlaydoc(ROOT);
  return { APPLIED: RESULT.applied, CONVERGED: RESULT.converged };
};
HANDLERS[MESSAGETYPES.REWRITESTYLEATTRS] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { APPLIED: SU_rewritestyleattrs(ROOT, MSG.RULES || [], SC) };
};
HANDLERS[MESSAGETYPES.CONSOLIDATESTYLES] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var SAFEPROPS = MSG.SAFEPROPS || (SC && SC.createstylizerconstants ? SC.createstylizerconstants().safeprops : null);
  return { APPLIED: SU_consolidatestyles(ROOT, SAFEPROPS, SC) };
};
HANDLERS[MESSAGETYPES.PANELAYOUT] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC || typeof SC.computepanemaxwidth !== 'function') return { ERROR: 'stylizercore.computepanemaxwidth unavailable' };
  var VIEWPORT = MSG.VIEWPORT || {};
  var VW = (typeof VIEWPORT.VIEWPORTWIDTH === 'number' && VIEWPORT.VIEWPORTWIDTH > 0) ? VIEWPORT.VIEWPORTWIDTH : SU_detectviewportwidth();
  if (VW === null) return { SKIPPED: 'viewport-undetectable' };
  var SHAPE = MSG.SHAPE === 'row' ? 'row' : 'column';
  var ROLE = SHAPE === 'row' ? 'app-shell' : 'reading-column';
  var SPACING = SC.computebasespacing(VW);
  var MAXW = SC.computepanemaxwidth(VW, ROLE);
  EL.style.maxWidth = MAXW;
  EL.style.margin = '0 auto';
  EL.style.display = 'flex';
  EL.style.flexDirection = SHAPE;
  EL.style.gap = SPACING.gap + 'px';
  var HEIGHTAPPLIED = null;
  if (MSG.HEIGHT === 'viewport') {
    var VH = SU_detectviewportheight();
    if (VH !== null) { EL.style.height = VH + 'px'; HEIGHTAPPLIED = VH; }
  } else if (typeof MSG.HEIGHT === 'number' && MSG.HEIGHT > 0) {
    EL.style.height = MSG.HEIGHT + 'px';
    HEIGHTAPPLIED = MSG.HEIGHT;
  }
  return { APPLIED: true, MAXWIDTH: MAXW, SHAPE: SHAPE, ROLE: ROLE, HEIGHT: HEIGHTAPPLIED };
};
HANDLERS[MESSAGETYPES.PALETTEGENERATE] = function(ENV, MSG) {
  if (typeof MSG.RULESET !== 'function') return { ERROR: 'PALETTEGENERATE requires RULESET as a function' };
  return { PALETTE: MSG.RULESET(MSG.OVERRIDES || {}) };
};
HANDLERS[MESSAGETYPES.SETACCENT] = function(ENV, MSG) {
  var SELECTOR = MSG.SELECTOR;
  if (!SELECTOR || typeof SELECTOR !== 'object') return { ERROR: 'SETACCENT requires SELECTOR object' };
  var HEX = MSG.HEX;
  if (typeof HEX !== 'string' || HEX.charAt(0) !== '#') return { ERROR: 'SETACCENT requires HEX as a #RRGGBB string' };
  var PROP = MSG.PROP || 'color';
  var root = document.getElementById('approot') || document.body;
  if (!root) return { ERROR: 'SETACCENT root not found' };
  var rule = { style: {} };
  if (SELECTOR.id) rule.id = SELECTOR.id;
  if (SELECTOR.tag) rule.tag = SELECTOR.tag;
  if (SELECTOR.class) rule.class = SELECTOR.class;
  if (!rule.id && !rule.tag && !rule.class) return { ERROR: 'SETACCENT selector must declare id, tag, or class' };
  rule.style[PROP] = HEX;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var applied = SU_rewritestyleattrs(root, [rule], SC);
  return { APPLIED: applied, REF: MSG.REF || null, HEX: HEX, PROP: PROP };
};
HANDLERS[MESSAGETYPES.OPTIMIZECONTRAST] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { APPLIED: SU_optimizecontrast(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) };
};
HANDLERS[MESSAGETYPES.OPTIMIZEHARMONY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { APPLIED: SU_optimizeharmony(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) };
};
HANDLERS[MESSAGETYPES.OPTIMIZETEXTVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { APPLIED: SU_optimizetextvisibility(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) };
};
HANDLERS[MESSAGETYPES.OPTIMIZEBUTTONVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { APPLIED: SU_optimizebuttonvisibility(ROOT, SC) };
};
HANDLERS[MESSAGETYPES.VERIFYCONTRAST] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var MINRATIO = MSG.MINRATIO !== undefined ? MSG.MINRATIO : 4.5;
  return { VIOLATIONS: SU_verifycontrast(ROOT, MINRATIO, SC) };
};
HANDLERS[MESSAGETYPES.VERIFYTEXTVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { VIOLATIONS: SU_verifytextvisibility(ROOT, SC) };
};
HANDLERS[MESSAGETYPES.VERIFYBUTTONVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { VIOLATIONS: SU_verifybuttonvisibility(ROOT, SC) };
};
HANDLERS[MESSAGETYPES.VERIFYHARMONY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { VIOLATIONS: SU_verifyharmony(ROOT, MSG.OPTIONS || {}, SC) };
};
HANDLERS[MESSAGETYPES.CHECKFOCUSVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { ERROR: 'element not found: ' + MSG.ID };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { VIOLATIONS: SU_checkfocusvisibility(ROOT, SC) };
};

// ---------- Async responses (return Promise<RESPONSE>) ----------
// @proposal=P-ACTOR-FLOW-002 — no callback-side response emission.
// Every exit path resolves.

HANDLERS[MESSAGETYPES.HTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() {
      return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
        if (MSG.APPEND) EL.insertAdjacentHTML('beforeend', MSG.MARKUP);
        else EL.innerHTML = MSG.MARKUP;
      });
    })
    .then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETSTYLES] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.STYLES || {}).forEach(function(PROP) { EL.style[PROP] = MSG.STYLES[PROP]; });
  }).then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETATTR] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.setAttribute(MSG.NAME, MSG.VALUE); })
    .then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.classList.toggle(MSG.CLASSNAME, MSG.FORCE); })
    .then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.GEOLOCATION] = function(ENV, MSG) {
  return new Promise(function(RESOLVE) {
    var WIN = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
    var GEO = WIN.navigator && WIN.navigator.geolocation;
    if (!GEO) { RESOLVE({ ERROR: 'geolocation API unavailable' }); return; }
    GEO.getCurrentPosition(
      function(POS) { RESOLVE({ LATITUDE: POS.coords.latitude, LONGITUDE: POS.coords.longitude, ACCURACY: POS.coords.accuracy }); },
      function(ERR) { RESOLVE({ ERROR: 'geolocation failed: ' + ERR.message }); },
      { enableHighAccuracy: MSG.ENABLEHIGHACCURACY || false, timeout: MSG.TIMEOUT || 5000 }
    );
  });
};

HANDLERS[MESSAGETYPES.SETHTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() { return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.innerHTML = MSG.VALUE; }); })
    .then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETPOSITION] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETSTYLE] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETVALUE] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.value = MSG.VALUE; })
    .then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

HANDLERS[MESSAGETYPES.SETLAYOUT] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return true; })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

// @proposal=P-ACTOR-FLOW-002 — LOADSCRIPT: every exit path resolves.
// Event listeners (not onload/onerror properties) guarantee the spec's
// error event fires even for a script the browser refuses to load.
HANDLERS[MESSAGETYPES.LOADSCRIPT] = function(ENV, MSG) {
  return new Promise(function(RESOLVE) {
    if (!MSG.SRC || typeof MSG.SRC !== 'string') {
      RESOLVE({ LOADED: false, ERROR: 'LOADSCRIPT requires SRC as a non-empty string' });
      return;
    }
    if (typeof document === 'undefined' || !document.head) {
      RESOLVE({ LOADED: false, ERROR: 'document.head unavailable' });
      return;
    }
    var S = document.createElement('script');
    S.src = MSG.SRC;
    S.addEventListener('load', function() { RESOLVE({ LOADED: true }); }, { once: true });
    S.addEventListener('error', function() { RESOLVE({ LOADED: false, ERROR: 'failed to load ' + MSG.SRC }); }, { once: true });
    document.head.appendChild(S);
  });
};

HANDLERS[MESSAGETYPES.RESTOREBODYHTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() {
      if (document.body) document.body.innerHTML = MSG.HTML;
      return true;
    })
    .catch(function(ERR) { return { ERROR: ERR.message || String(ERR) }; });
};

// @proposal=P-ACTOR-FLOW-002 — RECOVER returns Promise<ENV> with a fresh
// render slice. No callback-side ENV mutation.
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

// ---------- LOADINGINDICATOR (async response on SHOW/HIDE) ----------

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
      return { APPLIED: true, ID: id, ACTION: 'SHOW', CREATED: true };
    }
    existing.innerHTML = markup;
    return { APPLIED: true, ID: id, ACTION: 'SHOW', CREATED: false };
  }
  if (action === 'HIDE') {
    var el = document.getElementById(id);
    if (el && el.parentNode) { el.parentNode.removeChild(el); return { APPLIED: true, ID: id, ACTION: 'HIDE', REMOVED: true }; }
    return { APPLIED: true, ID: id, ACTION: 'HIDE', REMOVED: false };
  }
  return { ERROR: 'LOADINGINDICATOR requires ACTION SHOW|HIDE' };
};

// ---------- REGISTEREVENTLISTENER (mixed) ----------

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
  return { REGISTERED: true, SOURCEID: MSG.SOURCEID, EVENT: MSG.EVENT };
};

// ---------- SU_* helpers (unchanged) ----------

function SU_getancestors(el) {
  function climb(p, acc) {
    if (!p || p.nodeType !== 1) return acc;
    return climb(p.parentNode, acc.concat([p]));
  }
  return climb(el.parentNode, []);
}

function SU_getsiblings(el, dir) {
  function walk(s, acc) {
    if (!s) return acc;
    return walk(s[dir], s.nodeType === 1 ? acc.concat([s]) : acc);
  }
  return walk(el[dir], []);
}

function SU_getdepth(ancestor, descendant) {
  if (!descendant || descendant === ancestor) return 0;
  if (descendant.nodeType !== 1) return SU_getdepth(ancestor, descendant.parentNode);
  return 1 + SU_getdepth(ancestor, descendant.parentNode);
}

function SU_getalldescendants(el, stylizercore) {
  var children = Array.prototype.slice.call(el.children || []);
  return children.reduce(function(all, child) {
    return all.concat(child, SU_getalldescendants(child, stylizercore));
  }, []);
}

function SU_applystep(nodes, step, filterfn, stylizercore) {
  if (filterfn === undefined) filterfn = null;
  return nodes.reduce(function(next, node) {
    var candidates = [];
    switch (step.axis || 'child') {
      case 'self': candidates = [node]; break;
      case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
      case 'ancestor': candidates = SU_getancestors(node); break;
      case 'child': candidates = Array.prototype.slice.call(node.children || []); break;
      case 'descendant': candidates = SU_getalldescendants(node, stylizercore); break;
      case 'nextsibling': candidates = SU_getsiblings(node, 'nextSibling'); break;
      case 'previoussibling': candidates = SU_getsiblings(node, 'previousSibling'); break;
      default: throw new Error('Unknown axis: ' + step.axis);
    }
    if (step.tag) candidates = candidates.filter(function(el) { return el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase(); });
    if (step.class) candidates = candidates.filter(function(el) { return el.classList && el.classList.contains(step.class); });
    if (step.id) candidates = candidates.filter(function(el) { return el.id === step.id; });
    if (step.index !== undefined) candidates = candidates.length > step.index ? [candidates[step.index]] : [];
    if (step.depth !== undefined && step.axis === 'descendant') candidates = candidates.filter(function(el) { return SU_getdepth(node, el) === step.depth; });
    if (step.skip !== undefined && (step.axis === 'nextsibling' || step.axis === 'previoussibling')) candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
    if (step.content) {
      var text = step.content.text || '';
      var mode = step.content.mode || 'substring';
      var casesensitive = step.content.casesensitive || false;
      var search = casesensitive ? text : text.toLowerCase();
      candidates = candidates.filter(function(el) {
        var eltext = casesensitive ? el.textContent : el.textContent.toLowerCase();
        if (mode === 'exact') return eltext.trim() === search.trim();
        return eltext.indexOf(search) !== -1;
      });
    }
    if (typeof filterfn === 'function') candidates = candidates.filter(filterfn);
    candidates.forEach(function(c) { if (next.indexOf(c) === -1) next.push(c); });
    return next;
  }, []);
}

function SU_buildlayoutpropertymap(rootel, viewportwidth, inheritedfontsize, stylizercore) {
  if (inheritedfontsize === undefined) inheritedfontsize = SU_detectfontsize(rootel);
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  function walk(el, parentavailablewidth, parentfontsize, acc) {
    var style = el.style || {};
    var props = { fontsize: parentfontsize, width: null, maxwidth: null, minwidth: null, height: null, margintop: 0, marginbottom: 0, marginleft: 0, marginright: 0, paddingtop: 0, paddingbottom: 0, paddingleft: 0, paddingright: 0, bordertopwidth: 0, borderbottomwidth: 0, borderleftwidth: 0, borderrightwidth: 0, availablewidth: parentavailablewidth };
    var propnames = ['fontsize','width','maxwidth','minwidth','height','margintop','marginbottom','marginleft','marginright','paddingtop','paddingbottom','paddingleft','paddingright','bordertopwidth','borderbottomwidth','borderleftwidth','borderrightwidth'];
    propnames.forEach(function(prop) {
      if (style[prop] && sc && sc.parselength) props[prop] = sc.parselength(style[prop], prop === 'fontsize' ? parentfontsize : parentavailablewidth);
    });
    if (style.margin && sc && sc.parseshorthandlengths) {
      var sh = sc.parseshorthandlengths(style.margin, parentavailablewidth, sc);
      if (sh) { props.margintop = sh.top; props.marginright = sh.right; props.marginbottom = sh.bottom; props.marginleft = sh.left; }
    }
    if (style.padding && sc && sc.parseshorthandlengths) {
      var sh2 = sc.parseshorthandlengths(style.padding, parentavailablewidth, sc);
      if (sh2) { props.paddingtop = sh2.top; props.paddingright = sh2.right; props.paddingbottom = sh2.bottom; props.paddingleft = sh2.left; }
    }
    var contentwidth = Math.max(0, parentavailablewidth - props.paddingleft - props.paddingright - props.borderleftwidth - props.borderrightwidth);
    var selfavailable = contentwidth;
    if (props.maxwidth !== null) selfavailable = Math.min(selfavailable, props.maxwidth);
    if (props.width !== null) selfavailable = Math.min(selfavailable, props.width);
    if (props.minwidth !== null) selfavailable = Math.max(selfavailable, props.minwidth);
    props.availablewidth = selfavailable;
    var nextacc = acc.concat([{ element: el, props: props }]);
    var children = SU_applystep([el], { axis: 'child' }, null, sc);
    return children.reduce(function(inneracc, child) { return walk(child, selfavailable, props.fontsize, inneracc); }, nextacc);
  }
  return walk(rootel, viewportwidth, inheritedfontsize, []);
}

function SU_getpropsfrommap(propsmap, el, stylizercore) {
  var entry = propsmap.filter(function(item) { return item.element === el; })[0];
  return entry ? entry.props : null;
}

function SU_computeintrinsicsize(node, propertymap, inheritedprops, stylizercore) {
  if (inheritedprops === undefined) inheritedprops = {};
  var defaultlineheightfactor = 1.2;
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  if (!node) return { width: 0, height: 0 };
  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return { width: 0, height: 0 };
    var fontsize = inheritedprops.fontsize || SU_detectfontsize(node.parentElement);
    var lines = txt.split('\n');
    var isnowrap = inheritedprops.whitespace === 'nowrap' || inheritedprops.whitespace === 'pre';
    var maxlinelen = Math.max.apply(null, lines.map(function(line) {
      var words = isnowrap ? [line] : (sc && sc.tokenizewhitespace ? sc.tokenizewhitespace(line) : line.split(/\s+/).filter(Boolean));
      return words.reduce(function(len, w, i) { return len + w.length * fontsize + (i > 0 ? fontsize : 0); }, 0);
    }));
    var lineheight = inheritedprops.lineheight || fontsize * defaultlineheightfactor;
    return { width: maxlinelen, height: lines.length * lineheight };
  }
  if (node.nodeType !== 1) return { width: 0, height: 0 };
  var props = SU_getpropsfrommap(propertymap, node, sc);
  if (!props) throw new Error('[computeintrinsicsize] Missing property map entry: ' + node.tagName);
  var tag = node.tagName.toLowerCase();
  var padh = (props.paddingleft || 0) + (props.paddingright || 0) + (props.borderleftwidth || 0) + (props.borderrightwidth || 0);
  var padv = (props.paddingtop || 0) + (props.paddingbottom || 0);
  if (tag === 'img' || tag === 'svg') {
    if (props.width !== null) return { width: props.width, height: props.height || (props.width * 0.75) };
    throw new Error('[computeintrinsicsize] Image without explicit width');
  }
  if (tag === 'table') {
    if (props.width !== null) return { width: props.width, height: props.height || 0 };
    var rows = SU_applystep([node], { axis: 'descendant', tag: 'tr' }, null, sc);
    var colmax = {};
    var totalh = 0;
    rows.forEach(function(row) {
      var rowh = 0;
      SU_applystep([row], { axis: 'child' }, null, sc).forEach(function(cell, idx) {
        var s = SU_computeintrinsicsize(cell, propertymap, props, sc);
        colmax[idx] = Math.max(colmax[idx] || 0, s.width);
        rowh = Math.max(rowh, s.height);
      });
      totalh += rowh;
    });
    var colvals = Object.keys(colmax).map(function(k) { return colmax[k]; });
    var totalw = colvals.reduce(function(sum, w) { return sum + w; }, 0) + padh;
    return { width: totalw, height: totalh + padv };
  }
  var children = Array.prototype.slice.call(node.childNodes);
  if (!children.length) return { width: padh, height: padv };
  var isflexrow = node.style && node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
  var totalw = 0, maxw = 0, totalh = 0;
  children.forEach(function(child) {
    var s = SU_computeintrinsicsize(child, propertymap, props, sc);
    if (isflexrow) { totalw += s.width; totalh = Math.max(totalh, s.height); }
    else { maxw = Math.max(maxw, s.width); totalh += s.height; }
  });
  return { width: (isflexrow ? totalw : maxw) + padh, height: totalh + padv };
}

function SU_estimaterecursivebounds(node, stylizercore) {
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return 0;
    var fsize = SU_detectfontsize(node.parentElement || node);
    var isnowrap = false;
    function climb(p, size, nowrap) {
      if (!p || !p.style) return { size: size, nowrap: nowrap };
      if (p.style.fontSize) { var raw = p.style.fontSize; return { size: (raw.indexOf('rem') !== -1 || raw.indexOf('em') !== -1) ? parseFloat(raw) * 16 : parseFloat(raw), nowrap: nowrap }; }
      return climb(p.parentElement, size, nowrap || p.style.whiteSpace === 'nowrap');
    }
    var resolved = climb(node.parentElement, fsize, isnowrap);
    fsize = resolved.size; isnowrap = resolved.nowrap;
    var charpx = fsize * 0.6;
    if (isnowrap) return txt.length * charpx;
    var words = (sc && sc.tokenizewhitespace) ? sc.tokenizewhitespace(txt) : txt.split(/\s+/).filter(Boolean);
    var maxwordlen = Math.max.apply(null, words.map(function(w) { return w.length; }));
    return maxwordlen * charpx;
  }
  if (node.nodeType === 1) {
    if (node.tagName && (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg')) return parseFloat(node.style.width || node.getAttribute('width') || 24);
    var isflexrow = node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
    var totalw = 0;
    Array.prototype.slice.call(node.childNodes).forEach(function(child) {
      var w = SU_estimaterecursivebounds(child, sc);
      totalw = isflexrow ? totalw + w : Math.max(totalw, w);
    });
    return totalw;
  }
  return 0;
}

function SU_geteffectivebackground(el, stylizercore) {
  function ishexdigit(ch) { return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
  function findhexcolor(str) {
    function scanhex(j, count) { if (j < str.length && ishexdigit(str.charAt(j))) return scanhex(j + 1, count + 1); return { j: j, count: count }; }
    function scan(i) { if (i >= str.length) return null; if (str.charAt(i) === '#') { var res = scanhex(i + 1, 0); if (res.count === 3 || res.count === 6) return str.slice(i, res.j); } return scan(i + 1); }
    return scan(0);
  }
  function findrgbcolor(str) { var idx = str.indexOf('rgb('); if (idx === -1) return null; var end = str.indexOf(')', idx); if (end === -1) return null; return str.slice(idx, end + 1); }
  function extractbgfromshorthand(node) { if (node.style.backgroundColor) return node.style.backgroundColor; var bg = node.style.background; if (!bg) return null; return findhexcolor(bg) || findrgbcolor(bg) || null; }
  function climbbg(curr) { if (!curr || curr.nodeType !== 1) return ''; var bg = extractbgfromshorthand(curr); if (bg) return bg; return climbbg(curr.parentNode); }
  return climbbg(el);
}

function SU_getrgbhex(input, sc) {
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  if (!core) return input;
  var rgb = core.hextorgb(input, core);
  return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
}

function SU_harmonyscore(fg, bg, sc) {
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  if (!core) return 0.7;
  var fghsl = core.rgbtohsl.apply(null, core.hextorgb(fg, core));
  var bghsl = core.rgbtohsl.apply(null, core.hextorgb(bg, core));
  var huedist = Math.abs(fghsl.h - bghsl.h);
  var normalizeddist = huedist > 180 ? 360 - huedist : huedist;
  if (normalizeddist < 30) return 1;
  if (normalizeddist < 60) return 0.9;
  if (normalizeddist > 150 && normalizeddist < 180) return 0.95;
  if (normalizeddist > 90 && normalizeddist < 120) return 0.4;
  return 0.7;
}

function SU_rewritestyleattrs(root, rules, sc) {
  var count = 0;
  function applyrules(el) {
    rules.forEach(function(rule) {
      var matched = false;
      if (rule.id && el.id === rule.id) matched = true;
      else if (rule.tag && el.tagName && el.tagName.toLowerCase() === rule.tag.toLowerCase()) matched = true;
      else if (rule.class && el.classList && el.classList.contains(rule.class)) matched = true;
      if (matched && rule.style) {
        Object.keys(rule.style).forEach(function(prop) { el.style[prop] = rule.style[prop]; });
        count++;
      }
    });
    Array.prototype.slice.call(el.children).forEach(applyrules);
  }
  applyrules(root);
  return count;
}

function SU_consolidatestyles(root, safeprops, sc) {
  if (!safeprops) safeprops = ['color','font-family','font-size','font-weight','font-style','line-height','text-align','cursor','letter-spacing','word-spacing','text-transform','text-decoration','font-variant'];
  var count = 0;
  function walk(el) {
    Array.prototype.slice.call(el.children).forEach(function(child) {
      if (child.style) {
        var styleprops = Array.prototype.slice.call(child.style);
        styleprops.forEach(function(prop) {
          if (safeprops.indexOf(prop) !== -1 && el.style && el.style[prop] === child.style[prop]) { child.style.removeProperty(prop); count++; }
        });
      }
      walk(child);
    });
  }
  walk(root);
  return count;
}

function SU_optimizecontrast(root, themestyles, options, sc) {
  var minratio = (options && options.minratio != null) ? options.minratio : 4.5;
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !contrast) return 0;
  els.forEach(function(el) {
    if (el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (!bg) return;
      var fghex = SU_getrgbhex(el.style.color, sc);
      var bghex = SU_getrgbhex(bg, sc);
      if (contrast.contrastratio(fghex, bghex, core) < minratio) {
        var newfg = contrast.getoptimalforeground(bghex, minratio, { scheme: 'complementary' }, harmony, contrast, core);
        el.style.color = newfg;
        count++;
      }
    }
  });
  return count;
}

function SU_optimizeharmony(root, themestyles, options, sc) {
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !harmony) return 0;
  els.forEach(function(el) {
    if (el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (!bg) return;
      var fg = SU_getrgbhex(el.style.color, sc);
      var bghex = SU_getrgbhex(bg, sc);
      if (SU_harmonyscore(fg, bghex, sc) < 0.5) {
        var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
        if (pal.length) { el.style.color = pal[0]; count++; }
      }
    }
  });
  return count;
}

function SU_optimizetextvisibility(root, themestyles, options, sc) {
  if (!themestyles) themestyles = {};
  var minlh = (options && options.minlineheight != null) ? options.minlineheight : 1.2;
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  els.forEach(function(el) {
    if (el.textContent.trim()) {
      var tag = el.tagName.toLowerCase();
      var minsize = (sc && sc.parselength) ? sc.parselength(themestyles[tag] && themestyles[tag].fontsize || themestyles['p'] && themestyles['p'].fontsize || '12px', 16) : 12;
      var cursize = (sc && sc.parselength) ? sc.parselength(el.style.fontSize, 16) || 0 : (parseFloat(el.style.fontSize) || 0);
      var curlh = parseFloat(el.style.lineHeight) || 0;
      var modified = false;
      if (cursize > 0 && cursize < minsize) { el.style.fontSize = minsize + 'px'; modified = true; }
      if (curlh && curlh < minlh) { el.style.lineHeight = String(minlh); modified = true; }
      if (modified) count++;
    }
  });
  return count;
}

function SU_optimizebuttonvisibility(root, sc) {
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
  });
  els.forEach(function(btn) {
    var w = parseFloat(btn.style.width) || 0;
    var h = parseFloat(btn.style.height) || 0;
    var minw = Math.max(44, SU_estimaterecursivebounds(btn, sc) + 24);
    var modified = false;
    if (w < minw) { btn.style.minWidth = minw + 'px'; modified = true; }
    if (h < 44) { btn.style.minHeight = '44px'; modified = true; }
    if (!btn.style.cursor) { btn.style.cursor = 'pointer'; modified = true; }
    if (modified) count++;
  });
  return count;
}

function SU_verifycontrast(root, minratio, sc) {
  if (minratio === undefined) minratio = 4.5;
  var violations = [];
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
  if (!core || !contrast) return violations;
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (bg) {
        var fghex = SU_getrgbhex(el.style.color, sc);
        var bghex = SU_getrgbhex(bg, sc);
        var ratio = contrast.contrastratio(fghex, bghex, core);
        if (ratio < minratio) violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), ratio: ratio, expected: minratio, color: fghex, bg: bghex });
      }
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(root);
  return violations;
}

function SU_verifytextvisibility(root, sc) {
  var violations = [];
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim()) {
      var fsize = (sc && sc.parselength) ? sc.parselength(el.style.fontSize, 16) || 0 : (parseFloat(el.style.fontSize) || 0);
      var lh = parseFloat(el.style.lineHeight) || 0;
      var col = el.style.color;
      var id = el.tagName + (el.id ? '#' + el.id : '');
      if (fsize && fsize < 12) violations.push({ element: id, issue: 'font-size too small', value: fsize });
      if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
      if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(root);
  return violations;
}

function SU_verifybuttonvisibility(root, sc) {
  var violations = [];
  Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
  }).forEach(function(btn) {
    var w = parseFloat(btn.style.width) || 0;
    var h = parseFloat(btn.style.height) || 0;
    var id = btn.tagName + (btn.id ? '#' + btn.id : '');
    if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w: w, h: h });
    if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
  });
  return violations;
}

function SU_verifyharmony(root, options, sc) {
  if (options === undefined) options = {};
  var violations = [];
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !harmony) return violations;
  Array.prototype.slice.call(root.getElementsByTagName('*')).forEach(function(el) {
    if (!el.textContent.trim() || !el.style.color) return;
    var bg = SU_geteffectivebackground(el, sc);
    if (!bg) return;
    var fg = SU_getrgbhex(el.style.color, sc);
    var bghex = SU_getrgbhex(bg, sc);
    var score = harmony.colorharmonyscore(fg, bghex, core);
    if (score < 0.5) {
      violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), score: score, color: fg, bg: bg });
      if (options.autocorrect) {
        var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
        if (pal.length) el.style.color = pal[0];
      }
    }
  });
  return violations;
}

function SU_checkfocusvisibility(root, sc) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return (tag === 'a' && el.getAttribute('href')) || ['button', 'input', 'select', 'textarea'].indexOf(tag) !== -1 || el.getAttribute('tabindex') !== null;
  }).filter(function(el) {
    return !el.hasAttribute('onfocus') && (!el.style.outline || ['none', '0px'].indexOf(el.style.outline) !== -1);
  }).map(function(el) {
    return { element: el.tagName + (el.id ? '#' + el.id : ''), issue: 'no focus indicator' };
  });
}

function LC_getcandidateelements(root, stylizercore) {
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  var applyfn = (sc && sc.applystep) ? sc.applystep : SU_applystep;
  return applyfn([root], { axis: 'descendant' }, null, sc).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
    if (tag === 'div' && el.style && (el.style.width || el.style.maxWidth)) return true;
    return false;
  });
}

function LC_checkspacingdoc(root, mingap, stylizercore) {
  if (mingap === undefined) mingap = 12;
  var blocktags = ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'];
  function contains(arr, item) { return arr.indexOf(item) !== -1; }
  function iseligiblecontainer(el) { var s = el.style || {}; var d = s.display || ''; return d !== 'flex' && d !== 'grid'; }
  function iseligiblechild(el) {
    if (!el || el.nodeType !== 1) return false;
    var s = el.style || {};
    if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') return false;
    if (contains(blocktags, el.tagName.toLowerCase())) return true;
    var d = s.display || '';
    return d === 'block' || d === 'flex' || d === 'grid';
  }
  function filtereligiblechildren(children, index, acc) {
    if (index >= children.length) return acc;
    var child = children[index];
    if (iseligiblechild(child)) acc.push(child);
    return filtereligiblechildren(children, index + 1, acc);
  }
  function comparechildren(children, index, violations) {
    if (index >= children.length - 1) return violations;
    var a = children[index]; var b = children[index + 1];
    var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
    if (gap < mingap) violations.push({ elementa: a, elementb: b, gap: gap });
    return comparechildren(children, index + 1, violations);
  }
  function walkparentchildren(parent, childindex, violations) {
    var rawchildren = Array.prototype.slice.call(parent.children);
    if (childindex >= rawchildren.length) return violations;
    walk(rawchildren[childindex], violations);
    return walkparentchildren(parent, childindex + 1, violations);
  }
  function walk(node, violations) {
    if (!node || node.nodeType !== 1) return violations;
    if (!iseligiblecontainer(node)) return violations;
    var rawchildren = Array.prototype.slice.call(node.children);
    var eligible = filtereligiblechildren(rawchildren, 0, []);
    violations = comparechildren(eligible, 0, violations);
    return walkparentchildren(node, 0, violations);
  }
  return walk(root, []);
}

function LC_correctspacingdoc(root, mingap, stylizercore) {
  if (mingap === undefined) mingap = 12;
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkspacingdoc(root, mingap, stylizercore);
    var uncorrected = violations.filter(function(v) { return !register.has(v.elementa); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { register.add(v.elementa); if (!v.elementa) return; v.elementa.style.marginBottom = mingap + 'px'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkoverlapdoc(root) {
  var positioned = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) { return el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'); });
  return positioned.reduce(function(acc, a, i) {
    return positioned.slice(i + 1).reduce(function(inneracc, b) {
      var atop = parseFloat(a.style.top) || 0, aleft = parseFloat(a.style.left) || 0, aw = parseFloat(a.style.width) || 0, ah = parseFloat(a.style.height) || 0;
      var btop = parseFloat(b.style.top) || 0, bleft = parseFloat(b.style.left) || 0, bw = parseFloat(b.style.width) || 0, bh = parseFloat(b.style.height) || 0;
      if (aw && ah && bw && bh && aleft < bleft + bw && aleft + aw > bleft && atop < btop + bh && atop + ah > btop) {
        return inneracc.concat([{ elementa: a.tagName + (a.id ? '#' + a.id : ''), elementb: b.tagName + (b.id ? '#' + b.id : ''), elementaref: a, elementbref: b }]);
      }
      return inneracc;
    }, acc);
  }, []);
}

function LC_correctoverlapdoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkoverlapdoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementbref && !register.has(v.elementbref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementbref; if (!el) return; register.add(el); el.style.position = 'relative'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkscrollabilitydoc(root) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), elementref: el }; });
}

function LC_correctscrollabilitydoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkscrollabilitydoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementref && !register.has(v.elementref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementref; if (!el) return; register.add(el); el.style.touchAction = 'pan-y'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkcontrolledoverlaydoc(root) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), elementref: el }; });
}

function LC_correctcontrolledoverlaydoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkcontrolledoverlaydoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementref && !register.has(v.elementref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementref; if (!el) return; register.add(el); el.style.zIndex = '10'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkoverflowdoc(root, viewportwidth, containerwidths, stylizercore) {
  function isinsidescrollwrapper(el) {
    function climb(parent) { if (!parent) return false; var s = parent.style || {}; if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true; return climb(parent.parentElement); }
    return climb(el.parentElement);
  }
  var buildmapfn = (stylizercore && stylizercore.buildlayoutpropertymap) ? stylizercore.buildlayoutpropertymap : SU_buildlayoutpropertymap;
  var getpropsfn = (stylizercore && stylizercore.getpropsfrommap) ? stylizercore.getpropsfrommap : SU_getpropsfrommap;
  var computefn = (stylizercore && stylizercore.computeintrinsicsize) ? stylizercore.computeintrinsicsize : SU_computeintrinsicsize;
  var propertymap = buildmapfn(root, viewportwidth, undefined, stylizercore);
  return LC_getcandidateelements(root, stylizercore)
    .filter(function(el) { return !isinsidescrollwrapper(el); })
    .filter(function(el) {
      var props = getpropsfn(propertymap, el, stylizercore);
      if (!props) return false;
      try { var size = computefn(el, propertymap, props, stylizercore); return size.width > props.availablewidth; }
      catch (err) { if (stylizercore && stylizercore.warn) { stylizercore.warn('[checkoverflowdoc] Failed to compute intrinsic size:', el.tagName, err); } return false; }
    });
}

function LC_correctoverflowdoc(root, viewportwidth, containerwidths, stylizercore) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkoverflowdoc(root, viewportwidth, containerwidths, stylizercore);
    var uncorrected = violations.filter(function(el) { return !register.has(el); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(el) {
      register.add(el);
      if (LC_isintentionalclip(el)) return;
      var wrapper = document.createElement('div');
      wrapper.style.width = '80%';
      wrapper.style.overflow = 'scroll';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
      applied += 1;
    });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

// @proposal=P-ACTOR-FLOW-002 — RESPONDIFNEEDED retained for direct
// callers (REGISTEREVENTLISTENER's outer flow uses it, but that path
// only fires when a callback wants to respond outside the handler).
function RESPONDIFNEEDED(ENV, MESSAGE, RESULT) {
  if (MESSAGE.SENDER && MESSAGE.TAG) {
    var RESPONSESPEC = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
    var DOMRESULTTYPE = MESSAGETYPES.DOMRESULT;
    var RESPONSETYPE = (RESPONSESPEC && (RESPONSESPEC.responsetype || RESPONSESPEC.responseType)) || DOMRESULTTYPE;
    SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, RESULT, 'RENDERACTOR', RESPONSETYPE);
  }
}

function REINJECTSCRIPTTAGS(SCRIPTTAGS) {
  if (!SCRIPTTAGS || !SCRIPTTAGS.length || typeof document === 'undefined') return;
  var EXISTINGSRCS = {};
  Array.prototype.slice.call(document.head.getElementsByTagName('script')).forEach(function(S) { if (S.src) EXISTINGSRCS[S.src] = true; });
  SCRIPTTAGS.forEach(function(SRC) {
    if (!EXISTINGSRCS[SRC]) {
      var SCRIPT = document.createElement('script');
      SCRIPT.src = SRC;
      document.head.appendChild(SCRIPT);
      loginfo({}, '[RENDERACTOR]', 'RE-INJECTED SCRIPT TAG:', SRC);
    }
  });
}

// @proposal=P-ACTOR-FLOW-002 — RENDERBEHAVIOR marshals the surface's
// return. Sync values are wrapped as { ENV: NEXTENV, RESPONSE: value };
// async values are wrapped on resolution. No callback-side response.
function RENDERBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[RENDERACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE, MESSAGE.ID || '');
  var NEXTENV = ENSURERENDERSLICE(ENV);
  var OUT = RENDERBEHAVIORDISPATCH.DISPATCH(NEXTENV, MESSAGE);
  if (!OUT || OUT.HANDLED !== true) {
    return NEXTENV;
  }
  var R = OUT.RESULT;
  if (R && typeof R.then === 'function') {
    return R.then(function(RESOLVED) {
      if (RESOLVED === undefined) return NEXTENV;
      return { ENV: NEXTENV, RESPONSE: RESOLVED };
    });
  }
  if (R === undefined) return NEXTENV;
  return { ENV: NEXTENV, RESPONSE: R };
}

var RENDERBEHAVIORDISPATCH = MAKEACTORDISPATCHSURFACE('RENDERACTOR',
  Object.keys(HANDLERS).map(function (TYPE) {
    return MAKERENDERHANDLER(TYPE, HANDLERS[TYPE]);
  })
);

// @proposal=P64 — publish the surface and the aggregate; self-register.
REGISTERACTORSURFACE('RENDERACTOR', RENDERBEHAVIORDISPATCH);
REGISTERAGGREGATEBEHAVIOR('RENDERACTOR', RENDERBEHAVIOR);
ACTORCONSUMERS['RENDERACTOR'] = RENDERBEHAVIOR;

// ---------- Enqueue helpers (unchanged) ----------

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
      if (LASTARG && typeof LASTARG === 'object' && (LASTARG.responsetype || LASTARG.responseType)) RESPONSESPEC = LASTARG;
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

// ---------- Actor handle surface (unchanged) ----------

var RENDERACTORHANDLE = null;

function RENDERACTORHANDLEINSTANCE() {
  if (!RENDERACTORHANDLE) RENDERACTORHANDLE = CREATEACTORHANDLE('RENDERACTOR');
  return RENDERACTORHANDLE;
}

function SUBMIT(ACTION) { return RENDERACTORHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return RENDERACTORHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return RENDERACTORHANDLEINSTANCE().GETACTIONRESULT(ID); }

var STARTRENDERACTOR = function(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS : (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      if (ENV) ENV.VERBOSITY = LVL;
    }
  }
  return {
    GETSTATE: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    DISPATCH: function(MESSAGE) { return DISPATCHTOACTOR('RENDERACTOR', RENDERBEHAVIOR, MESSAGE); },
    SUBMIT: SUBMIT,
    EXPECT: EXPECT,
    GETACTIONRESULT: GETACTIONRESULT
  };
};

var EXPECTELEMENT = function(ID, TIMEOUT) {
  if (TIMEOUT === undefined) TIMEOUT = 30000;
  return new Promise(function(RESOLVE, REJECT) {
    var EXISTING = document.getElementById(ID);
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };
    if (EXISTING) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      var REG = ENV && ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
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
        var REGNOW = ENVNOW && ENVNOW.RENDER && ENVNOW.RENDER.ACTORREGISTRY;
        RESOLVE(DOMREFFN(EL, REGNOW));
      }
    });
    OBSERVER.observe(document.body, { childList: true, subtree: true });
  });
};
