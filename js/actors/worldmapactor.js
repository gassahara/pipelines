var WORLDMAPVERBOSITYCONSTANTS = createverbosityconstants();
var WORLDMAPSTATE = { level: WORLDMAPVERBOSITYCONSTANTS.DEBUG };

// Immutable path setter and value set application
function SETINPATH(OBJ, PATH, VALUE) {
  var KEYS = PATH.split('.');
  if (KEYS.length === 0) return VALUE;
  var KEY = KEYS[0];
  var REST = KEYS.slice(1).join('.');
  var NEXTOBJ = OBJ && typeof OBJ === 'object' ? OBJ : {};
  var UPDATEDCHILD = REST ? SETINPATH(NEXTOBJ[KEY], REST, VALUE) : VALUE;
  var NEWOBJ = Array.isArray(NEXTOBJ) ? NEXTOBJ.slice() : Object.keys(NEXTOBJ).reduce(function(ACC, K) {
    ACC[K] = NEXTOBJ[K];
    return ACC;
  }, {});
  NEWOBJ[KEY] = UPDATEDCHILD;
  return NEWOBJ;
}

function APPLYVALUESET(ENV, UPDATES) {
  return UPDATES.reduce(function(ACC, UPDATE) {
    return SETINPATH(ACC, UPDATE.path, UPDATE.value);
  }, ENV);
}

function PERSISTENV(ENV) {
  logdebug(ENV, '[WORLDMAPACTOR]', 'PERSISTENV SAVING ENV TO DB');
  var STOREFN = (typeof DBSTORE === 'function') ? DBSTORE : (typeof DB_STORE === 'function' ? DB_STORE : function() { return Promise.resolve(true); });
  STOREFN('actor:state:env', ENV).then(function(SUCCESS) {
    if (SUCCESS === false) {
      logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED');
    }
  }).catch(function(E) {
    logwarn(ENV, '[WORLDMAPACTOR]', 'STATE PERSIST FAILED:', E);
  });
}

function RECOVERENV() {
  logdebug({}, '[WORLDMAPACTOR]', 'RECOVERENV START');
  var RESTOREFN = (typeof DBRESTORE === 'function') ? DBRESTORE : (typeof DB_RESTORE === 'function' ? DB_RESTORE : function() { return Promise.resolve(null); });
  return RESTOREFN('actor:state:env').then(function(SAVED) {
    if (SAVED !== null && SAVED !== undefined) {
      loginfo(SAVED, '[WORLDMAPACTOR]', 'RECOVERENV RESTORED ENV');
      return SAVED;
    }
    loginfo({}, '[WORLDMAPACTOR]', 'RECOVERENV NO SAVED ENV, USING EMPTY CONTAINER');
    return {};
  });
}

// Behavior function: (env, message) -> env | promise<env>
function WORLDMAPBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[WORLDMAPACTOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);

  switch (MESSAGE.TYPE) {
    case MESSAGETYPES.UPDATE: {
      if (!MESSAGE.updates || !Array.isArray(MESSAGE.updates)) {
        logwarn(ENV, '[WORLDMAPACTOR]', 'UPDATE MISSING UPDATES ARRAY');
        return ENV;
      }
      var NEWENV = APPLYVALUESET(ENV, MESSAGE.updates);
      (NEWENV.OBSERVERS || []).forEach(function(OBSERVER) {
        try { OBSERVER(NEWENV); } catch (ERR) { logwarn(NEWENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
      });
      PERSISTENV(NEWENV);
      return NEWENV;
    }
    case MESSAGETYPES.UPDATEFN:
    case MESSAGETYPES.UPDATE_FN: {
      var NEXTENV = MESSAGE.FN(ENV);
      if (NEXTENV === undefined) NEXTENV = ENV;
      (NEXTENV.OBSERVERS || []).forEach(function(OBSERVER) {
        try { OBSERVER(NEXTENV); } catch (ERR) { logwarn(NEXTENV, '[WORLDMAPACTOR]', 'OBSERVER NOTIFICATION FAILED:', ERR); }
      });
      PERSISTENV(NEXTENV);
      return NEXTENV;
    }
    case MESSAGETYPES.OBSERVE: {
      var NEWOBSERVERS = (ENV.OBSERVERS || []).concat([MESSAGE.OBSERVER]);
      return SETINPATH(ENV, 'observers', NEWOBSERVERS);
    }
    case MESSAGETYPES.UNOBSERVE: {
      var FILTERED = (ENV.OBSERVERS || []).filter(function(OBS) { return OBS !== MESSAGE.OBSERVER; });
      return SETINPATH(ENV, 'observers', FILTERED);
    }
    case MESSAGETYPES.GETWORLDMAP:
    case MESSAGETYPES.GET_WORLDMAP:
    case MESSAGETYPES.GETENV:
    case MESSAGETYPES.GET_ENV: {
      if (MESSAGE.SENDER && MESSAGE.TAG) {
        SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'WORLDMAPACTOR');
      }
      return ENV;
    }
    default:
      logwarn(ENV, '[WORLDMAPACTOR]', 'UNKNOWN MESSAGE TYPE:', MESSAGE.TYPE);
      return ENV;
  }
}

// Initial state is empty object; actors own their slices.
REGISTERACTORSTATE('WORLDMAPACTOR', {});

function STARTWORLDMAPACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS : (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      WORLDMAPSTATE = { level: LVL };
      var ENVFORVERBOSITY = GETACTORSTATE('WORLDMAPACTOR');
      if (ENVFORVERBOSITY) {
        SETACTORSTATE('WORLDMAPACTOR', SETINPATH(ENVFORVERBOSITY, 'verbosity', LVL));
      }
    }
  }
  var CURRENTENV = GETACTORSTATE('WORLDMAPACTOR') || {};
  return RECOVERENV().then(function(SAVED) {
    SETACTORSTATE('WORLDMAPACTOR', SAVED);
    return SAVED;
  }).catch(function(ERR) {
    logwarn(CURRENTENV, '[WORLDMAPACTOR]', 'STATE RESTORE FAILED:', ERR);
    return CURRENTENV;
  });
}

function SENDWORLDMAPPATCH(PATCH, RESPONSESPEC) {
  if (PATCH && PATCH.UPDATES) {
    var TAG = GENERATETAG();
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, { updates: PATCH.UPDATES }, TAG, 'system', RESPONSESPEC);
  }
}

function UPDATEWORLDMAPFN(FN, RESPONSESPEC) {
  var TAG = GENERATETAG();
  var TYPE = MESSAGETYPES.UPDATEFN || MESSAGETYPES.UPDATE_FN;
  SENDINSTRUCTION('WORLDMAPACTOR', TYPE, { FN: FN }, TAG, 'system', RESPONSESPEC);
}

function OBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.OBSERVE, { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function UNOBSERVEWORLDMAP(OBSERVER, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UNOBSERVE, { OBSERVER: OBSERVER }, TAG, 'system', RESPONSESPEC);
}

function GETWORLDMAP(RESPONSESPEC) {
  var TAG = GENERATETAG();
  var TYPE = MESSAGETYPES.GETWORLDMAP || MESSAGETYPES.GET_WORLDMAP;
  SENDINSTRUCTION('WORLDMAPACTOR', TYPE, {}, TAG, 'system', RESPONSESPEC);
}