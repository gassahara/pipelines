var PALETTEGENERATETYPE = messagetype('PALETTEGENERATE', {
  RULESET: functiontype(),
  OVERRIDES: optionaltype(objecttype())
});
var SETACCENTTYPE = messagetype('SETACCENT', {
  SELECTOR: objecttype(),
  PROP: stringtype(),
  HEX: stringtype(),
  REF: optionaltype(anytype())
});
var OPTIMIZECONTRASTTYPE = messagetype('OPTIMIZECONTRAST', {
  ID: stringtype(),
  THEMESTYLES: optionaltype(objecttype()),
  OPTIONS: optionaltype(objecttype())
});
var OPTIMIZEHARMONYTYPE = messagetype('OPTIMIZEHARMONY', {
  ID: stringtype(),
  THEMESTYLES: optionaltype(objecttype()),
  OPTIONS: optionaltype(objecttype())
});
var OPTIMIZETEXTVISIBILITYTYPE = messagetype('OPTIMIZETEXTVISIBILITY', {
  ID: stringtype(),
  THEMESTYLES: optionaltype(objecttype()),
  OPTIONS: optionaltype(objecttype())
});
var OPTIMIZEBUTTONVISIBILITYTYPE = messagetype('OPTIMIZEBUTTONVISIBILITY', {
  ID: stringtype(),
  THEMESTYLES: optionaltype(objecttype()),
  OPTIONS: optionaltype(objecttype())
});
var VERIFYCONTRASTTYPE = messagetype('VERIFYCONTRAST', {
  ID: stringtype(),
  MINRATIO: optionaltype(numbertype())
});
var VERIFYTEXTVISIBILITYTYPE = messagetype('VERIFYTEXTVISIBILITY', {
  ID: stringtype()
});
var VERIFYBUTTONVISIBILITYTYPE = messagetype('VERIFYBUTTONVISIBILITY', {
  ID: stringtype()
});
var VERIFYHARMONYTYPE = messagetype('VERIFYHARMONY', {
  ID: stringtype(),
  OPTIONS: optionaltype(objecttype())
});
var CHECKFOCUSVISIBILITYTYPE = messagetype('CHECKFOCUSVISIBILITY', {
  ID: stringtype()
});

REGISTERMESSAGETYPE(PALETTEGENERATETYPE);
REGISTERMESSAGETYPE(SETACCENTTYPE);
REGISTERMESSAGETYPE(OPTIMIZECONTRASTTYPE);
REGISTERMESSAGETYPE(OPTIMIZEHARMONYTYPE);
REGISTERMESSAGETYPE(OPTIMIZETEXTVISIBILITYTYPE);
REGISTERMESSAGETYPE(OPTIMIZEBUTTONVISIBILITYTYPE);
REGISTERMESSAGETYPE(VERIFYCONTRASTTYPE);
REGISTERMESSAGETYPE(VERIFYTEXTVISIBILITYTYPE);
REGISTERMESSAGETYPE(VERIFYBUTTONVISIBILITYTYPE);
REGISTERMESSAGETYPE(VERIFYHARMONYTYPE);
REGISTERMESSAGETYPE(CHECKFOCUSVISIBILITYTYPE);

function RENDERHANDLER_PALETTEGENERATE(ENV, ARGS) {
  if (typeof ARGS.RULESET !== 'function') return { RESPONSE: { ERROR: 'PALETTEGENERATE requires RULESET as a function' } };
  return { RESPONSE: { PALETTE: ARGS.RULESET(ARGS.OVERRIDES || {}) } };
}

