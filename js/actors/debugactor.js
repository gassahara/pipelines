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
  return ENSUREENVSLICE(ENV, 'debug', function() {
    return {
      OVERLAY: null,
      CURRENTCONTINUATION: null,
      OVERLAYVISIBLE: false,
      CCCSTATE: { CURRENTCONTINUATION: null },
      GLOBALLISTENERSINSTALLED: false,
      // ===== ADDED: log storage fields =====
      LOGS: [],
      LOGFILTER: 'all',
      LOGSMAX: 1000,
      LOGVIEWERAUTO: true
      // ===== END ADDED =====
    };
  });
}

// ===== ADDED: helper to build log viewer HTML with inline styles =====
function BUILDLOGVIEWERHTML(LOGS, FILTER, AUTO) {
  var FILTERED = LOGS;
  if (FILTER !== 'all') {
    FILTERED = LOGS.filter(function(ENTRY) { return ENTRY.LEVEL === FILTER; });
  }
  var DISPLAY = FILTERED.slice(-200);
  var HTML = '';
  // Controls bar with inline styles
  HTML += '<div style="display:flex;gap:10px;padding:8px 16px;background:#1a1a2e;border-bottom:1px solid #444;flex-wrap:wrap;align-items:center;flex-shrink:0;">';
  HTML += '<span style="color:#ccc;font-size:13px;">Logs</span>';
  HTML += '<select id="debuglogfilter" style="background:#2d2d44;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">';
  HTML += '<option value="all"' + (FILTER === 'all' ? ' selected' : '') + '>All</option>';
  HTML += '<option value="error"' + (FILTER === 'error' ? ' selected' : '') + '>Errors</option>';
  HTML += '<option value="warn"' + (FILTER === 'warn' ? ' selected' : '') + '>Warnings</option>';
  HTML += '<option value="info"' + (FILTER === 'info' ? ' selected' : '') + '>Info</option>';
  HTML += '<option value="debug"' + (FILTER === 'debug' ? ' selected' : '') + '>Debug</option>';
  HTML += '</select>';
  HTML += '<label style="color:#aaa;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">';
  HTML += '<input type="checkbox" id="debuglogautoscroll"' + (AUTO ? ' checked' : '') + '> Auto-scroll';
  HTML += '</label>';
  HTML += '<button id="debuglogclear" style="background:#d32f2f;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;">Clear</button>';
  HTML += '<span style="color:#888;font-size:11px;margin-left:auto;">' + LOGS.length + ' entries</span>';
  HTML += '</div>';
  // Log list with inline styles
  HTML += '<div id="debugloglist" style="flex:1;overflow-y:auto;padding:8px 16px;font-family:\'Courier New\',monospace;font-size:12px;line-height:1.5;background:#0a0a12;">';
  if (DISPLAY.length === 0) {
    HTML += '<div style="color:#666;padding:20px;text-align:center;">No logs to display.</div>';
  } else {
    DISPLAY.forEach(function(ENTRY) {
      var LEVELCLASS = ENTRY.LEVEL || 'info';
      var COLOR = '#aaa';
      if (LEVELCLASS === 'error') COLOR = '#ff5555';
      else if (LEVELCLASS === 'warn') COLOR = '#ffaa33';
      else if (LEVELCLASS === 'info') COLOR = '#88ccff';
      else if (LEVELCLASS === 'debug') COLOR = '#888';
      var TIME = new Date(ENTRY.TIMESTAMP).toLocaleTimeString();
      var MSG = ENTRY.MESSAGE || '';
      var PREFIX = ENTRY.PREFIX || '';
      HTML += '<div style="color:' + COLOR + ';padding:2px 0;border-bottom:1px solid #1a1a2e;word-break:break-all;white-space:pre-wrap;">';
      HTML += '<span style="color:#666;margin-right:8px;">[' + TIME + ']</span>';
      if (PREFIX) HTML += '<span style="color:#88aaff;margin-right:8px;">' + PREFIX + '</span>';
      HTML += '<span>' + MSG + '</span>';
      if (ENTRY.DATA && typeof ENTRY.DATA === 'object') {
        HTML += ' <span style="color:#666;font-size:10px;margin-left:8px;">' + JSON.stringify(ENTRY.DATA) + '</span>';
      }
      HTML += '</div>';
    });
  }
  HTML += '</div>';
  return HTML;
}
// ===== END ADDED =====

