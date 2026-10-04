HANDLERS[MESSAGETYPES.GETHTML] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: { TAG: EL.tagName.toLowerCase(), INNERHTML: EL.innerHTML } };
};

HANDLERS[MESSAGETYPES.GETVALUE] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: EL.value };
};

HANDLERS[MESSAGETYPES.GETSTYLE] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var COMPUTED = window.getComputedStyle(EL);
  var STYLEOBJ = Array.prototype.slice.call(COMPUTED).reduce(function(ACC, PROP) {
    ACC[PROP] = COMPUTED.getPropertyValue(PROP);
    return ACC;
  }, {});
  return { RESPONSE: STYLEOBJ };
};

HANDLERS[MESSAGETYPES.GETPOSITION] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  var RECT = EL.getBoundingClientRect();
  return { RESPONSE: { X: RECT.x, Y: RECT.y, WIDTH: RECT.width, HEIGHT: RECT.height, TOP: RECT.top, RIGHT: RECT.right, BOTTOM: RECT.bottom, LEFT: RECT.left } };
};

HANDLERS[MESSAGETYPES.GETLAYOUT] = function(ENV, MSG) {
  var EL = document.getElementById(MSG.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
  return { RESPONSE: {
    OFFSETWIDTH: EL.offsetWidth, OFFSETHEIGHT: EL.offsetHeight,
    OFFSETLEFT: EL.offsetLeft, OFFSETTOP: EL.offsetTop,
    SCROLLWIDTH: EL.scrollWidth, SCROLLHEIGHT: EL.scrollHeight,
    CLIENTWIDTH: EL.clientWidth, CLIENTHEIGHT: EL.clientHeight
  } };
};

HANDLERS[MESSAGETYPES.GETVIEWPORT] = function(ENV, MSG) {
  var DOC = document.documentElement;
  return { RESPONSE: { VIEWPORTWIDTH: DOC.clientWidth, VIEWPORTHEIGHT: DOC.clientHeight } };
};

HANDLERS[MESSAGETYPES.GETSCREEN] = function(ENV, MSG) {
  var SCR = window.screen;
  return { RESPONSE: { SCREENWIDTH: SCR.width, SCREENHEIGHT: SCR.height, AVAILWIDTH: SCR.availWidth, AVAILHEIGHT: SCR.availHeight } };
};

HANDLERS[MESSAGETYPES.MATCHMEDIA] = function(ENV, MSG) {
  return { RESPONSE: { MATCHES: window.matchMedia(MSG.QUERY).matches } };
};

HANDLERS[MESSAGETYPES.GETBODYHTML] = function(ENV, MSG) {
  return { RESPONSE: document.body ? document.body.innerHTML : '' };
};

HANDLERS[MESSAGETYPES.GETELEMENTS] = function(ENV, MSG) {
  var ROOT = document.getElementById(MSG.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + MSG.ID } };
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
    Array.prototype.slice.call(EL.children || []).some(function (CHILD) {
      if (DESCRIPTORS.length >= LIMIT) return true;
      walk(CHILD);
      return false;
    });
  }
  walk(ROOT);
  return { RESPONSE: { DESCRIPTORS: DESCRIPTORS } };
};
