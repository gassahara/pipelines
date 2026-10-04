REGISTERMESSAGETYPE('PALETTEGENERATE');
REGISTERMESSAGETYPE('SETACCENT');
REGISTERMESSAGETYPE('OPTIMIZECONTRAST');
REGISTERMESSAGETYPE('OPTIMIZEHARMONY');
REGISTERMESSAGETYPE('OPTIMIZETEXTVISIBILITY');
REGISTERMESSAGETYPE('OPTIMIZEBUTTONVISIBILITY');
REGISTERMESSAGETYPE('VERIFYCONTRAST');
REGISTERMESSAGETYPE('VERIFYTEXTVISIBILITY');
REGISTERMESSAGETYPE('VERIFYBUTTONVISIBILITY');
REGISTERMESSAGETYPE('VERIFYHARMONY');
REGISTERMESSAGETYPE('CHECKFOCUSVISIBILITY');

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

REGISTERACTORMESSAGE('RENDERACTOR', 'PALETTEGENERATE',
  { RULESET: 'function', OVERRIDES: 'object?' },
  RENDERHANDLER_PALETTEGENERATE);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETACCENT',
  { SELECTOR: 'object', PROP: 'string', HEX: 'string', REF: 'any?' },
  RENDERHANDLER_SETACCENT);

REGISTERACTORMESSAGE('RENDERACTOR', 'OPTIMIZECONTRAST',
  { ID: 'string', THEMESTYLES: 'object?', OPTIONS: 'object?' },
  RENDERHANDLER_OPTIMIZECONTRAST);

REGISTERACTORMESSAGE('RENDERACTOR', 'OPTIMIZEHARMONY',
  { ID: 'string', THEMESTYLES: 'object?', OPTIONS: 'object?' },
  RENDERHANDLER_OPTIMIZEHARMONY);

REGISTERACTORMESSAGE('RENDERACTOR', 'OPTIMIZETEXTVISIBILITY',
  { ID: 'string', THEMESTYLES: 'object?', OPTIONS: 'object?' },
  RENDERHANDLER_OPTIMIZETEXTVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', 'OPTIMIZEBUTTONVISIBILITY',
  { ID: 'string', THEMESTYLES: 'object?', OPTIONS: 'object?' },
  RENDERHANDLER_OPTIMIZEBUTTONVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', 'VERIFYCONTRAST',
  { ID: 'string', MINRATIO: 'number?' },
  RENDERHANDLER_VERIFYCONTRAST);

REGISTERACTORMESSAGE('RENDERACTOR', 'VERIFYTEXTVISIBILITY',
  { ID: 'string' },
  RENDERHANDLER_VERIFYTEXTVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', 'VERIFYBUTTONVISIBILITY',
  { ID: 'string' },
  RENDERHANDLER_VERIFYBUTTONVISIBILITY);

REGISTERACTORMESSAGE('RENDERACTOR', 'VERIFYHARMONY',
  { ID: 'string', OPTIONS: 'object?' },
  RENDERHANDLER_VERIFYHARMONY);

REGISTERACTORMESSAGE('RENDERACTOR', 'CHECKFOCUSVISIBILITY',
  { ID: 'string' },
		     RENDERHANDLER_CHECKFOCUSVISIBILITY);
