var CHECKOVERFLOWTYPE = messagetype('CHECKOVERFLOW', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CORRECTOVERFLOWTYPE = messagetype('CORRECTOVERFLOW', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CHECKSPACINGTYPE = messagetype('CHECKSPACING', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CORRECTSPACINGTYPE = messagetype('CORRECTSPACING', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CHECKOVERLAPTYPE = messagetype('CHECKOVERLAP', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CORRECTOVERLAPTYPE = messagetype('CORRECTOVERLAP', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CHECKSCROLLABILITYTYPE = messagetype('CHECKSCROLLABILITY', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CORRECTSCROLLABILITYTYPE = messagetype('CORRECTSCROLLABILITY', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CHECKCONTROLLEDOVERLAYTYPE = messagetype('CHECKCONTROLLEDOVERLAY', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CORRECTCONTROLLEDOVERLAYTYPE = messagetype('CORRECTCONTROLLEDOVERLAY', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var REWRITESTYLEATTRSTYPE = messagetype('REWRITESTYLEATTRS', {
  ID: stringtype(),
  RULES: arraytype()
});
var CONSOLIDATESTYLESTYPE = messagetype('CONSOLIDATESTYLES', {
  ID: stringtype(),
  SAFEPROPS: optionaltype(arraytype())
});
var PANELAYOUTTYPE = messagetype('PANELAYOUT', {
  ID: stringtype(),
  SHAPE: stringtype(),
  VIEWPORT: objecttype(),
  HEIGHT: optionaltype(anytype())
});

REGISTERMESSAGETYPE(CHECKOVERFLOWTYPE);
REGISTERMESSAGETYPE(CORRECTOVERFLOWTYPE);
REGISTERMESSAGETYPE(CHECKSPACINGTYPE);
REGISTERMESSAGETYPE(CORRECTSPACINGTYPE);
REGISTERMESSAGETYPE(CHECKOVERLAPTYPE);
REGISTERMESSAGETYPE(CORRECTOVERLAPTYPE);
REGISTERMESSAGETYPE(CHECKSCROLLABILITYTYPE);
REGISTERMESSAGETYPE(CORRECTSCROLLABILITYTYPE);
REGISTERMESSAGETYPE(CHECKCONTROLLEDOVERLAYTYPE);
REGISTERMESSAGETYPE(CORRECTCONTROLLEDOVERLAYTYPE);
REGISTERMESSAGETYPE(REWRITESTYLEATTRSTYPE);
REGISTERMESSAGETYPE(CONSOLIDATESTYLESTYPE);
REGISTERMESSAGETYPE(PANELAYOUTTYPE);

// @proposal=P-STYLE-APPLICATION-GUARDS — the 13 direct-null handlers in this
// file treat a missing target as a non-error skip. A caller that fires
// before its target is provisioned (e.g. the recipe pipeline's style stage
// listening on #styleselect while the recipe scaffold has not yet been
// inserted) receives `{ APPLIED: false, SKIPPED: 'element not found: …' }`
// instead of `{ ERROR: 'element not found: …' }`. The domquery block's
// throw-on-r.ERROR path (blockcompilers.js::compilers.domquery) is thus not
// entered for this class of failure. Non-missing-target error paths are
// unchanged: a genuine throw inside SUREWRITESTYLEATTRS, SUCONSOLIDATESTYLES,
// or an LC* check continues to propagate.

function RENDERHANDLER_CHECKOVERFLOW(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var OPTS = ARGS.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  return { RESPONSE: { VIOLATIONS: LCCHECKOVERFLOWDOC(ROOT, VW, CW, SC) } };
}

function RENDERHANDLER_CORRECTOVERFLOW(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var OPTS = ARGS.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var RESULT = LCCORRECTOVERFLOWDOC(ROOT, VW, CW, SC);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
}

function RENDERHANDLER_CHECKSPACING(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var OPTS = ARGS.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var V = LCCHECKSPACINGDOC(ROOT, MINGAP, SC);
  return { RESPONSE: { VIOLATIONS: V.map(function(x) { return { ELEMENTA: x.elementa.tagName + (x.elementa.id ? '#' + x.elementa.id : ''), ELEMENTB: x.elementb.tagName + (x.elementb.id ? '#' + x.elementb.id : ''), GAP: x.gap }; }) } };
}

function RENDERHANDLER_CORRECTSPACING(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var OPTS = ARGS.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var RESULT = LCCORRECTSPACINGDOC(ROOT, MINGAP, SC);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
}

function RENDERHANDLER_CHECKOVERLAP(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKOVERLAPDOC(ROOT) } };
}

function RENDERHANDLER_CORRECTOVERLAP(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var RESULT = LCCORRECTOVERLAPDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
}

function RENDERHANDLER_CHECKSCROLLABILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKSCROLLABILITYDOC(ROOT) } };
}

function RENDERHANDLER_CORRECTSCROLLABILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var RESULT = LCCORRECTSCROLLABILITYDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
}

function RENDERHANDLER_CHECKCONTROLLEDOVERLAY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKCONTROLLEDOVERLAYDOC(ROOT) } };
}

function RENDERHANDLER_CORRECTCONTROLLEDOVERLAY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var RESULT = LCCORRECTCONTROLLEDOVERLAYDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
}

