import { updateworldmap as actormirror, observeworldmap as actorobserve, getworldmap } from './actors/worldmapactor.js';

const isobject = (item) => (item && typeof item === 'object' && !Array.isArray(item));

export const deepmerge = (target, source) => {
  const output = { ...target };
  if (isobject(target) && isobject(source)) {
    Object.keys(source).forEach(key => {
      if (isobject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepmerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};

export const createinitialworldmap = (envoverrides = {}) => {
  const dpr = window.devicePixelRatio || 1;
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  return {
    env: {
      locale: document.documentElement.lang || 'en',
      theme: theme,
      dpr: dpr,
      breakpoint: 'desktop',
      ...envoverrides
    },
    entropy: { seed: null, bits: 0, iscomplete: false },
    transit: { inputs: {}, outputs: {} },
    data: {},
    layout: {
      currenttemplate: 'default',
      isloading: false,
      error: null,
      activestage: null,
      progress: 0,
      messages: []
    }
  };
};

export const updateworldmap = (update) => {
  const current = getworldmap();
  const patch = typeof update === 'function' ? update(current) : update;
  actormirror(patch);
};

export const observeworldmap = (observer) => actorobserve(observer);
export const select = (selectorfn) => (state) => selectorfn(state);
