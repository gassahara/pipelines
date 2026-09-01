// ============================================================
// UPDATED FILE: js/actors/debugactor.js
// Change applied: VALUE SET FORMAT FOR UPDATES
//   - All worldmapactor UPDATE messages now use { updates: [{ path, value }] }
//     instead of { patch: {...} }.
//   - Stateless pure function; no interfaces, no createactor.
// ============================================================

var debugVerbosityConstants = createVerbosityConstants();

function getctx(error, cont) {
  var env = (cont && cont.envsnapshot) ||
    (cont && cont.options && cont.options.context && cont.options.context.env) || {};
  return {
    pipelineid: env.pipelineid || env.agentid ||
      (error && error.diagnostic && error.diagnostic.pipelineid) || 'unknown_pipeline',
    path: [
      (error && error.diagnostic && error.diagnostic.pipelinestage) || 'unknown_stage',
      (error && error.diagnostic && error.diagnostic.blockid) ||
      (error && error.diagnostic && error.diagnostic.elementid) || 'unknown_element'
    ],
    elementid: (error && error.diagnostic && error.diagnostic.blockid) ||
      (error && error.diagnostic && error.diagnostic.elementid) || 'unknown_element'
  };
}

function btn(text, style, onclick) {
  var b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'border:none; padding:10px 20px; cursor:pointer; font-weight:bold; ' + style;
  b.onclick = onclick;
  return b;
}

function ensureOverlay(debugSlice) {
  if (!debugSlice.overlay) {
    var overlay = document.getElementById('debugoverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'debugoverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:10000;display:none;flex-direction:column;';
      document.body.appendChild(overlay);
    }
    debugSlice.overlay = overlay;
  }
  return debugSlice.overlay;
}

