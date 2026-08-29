// ============================================================
// UPDATED FILE: js/actors/debugactor.js
// Change applied: removed createLogger; direct portable logging functions
// ============================================================

import { createactor } from './actorkernel.js';
import { frames } from '../evalstack.js';
import { formatdebugtrace } from '../debugformatter.js';
import {
  createVerbosityConstants,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import {
  enqueueExecutionCccRetry,
  enqueueExecutionCccContinue,
  enqueueExecutionCccAbort
} from './executionactor.js';

var debugVerbosityConstants = createVerbosityConstants();
var debugState = Object.freeze({ level: debugVerbosityConstants.DEBUG });

var DEBUG_MESSAGETYPES = Object.freeze({
  INIT_OVERLAY: 'init_overlay',
  SHOW: 'show',
  HIDE: 'hide',
  RECOVER: 'recover',
  PING: 'ping'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[DEBUG_MESSAGETYPES.INIT_OVERLAY] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DEBUG_MESSAGETYPES.SHOW] = { error: 'object', continuation: 'object?', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DEBUG_MESSAGETYPES.HIDE] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DEBUG_MESSAGETYPES.RECOVER] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[DEBUG_MESSAGETYPES.PING] = { resolve: 'function?', reject: 'function?' };
Object.freeze(MESSAGEINTERFACES);

var DEBUGACTOR_INSTANCE = null;

function createInitialDebugWorldmap() {
  return {
    overlayVisible: false,
    cccState: {
      currentContinuation: null
    }
  };
}

function persistDebugWorldmap(state) {
  logdebug(debugState, '[DEBUGACTOR]', 'persistDebugWorldmap saving state to db');
  enqueueDbStore('actor:state:debug', state.worldmap).catch(function(e) {
    logwarn(debugState, '[DEBUGACTOR]', 'state persist failed:', e);
  });
}

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

function ensureOverlay(state) {
  if (!state.overlay) {
    var overlay = document.getElementById('debugoverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'debugoverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:10000;display:none;flex-direction:column;';
      document.body.appendChild(overlay);
    }
    state.overlay = overlay;
  }
  return state.overlay;
}

var debugbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : debugVerbosityConstants.DEBUG;
  debugState = Object.freeze({ level: v });

  logdebug(debugState, '[DEBUGACTOR]', 'behavior handling action:', message.type);

  if (!state.worldmap) {
    state.worldmap = createInitialDebugWorldmap();
  }

  if (message.type === DEBUG_MESSAGETYPES.PING) {
    logdebug(debugState, '[DEBUGACTOR]', 'action PING');
    if (typeof message.resolve === 'function') message.resolve(true);
    return state;
  }

  if (message.type === DEBUG_MESSAGETYPES.INIT_OVERLAY) {
    logdebug(debugState, '[DEBUGACTOR]', 'action INIT_OVERLAY');
    persistDebugWorldmap(state);
    ensureOverlay(state);

    if (!state.globalListenersInstalled) {
      state.globalListenersInstalled = true;

      window.addEventListener('error', function(e) {
        e.preventDefault();
        logwarn(debugState, '[DEBUGACTOR]', 'global window error captured:', e.error || e);
        if (DEBUGACTOR_INSTANCE) {
          DEBUGACTOR_INSTANCE.send({
            type: DEBUG_MESSAGETYPES.SHOW,
            error: e.error || e,
            continuation: null
          });
        }
      });

      window.addEventListener('unhandledrejection', function(e) {
        if (e.reason && e.reason.diagnostic) {
          e.preventDefault();
          logwarn(debugState, '[DEBUGACTOR]', 'global unhandled rejection captured:', e.reason);
          if (DEBUGACTOR_INSTANCE) {
            DEBUGACTOR_INSTANCE.send({
              type: DEBUG_MESSAGETYPES.SHOW,
              error: e.reason,
              continuation: e.reason.diagnostic.continuation || null
            });
          }
        }
      });
    }

    state.worldmap.overlayVisible = false;
    persistDebugWorldmap(state);
    return state;
  }

  if (message.type === DEBUG_MESSAGETYPES.HIDE) {
    logdebug(debugState, '[DEBUGACTOR]', 'action HIDE');
    persistDebugWorldmap(state);
    if (state.overlay) {
      state.overlay.style.display = 'none';
      state.overlay.innerHTML = '';
    }
    state.worldmap.overlayVisible = false;
    state.worldmap.cccState.currentContinuation = null;
    persistDebugWorldmap(state);
    if (typeof message.resolve === 'function') message.resolve(state);
    return state;
  }

  if (message.type === DEBUG_MESSAGETYPES.SHOW) {
    loginfo(debugState, '[DEBUGACTOR]', 'action SHOW debug overlay');
    logdebug(debugState, '[DEBUGACTOR]', 'action SHOW error:', message.error, 'continuation:', message.continuation);
    persistDebugWorldmap(state);
    var overlay = ensureOverlay(state);

    overlay.innerHTML = formatdebugtrace(
      message.error,
      (message.error && message.error.diagnostic && message.error.diagnostic.debugtrace) || frames
    );

    var actions = document.createElement('div');
    actions.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

    if (message.continuation) {
      var ctx = getctx(message.error, message.continuation);

      actions.appendChild(btn('RETRY STAGE', 'background:#00ff00;color:#000;', function() {
        logdebug(debugState, '[DEBUGACTOR]', 'Retrying stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        enqueueExecutionCccRetry(ctx.pipelineid, ctx.path, ctx.elementid, message.continuation).catch(function(e) {
          logwarn(debugState, '[DEBUGACTOR]', 'RETRY failed:', e);
        });
      }));

      actions.appendChild(btn('CONTINUE', 'background:#4488ff;color:#fff;', function() {
        logdebug(debugState, '[DEBUGACTOR]', 'Continuing stage:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        enqueueExecutionCccContinue(ctx.pipelineid, ctx.path, ctx.elementid, message.continuation).catch(function(e) {
          logwarn(debugState, '[DEBUGACTOR]', 'CONTINUE failed:', e);
        });
      }));
    }

    actions.appendChild(btn('ABORT', 'background:#ff5555;color:#fff;', function() {
      var abortCtx = message.continuation
        ? getctx(null, message.continuation)
        : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };
      logdebug(debugState, '[DEBUGACTOR]', 'Aborting stage:', abortCtx);
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      enqueueExecutionCccAbort(abortCtx.pipelineid, abortCtx.path, abortCtx.elementid, message.continuation).catch(function(e) {
        logwarn(debugState, '[DEBUGACTOR]', 'ABORT failed:', e);
      });
    }));

    overlay.appendChild(actions);
    overlay.style.display = 'flex';

    state.worldmap.overlayVisible = true;
    state.worldmap.cccState.currentContinuation = message.continuation || null;
    persistDebugWorldmap(state);

    if (typeof message.resolve === 'function') message.resolve(state);
    return state;
  }

  if (message.type === DEBUG_MESSAGETYPES.RECOVER) {
    logdebug(debugState, '[DEBUGACTOR]', 'action RECOVER debug state');
    enqueueDbRestore('actor:state:debug').then(function(saved) {
      if (saved) {
        state.worldmap = saved;
        if (saved.overlayVisible) {
          ensureOverlay(state);
          state.overlay.style.display = 'flex';
        } else if (state.overlay) {
          state.overlay.style.display = 'none';
        }
        if (saved.cccState && saved.cccState.currentContinuation) {
          state.currentContinuation = saved.cccState.currentContinuation;
        }
      } else {
        state.worldmap = createInitialDebugWorldmap();
        persistDebugWorldmap(state);
      }
      logdebug(debugState, '[DEBUGACTOR]', 'debug recovery completed');
      if (typeof message.resolve === 'function') message.resolve(state);
    }).catch(function(e) {
      logwarn(debugState, '[DEBUGACTOR]', 'state restore failed:', e);
      state.worldmap = createInitialDebugWorldmap();
      persistDebugWorldmap(state);
      if (typeof message.resolve === 'function') message.resolve(state);
    });
    return state;
  }

  return state;
};

var debugMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

function createDebugActor(options) {
  if (DEBUGACTOR_INSTANCE) {
    if (options !== undefined) {
      var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
      if (lvl !== undefined) {
        debugState = Object.freeze({ level: lvl });
      }
    }
    return DEBUGACTOR_INSTANCE;
  }

  var verbosity = typeof options === 'number'
    ? options
    : (options && options.verbosity !== undefined
      ? options.verbosity
      : (options && options.verbosityLevel !== undefined ? options.verbosityLevel : debugVerbosityConstants.DEBUG));

  debugState = Object.freeze({ level: verbosity });

  var actor = createactor(
    debugbehavior,
    {
      overlay: null,
      currentContinuation: null,
      worldmap: createInitialDebugWorldmap(),
      verbosity: verbosity
    },
    MESSAGEINTERFACES,
    { actorName: 'debugactor', mailboxType: 'db', mailboxStore: debugMailboxStore, verbosity: verbosity }
  );
  DEBUGACTOR_INSTANCE = actor;
  return actor;
}

function startDebugActor(options) {
  return createDebugActor(options);
}

var enqueueDebugPing = function() {
  return new Promise(function(resolve, reject) {
    if (!DEBUGACTOR_INSTANCE) {
      reject(new Error('[DEBUGACTOR] not started'));
      return;
    }
    DEBUGACTOR_INSTANCE.send({ type: DEBUG_MESSAGETYPES.PING, resolve: resolve, reject: reject });
  });
};

var enqueueDebugRecover = function() {
  return new Promise(function(resolve, reject) {
    var actor = startDebugActor();
    actor.send({ type: DEBUG_MESSAGETYPES.RECOVER, resolve: resolve, reject: reject });
  });
};

export {
  DEBUG_MESSAGETYPES,
  createDebugActor,
  startDebugActor,
  enqueueDebugPing,
  enqueueDebugRecover
};
