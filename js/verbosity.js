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

function createVerbosityFunctions(constants) {
  if (!constants) {
    constants = createVerbosityConstants();
  }

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
        var copy = {};
        Object.keys(state).forEach(function(k) { copy[k] = state[k]; });
        copy.level = lvl;
        copy.verbosity = lvl;
        return Object.freeze(copy);
      }
      return Object.freeze({ level: lvl, verbosity: lvl });
    }
    return state;
  }

  function logcritical(state) {
    if (getverbosity(state) >= constants.NONE) {
      console.error.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function logerror(state) {
    if (getverbosity(state) >= constants.ERROR) {
      console.error.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function logwarn(state) {
    if (getverbosity(state) >= constants.WARN) {
      console.warn.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function loginfo(state) {
    if (getverbosity(state) >= constants.INFO) {
      console.log.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function logdebug(state) {
    if (getverbosity(state) >= constants.DEBUG) {
      console.log.apply(console, Array.prototype.slice.call(arguments, 1));
    }
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

  function createLogger(prefix, initialLevelOrState) {
    var currentState = typeof initialLevelOrState === 'object' && initialLevelOrState !== null
      ? initialLevelOrState
      : Object.freeze({ level: resolveLevel(initialLevelOrState) !== null ? resolveLevel(initialLevelOrState) : constants.DEBUG });

    return {
      getState: function() { return currentState; },
      setState: function(newStateOrLevel) {
        currentState = setverbosity(currentState, newStateOrLevel);
        return currentState;
      },
      getLevel: function() { return getverbosity(currentState); },
      setLevel: function(lvl) {
        currentState = setverbosity(currentState, lvl);
      },
      critical: function() {
        if (getverbosity(currentState) >= constants.NONE) {
          var args = prefix ? [prefix].concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments);
          console.error.apply(console, args);
        }
      },
      error: function() {
        if (getverbosity(currentState) >= constants.ERROR) {
          var args = prefix ? [prefix].concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments);
          console.error.apply(console, args);
        }
      },
      warn: function() {
        if (getverbosity(currentState) >= constants.WARN) {
          var args = prefix ? [prefix].concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments);
          console.warn.apply(console, args);
        }
      },
      info: function() {
        if (getverbosity(currentState) >= constants.INFO) {
          var args = prefix ? [prefix].concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments);
          console.log.apply(console, args);
        }
      },
      debug: function() {
        if (getverbosity(currentState) >= constants.DEBUG) {
          var args = prefix ? [prefix].concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments);
          console.log.apply(console, args);
        }
      },
      log: function(lvl) {
        var resolved = resolveLevel(lvl);
        var args = Array.prototype.slice.call(arguments, 1);
        if (resolved === constants.NONE) this.critical.apply(this, args);
        else if (resolved === constants.ERROR) this.error.apply(this, args);
        else if (resolved === constants.WARN) this.warn.apply(this, args);
        else if (resolved === constants.INFO) this.info.apply(this, args);
        else this.debug.apply(this, args);
      }
    };
  }

  return Object.freeze({
    getverbosity: getverbosity,
    setverbosity: setverbosity,
    logcritical: logcritical,
    logerror: logerror,
    logwarn: logwarn,
    loginfo: loginfo,
    logdebug: logdebug,
    getverbosityname: getverbosityname,
    createLogger: createLogger
  });
}

export {
  createVerbosityConstants,
  createVerbosityFunctions
};
