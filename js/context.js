import {
  updateworldmap as actormirror,
  updateworldmapfn,
  observeworldmap as actorobserve,
  getworldmap
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

// P20: functional updates are sent to the worldmap actor for evaluation
// against the actor's current state, avoiding stale reads.
export const updateworldmap = (update) => {
  if (typeof update === 'function') {
    updateworldmapfn(update);
    return;
  }
  actormirror(update);
};

export const observeworldmap = (observer) => actorobserve(observer);
export const select = (selectorfn) => (state) => selectorfn(state);
