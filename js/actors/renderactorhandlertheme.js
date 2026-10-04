HANDLERS[MESSAGETYPES.PALETTEGENERATE] = function(ENV, MSG) {
  if (typeof MSG.RULESET !== 'function') return { RESPONSE: { ERROR: 'PALETTEGENERATE requires RULESET as a function' } };
  return { RESPONSE: { PALETTE: MSG.RULESET(MSG.OVERRIDES || {}) } };
};

HANDLERS[MESSAGETYPES.SETACCENT] = function(ENV, MSG) {
  var SELECTOR = MSG.SELECTOR;
  if (!SELECTOR || typeof SELECTOR !== 'object') return { RESPONSE: { ERROR: 'SETACCENT requires SELECTOR object' } };
  var HEX = MSG.HEX;
  if (typeof HEX !== 'string' || HEX.charAt(0) !== '#') return { RESPONSE: { ERROR: 'SETACCENT requires HEX as a #RRGGBB string' } };
  var PROP = MSG.PROP || 'color';
  var root = document.getElementById('approot') || document.body;
  if (!root) return { RESPONSE: { ERROR: 'SETACCENT root not found' } };
  var rule = { style: {} };
  if (SELECTOR.id) rule.id = SELECTOR.id;
  if (SELECTOR.tag) rule.tag = SELECTOR.tag;
  if (SELECTOR.class) rule.class = SELECTOR.class;
  if (!rule.id && !rule.tag && !rule.class) return { RESPONSE: { ERROR: 'SETACCENT selector must declare id, tag, or class' } };
  rule.style[PROP] = HEX;
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var applied = SU_rewritestyleattrs(root, [rule], SC);
  return { RESPONSE: { APPLIED: applied, REF: MSG.REF || null, HEX: HEX, PROP: PROP } };
};

HANDLERS[MESSAGETYPES.OPTIMIZECONTRAST] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SU_optimizecontrast(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) } };
};

HANDLERS[MESSAGETYPES.OPTIMIZEHARMONY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SU_optimizeharmony(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) } };
};

HANDLERS[MESSAGETYPES.OPTIMIZETEXTVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SU_optimizetextvisibility(ROOT, MSG.THEMESTYLES || {}, MSG.OPTIONS || {}, SC) } };
};

HANDLERS[MESSAGETYPES.OPTIMIZEBUTTONVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { APPLIED: SU_optimizebuttonvisibility(ROOT, SC) } };
};

HANDLERS[MESSAGETYPES.VERIFYCONTRAST] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  var MINRATIO = MSG.MINRATIO !== undefined ? MSG.MINRATIO : 4.5;
  return { RESPONSE: { VIOLATIONS: SU_verifycontrast(ROOT, MINRATIO, SC) } };
};

HANDLERS[MESSAGETYPES.VERIFYTEXTVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SU_verifytextvisibility(ROOT, SC) } };
};

HANDLERS[MESSAGETYPES.VERIFYBUTTONVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SU_verifybuttonvisibility(ROOT, SC) } };
};

HANDLERS[MESSAGETYPES.VERIFYHARMONY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SU_verifyharmony(ROOT, MSG.OPTIONS || {}, SC) } };
};

HANDLERS[MESSAGETYPES.CHECKFOCUSVISIBILITY] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var SC = (typeof stylizercore !== 'undefined') ? stylizercore : null;
  return { RESPONSE: { VIOLATIONS: SU_checkfocusvisibility(ROOT, SC) } };
};
