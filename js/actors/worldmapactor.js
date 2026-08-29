import { createactor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';

var worldmapVerbosityConstants = createVerbosityConstants();
var worldmapVerbosityFunctions = createVerbosityFunctions(worldmapVerbosityConstants);
var worldmapLogger = worldmapVerbosityFunctions.createLogger('[WORLDMAPACTOR]', worldmapVerbosityConstants.DEBUG);

var UPDATE = 'update';
var OBSERVE = 'observe';
var UNOBSERVE = 'unobserve';

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[UPDATE] = { patch: 'object' };
MESSAGEINTERFACES[OBSERVE] = { observer: 'function' };
MESSAGEINTERFACES[UNOBSERVE] = { observer: 'function' };
Object.freeze(MESSAGEINTERFACES);

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
    Object.keys(acc).forEach(function(k) {
      if (k !== key) result[k] = acc[k];
    });
    result[key] = bothobjects ? deepmerge(targetval, patchval) : patchval;
    return result;
  }, target);
}

var worldmapbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : worldmapLogger.getLevel();
  worldmapLogger.setLevel(v);

  worldmapLogger.debug('behavior handling action:', message.type);

  if (message.type === UPDATE) {
    worldmapLogger.debug('action UPDATE patch keys:', Object.keys(message.patch || {}).join(', '));
    var nextworldmap = deepmerge(state.worldmap, message.patch);
    worldmapLogger.debug('notifying', state.observers.length, 'observers');
    state.observers.forEach(function(observer) {
      try {
        observer(nextworldmap);
      } catch (err) {
        worldmapLogger.warn('observer notification failed:', err);
      }
    });
    return { worldmap: nextworldmap, observers: state.observers, verbosity: v };
  }
  if (message.type === OBSERVE) {
    worldmapLogger.debug('action OBSERVE new observer attached, total:', state.observers.length + 1);
    return { worldmap: state.worldmap, observers: state.observers.concat([message.observer]), verbosity: v };
  }
  if (message.type === UNOBSERVE) {
    worldmapLogger.debug('action UNOBSERVE observer detached');
    return { worldmap: state.worldmap, observers: state.observers.filter(function(obs) { return obs !== message.observer; }), verbosity: v };
  }
  return state;
};

var worldmapMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

var WORLDMAPACTOR = createactor(
  worldmapbehavior,
  { worldmap: {}, observers: [], verbosity: worldmapVerbosityConstants.DEBUG },
  MESSAGEINTERFACES,
  {
    actorName: 'worldmapactor',
    mailboxType: 'db',
    mailboxStore: worldmapMailboxStore,
    verbosity: worldmapVerbosityConstants.DEBUG
  }
);

function startWorldmapActor(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      worldmapLogger.setLevel(lvl);
      if (WORLDMAPACTOR && WORLDMAPACTOR.getstate()) {
        WORLDMAPACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return WORLDMAPACTOR;
}

var updateworldmap = function(patch) {
  return WORLDMAPACTOR.send({ type: UPDATE, patch: patch });
};

var observeworldmap = function(observer) {
  return WORLDMAPACTOR.send({ type: OBSERVE, observer: observer });
};

var unobserveworldmap = function(observer) {
  return WORLDMAPACTOR.send({ type: UNOBSERVE, observer: observer });
};

var getworldmap = function() {
  return WORLDMAPACTOR.getstate().worldmap;
};

export {
  updateworldmap,
  observeworldmap,
  unobserveworldmap,
  getworldmap,
  startWorldmapActor
};
