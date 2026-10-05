var DYNAMICMESSAGETYPESREF = { current: Object.freeze({}) };
var MESSAGETYPEVALUESREF = { current: {} };

function GETDYNAMICMESSAGETYPES() {
  return DYNAMICMESSAGETYPESREF.current;
}
function GETMESSAGETYPE(NAME) {
  if (typeof NAME !== 'string' || NAME.length === 0) return null;
  var VALUES = MESSAGETYPEVALUESREF.current;
  if (!Object.prototype.hasOwnProperty.call(VALUES, NAME)) return null;
  return VALUES[NAME];
}

function GETTYPESTRUCTURE(NAME) {
  var V = GETMESSAGETYPE(NAME);
  if (V === null) return null;
  return V.structure();
}

function MESSAGETYPEEXISTS(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var DYNAMIC = DYNAMICMESSAGETYPESREF.current;
  return DYNAMIC && DYNAMIC[TYPE] !== undefined;
}
var messagetypevalidkinds = {
  string: true,
  number: true,
  boolean: true,
  object: true,
  array: true,
  'function': true,
  any: true
};

function kindmatches(VALUE, KIND) {
  if (KIND === 'any') return true;
  if (KIND === 'array') return Array.isArray(VALUE);
  if (KIND === 'object') return typeof VALUE === 'object' && VALUE !== null && !Array.isArray(VALUE);
  return typeof VALUE === KIND;
}

function stringtype()   { return { kind: 'string',   optional: false, defaultvalue: undefined }; }
function numbertype()   { return { kind: 'number',   optional: false, defaultvalue: undefined }; }
function booleantype()  { return { kind: 'boolean',  optional: false, defaultvalue: undefined }; }
function objecttype()   { return { kind: 'object',   optional: false, defaultvalue: undefined }; }
function arraytype()    { return { kind: 'array',    optional: false, defaultvalue: undefined }; }
function functiontype() { return { kind: 'function', optional: false, defaultvalue: undefined }; }
function anytype()      { return { kind: 'any',      optional: false, defaultvalue: undefined }; }

function optionaltype(SPEC) {
  if (!SPEC || typeof SPEC !== 'object' || typeof SPEC.kind !== 'string') {
    throw new Error('[optionaltype] SPEC must be a spec object produced by a spec constructor');
  }
  if (messagetypevalidkinds[SPEC.kind] !== true) {
    throw new Error('[optionaltype] unknown kind: ' + SPEC.kind);
  }
  return { kind: SPEC.kind, optional: true, defaultvalue: SPEC.defaultvalue };
}

