var createinitialworldmap = function(envoverrides) {
  envoverrides = envoverrides !== undefined ? envoverrides : {};
  var baseEnv = {
    locale: document.documentElement.lang || 'en',
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    dpr: window.devicePixelRatio || 1,
    breakpoint: 'desktop'
  };
  // Merge overrides into base env
  var env = Object.keys(envoverrides).reduce(function(acc, k) {
    acc[k] = envoverrides[k];
    return acc;
  }, baseEnv);
  return {
    env: env,
    entropy: { seed: null, bits: 0, iscomplete: false },
    transit: { inputs: {}, outputs: {} },
    data: {},
    layout: { currenttemplate: 'default', isloading: false, error: null, activestage: null, progress: 0, messages: [] }
  };
};

// Functional update: if passed a function, use UPDATEWORLDMAPFN; otherwise patch.
var updateworldmap = function(update) {
  if (typeof update === 'function') {
    return UPDATEWORLDMAPFN(update);
  }
  return SENDWORLDMAPPATCH(update);
};

var select = function(selectorfn) { return function(state) { return selectorfn(state); }; };
