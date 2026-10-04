var DYNAMICMESSAGETYPESREF = { current: Object.freeze({}) };

function GETDYNAMICMESSAGETYPES() {
  return DYNAMICMESSAGETYPESREF.current;
}

function MESSAGETYPEEXISTS(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var DYNAMIC = DYNAMICMESSAGETYPESREF.current;
  return DYNAMIC && DYNAMIC[TYPE] !== undefined;
}

function REGISTERMESSAGETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) {
    throw new Error('[REGISTERMESSAGETYPE] TYPE must be a non-empty string');
  }
  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[TYPE] !== undefined) return TYPE;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
  NEXT[TYPE] = TYPE;
  DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
  return TYPE;
}

function UNREGISTERMESSAGETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[TYPE] === undefined) return false;
  var NEXT = {};
  Object.keys(CURRENT).forEach(function (K) {
    if (K !== TYPE) NEXT[K] = CURRENT[K];
  });
  DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
  return true;
}
