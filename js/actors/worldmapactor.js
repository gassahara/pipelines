// ============================================================
// UPDATED FILE: js/actors/worldmapactor.js
// Change applied: PURE FUNCTION REFACTOR
//   - No message interface definitions.
//   - No MESSAGEREGISTRY references.
//   - No createactor object construction.
//   - Exports only createInitialWorldmapState, worldmapbehavior,
//     and enqueue producers.
//   - Actor state owned by the runtime (actorkernel.js).
// ============================================================

var worldmapVerbosityConstants = createVerbosityConstants();
var worldmapState = Object.freeze({ level: worldmapVerbosityConstants.DEBUG });

function createInitialWorldmapState() {
  return {
    worldmap: {},
    observers: [],
    verbosity: worldmapVerbosityConstants.DEBUG
  };
}

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

// Pure behavior function: (state, message) -> state
function worldmapbehavior(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : worldmapVerbosityConstants.DEBUG;
  worldmapState = Object.freeze({ level: v });

  logdebug(worldmapState, '[WORLDMAPACTOR]', 'behavior handling action:', message.type);

  if (message.type === MESSAGETYPES.UPDATE) {
    var nextworldmap = deepmerge(state.worldmap, message.patch);
    state.observers.forEach(function(observer) {
      try { observer(nextworldmap); } catch (err) { logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
    });
    return { worldmap: nextworldmap, observers: state.observers, verbosity: v };
  }

  if (message.type === MESSAGETYPES.UPDATE_FN) {
    var nextworldmapFn = message.fn(state.worldmap);
    if (nextworldmapFn === undefined) nextworldmapFn = state.worldmap;
    state.observers.forEach(function(observer) {
      try { observer(nextworldmapFn); } catch (err) { logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
    });
    return { worldmap: nextworldmapFn, observers: state.observers, verbosity: v };
  }

  if (message.type === MESSAGETYPES.OBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.concat([message.observer]), verbosity: v };
  }

  if (message.type === MESSAGETYPES.UNOBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.filter(function(obs) { return obs !== message.observer; }), verbosity: v };
  }

  if (message.type === MESSAGETYPES.GET_WORLDMAP) {
    if (message.sender && message.tag) {
      sendResponse(message.sender, message.tag, state.worldmap, 'worldmapactor');
    }
    return state;
  }

  return state;
}

// Register initial state with runtime.
registerActorState('worldmapactor', createInitialWorldmapState());

// Compatibility handle (stateless) for enqueue producers.
var WORLDMAPACTOR = {
  getstate: function() { return getActorState('worldmapactor'); },
  dispatch: function(message) { return dispatchToActor('worldmapactor', worldmapbehavior, message); }
};

function startWorldmapActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      worldmapState = Object.freeze({ level: lvl });
      var wmStateObj = getActorState('worldmapactor');
      if (wmStateObj) wmStateObj.verbosity = lvl;
    }
  }
  return WORLDMAPACTOR;
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
