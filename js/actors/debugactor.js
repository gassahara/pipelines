var INITOVERLAYTYPE = messagetype('INITOVERLAY', {});
var SHOWTYPE = messagetype('SHOW', {
  ERROR: objecttype(),
  CONTINUATION: optionaltype(objecttype())
});
var HIDETYPE = messagetype('HIDE', {});
var LOGLINETYPE = messagetype('LOGLINE', {
  LEVEL: stringtype(),
  MESSAGE: stringtype(),
  DATA: optionaltype(objecttype()),
  TIMESTAMP: numbertype(),
  PREFIX: optionaltype(stringtype()),
  ITEMS: optionaltype(arraytype())
});
var RECOVERTYPE = messagetype('RECOVER', {});

REGISTERMESSAGETYPE(INITOVERLAYTYPE);
REGISTERMESSAGETYPE(SHOWTYPE);
REGISTERMESSAGETYPE(HIDETYPE);
REGISTERMESSAGETYPE(LOGLINETYPE);
REGISTERMESSAGETYPE(RECOVERTYPE);

SETBATCHWINDOW('LOGLINE', 250);

// @proposal=P16 — bounded log storage.
var DEBUGLOGSMAX = 200;
var DEBUGLOGDATAMAX = 2048;
var DEBUGSLICEUPDATEDEBOUNCE = 500;
var DEBUGSLICEUPDATETIMER = null;
var DEBUGSLICEUPDATEENV = null;

function TRUNCATELOGDATA(DATA) {
  if (DATA === null || DATA === undefined) return DATA;
  if (typeof DATA !== 'object') {
    if (typeof DATA === 'string' && DATA.length > DEBUGLOGDATAMAX) return DATA.slice(0, DEBUGLOGDATAMAX) + '…[truncated]';
    return DATA;
  }
  var SERIALIZED;
  try { SERIALIZED = JSON.stringify(DATA); } catch (e) { return '[UNSERIALIZABLE]'; }
  if (SERIALIZED.length <= DEBUGLOGDATAMAX) return DATA;
  return { TRUNCATED: true, ORIGINALLENGTH: SERIALIZED.length, PREVIEW: SERIALIZED.slice(0, 512) + '…' };
}

function SCHEDULEDEBUGSLICEUPDATE(ENV) {
  DEBUGSLICEUPDATEENV = ENV;
  if (DEBUGSLICEUPDATETIMER) return;
  DEBUGSLICEUPDATETIMER = setTimeout(function() {
    DEBUGSLICEUPDATETIMER = null;
    var TARGETENV = DEBUGSLICEUPDATEENV;
    DEBUGSLICEUPDATEENV = null;
    if (!TARGETENV) return;
    var SLICE = TARGETENV.DEBUG;
    if (!SLICE) return;
    SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
      UPDATES: [{ PATH: 'DEBUG', VALUE: SLICE }]
    }, GENERATETAG(), 'DEBUGACTOR');
  }, DEBUGSLICEUPDATEDEBOUNCE);
}

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
      LOGS: [],
      LOGFILTER: 'all',
      LOGSMAX: DEBUGLOGSMAX,
      LOGVIEWERAUTO: true
    };
  });
}

function BUILDLOGVIEWERHTML(LOGS, FILTER, AUTO) {
  var FILTERED = LOGS;
  if (FILTER !== 'all') FILTERED = LOGS.filter(function(ENTRY) { return ENTRY.LEVEL === FILTER; });
  var DISPLAY = FILTERED.slice(-200);
  var HTML = '';
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
      if (ENTRY.DATA && typeof ENTRY.DATA === 'object') HTML += ' <span style="color:#666;font-size:10px;margin-left:8px;">' + JSON.stringify(ENTRY.DATA) + '</span>';
      HTML += '</div>';
    });
  }
  HTML += '</div>';
  return HTML;
}

// ============================================================
// §1 — Message handlers (P64, P-ACTOR-FLOW-002)
// ============================================================
//
// Handlers return { ENV, RESPONSE } or ENV or Promise<…>. Response
// emission is handled by DISPATCHRESPOND; a response with no SENDER/TAG
// is silently suppressed by the dispatcher.

function DEBUGBEHAVIORPING(ENV, ARGS) {
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION PING');
  return { ENV: ENV, RESPONSE: true };
}