// Behavior function: (env, message) -> env | promise<env>
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

  if (MESSAGE.TYPE === MESSAGETYPES.INITOVERLAY) {
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
            CONTINUATION: E.reason.diagnostic.CONTINUATION || null
          }, null, 'window');
        }
      });
    }

    DEBUGSLICE.OVERLAYVISIBLE = false;
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
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
      UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
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

    // ===== ADDED: Append log viewer panel below error trace =====
    var LOGVIEWERHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
    var LOGPANEL = document.createElement('div');
    LOGPANEL.id = 'debuglogpanel';
    LOGPANEL.style.cssText = 'flex:1;display:flex;flex-direction:column;border-top:1px solid #444;margin-top:20px;max-height:40vh;background:rgba(0,0,0,0.8);font-family:\'Courier New\',monospace;font-size:12px;color:#eee;';
    LOGPANEL.innerHTML = LOGVIEWERHTML;
    OVERLAY.appendChild(LOGPANEL);
    // ===== END ADDED =====

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
      UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');

    // ===== ADDED: attach event listeners for log controls =====
    setTimeout(function() {
      var FILTERSELECT = document.getElementById('debuglogfilter');
      var CLEARBTN = document.getElementById('debuglogclear');
      var AUTOCHECK = document.getElementById('debuglogautoscroll');
      if (FILTERSELECT) {
        FILTERSELECT.addEventListener('change', function() {
          DEBUGSLICE.LOGFILTER = FILTERSELECT.value;
          var PANEL = document.getElementById('debuglogpanel');
          if (PANEL) {
            PANEL.innerHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER, DEBUGSLICE.LOGVIEWERAUTO !== false);
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
      if (CLEARBTN) {
        CLEARBTN.addEventListener('click', function() {
          DEBUGSLICE.LOGS = [];
          var PANEL = document.getElementById('debuglogpanel');
          if (PANEL) {
            PANEL.innerHTML = BUILDLOGVIEWERHTML([], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
      if (AUTOCHECK) {
        AUTOCHECK.addEventListener('change', function() {
          DEBUGSLICE.LOGVIEWERAUTO = AUTOCHECK.checked;
          if (DEBUGSLICE.LOGVIEWERAUTO) {
            var LIST = document.getElementById('debugloglist');
            if (LIST) LIST.scrollTop = LIST.scrollHeight;
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
    }, 100);
    // ===== END ADDED =====

    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECSHOW = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPESHOW = (RESPONSESPECSHOW && (RESPONSESPECSHOW.responsetype || RESPONSESPECSHOW.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPESHOW);
    }
    return ENV;
  }

  // ===== ADDED: LOGLINE handler =====
  if (MESSAGE.TYPE === MESSAGETYPES.LOGLINE) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION LOGLINE:', MESSAGE.MESSAGE);
    var ENTRY = {
      LEVEL: MESSAGE.LEVEL || 'info',
      MESSAGE: MESSAGE.MESSAGE || '',
      DATA: MESSAGE.DATA || null,
      TIMESTAMP: MESSAGE.TIMESTAMP || Date.now(),
      PREFIX: MESSAGE.PREFIX || ''
    };
    if (!DEBUGSLICE.LOGS) DEBUGSLICE.LOGS = [];
    DEBUGSLICE.LOGS.push(ENTRY);
    if (DEBUGSLICE.LOGS.length > DEBUGSLICE.LOGSMAX) {
      DEBUGSLICE.LOGS = DEBUGSLICE.LOGS.slice(-DEBUGSLICE.LOGSMAX);
    }
    // Update viewer if visible
    if (DEBUGSLICE.OVERLAYVISIBLE && DEBUGSLICE.OVERLAY) {
      var LOGPANEL = document.getElementById('debuglogpanel');
      if (LOGPANEL) {
        var CURRENTFILTER = DEBUGSLICE.LOGFILTER || 'all';
        var AUTO = DEBUGSLICE.LOGVIEWERAUTO !== false;
        LOGPANEL.innerHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS, CURRENTFILTER, AUTO);
        if (AUTO) {
          var LIST = document.getElementById('debugloglist');
          if (LIST) LIST.scrollTop = LIST.scrollHeight;
        }
        // Re-bind controls (simplified: use event listeners that reference functions)
      }
    }
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');
    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECLOG = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPELOG = (RESPONSESPECLOG && (RESPONSESPECLOG.responsetype || RESPONSESPECLOG.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { stored: true }, 'DEBUGACTOR', RESPONSETYPELOG);
    }
    return ENV;
  }
  // ===== END ADDED =====

  if (MESSAGE.TYPE === MESSAGETYPES.RECOVER) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION RECOVER DEBUG STATE');
    DBRESTORE('actor:state:debug').then(function(SAVED) {
      var NEWDEBUG = (SAVED !== null && SAVED !== undefined) ? SAVED : {
        OVERLAY: null,
        CURRENTCONTINUATION: null,
        OVERLAYVISIBLE: false,
        CCCSTATE: { CURRENTCONTINUATION: null },
        GLOBALLISTENERSINSTALLED: false,
        // ===== ADDED: default log state =====
        LOGS: [],
        LOGFILTER: 'all',
        LOGSMAX: 1000,
        LOGVIEWERAUTO: true
        // ===== END ADDED =====
      };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'DEBUG', VALUE: NEWDEBUG }]
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
