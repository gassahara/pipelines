HANDLERS[MESSAGETYPES.RENDER] = function(ENV, MSG) {
  var TARGET = MSG.ID ? document.getElementById(MSG.ID) : null;
  if (typeof MSG.RENDERER === 'function') {
    try { MSG.RENDERER(TARGET, MSG.DATA, MSG.ENV || {}); } catch (ERR) { console.error('[RENDERACTOR] Renderer error:', ERR); throw ERR; }
  }
  return true;
};
HANDLERS[MESSAGETYPES.CLEAR] = function(ENV, MSG) {
  WITHELEMENT(MSG.ID, null, function(EL) { EL.innerHTML = ''; });
  return true;
};
HANDLERS[MESSAGETYPES.REMOVE] = function(ENV, MSG) {
  WITHELEMENT(MSG.ID, null, function(EL) { EL.remove(); });
  return true;
};
HANDLERS[MESSAGETYPES.HTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() {
      return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
        if (MSG.APPEND) EL.insertAdjacentHTML('beforeend', MSG.MARKUP);
        else EL.innerHTML = MSG.MARKUP;
      });
    })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETSTYLES] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.STYLES || {}).forEach(function(PROP) { EL.style[PROP] = MSG.STYLES[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETATTR] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.setAttribute(MSG.NAME, MSG.VALUE); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.classList.toggle(MSG.CLASSNAME, MSG.FORCE); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETHTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() { return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.innerHTML = MSG.VALUE; }); })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETPOSITION] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETSTYLE] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL.style[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETVALUE] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) { EL.value = MSG.VALUE; })
    .then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.SETLAYOUT] = function(ENV, MSG) {
  return WITHELEMENTRETRY(MSG.ID, null, function(EL) {
    Object.keys(MSG.VALUE || {}).forEach(function(PROP) { EL[PROP] = MSG.VALUE[PROP]; });
  }).then(function() { return { RESPONSE: true }; })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};

HANDLERS[MESSAGETYPES.RESTOREBODYHTML] = function(ENV, MSG) {
  return WAITFORDOMREADY()
    .then(function() {
      if (document.body) document.body.innerHTML = MSG.HTML;
      return { RESPONSE: true };
    })
    .catch(function(ERR) { return { RESPONSE: { ERROR: ERR.message || String(ERR) } }; });
};
