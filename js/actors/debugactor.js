var DEBUGVERBOSITYCONSTANTS = createverbosityconstants();

function GETCTX(ERROR, CONT) {
  var ENV = (CONT && CONT.ENVSNAPSHOT) ||
    (CONT && CONT.OPTIONS && CONT.OPTIONS.CONTEXT && CONT.OPTIONS.CONTEXT.ENV) || {};
  return {
    PIPELINEID: ENV.PIPELINEID || ENV.AGENTID ||
      (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.PIPELINEID) || 'UNKNOWNPIPELINE',
    PATH: [
      (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.PIPELINESTAGE) || 'UNKNOWNSTAGE',
      (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.BLOCKID) ||
      (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.ELEMENTID) || 'UNKNOWNELEMENT'
    ],
    ELEMENTID: (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.BLOCKID) ||
      (ERROR && ERROR.DIAGNOSTIC && ERROR.DIAGNOSTIC.ELEMENTID) || 'UNKNOWNELEMENT'
  };
}

function BTN(TEXT, STYLE, ONCLICK) {
  var B = document.createElement('button');
  B.textContent = TEXT;
  B.style.cssText = 'border:none; padding:10px 20px; cursor:pointer; font-weight:bold; ' + STYLE;
  B.onclick = ONCLICK;
  return B;
}

function ENSUREOVERLAY(DEBUGSLICE) {
  if (!DEBUGSLICE.OVERLAY) {
    var OVERLAY = document.getElementById('debugoverlay');
    if (!OVERLAY) {
      OVERLAY = document.createElement('div');
      OVERLAY.id = 'debugoverlay';
      OVERLAY.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:10000;display:none;flex-direction:column;';
      document.body.appendChild(OVERLAY);
    }
    DEBUGSLICE.OVERLAY = OVERLAY;
  }
  return DEBUGSLICE.OVERLAY;
}

function ENSUREDEBUGSLICE(ENV) {
  return ensureenvslice(ENV, 'debug', function() {
    return {
      OVERLAY: null,
      CURRENTCONTINUATION: null,
      OVERLAYVISIBLE: false,
      CCCSTATE: { CURRENTCONTINUATION: null },
      GLOBALLISTENERSINSTALLED: false
    };
  });
}

