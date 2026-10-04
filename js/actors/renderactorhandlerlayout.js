HANDLERS[MESSAGETYPES.CHECKOVERFLOW] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var OPTS = MSG.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  return { RESPONSE: { VIOLATIONS: LCCHECKOVERFLOWDOC(ROOT, VW, CW, SC) } };
};

HANDLERS[MESSAGETYPES.CORRECTOVERFLOW] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var OPTS = MSG.OPTIONS || {};
  var VW = (typeof OPTS.viewportwidth === 'number' && OPTS.viewportwidth > 0) ? OPTS.viewportwidth : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
  var CW = OPTS.containerwidths || {};
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var RESULT = LCCORRECTOVERFLOWDOC(ROOT, VW, CW, SC);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
};

HANDLERS[MESSAGETYPES.CHECKSPACING] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var OPTS = MSG.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var V = LCCHECKSPACINGDOC(ROOT, MINGAP, SC);
  return { RESPONSE: { VIOLATIONS: V.map(function(x) { return { ELEMENTA: x.elementa.tagName + (x.elementa.id ? '#' + x.elementa.id : ''), ELEMENTB: x.elementb.tagName + (x.elementb.id ? '#' + x.elementb.id : ''), GAP: x.gap }; }) } };
};

HANDLERS[MESSAGETYPES.CORRECTSPACING] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var OPTS = MSG.OPTIONS || {};
  var MINGAP = (typeof OPTS.mingap === 'number') ? OPTS.mingap : 12;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC) return { RESPONSE: { ERROR: 'stylizercore unavailable' } };
  var RESULT = LCCORRECTSPACINGDOC(ROOT, MINGAP, SC);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
};

HANDLERS[MESSAGETYPES.CHECKOVERLAP] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKOVERLAPDOC(ROOT) } };
};

HANDLERS[MESSAGETYPES.CORRECTOVERLAP] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var RESULT = LCCORRECTOVERLAPDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
};

HANDLERS[MESSAGETYPES.CHECKSCROLLABILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKSCROLLABILITYDOC(ROOT) } };
};

HANDLERS[MESSAGETYPES.CORRECTSCROLLABILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var RESULT = LCCORRECTSCROLLABILITYDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
};

HANDLERS[MESSAGETYPES.CHECKCONTROLLEDOVERLAY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: { VIOLATIONS: LCCHECKCONTROLLEDOVERLAYDOC(ROOT) } };
};

HANDLERS[MESSAGETYPES.CORRECTCONTROLLEDOVERLAY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var RESULT = LCCORRECTCONTROLLEDOVERLAYDOC(ROOT);
  return { RESPONSE: { APPLIED: RESULT.applied, CONVERGED: RESULT.converged } };
};

HANDLERS[MESSAGETYPES.REWRITESTYLEATTRS] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUREWRITESTYLEATTRS(ROOT, MSG.RULES || [], SC) } };
};

HANDLERS[MESSAGETYPES.CONSOLIDATESTYLES] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var SAFEPROPS = MSG.SAFEPROPS || (SC && SC.createstylizerconstants ? SC.createstylizerconstants().safeprops : null);
  return { RESPONSE: { APPLIED: SUCONSOLIDATESTYLES(ROOT, SAFEPROPS, SC) } };
};

HANDLERS[MESSAGETYPES.PANELAYOUT] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  if (!SC || typeof SC.computepanemaxwidth !== 'function') return { RESPONSE: { ERROR: 'stylizercore.computepanemaxwidth unavailable' } };
  var VIEWPORT = MSG.VIEWPORT || {};
  var VW = (typeof VIEWPORT.VIEWPORTWIDTH === 'number' && VIEWPORT.VIEWPORTWIDTH > 0) ? VIEWPORT.VIEWPORTWIDTH : SUDETECTVIEWPORTWIDTH();
  if (VW === null) return { RESPONSE: { SKIPPED: 'viewport-undetectable' } };
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
    var VH = SUDETECTVIEWPORTHEIGHT();
    if (VH !== null) { EL.style.height = VH + 'px'; HEIGHTAPPLIED = VH; }
  } else if (typeof MSG.HEIGHT === 'number' && MSG.HEIGHT > 0) {
    EL.style.height = MSG.HEIGHT + 'px';
    HEIGHTAPPLIED = MSG.HEIGHT;
  }
  return { RESPONSE: { APPLIED: true, MAXWIDTH: MAXW, SHAPE: SHAPE, ROLE: ROLE, HEIGHT: HEIGHTAPPLIED } };
};
