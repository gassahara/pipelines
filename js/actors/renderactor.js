var DOMRESULTTYPE = messagetype('DOMRESULT', {});
var EVENTLISTENERREGISTEREDTYPE = messagetype('EVENTLISTENERREGISTERED', {});
var SCRIPTLOADEDTYPE = messagetype('SCRIPTLOADED', {});

REGISTERMESSAGETYPE(DOMRESULTTYPE);
REGISTERRESPONSETYPE('DOMRESULT');
REGISTERMESSAGETYPE(EVENTLISTENERREGISTEREDTYPE);
REGISTERRESPONSETYPE('EVENTLISTENERREGISTERED');
REGISTERMESSAGETYPE(SCRIPTLOADEDTYPE);
REGISTERRESPONSETYPE('SCRIPTLOADED');

// ============================================================
// §1 — Aggregate behaviour
// ============================================================

function RENDERBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('RENDERACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERDISPATCH('RENDERACTOR', RENDERBEHAVIOR);

// ============================================================
// §2 — Enqueue helpers
// ============================================================

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

var ENQUEUERENDER = CREATEENQUEUER('RENDER', true, function(REST) { return { RENDERER: REST[0], DATA: REST[1], ENV: REST[2] }; });
var ENQUEUECLEAR = CREATEENQUEUER('CLEAR', true);
var ENQUEUEHTML = CREATEENQUEUER('HTML', true, function(REST) { return { MARKUP: REST[0], APPEND: REST[1] }; });
var ENQUEUEREMOVE = CREATEENQUEUER('REMOVE', true);
var ENQUEUESTYLES = CREATEENQUEUER('SETSTYLES', true, function(REST) { return { STYLES: REST[0] }; });
var ENQUEUESETATTR = CREATEENQUEUER('SETATTR', true, function(REST) { return { NAME: REST[0], VALUE: REST[1] }; });
var ENQUEUETOGGLECLASS = CREATEENQUEUER('TOGGLECLASS', true, function(REST) { return { CLASSNAME: REST[0], FORCE: REST[1] }; });
var ENQUEUECREATEELEMENT = CREATEENQUEUER('CREATEELEMENT', false, function(REST) { return { TAG: REST[0], PROPS: REST[1] }; });
var ENQUEUECREATECONTAINER = CREATEENQUEUER('CREATECONTAINER', false);
var ENQUEUECREATEFROMHTML = CREATEENQUEUER('CREATEFROMHTML', false, function(REST) { return { HTML: REST[0] }; });
var ENQUEUEGETHTML = CREATEENQUEUER('GETHTML', true);
var ENQUEUEGETVALUE = CREATEENQUEUER('GETVALUE', true);
var ENQUEUEGETSTYLE = CREATEENQUEUER('GETSTYLE', true);
var ENQUEUEGETPOSITION = CREATEENQUEUER('GETPOSITION', true);
var ENQUEUEGETLAYOUT = CREATEENQUEUER('GETLAYOUT', true);
var ENQUEUESETHTML = CREATEENQUEUER('SETHTML', true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETPOSITION = CREATEENQUEUER('SETPOSITION', true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETSTYLE = CREATEENQUEUER('SETSTYLE', true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUESETVALUE = CREATEENQUEUER('SETVALUE', true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUEPROPERTY = CREATEENQUEUER('PROPERTY', true, function(REST) { return { NAME: REST[0], ARGUMENTS: REST[1] }; });
var ENQUEUESETLAYOUT = CREATEENQUEUER('SETLAYOUT', true, function(REST) { return { VALUE: REST[0] }; });
var ENQUEUEGETVIEWPORT = CREATEENQUEUER('GETVIEWPORT', false);
var ENQUEUEGETSCREEN = CREATEENQUEUER('GETSCREEN', false);
var ENQUEUEMATCHMEDIA = CREATEENQUEUER('MATCHMEDIA', false, function(REST) { return { QUERY: REST[0] }; });

// ============================================================
// §3 — Actor handle, START, and EXPECTELEMENT
// ============================================================

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

// @proposal=P1 (CYCLE-05) — EXPECTELEMENT is a presence-expectation
// primitive, sampled on an interval. It observes the predicate
// getElementById(ID) !== null directly, at a declared cadence, rather
// than waiting for a document.body subtree mutation to trigger a
// re-check. This is faithful to the semantics of "expect the element"
// and is insensitive to the mutation queue's ordering pathologies.
//
// Signature: EXPECTELEMENT(ID, TIMEOUT, INTERVAL)
//   - ID       : the id to expect.
//   - TIMEOUT  : maximum wall-clock window, milliseconds.
//                Default 30000 when undefined.
//   - INTERVAL : sampling cadence, milliseconds.
//                Default 500 when undefined.
//
// Behaviour:
//   - Immediate synchronous check on entry. If the id is present, the
//     promise resolves immediately and no timer is created.
//   - Otherwise, an interval sampler runs every INTERVAL ms; the first
//     tick at which the id is present clears both handles and resolves.
//   - On timeout, the interval handle is cleared and the promise
//     rejects with an Error carrying a diagnostic object under
//     err.diagnostic describing the sampling window.
//
// The MutationObserver-based mechanism previously used here is
// preserved as-is in WITHELEMENTRETRY, which has a different obligation
// (locate the write target before the write).
var EXPECTELEMENT = function(ID, TIMEOUT, INTERVAL) {
  if (TIMEOUT === undefined) TIMEOUT = 30000;
  if (INTERVAL === undefined) INTERVAL = 500;
  return new Promise(function(RESOLVE, REJECT) {
    var DOMREFFN = (typeof createdomref === 'function') ? createdomref : function(E) { return E; };

    var EXISTING = document.getElementById(ID);
    if (EXISTING) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      var REG = ENV && ENV.RENDER && ENV.RENDER.ACTORREGISTRY;
      RESOLVE(DOMREFFN(EXISTING, REG));
      return;
    }

    var SAMPLES = 0;
    var INTERVALID = null;
    var TIMEOUTID = null;

    function clearhandles() {
      if (INTERVALID !== null) { clearInterval(INTERVALID); INTERVALID = null; }
      if (TIMEOUTID !== null) { clearTimeout(TIMEOUTID); TIMEOUTID = null; }
    }

    function tick() {
      SAMPLES = SAMPLES + 1;
      var EL = document.getElementById(ID);
      if (EL) {
        clearhandles();
        var ENVNOW = GETACTORSTATE('WORLDMAPACTOR');
        var REGNOW = ENVNOW && ENVNOW.RENDER && ENVNOW.RENDER.ACTORREGISTRY;
        RESOLVE(DOMREFFN(EL, REGNOW));
      }
    }

    function onTimeout() {
      clearhandles();
      var ERR = new Error('[EXPECTELEMENT] ELEMENT NOT FOUND: ' + ID);
      ERR.diagnostic = {
        KIND: 'expectelement-timeout',
        ID: ID,
        TIMEOUT: TIMEOUT,
        INTERVAL: INTERVAL,
        SAMPLES: SAMPLES,
        LASTHIT: false,
        MATCHCOUNT: document.querySelectorAll('[id="' + ID + '"]').length,
        DOCREADYSTATE: document.readyState,
        BODYCHILDCOUNT: document.body ? document.body.childElementCount : null
      };
      REJECT(ERR);
    }

    INTERVALID = setInterval(tick, INTERVAL);
    TIMEOUTID = setTimeout(onTimeout, TIMEOUT);
  });
};
