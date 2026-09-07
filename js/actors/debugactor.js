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
      // Logs storage
      LOGS: [],
      LOGFILTER: 'all',
      LOGSMAX: 1000,
      LOGVIEWERAUTO: true
    };
  });
}

// ===== Helper: builds log viewer HTML with all styles inlined =====
function buildLogViewerHTML(logs, filter, auto) {
  var filtered = logs;
  if (filter !== 'all') {
    filtered = logs.filter(function(entry) { return entry.level === filter; });
  }
  var display = filtered.slice(-200);
  var html = '';
  // Controls bar with inline styles
  html += '<div style="display:flex;gap:10px;padding:8px 16px;background:#1a1a2e;border-bottom:1px solid #444;flex-wrap:wrap;align-items:center;flex-shrink:0;">';
  html += '<span style="color:#ccc;font-size:13px;">Logs</span>';
  html += '<select id="debuglogfilter" style="background:#2d2d44;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;">';
  html += '<option value="all"' + (filter === 'all' ? ' selected' : '') + '>All</option>';
  html += '<option value="error"' + (filter === 'error' ? ' selected' : '') + '>Errors</option>';
  html += '<option value="warn"' + (filter === 'warn' ? ' selected' : '') + '>Warnings</option>';
  html += '<option value="info"' + (filter === 'info' ? ' selected' : '') + '>Info</option>';
  html += '<option value="debug"' + (filter === 'debug' ? ' selected' : '') + '>Debug</option>';
  html += '</select>';
  html += '<label style="color:#aaa;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;">';
  html += '<input type="checkbox" id="debuglogautoscroll"' + (auto ? ' checked' : '') + '> Auto-scroll';
  html += '</label>';
  html += '<button id="debuglogclear" style="background:#d32f2f;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;">Clear</button>';
  html += '<span style="color:#888;font-size:11px;margin-left:auto;">' + logs.length + ' entries</span>';
  html += '</div>';
  // Log list with inline styles
  html += '<div id="debugloglist" style="flex:1;overflow-y:auto;padding:8px 16px;font-family:\'Courier New\',monospace;font-size:12px;line-height:1.5;background:#0a0a12;">';
  if (display.length === 0) {
    html += '<div style="color:#666;padding:20px;text-align:center;">No logs to display.</div>';
  } else {
    display.forEach(function(entry) {
      var levelClass = entry.level || 'info';
      var color = '#aaa';
      if (levelClass === 'error') color = '#ff5555';
      else if (levelClass === 'warn') color = '#ffaa33';
      else if (levelClass === 'info') color = '#88ccff';
      else if (levelClass === 'debug') color = '#888';
      var time = new Date(entry.timestamp).toLocaleTimeString();
      var msg = entry.message || '';
      var prefix = entry.prefix || '';
      html += '<div style="color:' + color + ';padding:2px 0;border-bottom:1px solid #1a1a2e;word-break:break-all;white-space:pre-wrap;">';
      html += '<span style="color:#666;margin-right:8px;">[' + time + ']</span>';
      if (prefix) html += '<span style="color:#88aaff;margin-right:8px;">' + prefix + '</span>';
      html += '<span>' + msg + '</span>';
      if (entry.data && typeof entry.data === 'object') {
        html += ' <span style="color:#666;font-size:10px;margin-left:8px;">' + JSON.stringify(entry.data) + '</span>';
      }
      html += '</div>';
    });
  }
  html += '</div>';
  return html;
}
// ===== END =====

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

    // Append log viewer panel with all styles inline
    var logViewerHTML = buildLogViewerHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
    var logPanel = document.createElement('div');
    logPanel.id = 'debuglogpanel';
    logPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;border-top:1px solid #444;margin-top:20px;max-height:40vh;background:rgba(0,0,0,0.8);font-family:\'Courier New\',monospace;font-size:12px;color:#eee;';
    logPanel.innerHTML = logViewerHTML;
    OVERLAY.appendChild(logPanel);

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

    // Attach event listeners for log controls
    setTimeout(function() {
      var filterSelect = document.getElementById('debuglogfilter');
      var clearBtn = document.getElementById('debuglogclear');
      var autoCheck = document.getElementById('debuglogautoscroll');
      if (filterSelect) {
        filterSelect.addEventListener('change', function() {
          DEBUGSLICE.LOGFILTER = filterSelect.value;
          var panel = document.getElementById('debuglogpanel');
          if (panel) {
            panel.innerHTML = buildLogViewerHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER, DEBUGSLICE.LOGVIEWERAUTO !== false);
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          DEBUGSLICE.LOGS = [];
          var panel = document.getElementById('debuglogpanel');
          if (panel) {
            panel.innerHTML = buildLogViewerHTML([], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
      if (autoCheck) {
        autoCheck.addEventListener('change', function() {
          DEBUGSLICE.LOGVIEWERAUTO = autoCheck.checked;
          if (DEBUGSLICE.LOGVIEWERAUTO) {
            var list = document.getElementById('debugloglist');
            if (list) list.scrollTop = list.scrollHeight;
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
          }, GENERATETAG(), 'DEBUGACTOR');
        });
      }
    }, 100);

    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECSHOW = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPESHOW = (RESPONSESPECSHOW && (RESPONSESPECSHOW.responsetype || RESPONSESPECSHOW.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'DEBUGACTOR', RESPONSETYPESHOW);
    }
    return ENV;
  }

  // LOGLINE handler
  if (MESSAGE.TYPE === MESSAGETYPES.LOGLINE) {
    logdebug(ENV, '[DEBUGACTOR]', 'ACTION LOGLINE:', MESSAGE.message);
    var entry = {
      level: MESSAGE.level || 'info',
      message: MESSAGE.message || '',
      data: MESSAGE.data || null,
      timestamp: MESSAGE.timestamp || Date.now(),
      prefix: MESSAGE.prefix || ''
    };
    if (!DEBUGSLICE.LOGS) DEBUGSLICE.LOGS = [];
    DEBUGSLICE.LOGS.push(entry);
    if (DEBUGSLICE.LOGS.length > DEBUGSLICE.LOGSMAX) {
      DEBUGSLICE.LOGS = DEBUGSLICE.LOGS.slice(-DEBUGSLICE.LOGSMAX);
    }
    // Update viewer if visible
    if (DEBUGSLICE.OVERLAYVISIBLE && DEBUGSLICE.OVERLAY) {
      var logPanel = document.getElementById('debuglogpanel');
      if (logPanel) {
        var currentFilter = DEBUGSLICE.LOGFILTER || 'all';
        var auto = DEBUGSLICE.LOGVIEWERAUTO !== false;
        logPanel.innerHTML = buildLogViewerHTML(DEBUGSLICE.LOGS, currentFilter, auto);
        if (auto) {
          var list = document.getElementById('debugloglist');
          if (list) list.scrollTop = list.scrollHeight;
        }
        // Re-bind controls
        setTimeout(function() {
          var filterSelect = document.getElementById('debuglogfilter');
          var clearBtn = document.getElementById('debuglogclear');
          var autoCheck = document.getElementById('debuglogautoscroll');
          if (filterSelect) {
            filterSelect.value = currentFilter;
            filterSelect.onchange = function() {
              DEBUGSLICE.LOGFILTER = filterSelect.value;
              var panel = document.getElementById('debuglogpanel');
              if (panel) {
                panel.innerHTML = buildLogViewerHTML(DEBUGSLICE.LOGS, DEBUGSLICE.LOGFILTER, DEBUGSLICE.LOGVIEWERAUTO !== false);
              }
              SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
                UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
              }, GENERATETAG(), 'DEBUGACTOR');
            };
          }
          if (clearBtn) {
            clearBtn.onclick = function() {
              DEBUGSLICE.LOGS = [];
              var panel = document.getElementById('debuglogpanel');
              if (panel) {
                panel.innerHTML = buildLogViewerHTML([], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
              }
              SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
                UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
              }, GENERATETAG(), 'DEBUGACTOR');
            };
          }
          if (autoCheck) {
            autoCheck.checked = DEBUGSLICE.LOGVIEWERAUTO !== false;
            autoCheck.onchange = function() {
              DEBUGSLICE.LOGVIEWERAUTO = autoCheck.checked;
              if (DEBUGSLICE.LOGVIEWERAUTO) {
                var list = document.getElementById('debugloglist');
                if (list) list.scrollTop = list.scrollHeight;
              }
              SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
                UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
              }, GENERATETAG(), 'DEBUGACTOR');
            };
          }
        }, 50);
      }
    }
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'debug', VALUE: DEBUGSLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');
    if (MESSAGE.SENDER && MESSAGE.TAG) {
      var RESPONSESPECLOG = MESSAGE.RESPONSESPEC || MESSAGE.responseSpec;
      var RESPONSETYPELOG = (RESPONSESPECLOG && (RESPONSESPECLOG.responsetype || RESPONSESPECLOG.responseType)) || 'response';
      SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { stored: true }, 'DEBUGACTOR', RESPONSETYPELOG);
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
        GLOBALLISTENERSINSTALLED: false,
        LOGS: [],
        LOGFILTER: 'all',
        LOGSMAX: 1000,
        LOGVIEWERAUTO: true
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
