function creatednaserializerconstants() {
  return Object.freeze({
    defaultfnkeys: Object.freeze(['length', 'name', 'prototype'])
  });
}

// skipspaces — recursive whitespace scanner (functional-recursive P3).
function skipspaces(source, i, len) {
  if (i < len && source[i] === ' ') return skipspaces(source, i + 1, len);
  return i;
}

// skipidentifierpart — recursive identifier-part scanner.
function skipidentifierpart(source, i, len) {
  if (i < len && isidentifierpart(source[i])) return skipidentifierpart(source, i + 1, len);
  return i;
}

// readidentifier — collects identifier chars; returns { word, end }.
function readidentifier(source, i, len) {
  function scan(pos, word) {
    if (pos < len && isidentifierpart(source[pos])) return scan(pos + 1, word + source[pos]);
    return { word: word, end: pos };
  }
  return scan(i, '');
}

function rewritefunctionsource(source, destructure) {
  var len = source.length;

  var i = skipspaces(source, 0, len);
  if (source.slice(i, i + 5) === 'async') {
    i += 5;
    i = skipspaces(source, i, len);
  }

  var start = i;
  var idresult = readidentifier(source, i, len);
  var nextword = idresult.word;
  var j = idresult.end;

  if (nextword === 'function') {
    i = skipspaces(source, j, len);
    if (isidentifierstart(source[i])) {
      i = skipidentifierpart(source, i, len);
      i = skipspaces(source, i, len);
    }
    if (source[i] !== '(') throw new Error('[dnaserializer] invalid function signature');
    var openparen = i;
    var closeparen = findmatchingparen(source, openparen);
    if (closeparen === -1) throw new Error('[dnaserializer] unmatched paren');
    var params = source.slice(openparen + 1, closeparen).trim();
    var newparams = params.length === 0 ? '__deps' : params + ', __deps';
    var newsource = source.slice(0, openparen + 1) + newparams + source.slice(closeparen);

    var newcloseparen = findmatchingparen(newsource, openparen);
    if (newcloseparen === -1) throw new Error('[dnaserializer] unmatched paren after injection');

    var bodybrace = findbodybrace(newsource, newcloseparen + 1);
    if (bodybrace === -1) throw new Error('[dnaserializer] function body not found');

    return newsource.slice(0, bodybrace + 1) + destructure + newsource.slice(bodybrace + 1);
  }

  if (source[i] === '(') {
    var openparen2 = i;
    var closeparen2 = findmatchingparen(source, openparen2);
    if (closeparen2 === -1) throw new Error('[dnaserializer] unmatched paren');
    var params2 = source.slice(openparen2 + 1, closeparen2).trim();
    var newparams2 = params2.length === 0 ? '__deps' : params2 + ', __deps';
    var newsource2 = source.slice(0, openparen2 + 1) + newparams2 + source.slice(closeparen2);

    var newcloseparen2 = findmatchingparen(newsource2, openparen2);
    if (newcloseparen2 === -1) throw new Error('[dnaserializer] unmatched paren after injection');

    var arrowindex = newsource2.indexOf('=>', newcloseparen2 + 1);
    if (arrowindex === -1) throw new Error('[dnaserializer] arrow not found');

    var afterarrow = skipspaces(newsource2, arrowindex + 2, newsource2.length);
    if (newsource2[afterarrow] !== '{') {
      if (destructure) {
        var exprbody = newsource2.slice(afterarrow);
        return newsource2.slice(0, afterarrow) + '{' + destructure + '\n    return ' + exprbody + ';\n  }';
      }
      return source;
    }

    var bodybrace2 = afterarrow;
    return newsource2.slice(0, bodybrace2 + 1) + destructure + newsource2.slice(bodybrace2 + 1);
  }

  if (isidentifierstart(source[i])) {
    var identstart = i;
    i = skipidentifierpart(source, i, len);
    var ident = source.slice(identstart, i);
    i = skipspaces(source, i, len);
    if (source.slice(i, i + 2) !== '=>') return source;

    var newparams3 = '(' + ident + ', __deps) =>';
    var beforearrow3 = source.slice(0, identstart);
    var afterident3 = source.slice(i);
    var newsource3 = beforearrow3 + newparams3 + afterident3;

    var arrowpos3 = newsource3.indexOf('=>');
    if (arrowpos3 === -1) return source;

    var afterarrow3 = skipspaces(newsource3, arrowpos3 + 2, newsource3.length);
    if (newsource3[afterarrow3] !== '{') {
      if (destructure) {
        var exprbody3 = newsource3.slice(afterarrow3);
        return newsource3.slice(0, afterarrow3) + '{' + destructure + '\n    return ' + exprbody3 + ';\n  }';
      }
      return source;
    }

    var bodybrace3 = afterarrow3;
    return newsource3.slice(0, bodybrace3 + 1) + destructure + newsource3.slice(bodybrace3 + 1);
  }

  return source;
}

