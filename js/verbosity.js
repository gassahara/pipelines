// ============================================================
// UPDATED FILE: js/verbosity.js
// Change applied: portable functions, no `this`, no closures
// ============================================================

function createVerbosityConstants() {
  return Object.freeze({
    NONE: 0,
    CRITICAL: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    ALL: 4
  });
}

var constants = createVerbosityConstants();

function resolveLevel(val) {
  if (typeof val === 'number') {
    return Math.max(constants.NONE, Math.min(constants.DEBUG, Math.floor(val)));
  }
  if (typeof val === 'string') {
    var upper = val.toUpperCase();
    if (constants[upper] !== undefined) return constants[upper];
    var parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return Math.max(constants.NONE, Math.min(constants.DEBUG, parsed));
  }
  return null;
}

function getverbosity(state) {
  if (state === undefined || state === null) return constants.DEBUG;
  var direct = resolveLevel(state);
  if (direct !== null) return direct;
  if (typeof state === 'object') {
    if (state.level !== undefined) {
      var l = resolveLevel(state.level);
      if (l !== null) return l;
    }
    if (state.verbosity !== undefined) {
      var v = resolveLevel(state.verbosity);
      if (v !== null) return v;
    }
    if (state.verbosityLevel !== undefined) {
      var vl = resolveLevel(state.verbosityLevel);
      if (vl !== null) return vl;
    }
    if (state.options) {
      return getverbosity(state.options);
    }
  }
  return constants.DEBUG;
}

function setverbosity(state, level) {
  var lvl = resolveLevel(level);
  if (lvl !== null) {
    if (state && typeof state === 'object') {
      var copy = Object.keys(state).reduce(function(acc, k) { acc[k] = state[k]; return acc; }, {});
      copy.level = lvl;
      copy.verbosity = lvl;
      return Object.freeze(copy);
    }
    return Object.freeze({ level: lvl, verbosity: lvl });
  }
  return state;
}

function emit(level, state, prefix, args) {
  if (getverbosity(state) >= level) {
    var full = prefix ? [prefix].concat(args) : args;
    if (level === constants.ERROR || level === constants.CRITICAL) {
      console.error.apply(console, full);
    } else if (level === constants.WARN) {
      console.warn.apply(console, full);
    } else {
      console.log.apply(console, full);
    }
  }
}

function logcritical(state, prefix) {
  emit(constants.NONE, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logerror(state, prefix) {
  emit(constants.ERROR, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logwarn(state, prefix) {
  emit(constants.WARN, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function loginfo(state, prefix) {
  emit(constants.INFO, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logdebug(state, prefix) {
  emit(constants.DEBUG, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function getverbosityname(levelValue) {
  var lvl = resolveLevel(levelValue);
  switch (lvl) {
    case constants.NONE: return 'NONE';
    case constants.ERROR: return 'ERROR';
    case constants.WARN: return 'WARN';
    case constants.INFO: return 'INFO';
    case constants.DEBUG: return 'DEBUG';
    default: return 'UNKNOWN';
  }
}

function createVerbosityFunctions() {
  return Object.freeze({
    getverbosity: getverbosity,
    setverbosity: setverbosity,
    logcritical: logcritical,
    logerror: logerror,
    logwarn: logwarn,
    loginfo: loginfo,
    logdebug: logdebug,
    getverbosityname: getverbosityname
  });
}