// Pure behavior function: (env, message) -> env
function debugbehavior(env, message) {
  logdebug(env, '[DEBUGACTOR]', 'behavior handling action:', message.type);

  var debugSlice = env.debug;

  if (message.type === MESSAGETYPES.PING) {
    logdebug(env, '[DEBUGACTOR]', 'action PING');
    if (message.sender && message.tag) {
      var responseTypePing = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseTypePing, { result: true }, message.tag, 'debugactor');
    }
    return env;
  }

  if (message.type === MESSAGETYPES.INIT_OVERLAY) {
    logdebug(env, '[DEBUGACTOR]', 'action INIT_OVERLAY');
    ensureOverlay(debugSlice);

    if (!debugSlice.globalListenersInstalled) {
      debugSlice.globalListenersInstalled = true;

      window.addEventListener('error', function(e) {
        e.preventDefault();
        logwarn(env, '[DEBUGACTOR]', 'global window error captured:', e.error || e);
        sendInstruction('debugactor', MESSAGETYPES.SHOW, {
          error: e.error || e,
          continuation: null
        }, null, 'window');
      });

      window.addEventListener('unhandledrejection', function(e) {
        if (e.reason && e.reason.diagnostic) {
          e.preventDefault();
          logwarn(env, '[DEBUGACTOR]', 'global unhandled rejection captured:', e.reason);
          sendInstruction('debugactor', MESSAGETYPES.SHOW, {
            error: e.reason,
            continuation: e.reason.diagnostic.continuation || null
          }, null, 'window');
        }
      });
    }

    // Update debug slice via worldmapactor using value set format
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      updates: [{
        path: 'debug',
        value: {
          overlayVisible: false,
          globalListenersInstalled: debugSlice.globalListenersInstalled,
          overlay: debugSlice.overlay,
          currentContinuation: debugSlice.currentContinuation,
          cccState: debugSlice.cccState
        }
      }]
    }, generateTag(), 'debugactor');

    if (message.sender && message.tag) {
      var responseTypeInit = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseTypeInit, { result: true }, message.tag, 'debugactor');
    }
    return env;
  }

  if (message.type === MESSAGETYPES.HIDE) {
    logdebug(env, '[DEBUGACTOR]', 'action HIDE');
    if (debugSlice.overlay) {
      debugSlice.overlay.style.display = 'none';
      debugSlice.overlay.innerHTML = '';
    }
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      updates: [{
        path: 'debug',
        value: {
          overlayVisible: false,
          cccState: { currentContinuation: null },
          currentContinuation: null,
          overlay: debugSlice.overlay,
          globalListenersInstalled: debugSlice.globalListenersInstalled
        }
      }]
    }, generateTag(), 'debugactor');

    if (message.sender && message.tag) {
      var responseTypeHide = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseTypeHide, { result: env }, message.tag, 'debugactor');
    }
    return env;
  }

  if (message.type === MESSAGETYPES.SHOW) {
    loginfo(env, '[DEBUGACTOR]', 'action SHOW debug overlay');
    logdebug(env, '[DEBUGACTOR]', 'action SHOW error:', message.error, 'continuation:', message.continuation);
    var overlay = ensureOverlay(debugSlice);

    overlay.innerHTML = formatdebugtrace(
      message.error,
      (message.error && message.error.diagnostic && message.error.diagnostic.debugtrace) || frames
    );

    var actions = document.createElement('div');
    actions.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

    if (message.continuation) {
      var ctx = getctx(message.error, message.continuation);

      actions.appendChild(btn('RETRY STAGE', 'background:#00ff00;color:#000;', function() {
        logdebug(env, '[DEBUGACTOR]', 'Retrying stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        sendInstruction('executionactor', 'ccc_retry', {
          pipelineid: ctx.pipelineid,
          path: ctx.path,
          elementid: ctx.elementid,
          continuation: message.continuation
        }, null, 'debugactor');
      }));

      actions.appendChild(btn('CONTINUE', 'background:#4488ff;color:#fff;', function() {
        logdebug(env, '[DEBUGACTOR]', 'Continuing stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        sendInstruction('executionactor', 'ccc_continue', {
          pipelineid: ctx.pipelineid,
          path: ctx.path,
          elementid: ctx.elementid,
          continuation: message.continuation
        }, null, 'debugactor');
      }));
    }

    actions.appendChild(btn('ABORT', 'background:#ff5555;color:#fff;', function() {
      var abortCtx = message.continuation
        ? getctx(null, message.continuation)
        : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };
      logdebug(env, '[DEBUGACTOR]', 'Aborting stage:', abortCtx);
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      sendInstruction('executionactor', 'ccc_abort', {
        pipelineid: abortCtx.pipelineid,
        path: abortCtx.path,
        elementid: abortCtx.elementid,
        continuation: message.continuation
      }, null, 'debugactor');
    }));

    overlay.appendChild(actions);
    overlay.style.display = 'flex';

    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
      updates: [{
        path: 'debug',
        value: {
          overlayVisible: true,
          cccState: { currentContinuation: message.continuation || null },
          currentContinuation: message.continuation || null,
          overlay: overlay,
          globalListenersInstalled: debugSlice.globalListenersInstalled
        }
      }]
    }, generateTag(), 'debugactor');

    if (message.sender && message.tag) {
      var responseTypeShow = (message.responseSpec && message.responseSpec.responseType) || 'response';
      sendInstruction(message.sender, responseTypeShow, { result: env }, message.tag, 'debugactor');
    }
    return env;
  }

  if (message.type === MESSAGETYPES.RECOVER) {
    logdebug(env, '[DEBUGACTOR]', 'action RECOVER debug state');
    enqueueDbRestore('actor:state:debug').then(function(maybe) {
      var newDebug = (maybe && maybe.tag === 'JUST') ? maybe.value : {
        overlay: null,
        currentContinuation: null,
        overlayVisible: false,
        cccState: { currentContinuation: null },
        globalListenersInstalled: false
      };
      sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'debug', value: newDebug }]
      }, generateTag(), 'debugactor');
      if (message.sender && message.tag) {
        var responseTypeRecover = (message.responseSpec && message.responseSpec.responseType) || 'response';
        sendInstruction(message.sender, responseTypeRecover, { result: env }, message.tag, 'debugactor');
      }
    }).catch(function(e) {
      logwarn(env, '[DEBUGACTOR]', 'state restore failed:', e);
      if (message.sender && message.tag) {
        var responseTypeErr = (message.responseSpec && message.responseSpec.responseType) || 'response';
        sendInstruction(message.sender, responseTypeErr, { result: env }, message.tag, 'debugactor');
      }
    });
    return env;
  }

  return env;
}

function enqueueDebugPing(responseSpec) {
  var tag = generateTag();
  sendInstruction('debugactor', MESSAGETYPES.PING, {}, tag, 'system', responseSpec);
}

function enqueueDebugRecover(responseSpec) {
  var tag = generateTag();
  sendInstruction('debugactor', MESSAGETYPES.RECOVER, {}, tag, 'system', responseSpec);
}
