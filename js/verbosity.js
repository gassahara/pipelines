function createverbosityconstants() {
  return {
    none: 0,
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    all: 4
  };
}

var constants = createverbosityconstants();

function resolvelevel(val) {
  if (typeof val === 'number') {
    return Math.max(constants.none, Math.min(constants.debug, Math.floor(val)));
  }
  if (typeof val === 'string') {
    var upper = val.toUpperCase();
    if (constants[upper] !== undefined) return constants[upper];
    var parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return Math.max(constants.none, Math.min(constants.debug, parsed));
  }
  return null;
}

function getverbosity(state) {
  if (state === undefined || state === null) return constants.debug;
  var direct = resolvelevel(state);
  if (direct !== null) return direct;
  if (typeof state === 'object') {
    if (state.level !== undefined) {
      var l = resolvelevel(state.level);
      if (l !== null) return l;
    }
    if (state.verbosity !== undefined) {
      var v = resolvelevel(state.verbosity);
      if (v !== null) return v;
    }
    if (state.verbositylevel !== undefined || state.verbosityLevel !== undefined) {
      var vl = resolvelevel(state.verbositylevel !== undefined ? state.verbositylevel : state.verbosityLevel);
      if (vl !== null) return vl;
    }
    if (state.options) {
      return getverbosity(state.options);
    }
  }
  return constants.debug;
}

function setverbosity(state, level) {
  var lvl = resolvelevel(level);
  if (lvl !== null) {
    if (state && typeof state === 'object') {
      var copy = Object.keys(state).reduce(function(acc, k) { acc[k] = state[k]; return acc; }, {});
      copy.level = lvl;
      copy.verbosity = lvl;
      return copy;
    }
    return { level: lvl, verbosity: lvl };
  }
  return state;
}

function emit(level, state, prefix, args) {
  if (getverbosity(state) >= level) {
    var full = prefix ? [prefix].concat(args) : args;
    if (level === constants.error || level === constants.critical) {
      console.error.apply(console, full);
    } else if (level === constants.warn) {
      console.warn.apply(console, full);
    } else {
      console.log.apply(console, full);
    }
  }
}

function logcritical(state, prefix) {
  emit(constants.none, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logerror(state, prefix) {
  emit(constants.error, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logwarn(state, prefix) {
  emit(constants.warn, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function loginfo(state, prefix) {
  emit(constants.info, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function logdebug(state, prefix) {
  emit(constants.debug, state, prefix, Array.prototype.slice.call(arguments, 2));
}

function getverbosityname(levelvalue) {
  var lvl = resolvelevel(levelvalue);
  switch (lvl) {
    case constants.none: return 'none';
    case constants.error: return 'error';
    case constants.warn: return 'warn';
    case constants.info: return 'info';
    case constants.debug: return 'debug';
    default: return 'unknown';
  }
}

// ===== ADDED: logToDebugger helper =====
function logToDebugger(env, level, prefix, data) {
  // If env is not provided, use a default state
  var effectiveEnv = env || {};
  var lvl = resolvelevel(level);
  if (lvl === null) lvl = constants.debug; // fallback

  // Check if verbosity is high enough
  if (getverbosity(effectiveEnv) < lvl) {
    return; // do nothing
  }

  // Emit to console using appropriate level
  var args = [];
  if (data && typeof data === 'object') {
    args = [prefix, data];
  } else {
    args = [prefix, data];
  }
  // Use the existing emit logic
  emit(lvl, effectiveEnv, prefix, [data]);

  // Send to DEBUGACTOR via LOGLINE message
  if (typeof SENDINSTRUCTION !== 'undefined' && typeof MESSAGETYPES !== 'undefined') {
    var tag = (typeof GENERATETAG === 'function') ? GENERATETAG() : 'LOG' + Date.now();
    var payload = {
      level: getverbosityname(lvl),
      message: prefix + ' ' + (typeof data === 'string' ? data : JSON.stringify(data)),
      data: data,
      timestamp: Date.now(),
      prefix: prefix
    };
    SENDINSTRUCTION('DEBUGACTOR', MESSAGETYPES.LOGLINE, payload, tag, 'verbosity');
  }
}
// ===== END ADDED =====

// ===== ADDED: logblockdebug helper =====
function logblockdebug(state, prefix, blockid, values) {
  if (getverbosity(state) < constants.debug) return;
  var serialized;
  if (values === null || values === undefined) {
    serialized = String(values);
  } else if (typeof values === 'object') {
    try {
      serialized = JSON.stringify(values);
    } catch (e) {
      serialized = String(values);
    }
  } else {
    serialized = String(values);
  }
  logdebug(state, prefix, blockid + ' ' + serialized);
}
// ===== END ADDED =====

function createverbosityfunctions() {
  return {
    getverbosity: getverbosity,
    setverbosity: setverbosity,
    logcritical: logcritical,
    logerror: logerror,
    logwarn: logwarn,
    loginfo: loginfo,
    logdebug: logdebug,
    getverbosityname: getverbosityname,
    logToDebugger: logToDebugger,
    logblockdebug: logblockdebug
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createverbosityconstants: createverbosityconstants,
    getverbosity: getverbosity,
    setverbosity: setverbosity,
    logcritical: logcritical,
    logerror: logerror,
    logwarn: logwarn,
    loginfo: loginfo,
    logdebug: logdebug,
    getverbosityname: getverbosityname,
    createverbosityfunctions: createverbosityfunctions,
    logToDebugger: logToDebugger,
    logblockdebug: logblockdebug
  };
}