function defaultedtype(SPEC, VALUE) {
  if (!SPEC || typeof SPEC !== 'object' || typeof SPEC.kind !== 'string') {
    throw new Error('[defaultedtype] SPEC must be a spec object produced by a spec constructor');
  }
  if (messagetypevalidkinds[SPEC.kind] !== true) {
    throw new Error('[defaultedtype] unknown kind: ' + SPEC.kind);
  }
  return { kind: SPEC.kind, optional: SPEC.optional === true, defaultvalue: VALUE };
}
function messagetype(NAME, SPEC) {
  if (typeof NAME !== 'string' || NAME.length === 0) {
    throw new Error('[messagetype] NAME must be a non-empty string');
  }
  if (!SPEC || typeof SPEC !== 'object' || Array.isArray(SPEC)) {
    throw new Error('[messagetype] SPEC must be a non-null object');
  }
  var FIELDKEYS = Object.keys(SPEC);
  FIELDKEYS.forEach(function (K) {
    var S = SPEC[K];
    if (!S || typeof S !== 'object' || typeof S.kind !== 'string') {
      throw new Error('[messagetype] field ' + K + ' must be a spec object with a kind');
    }
    if (messagetypevalidkinds[S.kind] !== true) {
      throw new Error('[messagetype] field ' + K + ' has unknown kind: ' + S.kind);
    }
  });

  var IFACE = {};
  FIELDKEYS.forEach(function (K) {
    var S = SPEC[K];
    IFACE[K] = { kind: S.kind, optional: S.optional === true, defaultvalue: S.defaultvalue };
  });

  function TYPEFN(MESSAGE) {
    var R = TYPEFN.validate(MESSAGE);
    if (R.valid !== true) {
      var E = new Error('[messagetype] ' + NAME + ' validation failed: ' + R.errors.join('; '));
      E.diagnostic = { KIND: 'messagetype-validation-failed', TYPENAME: NAME, ERRORS: R.errors };
      throw E;
    }
    return MESSAGE;
  }

  TYPEFN.typename = NAME;
  TYPEFN.iface = IFACE;

  TYPEFN.structure = function () {
    var REQUIRED = [];
    var OPTIONAL = [];
    FIELDKEYS.forEach(function (K) {
      if (IFACE[K].optional === true) OPTIONAL.push(K);
      else REQUIRED.push(K);
    });
    return { name: NAME, required: REQUIRED, optional: OPTIONAL };
  };

  TYPEFN.validate = function (MESSAGE) {
    var ERRORS = [];
    if (!MESSAGE || typeof MESSAGE !== 'object' || Array.isArray(MESSAGE)) {
      ERRORS.push('message must be a non-null object');
      return { valid: false, errors: ERRORS };
    }
    FIELDKEYS.forEach(function (K) {
      var S = IFACE[K];
      var V = MESSAGE[K];
      if (V === undefined || V === null) {
        if (S.optional !== true && S.defaultvalue === undefined) {
          ERRORS.push('missing required field ' + K);
        }
        return;
      }
      if (!kindmatches(V, S.kind)) {
        ERRORS.push('field ' + K + ' expected ' + S.kind + ' got ' + (Array.isArray(V) ? 'array' : typeof V));
      }
    });
    return { valid: ERRORS.length === 0, errors: ERRORS };
  };

  TYPEFN.produce = function (PARTIAL) {
    var OUT = {};
    if (PARTIAL && typeof PARTIAL === 'object' && !Array.isArray(PARTIAL)) {
      Object.keys(PARTIAL).forEach(function (K) {
        if (Object.prototype.hasOwnProperty.call(IFACE, K)) OUT[K] = PARTIAL[K];
      });
    }
    FIELDKEYS.forEach(function (K) {
      if (OUT[K] !== undefined) return;
      var S = IFACE[K];
      if (S.defaultvalue !== undefined) OUT[K] = S.defaultvalue;
    });
    var R = TYPEFN.validate(OUT);
    if (R.valid !== true) {
      var E = new Error('[messagetype] ' + NAME + ' produce failed: ' + R.errors.join('; '));
      E.diagnostic = { KIND: 'messagetype-produce-failed', TYPENAME: NAME, ERRORS: R.errors };
      throw E;
    }
    return OUT;
  };

  TYPEFN.project = function (MESSAGE) {
    var OUT = {};
    if (!MESSAGE || typeof MESSAGE !== 'object') return OUT;
    FIELDKEYS.forEach(function (K) {
      if (MESSAGE[K] !== undefined) OUT[K] = MESSAGE[K];
    });
    return OUT;
  };

  return TYPEFN;
}

function REGISTERMESSAGETYPE(TYPEVALUE) {
  if (typeof TYPEVALUE !== 'function' || typeof TYPEVALUE.typename !== 'string' || TYPEVALUE.typename.length === 0) {
    throw new Error('[REGISTERMESSAGETYPE] argument must be a type value produced by messagetype');
  }
  var NAME = TYPEVALUE.typename;
  var VALUES = MESSAGETYPEVALUESREF.current;
  if (Object.prototype.hasOwnProperty.call(VALUES, NAME)) {
    if (VALUES[NAME] === TYPEVALUE) return NAME;
    throw new Error('[REGISTERMESSAGETYPE] conflicting re-registration for ' + NAME);
  }
  var NEXTVALUES = {};
  Object.keys(VALUES).forEach(function (K) { NEXTVALUES[K] = VALUES[K]; });
  NEXTVALUES[NAME] = TYPEVALUE;
  MESSAGETYPEVALUESREF.current = NEXTVALUES;

  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[NAME] === undefined) {
    var NEXT = {};
    Object.keys(CURRENT).forEach(function (K) { NEXT[K] = CURRENT[K]; });
    NEXT[NAME] = NAME;
    DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
  }
  return NAME;
}

function UNREGISTERMESSAGETYPE(TYPE) {
  if (typeof TYPE !== 'string' || TYPE.length === 0) return false;
  var VALUES = MESSAGETYPEVALUESREF.current;
  var REMOVED = false;
  if (Object.prototype.hasOwnProperty.call(VALUES, TYPE)) {
    var NEXTVALUES = {};
    Object.keys(VALUES).forEach(function (K) {
      if (K !== TYPE) NEXTVALUES[K] = VALUES[K];
    });
    MESSAGETYPEVALUESREF.current = NEXTVALUES;
    REMOVED = true;
  }
  var CURRENT = DYNAMICMESSAGETYPESREF.current;
  if (CURRENT[TYPE] !== undefined) {
    var NEXT = {};
    Object.keys(CURRENT).forEach(function (K) {
      if (K !== TYPE) NEXT[K] = CURRENT[K];
    });
    DYNAMICMESSAGETYPESREF.current = Object.freeze(NEXT);
    REMOVED = true;
  }
  return REMOVED;
}
