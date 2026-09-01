// ============================================================
// UPDATED FILE: js/actors/worldmapactor.js
// Change applied: GLOBAL ENV OWNER
//   - Worldmapactor now owns the single global ENV object.
//   - State factory returns a full ENV with slices for all actors.
//   - Behavior function handles UPDATE, UPDATE_FN, OBSERVE,
//     UNOBSERVE, and GET_ENV; persists ENV via dbactor.
//   - All other actors are stateless; they receive ENV via dispatcher
//     and send updates through messages to worldmapactor.
// ============================================================

var worldmapVerbosityConstants = createVerbosityConstants();
var worldmapState = Object.freeze({ level: worldmapVerbosityConstants.DEBUG });

function deepmerge(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return patch;
  return Object.keys(patch).reduce(function(acc, key) {
    var targetval = acc[key];
    var patchval = patch[key];
    var bothobjects = (
      patchval !== null && typeof patchval === 'object' && !Array.isArray(patchval) &&
      targetval !== null && typeof targetval === 'object' && !Array.isArray(targetval)
    );
    var result = {};
    Object.keys(acc).forEach(function(k) { if (k !== key) result[k] = acc[k]; });
    result[key] = bothobjects ? deepmerge(targetval, patchval) : patchval;
    return result;
  }, target);
}

function createInitialEnv() {
  return {
    verbosity: worldmapVerbosityConstants.DEBUG,
    api: {
      lastRequest: null,
      requestCount: 0
    },
    db: {
      store: {}
    },
    render: {
      html: '',
      viewport: null
    },
    execution: {
      pipelines: {},
      tasks: {},
      taskCounter: 0,
      htmlSnapshot: null
    },
    hypervisor: {
      boot: true,
      envByPipeline: {},
      renderHtml: '',
      executionStack: [],
      routes: {},
      activePipelines: [],
      programs: {},
      stageDescriptors: {},
      triggerRecipients: {},
      loadedPipelines: {},
      nextStageMessages: {}
    },
    debug: {
      overlay: null,
      currentContinuation: null,
      overlayVisible: false,
      cccState: { currentContinuation: null },
      globalListenersInstalled: false
    },
    worldmap: {},
    mail: {
      queues: {},
      nextId: 1
    }
  };
}

function persistEnv(env) {
  logdebug(env, '[WORLDMAPACTOR]', 'persistEnv saving ENV to db');
  enqueueDbStore('actor:state:env', env).catch(function(e) {
    logwarn(env, '[WORLDMAPACTOR]', 'state persist failed:', e);
  });
}

function recoverEnv(env) {
  logdebug(env, '[WORLDMAPACTOR]', 'recoverEnv start');
  return enqueueDbRestore('actor:state:env').then(function(saved) {
    if (saved && typeof saved === 'object') {
      loginfo(env, '[WORLDMAPACTOR]', 'recoverEnv restored ENV');
      return saved;
    }
    var initial = createInitialEnv();
    return enqueueDbStore('actor:state:env', initial).then(function() { return initial; });
  });
}

// Pure behavior function: (env, message) -> env
function worldmapbehavior(env, message) {
  var v = env && env.verbosity !== undefined ? env.verbosity : worldmapVerbosityConstants.DEBUG;
  worldmapState = Object.freeze({ level: v });

  logdebug(env, '[WORLDMAPACTOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case MESSAGETYPES.UPDATE: {
      var nextenv = deepmerge(env, message.patch);
      (nextenv.observers || []).forEach(function(observer) {
        try { observer(nextenv); } catch (err) { logwarn(nextenv, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
      });
      persistEnv(nextenv);
      return nextenv;
    }
    case MESSAGETYPES.UPDATE_FN: {
      var nextenv2 = message.fn(env);
      if (nextenv2 === undefined) nextenv2 = env;
      (nextenv2.observers || []).forEach(function(observer) {
        try { observer(nextenv2); } catch (err) { logwarn(nextenv2, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
      });
      persistEnv(nextenv2);
      return nextenv2;
    }
    case MESSAGETYPES.OBSERVE: {
      var observers = (env.observers || []).concat([message.observer]);
      var nextenv3 = deepmerge(env, { observers: observers });
      return nextenv3;
    }
    case MESSAGETYPES.UNOBSERVE: {
      var filtered = (env.observers || []).filter(function(obs) { return obs !== message.observer; });
      var nextenv4 = deepmerge(env, { observers: filtered });
      return nextenv4;
    }
    case MESSAGETYPES.GET_WORLDMAP:
    case MESSAGETYPES.GET_ENV: {
      if (message.sender && message.tag) {
        sendResponse(message.sender, message.tag, env, 'worldmapactor');
      }
      return env;
    }
    default:
      logwarn(env, '[WORLDMAPACTOR]', 'unknown message type:', message.type);
      return env;
  }
}

// Register initial state with runtime. This is the only actor state
// registration required. All other actors use the ENV inside this state.
registerActorState('worldmapactor', createInitialEnv());

function startWorldmapActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      worldmapState = Object.freeze({ level: lvl });
      var env = getActorState('worldmapactor');
      if (env) env.verbosity = lvl;
    }
  }
  // On boot, recover saved ENV from dbactor.
  var currentEnv = getActorState('worldmapactor');
  if (currentEnv) {
    recoverEnv(currentEnv).then(function(saved) {
      setActorState('worldmapactor', saved);
    }).catch(function(err) {
      logwarn(currentEnv, '[WORLDMAPACTOR]', 'state restore failed:', err);
    });
  }
  return {
    getstate: function() { return getActorState('worldmapactor'); },
    dispatch: function(message) { return dispatchToActor('worldmapactor', worldmapbehavior, message); }
  };
}

function sendworldmappatch(patch, responseSpec) {
  var tag = generateTag();
  sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, { patch: patch }, tag, 'system', responseSpec);
}

function updateworldmapfn(fn, responseSpec) {
  var tag = generateTag();
  sendInstruction('worldmapactor', MESSAGETYPES.UPDATE_FN, { fn: fn }, tag, 'system', responseSpec);
}

function observeworldmap(observer, responseSpec) {
  var tag = generateTag();
  sendInstruction('worldmapactor', MESSAGETYPES.OBSERVE, { observer: observer }, tag, 'system', responseSpec);
}

function unobserveworldmap(observer, responseSpec) {
  var tag = generateTag();
  sendInstruction('worldmapactor', MESSAGETYPES.UNOBSERVE, { observer: observer }, tag, 'system', responseSpec);
}

function getworldmap(responseSpec) {
  var tag = generateTag();
  sendInstruction('worldmapactor', MESSAGETYPES.GET_WORLDMAP, {}, tag, 'system', responseSpec);
}
