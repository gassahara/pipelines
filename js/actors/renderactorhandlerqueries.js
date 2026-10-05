var GETHTMLTYPE = messagetype('GETHTML', {
  ID: stringtype()
});
var GETVALUETYPE = messagetype('GETVALUE', {
  ID: stringtype()
});
var GETSTYLETYPE = messagetype('GETSTYLE', {
  ID: stringtype()
});
var GETPOSITIONTYPE = messagetype('GETPOSITION', {
  ID: stringtype()
});
var GETLAYOUTTYPE = messagetype('GETLAYOUT', {
  ID: stringtype()
});
var GETVIEWPORTTYPE = messagetype('GETVIEWPORT', {});
var GETSCREENTYPE = messagetype('GETSCREEN', {});
var MATCHMEDIATYPE = messagetype('MATCHMEDIA', {
  QUERY: stringtype()
});
var GETBODYHTMLTYPE = messagetype('GETBODYHTML', {});
var GETELEMENTSTYPE = messagetype('GETELEMENTS', {
  ID: stringtype(),
  TAGNAME: optionaltype(stringtype()),
  LIMIT: optionaltype(numbertype())
});

REGISTERMESSAGETYPE(GETHTMLTYPE);
REGISTERMESSAGETYPE(GETVALUETYPE);
REGISTERMESSAGETYPE(GETSTYLETYPE);
REGISTERMESSAGETYPE(GETPOSITIONTYPE);
REGISTERMESSAGETYPE(GETLAYOUTTYPE);
REGISTERMESSAGETYPE(GETVIEWPORTTYPE);
REGISTERMESSAGETYPE(GETSCREENTYPE);
REGISTERMESSAGETYPE(MATCHMEDIATYPE);
REGISTERMESSAGETYPE(GETBODYHTMLTYPE);
REGISTERMESSAGETYPE(GETELEMENTSTYPE);

function RENDERHANDLER_GETHTML(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: { TAG: EL.tagName.toLowerCase(), INNERHTML: EL.innerHTML } };
}

function RENDERHANDLER_GETVALUE(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: EL.value };
}

function RENDERHANDLER_GETSTYLE(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var COMPUTED = window.getComputedStyle(EL);
  var STYLEOBJ = Array.prototype.slice.call(COMPUTED).reduce(function(ACC, PROP) {
    ACC[PROP] = COMPUTED.getPropertyValue(PROP);
    return ACC;
  }, {});
  return { RESPONSE: STYLEOBJ };
}

function RENDERHANDLER_GETPOSITION(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var RECT = EL.getBoundingClientRect();
  return { RESPONSE: { X: RECT.x, Y: RECT.y, WIDTH: RECT.width, HEIGHT: RECT.height, TOP: RECT.top, RIGHT: RECT.right, BOTTOM: RECT.bottom, LEFT: RECT.left } };
}

function RENDERHANDLER_GETLAYOUT(ENV, ARGS) {
  var EL = document.getElementById(ARGS.ID);
  if (!EL) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  return { RESPONSE: {
    OFFSETWIDTH: EL.offsetWidth, OFFSETHEIGHT: EL.offsetHeight,
    OFFSETLEFT: EL.offsetLeft, OFFSETTOP: EL.offsetTop,
    SCROLLWIDTH: EL.scrollWidth, SCROLLHEIGHT: EL.scrollHeight,
    CLIENTWIDTH: EL.clientWidth, CLIENTHEIGHT: EL.clientHeight
  } };
}

function RENDERHANDLER_GETVIEWPORT(ENV, ARGS) {
  var DOC = document.documentElement;
  return { RESPONSE: { VIEWPORTWIDTH: DOC.clientWidth, VIEWPORTHEIGHT: DOC.clientHeight } };
}

function RENDERHANDLER_GETSCREEN(ENV, ARGS) {
  var SCR = window.screen;
  return { RESPONSE: { SCREENWIDTH: SCR.width, SCREENHEIGHT: SCR.height, AVAILWIDTH: SCR.availWidth, AVAILHEIGHT: SCR.availHeight } };
}

function RENDERHANDLER_MATCHMEDIA(ENV, ARGS) {
  return { RESPONSE: { MATCHES: window.matchMedia(ARGS.QUERY).matches } };
}

function RENDERHANDLER_GETBODYHTML(ENV, ARGS) {
  return { RESPONSE: document.body ? document.body.innerHTML : '' };
}

function RENDERHANDLER_GETELEMENTS(ENV, ARGS) {
  var ROOT = document.getElementById(ARGS.ID);
  if (!ROOT) return { RESPONSE: { ERROR: 'element not found: ' + ARGS.ID } };
  var TAGFILTER = ARGS.TAGNAME ? String(ARGS.TAGNAME).toLowerCase() : null;
  var LIMIT = (typeof ARGS.LIMIT === 'number' && ARGS.LIMIT > 0) ? ARGS.LIMIT : Infinity;
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
}

REGISTERACTORMESSAGE('RENDERACTOR', GETHTMLTYPE,
  RENDERHANDLER_GETHTML);

REGISTERACTORMESSAGE('RENDERACTOR', GETVALUETYPE,
  RENDERHANDLER_GETVALUE);

REGISTERACTORMESSAGE('RENDERACTOR', GETSTYLETYPE,
  RENDERHANDLER_GETSTYLE);

REGISTERACTORMESSAGE('RENDERACTOR', GETPOSITIONTYPE,
  RENDERHANDLER_GETPOSITION);

REGISTERACTORMESSAGE('RENDERACTOR', GETLAYOUTTYPE,
  RENDERHANDLER_GETLAYOUT);

REGISTERACTORMESSAGE('RENDERACTOR', GETVIEWPORTTYPE,
  RENDERHANDLER_GETVIEWPORT);

REGISTERACTORMESSAGE('RENDERACTOR', GETSCREENTYPE,
  RENDERHANDLER_GETSCREEN);

REGISTERACTORMESSAGE('RENDERACTOR', MATCHMEDIATYPE,
  RENDERHANDLER_MATCHMEDIA);

REGISTERACTORMESSAGE('RENDERACTOR', GETBODYHTMLTYPE,
  RENDERHANDLER_GETBODYHTML);

REGISTERACTORMESSAGE('RENDERACTOR', GETELEMENTSTYPE,
		     RENDERHANDLER_GETELEMENTS);
