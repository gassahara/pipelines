// ============================================================
// UPDATED FILE: js/actors/worldmapactor.js
// Change applied: FUNCTIONAL ENV – NO INITIALIZATION
//   - Initial state is {}; no createInitialEnv.
//   - recoverEnv returns saved ENV or {}.
//   - startWorldmapActor returns a Promise that resolves after recovery.
//   - Worldmapactor does not define or merge actor slices.
// ============================================================

var worldmapVerbosityConstants = createVerbosityConstants();
var worldmapState = Object.freeze({ level: worldmapVerbosityConstants.DEBUG });

function setInPath(obj, path, value) {
  var keys = path.split('.');
  if (keys.length === 0) return value;
  var key = keys[0];
  var rest = keys.slice(1).join('.');
  var nextObj = obj && typeof obj === 'object' ? obj : {};
  var updatedChild = rest ? setInPath(nextObj[key], rest, value) : value;
  var newObj = Array.isArray(nextObj) ? nextObj.slice() : Object.assign({}, nextObj);
  newObj[key] = updatedChild;
  return newObj;
}

function applyValueSet(env, updates) {
  return updates.reduce(function(acc, update) {
    return setInPath(acc, update.path, update.value);
  }, env);
}

function persistEnv(env) {
  logdebug(env, '[WORLDMAPACTOR]', 'persistEnv saving ENV to db');
  enqueueDbStore('actor:state:env', env).then(function(either) {
    if (either.tag === 'LEFT') {
      logwarn(env, '[WORLDMAPACTOR]', 'state persist failed:', either.error);
    }
  }).catch(function(e) {
    logwarn(env, '[WORLDMAPACTOR]', 'state persist failed:', e);
  });
}

function recoverEnv() {
  logdebug({}, '[WORLDMAPACTOR]', 'recoverEnv start');
  return enqueueDbRestore('actor:state:env').then(function(maybe) {
    if (maybe && maybe.tag === 'JUST') {
      loginfo(maybe.value, '[WORLDMAPACTOR]', 'recoverEnv restored ENV');
      return maybe.value;
    }
    loginfo({}, '[WORLDMAPACTOR]', 'recoverEnv no saved ENV, using empty container');
    return {};
  });
}

// Pure behavior function: (env, message) -> env
function worldmapbehavior(env, message) {
  logdebug(env, '[WORLDMAPACTOR]', 'behavior handling action:', message.type);

  switch (message.type) {
    case MESSAGETYPES.UPDATE: {
      if (!message.updates || !Array.isArray(message.updates)) {
        logwarn(env, '[WORLDMAPACTOR]', 'UPDATE missing updates array');
        return env;
      }
      var newEnv = applyValueSet(env, message.updates);
      (newEnv.observers || []).forEach(function(observer) {
        try { observer(newEnv); } catch (err) { logwarn(newEnv, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
      });
      persistEnv(newEnv);
      return newEnv;
    }
    case MESSAGETYPES.UPDATE_FN: {
      var nextEnv = message.fn(env);
      if (nextEnv === undefined) nextEnv = env;
      (nextEnv.observers || []).forEach(function(observer) {
        try { observer(nextEnv); } catch (err) { logwarn(nextEnv, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
      });
      persistEnv(nextEnv);
      return nextEnv;
    }
    case MESSAGETYPES.OBSERVE: {
      var newObservers = (env.observers || []).concat([message.observer]);
      return setInPath(env, 'observers', newObservers);
    }
    case MESSAGETYPES.UNOBSERVE: {
      var filtered = (env.observers || []).filter(function(obs) { return obs !== message.observer; });
      return setInPath(env, 'observers', filtered);
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

// Initial state is empty object; actors own their slices.
registerActorState('worldmapactor', {});

function startWorldmapActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      worldmapState = Object.freeze({ level: lvl });
      var envForVerbosity = getActorState('worldmapactor');
      if (envForVerbosity) {
        setActorState('worldmapactor', setInPath(envForVerbosity, 'verbosity', lvl));
      }
    }
  }
  var currentEnv = getActorState('worldmapactor') || {};
  // Return promise that resolves after recovery and state set.
  return recoverEnv().then(function(saved) {
    setActorState('worldmapactor', saved);
    return saved;
  }).catch(function(err) {
    logwarn(currentEnv, '[WORLDMAPACTOR]', 'state restore failed:', err);
    return currentEnv;
  });
}

function sendworldmappatch(patch, responseSpec) {
  if (patch && patch.updates) {
    var tag = generateTag();
    sendInstruction('worldmapactor', MESSAGETYPES.UPDATE, { updates: patch.updates }, tag, 'system', responseSpec);
  }
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
