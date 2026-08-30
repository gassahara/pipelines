// ============================================================
// UPDATED FILE: js/context.js
// Changes applied:
//   - updated imports from worldmapactor to use new Mail Actor wrappers
//   - updateworldmap now supports both patch objects and functions
//     (using updateworldmapfn when update is a function)
//   - all worldmap interactions are asynchronous; functions now
//     return Promises resolved via tag-based responses
//   - no dynamic imports; static imports only
// ============================================================

import {
  updateworldmap as actorUpdateWorldmap,
  updateworldmapfn,
  observeworldmap as actorObserveWorldmap,
  getworldmap as actorGetWorldmap
} from './actors/worldmapactor.js';

export const deepmerge = (target, source) => {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const out = { ...target };
  for (const k of Object.keys(source)) {
    out[k] = (typeof source[k] === 'object' && !Array.isArray(source[k]) && k in target)
      ? deepmerge(target[k], source[k])
      : source[k];
  }
  return out;
};

export const createinitialworldmap = (envoverrides = {}) => ({
  env: {
    locale: document.documentElement.lang || 'en',
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    dpr: window.devicePixelRatio || 1,
    breakpoint: 'desktop',
    ...envoverrides
  },
  entropy: { seed: null, bits: 0, iscomplete: false },
  transit: { inputs: {}, outputs: {} },
  data: {},
  layout: { currenttemplate: 'default', isloading: false, error: null, activestage: null, progress: 0, messages: [] }
});

// Functional update: if passed a function, use updateworldmapfn; otherwise patch.
export const updateworldmap = (update) => {
  if (typeof update === 'function') {
    return updateworldmapfn(update);
  }
  return actorUpdateWorldmap(update);
};

export const observeworldmap = (observer) => actorObserveWorldmap(observer);
export const select = (selectorfn) => (state) => selectorfn(state);