// Pure behavior function: (env, message) -> env
function DEBUGBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[DEBUGACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);

  var DEBUGSLICE = ENSUREDEBUGSLICE(ENV);

  if (MESSAGE.TYPE === MESSAGETYPES.PING) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION PING');
    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECPING = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPEPING = (RESPONSESPECPING && (RESPONSESPECPING.responsetype || RESPONSESPECPING.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, true, 'DEBUGACTOR', RESPONSETYPEPING);
    }
    return ENV;
  }

  if (MESSAGE.TYPE === MESSAGETYPES.INITOVERLAY || MESSAGE.TYPE === MESSAGETYPES.INIT_OVERLAY) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION INITOVERLAY');
    ENSUREOVERLAY(DEBUGSLICE);

    if (!DEBUGSLICE.GLOBALLISTENERSINSTALLED) {
      DEBUGSLICE.GLOBALLISTENERSINSTALLED = true;

      window.addEventListener('error', function(E) {
        E.preventDefault();
        logwarn(ENV, '[DEBUGACTOR]', 'GLOBAL WINDOW ERROR CAPTURED:', E.error || E);
        SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.SHOW, {
          ERROR: E.error || E,
          CONTINUATION: null
        }, null, 'window');
      });

      window.addEventListener('unhandledrejection', function(E) {
        if (E.reason && E.reason.diagnostic) {
          E.preventDefault();
          logwarn(ENV, '[DEBUGACTOR]', 'GLOBAL UNHANDLED REJECTION CAPTURED:', E.reason);
          SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.SHOW, {
            ERROR: E.reason,
            CONTINUATION: E.reason.diagnostic.continuation || null
          }, null, 'window');
        }
      });
    }

    DEBUGSLICE.OVERLAYVISIBLE = false;
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECINIT = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPEINIT = (RESPONSESPECINIT && (RESPONSESPECINIT.responsetype || RESPONSESPECINIT.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, true, 'DEBUGACTOR', RESPONSETYPEINIT);
    }
    return ENV;
  }

  if (MESSAGE.TYPE === MESSAGETYPES.HIDE) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION HIDE');
    if (DEBUGSLICE.OVERLAY) {
      DEBUGSLICE.OVERLAY.style.display = 'none';
      DEBUGSLICE.OVERLAY.innerHTML = '';
    }
    DEBUGSLICE.OVERLAYVISIBLE = false;
    DEBUGSLICE.CCCSTATE.CURRENTCONTINUATION = null;
    DEBUGSLICE.CURRENTCONTINUATION = null;

    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECHIDE = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPEHIDE = (RESPONSESPECHIDE && (RESPONSESPECHIDE.responsetype || RESPONSESPECHIDE.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPEHIDE);
    }
    return ENV;
  }

  if (MESSAGE.TYPE === MESSAGETYPES.SHOW) {
    loginfo(ENV, '[DEBUGACTOR]', 'ACTION SHOW DEBUG OVERLAY');
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION SHOW ERROR:', MESSAGE.ERROR, 'CONTINUATION:', MESSAGE.CONTINUATION);
    var OVERLAY = ENSUREOVERLAY(DEBUGSLICE);

    OVERLAY.innerHTML = formatdebugtrace(
      MESSAGE.ERROR,
      (MESSAGE.ERROR && MESSAGE.ERROR.DIAGNOSTIC && MESSAGE.ERROR.DIAGNOSTIC.DEBUGTRACE) || []
    );

    var ACTIONS = document.createElement('div');
    ACTIONS.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

    if (MESSAGE.CONTINUATION) {
      var CTX = GETCTX(MESSAGE.ERROR, MESSAGE.CONTINUATION);

      ACTIONS.appendChild(BTN('RETRY STAGE', 'background:#00ff00;color:#000;', function() {
        logdebug(ENV, '[DEBUGACTOR]', 'RETRYING STAGE:', CTX);
        OVERLAY.style.display = 'none';
        OVERLAY.innerHTML = '';
        SENDINSTRUCTION('EXECUTIONACTOR', 'CCCRETRY', {
          PIPELINEID: CTX.PIPELINEID,
          PATH: CTX.PATH,
          ELEMENTID: CTX.ELEMENTID,
          CONTINUATION: MESSAGE.CONTINUATION
        }, null, 'DEBUGACTOR');
      }));

      ACTIONS.appendChild(BTN('CONTINUE', 'background:#4488ff;color:#fff;', function() {
        logdebug(ENV, '[DEBUGACTOR]', 'CONTINUING STAGE:', CTX);
        OVERLAY.style.display = 'none';
        OVERLAY.innerHTML = '';
        SENDINSTRUCTION('EXECUTIONACTOR', 'CCCCONTINUE', {
          PIPELINEID: CTX.PIPELINEID,
          PATH: CTX.PATH,
          ELEMENTID: CTX.ELEMENTID,
          CONTINUATION: MESSAGE.CONTINUATION
        }, null, 'DEBUGACTOR');
      }));
    }

    ACTIONS.appendChild(BTN('ABORT', 'background:#ff5555;color:#fff;', function() {
      var ABORTCTX = MESSAGE.CONTINUATION
        ? GETCTX(null, MESSAGE.CONTINUATION)
        : { PIPELINEID: 'unknownpipeline', PATH: ['unknownstage', 'unknownelement'], ELEMENTID: 'unknownelement' };
      logdebug(ENV, '[DEBUGACTOR]', 'ABORTING STAGE:', ABORTCTX);
      OVERLAY.style.display = 'none';
      OVERLAY.innerHTML = '';
      SENDINSTRUCTION('EXECUTIONACTOR', 'CCCABORT', {
        PIPELINEID: ABORTCTX.PIPELINEID,
        PATH: ABORTCTX.PATH,
        ELEMENTID: ABORTCTX.ELEMENTID,
        CONTINUATION: MESSAGE.CONTINUATION
      }, null, 'DEBUGACTOR');
    }));

    OVERLAY.appendChild(ACTIONS);
    OVERLAY.style.display = 'flex';

    DEBUGSLICE.OVERLAYVISIBLE = true;
    DEBUGSLICE.CCCSTATE.CURRENTCONTINUATION = MESSAGE.CONTINUATION || null;
    DEBUGSLICE.CURRENTCONTINUATION = MESSAGE.CONTINUATION || null;

    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');

    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECSHOW = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPESHOW = (RESPONSESPECSHOW && (RESPONSESPECSHOW.responsetype || RESPONSESPECSHOW.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPESHOW);
    }
    return ENV;
  }

  if (MESSAGE.TYPE === MESSAGETYPES.RECOVER) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION RECOVER DEBUG STATE');
    DBRESTORE('actor:state:debug').then(function(SAVED) {
      var NEWDEBUG = (SAVED !== null && SAVED !== undefined) ? SAVED : {
        OVERLAY: null,
        CURRENTCONTINUATION: null,
        OVERLAYVISIBLE: false,
        CCCSTATE: { CURRENTCONTINUATION: null },
        GLOBALLISTENERSINSTALLED: false
      };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'debug', VALUE: NEWDEBUG }]
      }, GENERATETAG(), 'DEBUGACTOR');
      if (MESSAGE.SENDER && MESSAGE.TAG) {
        var RESPONSESPECRECOVER = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
        var RESPONSETYPERECOVER = (RESPONSESPECRECOVER && (RESPONSESPECRECOVER.responsetype || RESPONSESPECRECOVER.responseType)) || 'response';
        SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPERECOVER);
      }
    }).catch(function(E) {
      logwarn(ENV, '[DEBUGACTOR]', 'STATE RESTORE FAILED:', E);
      if (MESSAGE.SENDER && MESSAGE.TAG) {
        var RESPONSESPECERR = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
        var RESPONSETYPEERR = (RESPONSESPECERR && (RESPONSESPECERR.responsetype || RESPONSESPECERR.responseType)) || 'response';
        SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPEERR);
      }
    });
    return ENV;
  }

  return ENV;
}

function ENQUEUEDEBUGPING(RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.PING, {}, TAG, 'system', RESPONSESPEC);
}

function ENQUEUEDEBUGRECOVER(RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.RECOVER, {}, TAG, 'system', RESPONSESPEC);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEBUGVERBOSITYCONSTANTS: DEBUGVERBOSITYCONSTANTS,
    GETCTX: GETCTX,
    BTN: BTN,
    ENSUREOVERLAY: ENSUREOVERLAY,
    ENSUREDEBUGSLICE: ENSUREDEBUGSLICE,
    DEBUGBEHAVIOR: DEBUGBEHAVIOR,
    ENQUEUEDEBUGPING: ENQUEUEDEBUGPING,
    ENQUEUEDEBUGRECOVER: ENQUEUEDEBUGRECOVER
  };
}
