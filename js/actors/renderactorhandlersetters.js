REGISTERMESSAGETYPE('RENDER');
REGISTERMESSAGETYPE('CLEAR');
REGISTERMESSAGETYPE('HTML');
REGISTERMESSAGETYPE('REMOVE');
REGISTERMESSAGETYPE('SETSTYLES');
REGISTERMESSAGETYPE('SETATTR');
REGISTERMESSAGETYPE('TOGGLECLASS');
REGISTERMESSAGETYPE('SETHTML');
REGISTERMESSAGETYPE('SETPOSITION');
REGISTERMESSAGETYPE('SETSTYLE');
REGISTERMESSAGETYPE('SETVALUE');
REGISTERMESSAGETYPE('SETLAYOUT');
REGISTERMESSAGETYPE('RESTOREBODYHTML');

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

REGISTERACTORMESSAGE('RENDERACTOR', 'RENDER',
  { ID: 'string', RENDERER: 'function', DATA: 'any', ENV: 'object' },
  RENDERHANDLER_RENDER);

REGISTERACTORMESSAGE('RENDERACTOR', 'CLEAR',
  { ID: 'string' },
  RENDERHANDLER_CLEAR);

REGISTERACTORMESSAGE('RENDERACTOR', 'REMOVE',
  { ID: 'string' },
  RENDERHANDLER_REMOVE);

REGISTERACTORMESSAGE('RENDERACTOR', 'HTML',
  { ID: 'string', MARKUP: 'string', APPEND: 'boolean' },
  RENDERHANDLER_HTML);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETSTYLES',
  { ID: 'string', STYLES: 'object' },
  RENDERHANDLER_SETSTYLES);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETATTR',
  { ID: 'string', NAME: 'string', VALUE: 'string' },
  RENDERHANDLER_SETATTR);

REGISTERACTORMESSAGE('RENDERACTOR', 'TOGGLECLASS',
  { ID: 'string', CLASSNAME: 'string', FORCE: 'boolean?' },
  RENDERHANDLER_TOGGLECLASS);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETHTML',
  { ID: 'string', VALUE: 'string' },
  RENDERHANDLER_SETHTML);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETPOSITION',
  { ID: 'string', VALUE: 'object' },
  RENDERHANDLER_SETPOSITION);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETSTYLE',
  { ID: 'string', VALUE: 'object' },
  RENDERHANDLER_SETSTYLE);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETVALUE',
  { ID: 'string', VALUE: 'any' },
  RENDERHANDLER_SETVALUE);

REGISTERACTORMESSAGE('RENDERACTOR', 'SETLAYOUT',
  { ID: 'string', VALUE: 'object' },
  RENDERHANDLER_SETLAYOUT);

REGISTERACTORMESSAGE('RENDERACTOR', 'RESTOREBODYHTML',
  { HTML: 'string' },
		     RENDERHANDLER_RESTOREBODYHTML);