function RENDERHANDLER_SETACCENT(ENV, ARGS) {
  var SELECTOR = ARGS.SELECTOR;
  if (!SELECTOR || typeof SELECTOR !== 'object') return { RESPONSE: { ERROR: 'SETACCENT requires SELECTOR object' } };
  var HEX = ARGS.HEX;
  if (typeof HEX !== 'string' || HEX.charAt(0) !== '#') return { RESPONSE: { ERROR: 'SETACCENT requires HEX as a #RRGGBB string' } };
  var PROP = ARGS.PROP || 'color';
  var root = document.getElementById('approot') || document.body;
  if (!root) return { RESPONSE: { ERROR: 'SETACCENT root not found' } };
  var rule = { style: {} };
  if (SELECTOR.id) rule.id = SELECTOR.id;
  if (SELECTOR.tag) rule.tag = SELECTOR.tag;
  if (SELECTOR.class) rule.class = SELECTOR.class;
  if (!rule.id && !rule.tag && !rule.class) return { RESPONSE: { ERROR: 'SETACCENT selector must declare id, tag, or class' } };
  rule.style[PROP] = HEX;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var applied = SUREWRITESTYLEATTRS(root, [rule], SC);
  return { RESPONSE: { APPLIED: applied, REF: ARGS.REF || null, HEX: HEX, PROP: PROP } };
}

function RENDERHANDLER_OPTIMIZECONTRAST(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUOPTIMIZECONTRAST(ROOT, ARGS.THEMESTYLES || {}, ARGS.OPTIONS || {}, SC) } };
}

function RENDERHANDLER_OPTIMIZEHARMONY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUOPTIMIZEHARMONY(ROOT, ARGS.THEMESTYLES || {}, ARGS.OPTIONS || {}, SC) } };
}

function RENDERHANDLER_OPTIMIZETEXTVISIBILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUOPTIMIZETEXTVISIBILITY(ROOT, ARGS.THEMESTYLES || {}, ARGS.OPTIONS || {}, SC) } };
}

function RENDERHANDLER_OPTIMIZEBUTTONVISIBILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SUOPTIMIZEBUTTONVISIBILITY(ROOT, SC) } };
}

function RENDERHANDLER_VERIFYCONTRAST(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var MINRATIO = ARGS.MINRATIO !== undefined ? ARGS.MINRATIO : 4.5;
  return { RESPONSE: { VIOLATIONS: SUVERIFYCONTRAST(ROOT, MINRATIO, SC) } };
}

function RENDERHANDLER_VERIFYTEXTVISIBILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SUVERIFYTEXTVISIBILITY(ROOT, SC) } };
}

function RENDERHANDLER_VERIFYBUTTONVISIBILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SUVERIFYBUTTONVISIBILITY(ROOT, SC) } };
}

function RENDERHANDLER_VERIFYHARMONY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SUVERIFYHARMONY(ROOT, ARGS.OPTIONS || {}, SC) } };
}

function RENDERHANDLER_CHECKFOCUSVISIBILITY(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SUCHECKFOCUSVISIBILITY(ROOT, SC) } };
}

REGISTERACTORMESSAGE('RENDERACTOR', PALETTEGENERATETYPE,
  RENDERHANDLER_PALETTEGENERATE);

REGISTERACTORMESSAGE('RENDERACTOR', SETACCENTTYPE,
  RENDERHANDLER_SETACCENT);

REGISTERACTORMESSAGE('RENDERACTOR', OPTIMIZECONTRASTTYPE,
  RENDERHANDLER_OPTIMIZECONTRAST);

REGISTERACTORMESSAGE('RENDERACTOR', OPTIMIZEHARMONYTYPE,
  RENDERHANDLER_OPTIMIZEHARMONY);

REGISTERACTORMESSAGE('RENDERACTOR', OPTIMIZETEXTVISIBILITYTYPE,
  RENDERHANDLER_OPTIMIZETEXTVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', OPTIMIZEBUTTONVISIBILITYTYPE,
  RENDERHANDLER_OPTIMIZEBUTTONVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', VERIFYCONTRASTTYPE,
  RENDERHANDLER_VERIFYCONTRAST);

REGISTERACTORMESSAGE('RENDERACTOR', VERIFYTEXTVISIBILITYTYPE,
  RENDERHANDLER_VERIFYTEXTVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', VERIFYBUTTONVISIBILITYTYPE,
  RENDERHANDLER_VERIFYBUTTONVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', VERIFYHARMONYTYPE,
  RENDERHANDLER_VERIFYHARMONY);

REGISTERACTORMESSAGE('RENDERACTOR', CHECKFOCUSVISIBILITYTYPE,
		     RENDERHANDLER_CHECKFOCUSVISIBILITY);
