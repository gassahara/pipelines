import { createactor } from './actorkernel.js';
import { frames } from '../evalstack.js';
import { formatdebugtrace } from '../debugformatter.js';
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import {
  enqueueExecutionCccRetry,
  enqueueExecutionCccContinue,
  enqueueExecutionCccAbort
} from './executionactor.js';

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
  enqueueDbStore('actor:state:debug', state.worldmap).catch(function(e) {
    console.warn('[DEBUGACTOR] state persist failed:', e);
  });
}

function createDebugLogger() {
  var constants = createVerbosityConstants();
  var fns = createVerbosityFunctions(constants);
  var state = Object.freeze({ level: constants.DEBUG });
  return {
    debug: function() {
      fns.logdebug.apply(null, [state].concat(Array.prototype.slice.call(arguments)));
    },
    warn: function() {
      fns.logwarn.apply(null, [state].concat(Array.prototype.slice.call(arguments)));
    }
  };
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
  if (!state.worldmap) {
    state.worldmap = createInitialDebugWorldmap();
  }

  if (message.type === DEBUG_MESSAGETYPES.PING) {
    if (typeof message.resolve === 'function') message.resolve(true);
    return state;
  }

  if (message.type === DEBUG_MESSAGETYPES.INIT_OVERLAY) {
    persistDebugWorldmap(state);
    ensureOverlay(state);

    if (!state.globalListenersInstalled) {
      state.globalListenersInstalled = true;

      window.addEventListener('error', function(e) {
        e.preventDefault();
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
    persistDebugWorldmap(state);
    var logger = createDebugLogger();
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
        logger.debug('[DebugActor] Retrying:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        enqueueExecutionCccRetry(ctx.pipelineid, ctx.path, ctx.elementid, message.continuation).catch(function(e) {
          console.warn('[DebugActor] RETRY failed:', e);
        });
      }));

      actions.appendChild(btn('CONTINUE', 'background:#4488ff;color:#fff;', function() {
        logger.debug('[DebugActor] Continuing:', ctx);
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        enqueueExecutionCccContinue(ctx.pipelineid, ctx.path, ctx.elementid, message.continuation).catch(function(e) {
          console.warn('[DebugActor] CONTINUE failed:', e);
        });
      }));
    }

    actions.appendChild(btn('ABORT', 'background:#ff5555;color:#fff;', function() {
      var abortCtx = message.continuation
        ? getctx(null, message.continuation)
        : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };
      logger.debug('[DebugActor] Aborting:', abortCtx);
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      enqueueExecutionCccAbort(abortCtx.pipelineid, abortCtx.path, abortCtx.elementid, message.continuation).catch(function(e) {
        console.warn('[DebugActor] ABORT failed:', e);
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
      if (typeof message.resolve === 'function') message.resolve(state);
    }).catch(function(e) {
      console.warn('[DEBUGACTOR] state restore failed:', e);
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

function createDebugActor() {
  if (DEBUGACTOR_INSTANCE) {
    return DEBUGACTOR_INSTANCE;
  }

  var actor = createactor(
    debugbehavior,
    {
      overlay: null,
      currentContinuation: null,
      worldmap: createInitialDebugWorldmap()
    },
    MESSAGEINTERFACES,
    { actorName: 'debugactor', mailboxType: 'db', mailboxStore: debugMailboxStore }
  );
  DEBUGACTOR_INSTANCE = actor;
  return actor;
}

function startDebugActor() {
  return createDebugActor();
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
