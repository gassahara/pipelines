var DEBUGVERBOSITYCONSTANTS = createVerbosityConstants();

function GETCTX(error, cont) {
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

function BTN(text, style, onclick) {
  var b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'border:none; padding:10px 20px; cursor:pointer; font-weight:bold; ' + style;
  b.onclick = onclick;
  return b;
}

function ENSUREOVERLAY(debugSlice) {
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

function ENSUREDEBUGSLICE(env) {
  return ensureEnvSlice(env, 'debug', function() {
    return {
      overlay: null,
      currentContinuation: null,
      overlayVisible: false,
      cccState: { currentContinuation: null },
      globalListenersInstalled: false
    };
  });
}

// Pure behavior function: (env, message) -> env
function DEBUGBEHAVIOR(env, message) {
  logdebug(env, '[DEBUGACTOR]', 'behavior handling action:', message.type);

  var debugSlice = ENSUREDEBUGSLICE(env);

  if (message.type === MESSAGETYPES.PING) {
    logdebug(env, '[DEBUGACTOR]', 'action PING');
    if (message.sender && message.tag) {
      var responseTypePing = (message.responseSpec && message.responseSpec.responseType) || 'response';
      SENDRESPONSE(message.sender, message.tag, true, 'DEBUGACTOR', responseTypePing);
    }
    return env;
  }

  if (message.type === MESSAGETYPES.INIT_OVERLAY) {
    logdebug(env, '[DEBUGACTOR]', 'action INIT_OVERLAY');
    ENSUREOVERLAY(debugSlice);

    if (!debugSlice.globalListenersInstalled) {
      debugSlice.globalListenersInstalled = true;

      window.addEventListener('error', function(e) {
        e.preventDefault();
        logwarn(env, '[DEBUGACTOR]', 'global window error captured:', e.error || e);
        SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.SHOW, {
          error: e.error || e,
          continuation: null
        }, null, 'window');
      });

      window.addEventListener('unhandledrejection', function(e) {
        if (e.reason && e.reason.diagnostic) {
          e.preventDefault();
          logwarn(env, '[DEBUGACTOR]', 'global unhandled rejection captured:', e.reason);
          SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.SHOW, {
            error: e.reason,
            continuation: e.reason.diagnostic.continuation || null
          }, null, 'window');
        }
      });
    }

    debugSlice.overlayVisible = false;
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'debug', value: debugSlice }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (message.sender && message.tag) {
      var responseTypeInit = (message.responseSpec && message.responseSpec.responseType) || 'response';
      SENDRESPONSE(message.sender, message.tag, true, 'DEBUGACTOR', responseTypeInit);
    }
    return env;
  }

  if (message.type === MESSAGETYPES.HIDE) {
    logdebug(env, '[DEBUGACTOR]', 'action HIDE');
    if (debugSlice.overlay) {
      debugSlice.overlay.style.display = 'none';
      debugSlice.overlay.innerHTML = '';
    }
    debugSlice.overlayVisible = false;
    debugSlice.cccState.currentContinuation = null;
    debugSlice.currentContinuation = null;

    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'debug', value: debugSlice }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (message.sender && message.tag) {
      var responseTypeHide = (message.responseSpec && message.responseSpec.responseType) || 'response';
      SENDRESPONSE(message.sender, message.tag, env, 'DEBUGACTOR', responseTypeHide);
    }
    return env;
  }

  if (message.type === MESSAGETYPES.SHOW) {
    loginfo(env, '[DEBUGACTOR]', 'action SHOW debug overlay');
    logdebug(env, '[DEBUGACTOR]', 'action SHOW error:', message.error, 'continuation:', message.continuation);
    var overlay = ENSUREOVERLAY(debugSlice);

    overlay.innerHTML = formatdebugtrace(
      message.error,
      (message.error && message.error.diagnostic && message.error.diagnostic.debugtrace) || frames
    );

    var actions = document.createElement('div');
    actions.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

    if (message.continuation) {
      var ctx = GETCTX(message.error, message.continuation);

      actions.appendChild(BTN('RETRY STAGE', 'background:#00ff00;color:#000;', function() {
        logdebug(env, '[DEBUGACTOR]', 'Retrying stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        SENDINSTRUCTION('EXECUTIONACTOR', 'ccc_retry', {
          pipelineid: ctx.pipelineid,
          path: ctx.path,
          elementid: ctx.elementid,
          continuation: message.continuation
        }, null, 'DEBUGACTOR');
      }));

      actions.appendChild(BTN('CONTINUE', 'background:#4488ff;color:#fff;', function() {
        logdebug(env, '[DEBUGACTOR]', 'Continuing stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        SENDINSTRUCTION('EXECUTIONACTOR', 'ccc_continue', {
          pipelineid: ctx.pipelineid,
          path: ctx.path,
          elementid: ctx.elementid,
          continuation: message.continuation
        }, null, 'DEBUGACTOR');
      }));
    }

    actions.appendChild(BTN('ABORT', 'background:#ff5555;color:#fff;', function() {
      var abortCtx = message.continuation
        ? GETCTX(null, message.continuation)
        : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };
      logdebug(env, '[DEBUGACTOR]', 'Aborting stage:', abortCtx);
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      SENDINSTRUCTION('EXECUTIONACTOR', 'ccc_abort', {
        pipelineid: abortCtx.pipelineid,
        path: abortCtx.path,
        elementid: abortCtx.elementid,
        continuation: message.continuation
      }, null, 'DEBUGACTOR');
    }));

    overlay.appendChild(actions);
    overlay.style.display = 'flex';

    debugSlice.overlayVisible = true;
    debugSlice.cccState.currentContinuation = message.continuation || null;
    debugSlice.currentContinuation = message.continuation || null;

    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'debug', value: debugSlice }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (message.sender && message.tag) {
      var responseTypeShow = (message.responseSpec && message.responseSpec.responseType) || 'response';
      SENDRESPONSE(message.sender, message.tag, env, 'DEBUGACTOR', responseTypeShow);
    }
    return env;
  }

  if (message.type === MESSAGETYPES.RECOVER) {
    logdebug(env, '[DEBUGACTOR]', 'action RECOVER debug state');
    DBRESTORE('actor:state:debug').then(function(saved) {
      var newDebug = (saved !== null && saved !== undefined) ? saved : {
        overlay: null,
        currentContinuation: null,
        overlayVisible: false,
        cccState: { currentContinuation: null },
        globalListenersInstalled: false
      };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'debug', value: newDebug }]
      }, GENERATETAG(), 'DEBUGACTOR');
      if (message.sender && message.tag) {
        var responseTypeRecover = (message.responseSpec && message.responseSpec.responseType) || 'response';
        SENDRESPONSE(message.sender, message.tag, env, 'DEBUGACTOR', responseTypeRecover);
      }
    }).catch(function(e) {
      logwarn(env, '[DEBUGACTOR]', 'state restore failed:', e);
      if (message.sender && message.tag) {
        var responseTypeErr = (message.responseSpec && message.responseSpec.responseType) || 'response';
        SENDRESPONSE(message.sender, message.tag, env, 'DEBUGACTOR', responseTypeErr);
      }
    });
    return env;
  }

  return env;
}

function ENQUEUEDEBUGPING(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.PING, {}, tag, 'system', responseSpec);
}

function ENQUEUEDEBUGRECOVER(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.RECOVER, {}, tag, 'system', responseSpec);
}