function validaterevivablefunctionblock(block, blocktypes, constants) {
  if (block.type !== blocktypes.fn && block.type !== blocktypes.writer) return [];
  var fn = block.type === blocktypes.fn ? block.fn : (block.fn || block.ref);
  if (typeof fn !== 'function') return [];

  var errors = [];
  var src = fn.toString();

  if (src.indexOf('[native code]') !== -1) {
    errors.push('[REVIVABILITY] block "' + block.id + '" contains a native function');
  }

  if (fn.name === 'bound ') {
    errors.push('[REVIVABILITY] block "' + block.id + '" contains a bound function');
  }

  if (containsidentifier(src, 'this')) {
    errors.push('[REVIVABILITY] block "' + block.id + '" uses "this"');
  }

  var defaultfnkeys = constants.defaultfnkeys;
  var customkeys = Object.getOwnPropertyNames(fn).filter(function(k) { return defaultfnkeys.indexOf(k) === -1; });
  if (customkeys.length > 0) {
    errors.push('[REVIVABILITY] block "' + block.id + '" has custom function properties: ' + customkeys.join(', '));
  }

  return errors;
}

function validaterevivableobject(obj, label, constants) {
  if (label === undefined) label = 'briefcase';
  var errors = [];
  if (typeof obj !== 'object' || obj === null) return errors;
  Object.keys(obj).forEach(function(key) {
    var value = obj[key];
    if (typeof value === 'function') {
      var src = value.toString();
      if (src.indexOf('[native code]') !== -1) errors.push('[REVIVABILITY] ' + label + '.' + key + ' contains a native function');
      if (value.name === 'bound ') errors.push('[REVIVABILITY] ' + label + '.' + key + ' contains a bound function');
      if (containsidentifier(src, 'this')) errors.push('[REVIVABILITY] ' + label + '.' + key + ' uses "this"');
      var defaultfnkeys = constants.defaultfnkeys;
      var customkeys = Object.getOwnPropertyNames(value).filter(function(k) { return defaultfnkeys.indexOf(k) === -1; });
      if (customkeys.length > 0) errors.push('[REVIVABILITY] ' + label + '.' + key + ' has custom function properties: ' + customkeys.join(', '));
    } else if (typeof value === 'object' && value !== null) {
      errors = errors.concat(validaterevivableobject(value, label + '.' + key, constants));
    }
  });
  return errors;
}

function resolvefrombriefcase(id, container) {
  if (container === null || typeof container !== 'object') {
    return { found: false, value: undefined };
  }

  if (container[id] !== undefined) {
    return { found: true, value: container[id] };
  }

  var values = Object.keys(container).map(function(k) { return container[k]; });
  function scan(i) {
    if (i >= values.length) return { found: false, value: undefined };
    var value = values[i];
    if (value && typeof value === 'object') {
      var result = resolvefrombriefcase(id, value);
      if (result.found) return result;
    }
    return scan(i + 1);
  }
  return scan(0);
}

function preparefunctionforserialization(fn, env, briefcase, deps) {
  if (deps === undefined) deps = briefcase;
  var source = fn.toString();
  var freeids = detectfreeidentifiers(source);
  var resolveddeps = {};
  var missing = [];

  freeids.forEach(function(id) {
    var resolved = resolvefrombriefcase(id, deps);
    if (resolved.found) {
      resolveddeps[id] = resolved.value;
    } else if (deps !== briefcase) {
      var fb = resolvefrombriefcase(id, briefcase);
      if (fb.found) {
        resolveddeps[id] = fb.value;
      } else if (env && env[id] !== undefined) {
        resolveddeps[id] = env[id];
        if (briefcase) briefcase[id] = env[id];
      } else {
        missing.push(id);
      }
    } else if (env && env[id] !== undefined) {
      resolveddeps[id] = env[id];
      if (briefcase) briefcase[id] = env[id];
    } else {
      missing.push(id);
    }
  });

  if (missing.length > 0) {
    throw new Error('[preparednaforserialization] Missing dependencies for function ' + (fn.name || '<anonymous>') + ': ' + missing.join(', ') + '. Add them to the briefcase or deps.');
  }

  var depkeys = Object.keys(resolveddeps);
  var destructure = depkeys.length ? '\n    ' + depkeys.map(function(k) { return 'var ' + k + ' = __deps.' + k + ';'; }).join('\n    ') : '';
  var rewritten = depkeys.length ? rewritefunctionsource(source, destructure) : source;

  return { __fn__: true, source: rewritten, deps: resolveddeps };
}

