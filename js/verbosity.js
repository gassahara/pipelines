function createVerbosityConstants() {
  return Object.freeze({
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
  });
}

function createVerbosityFunctions(constants) {
  function getverbosity(state) {
    return state.level;
  }

  function setverbosity(state, level) {
    if (level >= constants.NONE && level <= constants.DEBUG) {
      return Object.freeze({ level: level });
    }
    return state;
  }

  function logerror(state, message) {
    if (getverbosity(state) >= constants.ERROR) {
      console.error.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function logwarn(state, message) {
    if (getverbosity(state) >= constants.WARN) {
      console.warn.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function loginfo(state, message) {
    if (getverbosity(state) >= constants.INFO) {
      console.log.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function logdebug(state, message) {
    if (getverbosity(state) >= constants.DEBUG) {
      console.log.apply(console, Array.prototype.slice.call(arguments, 1));
    }
  }

  function getverbosityname(levelValue) {
    switch (levelValue) {
      case constants.NONE: return 'NONE';
      case constants.ERROR: return 'ERROR';
      case constants.WARN: return 'WARN';
      case constants.INFO: return 'INFO';
      case constants.DEBUG: return 'DEBUG';
      default: return 'UNKNOWN';
    }
  }

  return Object.freeze({
    getverbosity: getverbosity,
    setverbosity: setverbosity,
    logerror: logerror,
    logwarn: logwarn,
    loginfo: loginfo,
    logdebug: logdebug,
    getverbosityname: getverbosityname
  });
}

export {
  createVerbosityConstants,
  createVerbosityFunctions
};