function DEBUGBEHAVIORINITOVERLAY(ENV, ARGS) {
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION INITOVERLAY');
  var NEXTENV = ENSUREDEBUGSLICE(ENV);
  var DEBUGSLICE = NEXTENV.debug;
  ENSUREOVERLAY(DEBUGSLICE);

  if (!DEBUGSLICE.GLOBALLISTENERSINSTALLED) {
    DEBUGSLICE.GLOBALLISTENERSINSTALLED = true;
    // Listener registration is a one-time fire-and-forget; the listeners
    // dispatch SENDINSTRUCTION later, so their effect flows through the
    // transport, not through this handler's return.
    window.addEventListener('error', function(E) {
      E.preventDefault();
      logwarn(ENV, '[DEBUGACTOR]', 'GLOBAL WINDOW ERROR CAPTURED:', E.error || E);
      SENDINSTRUCTION('DEBUGACTOR', 'SHOW', { ERROR: E.error || E, CONTINUATION: null }, null, 'window');
    });
    window.addEventListener('unhandledrejection', function(E) {
      if (E.reason && E.reason.diagnostic) {
        E.preventDefault();
        logwarn(ENV, '[DEBUGACTOR]', 'GLOBAL UNHANDLED REJECTION CAPTURED:', E.reason);
        SENDINSTRUCTION('DEBUGACTOR', 'SHOW', { ERROR: E.reason, CONTINUATION: E.reason.diagnostic.CONTINUATION || null }, null, 'window');
      }
    });
  }

  DEBUGSLICE.OVERLAYVISIBLE = false;
  SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
    UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
  }, GENERATETAG(), 'DEBUGACTOR');

  return { ENV: NEXTENV, RESPONSE: true };
}

function DEBUGBEHAVIORHIDE(ENV, ARGS) {
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION HIDE');
  var NEXTENV = ENSUREDEBUGSLICE(ENV);
  var DEBUGSLICE = NEXTENV.debug;
  if (DEBUGSLICE.OVERLAY) {
    DEBUGSLICE.OVERLAY.style.display = 'none';
    DEBUGSLICE.OVERLAY.innerHTML = '';
  }
  DEBUGSLICE.OVERLAYVISIBLE = false;
  DEBUGSLICE.CCCSTATE.CURRENTCONTINUATION = null;
  DEBUGSLICE.CURRENTCONTINUATION = null;

  SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
    UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
  }, GENERATETAG(), 'DEBUGACTOR');

  return { ENV: NEXTENV, RESPONSE: NEXTENV };
}

