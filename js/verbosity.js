export const VERBOSITY = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

let currentverbosity = VERBOSITY.DEBUG;

export function getverbosity() {
  return currentverbosity;
}

export function setverbosity(level) {
  if (level >= VERBOSITY.NONE && level <= VERBOSITY.DEBUG) {
    currentverbosity = level;
    return true;
  }
  return false;
}

export function logerror(message, ...args) {
  if (currentverbosity >= VERBOSITY.ERROR) {
    console.error(message, ...args);
  }
}

export function logwarn(message, ...args) {
  if (currentverbosity >= VERBOSITY.WARN) {
    console.warn(message, ...args);
  }
}

export function loginfo(message, ...args) {
  if (currentverbosity >= VERBOSITY.INFO) {
    console.log(message, ...args);
  }
}

export function logdebug(message, ...args) {
  if (currentverbosity >= VERBOSITY.DEBUG) {
    console.log(message, ...args);
  }
}

export function getverbosityname(level) {
  switch (level) {
    case VERBOSITY.NONE: return 'NONE';
    case VERBOSITY.ERROR: return 'ERROR';
    case VERBOSITY.WARN: return 'WARN';
    case VERBOSITY.INFO: return 'INFO';
    case VERBOSITY.DEBUG: return 'DEBUG';
    default: return 'UNKNOWN';
  }
}
