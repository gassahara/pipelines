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

// @proposal=P-RENDERACTOR-ELEMENT-WAIT-MECHANISM-005 (option a)
// Mechanism: MutationObserver on document.body with
// { childList: true, subtree: true }. This function does NOT poll on an
// interval. The observer callback re-checks getElementById(ID) on every
// DOM mutation under body. If no mutation occurs during the window, the
// timeout fires without any intermediate re-check.
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

// @proposal=P64 / @proposal=P-RENDERACTOR-FLOW-008 (R-a) — the wrapper
// marks "handled" for the surface's fall-through. The handler's return
// value is the RESPONSE-bearing shape; the wrapper does not modify it.
function MAKERENDERHANDLER(TYPE, HANDLER) {
  var TYPECAP = TYPE;
  var HANDLERCAP = HANDLER;
  return function (ENV, MESSAGE) {
    if (!MESSAGE || MESSAGE.TYPE !== TYPECAP) return undefined;
    var RESULT = HANDLERCAP(ENV, MESSAGE);
    return { HANDLED: true, RESULT: RESULT };
  };
}

// The HANDLERS table. Declared empty here; populated by the five
// handler-domain files that load after this file and before
// renderactor.js (the dispatcher surface).
var HANDLERS = {};

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