function DEBUGBEHAVIORSHOW(ENV, ARGS) {
  loginfo(ENV, '[DEBUGACTOR]', 'ACTION SHOW DEBUG OVERLAY');
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION SHOW ERROR:', ARGS.ERROR, 'CONTINUATION:', ARGS.CONTINUATION);
  var NEXTENV = ENSUREDEBUGSLICE(ENV);
  var DEBUGSLICE = NEXTENV.debug;
  var OVERLAY = ENSUREOVERLAY(DEBUGSLICE);

  OVERLAY.innerHTML = formatdebugtrace(
    ARGS.ERROR,
    (ARGS.ERROR && ARGS.ERROR.DIAGNOSTIC && ARGS.ERROR.DIAGNOSTIC.DEBUGTRACE) || []
  );

  var LOGVIEWERHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
  var LOGPANEL = document.createElement('div');
  LOGPANEL.id = 'debuglogpanel';
  LOGPANEL.style.cssText = 'flex:1;display:flex;flex-direction:column;border-top:1px solid #444;margin-top:20px;max-height:40vh;background:rgba(0,0,0,0.8);font-family:\'Courier New\',monospace;font-size:12px;color:#eee;';
  LOGPANEL.innerHTML = LOGVIEWERHTML;
  OVERLAY.appendChild(LOGPANEL);

  var ACTIONS = document.createElement('div');
  ACTIONS.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

  if (ARGS.CONTINUATION) {
    var CTX = GETCTX(ARGS.ERROR, ARGS.CONTINUATION);
    ACTIONS.appendChild(BTN('RETRY STAGE', 'background:#00ff00;color:#000;', function() {
      logdebug(ENV, '[DEBUGACTOR]', 'RETRYING STAGE:', CTX);
      OVERLAY.style.display = 'none';
      OVERLAY.innerHTML = '';
      SENDINSTRUCTION('EXECUTIONACTOR', 'CCCRETRY', { PIPELINEID: CTX.PIPELINEID, PATH: CTX.PATH, ELEMENTID: CTX.ELEMENTID, CONTINUATION: ARGS.CONTINUATION }, null, 'DEBUGACTOR');
    }));
    ACTIONS.appendChild(BTN('CONTINUE', 'background:#4488ff;color:#fff;', function() {
      logdebug(ENV, '[DEBUGACTOR]', 'CONTINUING STAGE:', CTX);
      OVERLAY.style.display = 'none';
      OVERLAY.innerHTML = '';
      SENDINSTRUCTION('EXECUTIONACTOR', 'CCCCONTINUE', { PIPELINEID: CTX.PIPELINEID, PATH: CTX.PATH, ELEMENTID: CTX.ELEMENTID, CONTINUATION: ARGS.CONTINUATION }, null, 'DEBUGACTOR');
    }));
  }

  ACTIONS.appendChild(BTN('ABORT', 'background:#ff5555;color:#fff;', function() {
    var ABORTCTX = ARGS.CONTINUATION ? GETCTX(null, ARGS.CONTINUATION) : { PIPELINEID: 'unknownpipeline', PATH: ['unknownstage', 'unknownelement'], ELEMENTID: 'unknownelement' };
    logdebug(ENV, '[DEBUGACTOR]', 'ABORTING STAGE:', ABORTCTX);
    OVERLAY.style.display = 'none';
    OVERLAY.innerHTML = '';
    SENDINSTRUCTION('EXECUTIONACTOR', 'CCCABORT', { PIPELINEID: ABORTCTX.PIPELINEID, PATH: ABORTCTX.PATH, ELEMENTID: ABORTCTX.ELEMENTID, CONTINUATION: ARGS.CONTINUATION }, null, 'DEBUGACTOR');
  }));

  OVERLAY.appendChild(ACTIONS);
  OVERLAY.style.display = 'flex';

  DEBUGSLICE.OVERLAYVISIBLE = true;
  DEBUGSLICE.CCCSTATE.CURRENTCONTINUATION = ARGS.CONTINUATION || null;
  DEBUGSLICE.CURRENTCONTINUATION = ARGS.CONTINUATION || null;

  SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
    UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }]
  }, GENERATETAG(), 'DEBUGACTOR');

  setTimeout(function() {
    var FILTERSELECT = document.getElementById('debuglogfilter');
    var CLEARBTN = document.getElementById('debuglogclear');
    var AUTOCHECK = document.getElementById('debuglogautoscroll');
    if (FILTERSELECT) {
      FILTERSELECT.addEventListener('change', function() {
        DEBUGSLICE.LOGFILTER = FILTERSELECT.value;
        var PANEL = document.getElementById('debuglogpanel');
        if (PANEL) PANEL.innerHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS || [], DEBUGSLICE.LOGFILTER, DEBUGSLICE.LOGVIEWERAUTO !== false);
        SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', { UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }] }, GENERATETAG(), 'DEBUGACTOR');
      });
    }
    if (CLEARBTN) {
      CLEARBTN.addEventListener('click', function() {
        DEBUGSLICE.LOGS = [];
        var PANEL = document.getElementById('debuglogpanel');
        if (PANEL) PANEL.innerHTML = BUILDLOGVIEWERHTML([], DEBUGSLICE.LOGFILTER || 'all', DEBUGSLICE.LOGVIEWERAUTO !== false);
        SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', { UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }] }, GENERATETAG(), 'DEBUGACTOR');
      });
    }
    if (AUTOCHECK) {
      AUTOCHECK.addEventListener('change', function() {
        DEBUGSLICE.LOGVIEWERAUTO = AUTOCHECK.checked;
        if (DEBUGSLICE.LOGVIEWERAUTO) {
          var LIST = document.getElementById('debugloglist');
          if (LIST) LIST.scrollTop = LIST.scrollHeight;
        }
        SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', { UPDATES: [{ PATH: 'DEBUG', VALUE: DEBUGSLICE }] }, GENERATETAG(), 'DEBUGACTOR');
      });
    }
  }, 100);

  return { ENV: NEXTENV, RESPONSE: NEXTENV };
}

function DEBUGBEHAVIORLOGLINE(ENV, ARGS) {
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION LOGLINE:', ARGS.MESSAGE || ('batch[' + (ARGS.ITEMS ? ARGS.ITEMS.length : 1) + ']'));
  var NEXTENV = ENSUREDEBUGSLICE(ENV);
  var DEBUGSLICE = NEXTENV.debug;

  var INCOMING = [];
  if (Array.isArray(ARGS.ITEMS)) {
    ARGS.ITEMS.forEach(function(IT) {
      var SAFEIT = IT || {};
      INCOMING.push({
        LEVEL: SAFEIT.LEVEL || 'info',
        MESSAGE: SAFEIT.MESSAGE || '',
        DATA: TRUNCATELOGDATA(SAFEIT.DATA || null),
        TIMESTAMP: SAFEIT.TIMESTAMP || Date.now(),
        PREFIX: SAFEIT.PREFIX || ''
      });
    });
  } else {
    INCOMING.push({
      LEVEL: ARGS.LEVEL || 'info',
      MESSAGE: ARGS.MESSAGE || '',
      DATA: TRUNCATELOGDATA(ARGS.DATA || null),
      TIMESTAMP: ARGS.TIMESTAMP || Date.now(),
      PREFIX: ARGS.PREFIX || ''
    });
  }

  if (!DEBUGSLICE.LOGS) DEBUGSLICE.LOGS = [];
  INCOMING.forEach(function(ENTRY) { DEBUGSLICE.LOGS.push(ENTRY); });

  var CAP = DEBUGSLICE.LOGSMAX || DEBUGLOGSMAX;
  if (DEBUGSLICE.LOGS.length > CAP) {
    DEBUGSLICE.LOGS = DEBUGSLICE.LOGS.slice(-CAP);
  }

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
    }
  }
  SCHEDULEDEBUGSLICEUPDATE(NEXTENV);

  return { ENV: NEXTENV, RESPONSE: { stored: true } };
}

