// ============================================================
// UPDATED FILE: js/actors/worldmapactor.js
// Changes applied:
//   - mailboxType 'mail' with mailTransport injection
//   - update/observe/unobserve functions use sendInstruction +
//     awaitResponse
//   - getworldmap now sends GET_WORLDMAP instruction and awaits response
//   - state persistence still uses enqueueDbStore/Restore/Delete
// ============================================================

import { createactor } from './actorkernel.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';
import {
  sendInstruction,
  requestUnreadMessages,
  sendResponse,
  awaitResponse,
  generateTag
} from './mailactor.js';
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
var GET_WORLDMAP = 'get_worldmap';

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[UPDATE] = { patch: 'object' };
MESSAGEINTERFACES[UPDATE_FN] = { fn: 'function' };
MESSAGEINTERFACES[OBSERVE] = { observer: 'function' };
MESSAGEINTERFACES[UNOBSERVE] = { observer: 'function' };
MESSAGEINTERFACES[GET_WORLDMAP] = {};
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
    Object.keys(acc).forEach(function(k) { if (k !== key) result[k] = acc[k]; });
    result[key] = bothobjects ? deepmerge(targetval, patchval) : patchval;
    return result;
  }, target);
}

var worldmapbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : worldmapVerbosityConstants.DEBUG;
  worldmapState = Object.freeze({ level: v });

  logdebug(worldmapState, '[WORLDMAPACTOR]', 'behavior handling action:', message.type);

  if (message.type === UPDATE) {
    var nextworldmap = deepmerge(state.worldmap, message.patch);
    state.observers.forEach(function(observer) {
      try { observer(nextworldmap); } catch (err) { logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
    });
    return { worldmap: nextworldmap, observers: state.observers, verbosity: v };
  }

  if (message.type === UPDATE_FN) {
    var nextworldmapFn = message.fn(state.worldmap);
    if (nextworldmapFn === undefined) nextworldmapFn = state.worldmap;
    state.observers.forEach(function(observer) {
      try { observer(nextworldmapFn); } catch (err) { logwarn(worldmapState, '[WORLDMAPACTOR]', 'observer notification failed:', err); }
    });
    return { worldmap: nextworldmapFn, observers: state.observers, verbosity: v };
  }

  if (message.type === OBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.concat([message.observer]), verbosity: v };
  }

  if (message.type === UNOBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.filter(function(obs) { return obs !== message.observer; }), verbosity: v };
  }

  if (message.type === GET_WORLDMAP) {
    return state.worldmap;
  }

  return state;
};

var WORLDMAPACTOR = createactor(
  worldmapbehavior,
  { worldmap: {}, observers: [], verbosity: worldmapVerbosityConstants.DEBUG },
  MESSAGEINTERFACES,
  {
    actorName: 'worldmapactor',
    mailboxType: 'mail',
    mailTransport: {
      sendInstruction: sendInstruction,
      requestUnreadMessages: requestUnreadMessages,
      sendResponse: sendResponse
    },
    pollInterval: 25,
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

function updateworldmap(patch) {
  const tag = generateTag();
  sendInstruction('worldmapactor', UPDATE, { patch: patch }, tag, 'system');
  return awaitResponse('system', tag);
}

function updateworldmapfn(fn) {
  const tag = generateTag();
  sendInstruction('worldmapactor', UPDATE_FN, { fn: fn }, tag, 'system');
  return awaitResponse('system', tag);
}

function observeworldmap(observer) {
  const tag = generateTag();
  sendInstruction('worldmapactor', OBSERVE, { observer: observer }, tag, 'system');
  return awaitResponse('system', tag);
}

function unobserveworldmap(observer) {
  const tag = generateTag();
  sendInstruction('worldmapactor', UNOBSERVE, { observer: observer }, tag, 'system');
  return awaitResponse('system', tag);
}

function getworldmap() {
  const tag = generateTag();
  sendInstruction('worldmapactor', GET_WORLDMAP, {}, tag, 'system');
  return awaitResponse('system', tag);
}

export {
  updateworldmap,
  updateworldmapfn,
  observeworldmap,
  unobserveworldmap,
  getworldmap,
  startWorldmapActor
};