function RENDERHANDLER_REWRITESTYLEATTRS(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUREWRITESTYLEATTRS(ROOT, ARGS.RULES || [], SC) } };
}

function RENDERHANDLER_CONSOLIDATESTYLES(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var SAFEPROPS = ARGS.SAFEPROPS || (SC && SC.createstylizerconstants ? SC.createstylizerconstants().safeprops : null);
  return { RESPONSE: { APPLIED: SUCONSOLIDATESTYLES(ROOT, SAFEPROPS, SC) } };
}

function RENDERHANDLER_PANELAYOUT(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC || typeof SC.computepanemaxwidth !== 'function') return { RESPONSE: { ERROR: 'stylizercore.computepanemaxwidth unavailable' } };
  var VIEWPORT = ARGS.VIEWPORT || {};
  var VW = (typeof VIEWPORT.VIEWPORTWIDTH === 'number' && VIEWPORT.VIEWPORTWIDTH > 0) ? VIEWPORT.VIEWPORTWIDTH : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
  var SHAPE = ARGS.SHAPE === 'row' ? 'row' : 'column';
  var ROLE = SHAPE === 'row' ? 'app-shell' : 'reading-column';
  var SPACING = SC.computebasespacing(VW);
  var MAXW = SC.computepanemaxwidth(VW, ROLE);
  EL.style.maxWidth = MAXW;
  EL.style.margin = '0 auto';
  EL.style.display = 'flex';
  EL.style.flexDirection = SHAPE;
  EL.style.gap = SPACING.gap + 'px';
  var HEIGHTAPPLIED = null;
  if (ARGS.HEIGHT === 'viewport') {
    var VH = SUDETECTVIEWPORTHEIGHT();
    if (VH !== null) { EL.style.height = VH + 'px'; HEIGHTAPPLIED = VH; }
  } else if (typeof ARGS.HEIGHT === 'number' && ARGS.HEIGHT > 0) {
    EL.style.height = ARGS.HEIGHT + 'px';
    HEIGHTAPPLIED = ARGS.HEIGHT;
  }
  return { RESPONSE: { APPLIED: true, MAXWIDTH: MAXW, SHAPE: SHAPE, ROLE: ROLE, HEIGHT: HEIGHTAPPLIED } };
}

REGISTERACTORMESSAGE('RENDERACTOR', CHECKOVERFLOWTYPE,
  RENDERHANDLER_CHECKOVERFLOW);
REGISTERACTORMESSAGE('RENDERACTOR', CORRECTOVERFLOWTYPE,
  RENDERHANDLER_CORRECTOVERFLOW);
REGISTERACTORMESSAGE('RENDERACTOR', CHECKSPACINGTYPE,
  RENDERHANDLER_CHECKSPACING);
REGISTERACTORMESSAGE('RENDERACTOR', CORRECTSPACINGTYPE,
  RENDERHANDLER_CORRECTSPACING);
REGISTERACTORMESSAGE('RENDERACTOR', CHECKOVERLAPTYPE,
  RENDERHANDLER_CHECKOVERLAP);
REGISTERACTORMESSAGE('RENDERACTOR', CORRECTOVERLAPTYPE,
  RENDERHANDLER_CORRECTOVERLAP);
REGISTERACTORMESSAGE('RENDERACTOR', CHECKSCROLLABILITYTYPE,
  RENDERHANDLER_CHECKSCROLLABILITY);
REGISTERACTORMESSAGE('RENDERACTOR', CORRECTSCROLLABILITYTYPE,
  RENDERHANDLER_CORRECTSCROLLABILITY);
REGISTERACTORMESSAGE('RENDERACTOR', CHECKCONTROLLEDOVERLAYTYPE,
  RENDERHANDLER_CHECKCONTROLLEDOVERLAY);
REGISTERACTORMESSAGE('RENDERACTOR', CORRECTCONTROLLEDOVERLAYTYPE,
  RENDERHANDLER_CORRECTCONTROLLEDOVERLAY);
REGISTERACTORMESSAGE('RENDERACTOR', REWRITESTYLEATTRSTYPE,
  RENDERHANDLER_REWRITESTYLEATTRS);
REGISTERACTORMESSAGE('RENDERACTOR', CONSOLIDATESTYLESTYPE,
  RENDERHANDLER_CONSOLIDATESTYLES);
REGISTERACTORMESSAGE('RENDERACTOR', PANELAYOUTTYPE,
		     RENDERHANDLER_PANELAYOUT);