function DEBUGBEHAVIORRECOVER(ENV, ARGS) {
  logdebug(ENV, '[DEBUGACTOR]', 'ACTION RECOVER DEBUG STATE');
  return DBRESTORE('actor:state:debug').then(function(SAVED) {
    var NEWDEBUG = (SAVED !== null && SAVED !== undefined) ? SAVED : {
      OVERLAY: null,
      CURRENTCONTINUATION: null,
      OVERLAYVISIBLE: false,
      CCCSTATE: { CURRENTCONTINUATION: null },
      GLOBALLISTENERSINSTALLED: false,
      LOGS: [],
      LOGFILTER: 'all',
      LOGSMAX: DEBUGLOGSMAX,
      LOGVIEWERAUTO: true
    };
    var NEXTENV = {};
    Object.keys(ENV).forEach(function(K) { NEXTENV[K] = ENV[K]; });
    NEXTENV.DEBUG = NEWDEBUG;
    SENDINSTRUCTION('WORLDMAPACTOR', 'UPDATE', {
      UPDATES: [{ PATH: 'DEBUG', VALUE: NEWDEBUG }]
    }, GENERATETAG(), 'DEBUGACTOR');
    return NEXTENV;
  }).catch(function(E) {
    logwarn(ENV, '[DEBUGACTOR]', 'STATE RESTORE FAILED:', E);
    return ENV;
  });
}

// ============================================================
// §2 — Handler registration
// ============================================================

REGISTERACTORMESSAGE('DEBUGACTOR', PINGTYPE,
  DEBUGBEHAVIORPING);

REGISTERACTORMESSAGE('DEBUGACTOR', INITOVERLAYTYPE,
  DEBUGBEHAVIORINITOVERLAY);

REGISTERACTORMESSAGE('DEBUGACTOR', HIDETYPE,
  DEBUGBEHAVIORHIDE);

REGISTERACTORMESSAGE('DEBUGACTOR', SHOWTYPE,
  DEBUGBEHAVIORSHOW);

REGISTERACTORMESSAGE('DEBUGACTOR', LOGLINETYPE,
  DEBUGBEHAVIORLOGLINE);

REGISTERACTORMESSAGE('DEBUGACTOR', RECOVERTYPE,
  DEBUGBEHAVIORRECOVER);

// ============================================================
// §3 — Aggregate behaviour
// ============================================================

function DEBUGBEHAVIOR(ENV, MESSAGE) {
  var OUT = INVOKEHANDLER('DEBUGACTOR', ENV, MESSAGE);
  if (OUT.matched !== true) return ENV;
  return OUT.result;
}

REGISTERDISPATCH('DEBUGACTOR', DEBUGBEHAVIOR);

// ============================================================
// §4 — Enqueue helpers (literals)
// ============================================================

function ENQUEUEDEBUGPING(RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', 'PING', {}, TAG, 'system', RESPONSESPEC);
}

function ENQUEUEDEBUGRECOVER(RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('DEBUGACTOR', 'RECOVER', {}, TAG, 'system', RESPONSESPEC);
}

// ============================================================
// §5 — Actor handle surface (unchanged)
// ============================================================

var DEBUGHANDLE = null;

function DEBUGHANDLEINSTANCE() {
  if (!DEBUGHANDLE) DEBUGHANDLE = CREATEACTORHANDLE('DEBUGACTOR');
  return DEBUGHANDLE;
}

function SUBMIT(ACTION) { return DEBUGHANDLEINSTANCE().SUBMIT(ACTION); }
function EXPECT(ID, INTERVAL, TIMEOUT) { return DEBUGHANDLEINSTANCE().EXPECT(ID, INTERVAL, TIMEOUT); }
function GETACTIONRESULT(ID) { return DEBUGHANDLEINSTANCE().GETACTIONRESULT(ID); }