function safeliteral(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'null';
  try {
    var json = JSON.stringify(value);
    return json === undefined ? 'undefined' : json;
  } catch (e) {
    return 'null';
  }
}

// ==================== GLOBAL SERIALIZED DEPS STORE ====================
var serializedDepsStore = {};
var serializedDepsCounter = 0;
var serializedDepsKeyMap = {};

function structuralhash(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function getDepStoreKey(value) {
  if (typeof value === 'function') {
    return 'fn:' + structuralhash(value.toString());
  }
  if (value && typeof value === 'object') {
    try {
      return 'obj:' + structuralhash(JSON.stringify(value, function(k, v) {
        if (typeof v === 'function') return v.toString();
        return v;
      }));
    } catch (e) {
      return 'obj:' + String(value);
    }
  }
  return 'val:' + typeof value + ':' + String(value);
}

function defaultAnalyzer(source) {
  return { ok: false, identifiers: [], errors: ['analyzer not provided'] };
}

function serializeDepValue(value, seen, analyzer) {
  if (analyzer === undefined) analyzer = defaultAnalyzer;
  if (seen === undefined) seen = [];
  if (seen.indexOf(value) !== -1) return { __circular: true };
  seen.push(value);

  if (value === null || value === undefined) return value;
  var t = typeof value;
  if (t === 'string' || t === 'boolean' || t === 'number') return value;
  if (t === 'function') {
    var key = getDepStoreKey(value);
    if (!serializedDepsStore[key]) {
      var serializedFn = serializeFunctionWithDeps(value, {}, {}, seen, analyzer);
      if (serializedFn.opaque) {
        serializedDepsStore[key] = { type: 'opaque-fn', source: serializedFn.source };
      } else {
        serializedDepsStore[key] = { type: 'fn', source: serializedFn.source, deps: serializedFn.deps || {} };
      }
    }
    return { __depref: key };
  }
  if (Array.isArray(value)) {
    return value.map(function(item) { return serializeDepValue(item, seen.slice(), analyzer); });
  }
  if (t === 'object') {
    var out = {};
    Object.keys(value).forEach(function(k) {
      out[k] = serializeDepValue(value[k], seen.slice(), analyzer);
    });
    return out;
  }
  return value;
}

function serializeFunctionWithDeps(fn, deps, capturedenv, seen, analyzer) {
  if (analyzer === undefined) analyzer = defaultAnalyzer;
  if (typeof fn !== 'function') return { source: 'function() {}', deps: {}, opaque: false };
  var src = fn.toString();
  if (src.indexOf('[native code]') !== -1) {
    return { source: src, deps: {}, opaque: true };
  }
  var parsed = analyzer(src);
  if (!parsed || parsed.ok !== true || !Array.isArray(parsed.identifiers)) {
    return { source: src, deps: {}, opaque: true };
  }
  var freeIds = parsed.identifiers;
  var bindings = {};
  var order = [];

  freeIds.forEach(function(id) {
    if (deps && deps[id] !== undefined) {
      bindings[id] = deps[id];
      order.push(id);
    } else if (capturedenv && capturedenv[id] !== undefined) {
      bindings[id] = capturedenv[id];
      order.push(id);
    }
  });

  var serializedDepsMap = {};
  order.forEach(function(name) {
    var val = bindings[name];
    var sval = serializeDepValue(val, seen || [], analyzer);
    serializedDepsMap[name] = sval;
  });

  var depLines = order.map(function(name) {
    var serialized = serializedDepsMap[name];
    if (serialized && serialized.__depref) {
      return '  var ' + name + ' = __recallDep(' + JSON.stringify(serialized.__depref) + ');';
    }
    return '  var ' + name + ' = ' + JSON.stringify(serialized) + ';';
  }).join('\n');

  var openparen = src.indexOf('(');
  var closeparen = openparen === -1 ? -1 : findmatchingparen(src, openparen);
  if (openparen === -1 || closeparen === -1) {
    return { source: 'function() { ' + depLines + '\n  return (' + src + ');\n}', deps: serializedDepsMap, opaque: false };
  }

  var bodybrace = findbodybrace(src, closeparen + 1);
  if (bodybrace === -1) {
    var afterarrowmaybe = closeparen + 1;
    var arrowidx = src.indexOf('=>', afterarrowmaybe);
    if (arrowidx === -1) return { source: 'function() { ' + depLines + '\n  return (' + src + ');\n}', deps: serializedDepsMap, opaque: false };
    var afterarrow = skipspaces(src, arrowidx + 2, src.length);
    var expr = src.slice(afterarrow);
    return { source: '(function() {\n' + depLines + '\n  return (' + expr + ');\n})', deps: serializedDepsMap, opaque: false };
  }

  var bodystart = bodybrace + 1;
  var bodyend = src.lastIndexOf('}');
  var innerbody = src.slice(bodystart, bodyend);
  var zeroargsource = 'function() {\n' + depLines + '\n' + innerbody + '\n}';
  return { source: zeroargsource, deps: serializedDepsMap, opaque: false };
}

function serializeselfcontainedclosure(fn, actualargs, capturedenv, deps, analyzer) {
  if (analyzer === undefined) analyzer = defaultAnalyzer;
  if (typeof fn !== 'function') return null;
  var serialized = serializeFunctionWithDeps(fn, deps || {}, capturedenv || {}, [], analyzer);
  if (serialized.opaque) {
    return {
      __fn__: true,
      source: '(function() { return ' + JSON.stringify(serialized.source) + '; })()',
      deps: {}
    };
  }
  var source = serialized.source;
  var depsObj = serialized.deps || {};

  var depDefs = [];
  Object.keys(serializedDepsStore).forEach(function(key) {
    var entry = serializedDepsStore[key];
    if (entry.type === 'fn') {
      depDefs.push('  __depStore[' + JSON.stringify(key) + '] = ' + entry.source + ';');
    }
  });

  var iife = '(function() {\n' +
    '  var __depStore = {};\n' +
    depDefs.join('\n') + '\n' +
    '  function __recallDep(key) {\n' +
    '    return __depStore[key] || null;\n' +
    '  }\n' +
    '  return (' + source + ');\n' +
    '})()';

  return {
    __fn__: true,
    source: iife,
    deps: depsObj
  };
}

function preparednaforserialization(node, env, briefcase, deps, analyzer) {
  if (analyzer === undefined) analyzer = defaultAnalyzer;
  if (typeof node === 'function') {
    return preparefunctionforserialization(node, env, briefcase, deps);
  }
  if (Array.isArray(node)) {
    return node.map(function(item) { return preparednaforserialization(item, env, briefcase, deps, analyzer); });
  }
  if (node && typeof node === 'object') {
    var out = {};
    Object.keys(node).forEach(function(key) {
      out[key] = preparednaforserialization(node[key], env, briefcase, deps, analyzer);
    });
    return out;
  }
  return node;
}

// aliases (lowercase)
var creatednaserializerconstantsalias = creatednaserializerconstants;
var rewritefunctionsourcealias = rewritefunctionsource;
var validaterevivablefunctionblockalias = validaterevivablefunctionblock;
var validaterevivableobjectalias = validaterevivableobject;
var resolvefrombriefcasealias = resolvefrombriefcase;
var preparefunctionforserializationalias = preparefunctionforserialization;
var serializeselfcontainedclosurealias = serializeselfcontainedclosure;
var preparednaforserializationalias = preparednaforserialization;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    creatednaserializerconstants: creatednaserializerconstants,
    creatednaserializerconstantsalias: creatednaserializerconstantsalias,
    rewritefunctionsource: rewritefunctionsource,
    rewritefunctionsourcealias: rewritefunctionsourcealias,
    validaterevivablefunctionblock: validaterevivablefunctionblock,
    validaterevivablefunctionblockalias: validaterevivablefunctionblockalias,
    validaterevivableobject: validaterevivableobject,
    validaterevivableobjectalias: validaterevivableobjectalias,
    resolvefrombriefcase: resolvefrombriefcase,
    resolvefrombriefcasealias: resolvefrombriefcasealias,
    preparefunctionforserialization: preparefunctionforserialization,
    preparefunctionforserializationalias: preparefunctionforserializationalias,
    serializeselfcontainedclosure: serializeselfcontainedclosure,
    serializeselfcontainedclosurealias: serializeselfcontainedclosurealias,
    preparednaforserialization: preparednaforserialization,
    preparednaforserializationalias: preparednaforserializationalias,
    serializedDepsStore: serializedDepsStore,
    serializeFunctionWithDeps: serializeFunctionWithDeps,
    serializeDepValue: serializeDepValue
  };
}
