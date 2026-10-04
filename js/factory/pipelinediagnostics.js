// js/factory/pipelinediagnostics.js — pipeline diagnostics and
// accent application.
//
// @proposal=CP2 (CYCLE-25) — extracted from /js/factory/blockcompiler.js
// as concerns B15 (setaccent) and B16 (boot diagnostics). The function
// bodies are byte-identical to their pre-split forms.
//
// Load order: this file loads after pipelinecompilers.js and
// blockcompilers.js. It is loaded before blockcompiler.js (which
// declares compileblock, the entry point that does not read
// setaccent, showbootloader, hidebootloader, or emitinitializationroster).

// ============================================================
// setaccent
// ============================================================

function setaccent(selector, accentref, palette, prop) {
  if (!selector || typeof selector !== 'object') {
    throw new Error('[setaccent] selector required');
  }
  if (!selector.id && !selector.tag && !selector.class) {
    throw new Error('[setaccent] selector must declare id, tag, or class');
  }
  if (!palette || typeof palette !== 'object') {
    throw new Error('[setaccent] palette required');
  }

  var entry = null;

  if (typeof accentref === 'number') {
    if (palette.accents && palette.accents[accentref]) {
      entry = palette.accents[accentref];
    } else if (palette.warm && palette.warm[accentref]) {
      entry = palette.warm[accentref];
    }
  } else if (typeof accentref === 'string') {
    if (palette.accents) {
      for (var i = 0; i < palette.accents.length; i++) {
        if (palette.accents[i] && palette.accents[i].name === accentref) {
          entry = palette.accents[i];
          break;
        }
      }
    }
    if (!entry && palette.neutrals && palette.neutrals[accentref]) {
      entry = palette.neutrals[accentref];
    }
    if (!entry && palette[accentref] !== undefined) {
      entry = palette[accentref];
    }
    if (!entry && palette.warm) {
      for (var j = 0; j < palette.warm.length; j++) {
        if (palette.warm[j] && palette.warm[j].name === accentref) {
          entry = palette.warm[j];
          break;
        }
      }
    }
  } else {
    throw new Error('[setaccent] accentref must be a number or string');
  }

  if (!entry) {
    throw new Error('[setaccent] cannot resolve accent ' + String(accentref));
  }

  var hex = (typeof entry === 'string') ? entry : entry.hex;
  if (!hex || typeof hex !== 'string' || hex.charAt(0) !== '#') {
    throw new Error('[setaccent] accent ' + String(accentref) + ' has no hex');
  }

  var cssprop = prop || 'color';

  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.SETACCENT, {
    SELECTOR: selector,
    PROP: cssprop,
    HEX: hex,
    REF: accentref
  }, GENERATETAG(), 'BLOCKCOMPILER');
}

// ============================================================
// §7 — Boot diagnostics (P-FRONTEND-BOUNDARY-001v2 /
//      P-FRONTEND-BOUNDARY-002v2)
// ============================================================
//
// @proposal=P-FRONTEND-BOUNDARY-001v2 — the two boot-time visual
// diagnostics are blockcompiler-owned. They are the sole legal
// producers of the loading indicator for the frontend's boot path.
// The frontend calls these by name; it does not reference the actor
// or the message type.
//
// @proposal=P-FRONTEND-BOUNDARY-002v2 (option a) — the initialization
// roster is emitted internally, from run() and compile(), under the
// gate `options.roster === true`. It is NOT exported. The frontend
// supplies the boolean and does not walk the pipeline.

function showbootloader() {
  if (typeof SENDINSTRUCTION !== 'function' || typeof MESSAGETYPES === 'undefined') return;
  var bootloadermarkup =
      '<style>'
      + '@keyframes bootloaderpulse{0%,100%{opacity:0.4;transform:scale(0.9);}50%{opacity:1.0;transform:scale(1.0);}}'
      + '</style>'
      + '<div role="status" aria-live="polite" aria-label="Initialising application"'
      + ' style="position:fixed;top:0;left:0;width:100vw;height:100vh;'
      + 'background:rgba(0,0,0,0.85);z-index:9999;'
      + 'display:flex;align-items:center;justify-content:center;gap:10px">'
      + '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;'
      + 'background:#f59e0b;animation:bootloaderpulse 1.2s ease-in-out infinite"></span>'
      + '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;'
      + 'background:#f59e0b;animation:bootloaderpulse 1.2s ease-in-out 0.2s infinite"></span>'
      + '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;'
      + 'background:#f59e0b;animation:bootloaderpulse 1.2s ease-in-out 0.4s infinite"></span>'
      + '</div>';
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.LOADINGINDICATOR, {
    ACTION: 'SHOW',
    ID: 'bootloadingindicator',
    MARKUP: bootloadermarkup
  }, null, 'BLOCKCOMPILER');
}

function hidebootloader() {
  if (typeof SENDINSTRUCTION !== 'function' || typeof MESSAGETYPES === 'undefined') return;
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.LOADINGINDICATOR, {
    ACTION: 'HIDE',
    ID: 'bootloadingindicator'
  }, null, 'BLOCKCOMPILER');
}

// Internal. Not exported. Invoked by run() and compile() when
// options.roster === true.
function emitinitializationroster(p) {
  if (!p || !Array.isArray(p.elements)) return;
  if (typeof SENDINSTRUCTION !== 'function' || typeof MESSAGETYPES === 'undefined') return;

  function emitline(kind, id, blocktype) {
    SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.LOGLINE, {
      LEVEL: 'info',
      MESSAGE: 'set',
      DATA: { kind: kind, blockid: id, blocktype: blocktype || null },
      TIMESTAMP: Date.now(),
      PREFIX: 'init'
    }, null, 'BLOCKCOMPILER');
  }

  function walk(elements) {
    if (!Array.isArray(elements)) return;
    elements.forEach(function(el, i) {
      if (!el || !el.element) return;
      if (el.element === 'BLOCK') {
        emitline('block', el.id || ('block' + i), el.type);
      } else if (el.element === 'STAGE') {
        emitline('stage', el.id || ('stage' + i), 'STAGE');
        walk(el.elements);
      } else if (el.element === 'PIPELINE') {
        emitline('pipeline', el.id || ('pipeline' + i), 'PIPELINE');
      }
    });
  }

  walk(p.elements);
}
