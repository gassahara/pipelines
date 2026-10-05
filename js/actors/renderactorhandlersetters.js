var RENDERTYPE = messagetype('RENDER', {
  ID: stringtype(),
  RENDERER: functiontype(),
  DATA: anytype(),
  ENV: objecttype()
});
var CLEARTYPE = messagetype('CLEAR', {
  ID: stringtype()
});
var HTMLTYPE = messagetype('HTML', {
  ID: stringtype(),
  MARKUP: stringtype(),
  APPEND: booleantype()
});
var REMOVETYPE = messagetype('REMOVE', {
  ID: stringtype()
});
var SETSTYLESTYPE = messagetype('SETSTYLES', {
  ID: stringtype(),
  STYLES: objecttype()
});
var SETATTRTYPE = messagetype('SETATTR', {
  ID: stringtype(),
  NAME: stringtype(),
  VALUE: stringtype()
});
var TOGGLECLASSTYPE = messagetype('TOGGLECLASS', {
  ID: stringtype(),
  CLASSNAME: stringtype(),
  FORCE: optionaltype(booleantype())
});
var SETHTMLTYPE = messagetype('SETHTML', {
  ID: stringtype(),
  VALUE: stringtype()
});
var SETPOSITIONTYPE = messagetype('SETPOSITION', {
  ID: stringtype(),
  VALUE: objecttype()
});
var SETSTYLETYPE = messagetype('SETSTYLE', {
  ID: stringtype(),
  VALUE: objecttype()
});
var SETVALUETYPE = messagetype('SETVALUE', {
  ID: stringtype(),
  VALUE: anytype()
});
var SETLAYOUTTYPE = messagetype('SETLAYOUT', {
  ID: stringtype(),
  VALUE: objecttype()
});
var RESTOREBODYHTMLTYPE = messagetype('RESTOREBODYHTML', {
  HTML: stringtype()
});

REGISTERMESSAGETYPE(RENDERTYPE);
REGISTERMESSAGETYPE(CLEARTYPE);
REGISTERMESSAGETYPE(HTMLTYPE);
REGISTERMESSAGETYPE(REMOVETYPE);
REGISTERMESSAGETYPE(SETSTYLESTYPE);
REGISTERMESSAGETYPE(SETATTRTYPE);
REGISTERMESSAGETYPE(TOGGLECLASSTYPE);
REGISTERMESSAGETYPE(SETHTMLTYPE);
REGISTERMESSAGETYPE(SETPOSITIONTYPE);
REGISTERMESSAGETYPE(SETSTYLETYPE);
REGISTERMESSAGETYPE(SETVALUETYPE);
REGISTERMESSAGETYPE(SETLAYOUTTYPE);
REGISTERMESSAGETYPE(RESTOREBODYHTMLTYPE);

function RENDERHANDLER_RENDER(ENV, ARGS) {
  var TARGET = ARGS.ID ? document.getElementById(ARGS.ID) : null;
  if (typeof ARGS.RENDERER === 'function') {
    try { ARGS.RENDERER(TARGET, ARGS.DATA, ARGS.ENV || {}); } catch (ERR) { console.error('[RENDERACTOR] Renderer error:', ERR); throw ERR; }
  }
  return true;
}

function RENDERHANDLER_CLEAR(ENV, ARGS) {
  WITHELEMENT(ARGS.ID, null, function(EL) { EL.innerHTML = ''; });
  return true;
}

function RENDERHANDLER_REMOVE(ENV, ARGS) {
  WITHELEMENT(ARGS.ID, null, function(EL) { EL.remove(); });
  return true;
}

function RENDERHANDLER_HTML(ENV, ARGS) {
  return WAITFORDOMREADY()
    .then(function() {
      return WITHELEMENTRETRY(ARGS.ID, null, function(EL) {
        if (ARGS.APPEND) EL.insertAdjacentHTML('beforeend', ARGS.MARKUP);
        else EL.innerHTML = ARGS.MARKUP;
      });
    })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETSTYLES(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) {
    Object.keys(ARGS.STYLES || {}).forEach(function(PROP) { EL.style[PROP] = ARGS.STYLES[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETATTR(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) { EL.setAttribute(ARGS.NAME, ARGS.VALUE); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_TOGGLECLASS(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) { EL.classList.toggle(ARGS.CLASSNAME, ARGS.FORCE); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETHTML(ENV, ARGS) {
  return WAITFORDOMREADY()
    .then(function() { return WITHELEMENTRETRY(ARGS.ID, null, function(EL) { EL.innerHTML = ARGS.VALUE; }); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETPOSITION(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) {
    Object.keys(ARGS.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = ARGS.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETSTYLE(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) {
    Object.keys(ARGS.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = ARGS.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETVALUE(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) { EL.value = ARGS.VALUE; })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_SETLAYOUT(ENV, ARGS) {
  return WITHELEMENTRETRY(ARGS.ID, null, function(EL) {
    Object.keys(ARGS.VALUE || {}).forEach(function(PROP) { EL[PROP] = ARGS.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

function RENDERHANDLER_RESTOREBODYHTML(ENV, ARGS) {
  return WAITFORDOMREADY()
    .then(function() {
      if (document.body) document.body.innerHTML = ARGS.HTML;
      return { RESPONSE: true };
    })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
}

REGISTERACTORMESSAGE('RENDERACTOR', RENDERTYPE,
  RENDERHANDLER_RENDER);

REGISTERACTORMESSAGE('RENDERACTOR', CLEARTYPE,
  RENDERHANDLER_CLEAR);

REGISTERACTORMESSAGE('RENDERACTOR', REMOVETYPE,
  RENDERHANDLER_REMOVE);

REGISTERACTORMESSAGE('RENDERACTOR', HTMLTYPE,
  RENDERHANDLER_HTML);

REGISTERACTORMESSAGE('RENDERACTOR', SETSTYLESTYPE,
  RENDERHANDLER_SETSTYLES);

REGISTERACTORMESSAGE('RENDERACTOR', SETATTRTYPE,
  RENDERHANDLER_SETATTR);

REGISTERACTORMESSAGE('RENDERACTOR', TOGGLECLASSTYPE,
  RENDERHANDLER_TOGGLECLASS);

REGISTERACTORMESSAGE('RENDERACTOR', SETHTMLTYPE,
  RENDERHANDLER_SETHTML);

REGISTERACTORMESSAGE('RENDERACTOR', SETPOSITIONTYPE,
  RENDERHANDLER_SETPOSITION);

REGISTERACTORMESSAGE('RENDERACTOR', SETSTYLETYPE,
  RENDERHANDLER_SETSTYLE);

REGISTERACTORMESSAGE('RENDERACTOR', SETVALUETYPE,
  RENDERHANDLER_SETVALUE);

REGISTERACTORMESSAGE('RENDERACTOR', SETLAYOUTTYPE,
  RENDERHANDLER_SETLAYOUT);

REGISTERACTORMESSAGE('RENDERACTOR', RESTOREBODYHTMLTYPE,
		     RENDERHANDLER_RESTOREBODYHTML);
