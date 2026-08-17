import { createactor } from './actorkernel.js';

var UPDATE = 'update';
var OBSERVE = 'observe';
var UNOBSERVE = 'unobserve';

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
  if (message.type === UPDATE) {
    var nextworldmap = deepmerge(state.worldmap, message.patch);
    state.observers.forEach(function(observer) { observer(nextworldmap); });
    return { worldmap: nextworldmap, observers: state.observers };
  }
  if (message.type === OBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.concat([message.observer]) };
  }
  if (message.type === UNOBSERVE) {
    return { worldmap: state.worldmap, observers: state.observers.filter(function(obs) { return obs !== message.observer; }) };
  }
  return state;
};

var WORLDMAPACTOR = createactor(worldmapbehavior, { worldmap: {}, observers: [] });

export var updateworldmap = function(patch) {
  return WORLDMAPACTOR.send({ type: UPDATE, patch: patch });
};

export var observeworldmap = function(observer) {
  return WORLDMAPACTOR.send({ type: OBSERVE, observer: observer });
};

export var unobserveworldmap = function(observer) {
  return WORLDMAPACTOR.send({ type: UNOBSERVE, observer: observer });
};

export var getworldmap = function() {
  return WORLDMAPACTOR.getstate().worldmap;
};
