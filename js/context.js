var createinitialworldmap = function(envoverrides) {
  envoverrides = envoverrides !== undefined ? envoverrides : {};
  var baseenv = {
    locale: (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'en',
    theme: (typeof document !== 'undefined' && document.documentElement && document.documentElement.getAttribute('data-theme')) || 'dark',
    dpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    breakpoint: 'desktop'
  };
  var env = Object.keys(envoverrides).reduce(function(acc, k) {
    acc[k] = envoverrides[k];
    return acc;
  }, baseenv);
  return {
    env: env,
    entropy: { seed: null, bits: 0, iscomplete: false },
    transit: { inputs: {}, outputs: {} },
    data: {},
    layout: { currenttemplate: 'default', isloading: false, error: null, activestage: null, progress: 0, messages: [] }
  };
};

var updateworldmap = function(update) {
  if (typeof update === 'function') {
    return UPDATEWORLDMAPFN(update);
  }
  return SENDWORLDMAPPATCH(update);
};

var select = function(selectorfn) { return function(state) { return selectorfn(state); }; };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createinitialworldmap: createinitialworldmap,
    updateworldmap: updateworldmap,
    select: select
  };
}
