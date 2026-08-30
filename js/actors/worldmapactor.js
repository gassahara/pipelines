// ============================================================
// UPDATED FILE: js/actors/worldmapactor.js
// Change applied:
//   P20: added functional update support (UPDATE_FN)
// ============================================================

import { createactor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import {
  createVerbosityConstants,
  logdebug,
  logwarn,
  logerror,
  loginfo,
  logcritical
} from '../verbosity.js';

var worldmapVerbosityConstants = createVerbosityConstants();
var worldmapState = Object.freeze({ level: worldmapVerbosityConstants.DEBUG });

var UPDATE = 'update';
var UPDATE_FN = 'update_fn';
var OBSERVE = 'observe';
var UNOBSERVE = 'unobserve';

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[UPDATE] = { patch: 'object' };
MESSAGEINTERFACES[UPDATE_FN] = { fn: 'function' };
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
  var v = state && state.verbosity !== undefined ? state.verbosity : worldmapVerbosityConstants.DEBUG;
  worldmapState = Object.freeze({ level: v });

  logdebug(worldmapState, '[WORLDMAPACTOR]', 'behavior handling action:', message.type);

  if (message.type === UPDATE) {
    logdebug(worldmapState, '[WORLDMAPACTOR]', 'action UPDATE patch keys:', Object.keys(message.patch || {}).join(', '));
    var nextworldmap = deepmerge(state.worldmap, message.patch);
    logdebug(worldmapState, '[WORLDMAPACTOR]', 'notifying', state.observers.length, 'observers');
    state.observers.forEach(function(observer) {
      try {
        observer(nextworldmap);
      } catch (err) {
        logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err);
      }
    });
    return { worldmap: nextworldmap, observers: state.observers, verbosity: v };
  }

  if (message.type === UPDATE_FN) {
    logdebug(worldmapState, '[WORLDMAPACTOR]', 'action UPDATE_FN applying functional update');
    if (typeof message.fn !== 'function') {
      logwarn(worldmapState, '[WORLDMAPACTOR]', 'UPDATE_FN received non-function value');
      return state;
    }
    var nextworldmapFn = message.fn(state.worldmap);
    if (nextworldmapFn === undefined) {
      nextworldmapFn = state.worldmap;
    }
    state.observers.forEach(function(observer) {
      try {
        observer(nextworldmapFn);
      } catch (err) {
        logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err);
      }
    });
    return { worldmap: nextworldmapFn, observers: state.observers, verbosity: v };
  }

  if (message.type === OBSERVE) {
    logdebug(worldmapState, '[WORLDMAPACTOR]', 'action OBSERVE new observer attached, total:', state.observers.length + 1);
    return { worldmap: state.worldmap, observers: state.observers.concat([message.observer]), verbosity: v };
  }

  if (message.type === UNOBSERVE) {
    logdebug(worldmapState, '[WORLDMAPACTOR]', 'action UNOBSERVE observer detached');
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
      worldmapState = Object.freeze({ level: lvl });
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

var updateworldmapfn = function(fn) {
  return WORLDMAPACTOR.send({ type: UPDATE_FN, fn: fn });
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
  updateworldmapfn,
  observeworldmap,
  unobserveworldmap,
  getworldmap,
  startWorldmapActor
};
