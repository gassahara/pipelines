// fnblock.js — function-value concern
// Top of the DAG: reads tokenscanner.js and parser.js globals;
// provides the fn-value surface and re-exports the parser surface
// for out-of-browser Node consumers.

// ============================================================
// §1 — Serializer constants
// ============================================================

function creatednaserializerconstants() {
  return Object.freeze({
    defaultfnkeys: Object.freeze(['length', 'name', 'prototype'])
  });
}

// ============================================================
// §2 — String primitives
// ============================================================

function skipspaces(source, i, len) {
  if (i < len && source[i] === ' ') return skipspaces(source, i + 1, len);
  return i;
}

function readidentifier(source, i, len) {
  function scan(pos, word) {
    if (pos < len && isidentifierpart(source[pos])) return scan(pos + 1, word + source[pos]);
    return { word: word, end: pos };
  }
  return scan(i, '');
}

function containsidentifier(src, target) {
  var len = src.length;

  function skipident(i) {
    if (i < len && isidentifierpart(src[i])) return skipident(i + 1);
    return i;
  }

  function scan(i) {
    if (i >= len) return false;
    if (isidentifierstart(src[i])) {
      var start = i;
      var end = skipident(i + 1);
      var word = src.slice(start, end);
      if (word === target) return true;
      return scan(end);
    }
    return scan(i + 1);
  }

  return scan(0);
}

// ---- TS-1: shared quoted-string skipper ----
function skipquoted(src, i, quote) {
  if (i >= src.length) return i;
  if (src[i] === '\\') return skipquoted(src, i + 2, quote);
  if (src[i] === quote) return i + 1;
  return skipquoted(src, i + 1, quote);
}

// ---- TS-1: find matching close paren, skipping strings ----
function findmatchingparen(src, openindex) {
  function loop(i, depth) {
    if (i >= src.length) return -1;
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipquoted(src, i + 1, ch), depth); };
    }
    if (ch === '(') return function() { return loop(i + 1, depth + 1); };
    if (ch === ')') {
      var d = depth - 1;
      if (d === 0) return i;
      return function() { return loop(i + 1, d); };
    }
    return function() { return loop(i + 1, depth); };
  }

  return trampoline(loop)(openindex, 0);
}

// ---- TS-1 + TS-2: find body opening brace, skipping strings and comments ----
function findbodybrace(src, startindex) {
  function loop(i, depthparen, depthbrace, depthbracket) {
    if (i >= src.length) return -1;
    var ch = src[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipquoted(src, i + 1, ch), depthparen, depthbrace, depthbracket); };
    }

    if (ch === '/' && i + 1 < src.length && src[i + 1] === '/') {
      return function() { return loop(skiplinecomment(src, i + 2), depthparen, depthbrace, depthbracket); };
    }
    if (ch === '/' && i + 1 < src.length && src[i + 1] === '*') {
      return function() { return loop(skipblockcomment(src, i + 2), depthparen, depthbrace, depthbracket); };
    }

    if (ch === '(') return function() { return loop(i + 1, depthparen + 1, depthbrace, depthbracket); };
    if (ch === ')') return function() { return loop(i + 1, depthparen - 1, depthbrace, depthbracket); };
    if (ch === '[') return function() { return loop(i + 1, depthparen, depthbrace, depthbracket + 1); };
    if (ch === ']') return function() { return loop(i + 1, depthparen, depthbrace, depthbracket - 1); };
    if (ch === '{') {
      if (depthparen === 0 && depthbracket === 0) return i;
      return function() { return loop(i + 1, depthparen, depthbrace + 1, depthbracket); };
    }
    if (ch === '}') {
      return function() { return loop(i + 1, depthparen, depthbrace > 0 ? depthbrace - 1 : 0, depthbracket); };
    }

    return function() { return loop(i + 1, depthparen, depthbrace, depthbracket); };
  }

  return trampoline(loop)(startindex, 0, 0, 0);
}

// ============================================================
// §3 — Source rewriter
// ============================================================

function rewritefunctionsource(source, destructure) {
  var len = source.length;

  var i = skipspaces(source, 0, len);
  if (source.slice(i, i + 5) === 'async') {
    i += 5;
    i = skipspaces(source, i, len);
  }

  var idresult = readidentifier(source, i, len);
  var nextword = idresult.word;
  var j = idresult.end;

  function injectdeps(newsource, openparen) {
    var closeparen = findmatchingparen(newsource, openparen);
    if (closeparen === -1) return null;
    var params = newsource.slice(openparen + 1, closeparen).trim();
    var newparams = params.length === 0 ? '__deps' : params + ', __deps';
    return newsource.slice(0, openparen + 1) + newparams + newsource.slice(closeparen);
  }

  function insertdestructure(newsource, closeparen) {
    var bodybrace = findbodybrace(newsource, closeparen + 1);
    if (bodybrace === -1) return null;
    return newsource.slice(0, bodybrace + 1) + destructure + newsource.slice(bodybrace + 1);
  }

  if (nextword === 'function') {
    i = skipspaces(source, j, len);
    if (isidentifierstart(source[i])) {
      i = skipidentifierpart(source, i, len);
      i = skipspaces(source, i, len);
    }
    if (source[i] !== '(') throw new Error('[dnaserializer] invalid function signature');
    var newsource = injectdeps(source, i);
    if (!newsource) throw new Error('[dnaserializer] unmatched paren');
    var newcloseparen = findmatchingparen(newsource, i);
    if (newcloseparen === -1) throw new Error('[dnaserializer] unmatched paren after injection');
    var out = insertdestructure(newsource, newcloseparen);
    if (!out) throw new Error('[dnaserializer] function body not found');
    return out;
  }

  if (source[i] === '(') {
    var newsource2 = injectdeps(source, i);
    if (!newsource2) throw new Error('[dnaserializer] unmatched paren');
    var newcloseparen2 = findmatchingparen(newsource2, i);
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
    return insertdestructure(newsource2, afterarrow) || source;
  }

  if (isidentifierstart(source[i])) {
    var identstart = i;
    i = skipidentifierpart(source, i, len);
    var ident = source.slice(identstart, i);
    i = skipspaces(source, i, len);
    if (source.slice(i, i + 2) !== '=>') return source;

    var newparams3 = '(' + ident + ', __deps) =>';
    var newsource3 = source.slice(0, identstart) + newparams3 + source.slice(i);
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
    return insertdestructure(newsource3, afterarrow3) || source;
  }

  return source;
}






// ============================================================
// §2b — Identifier skip helper (delivers forward reference from segment 1)
// ============================================================

function skipidentifierpart(source, i, len) {
  if (i < len && isidentifierpart(source[i])) return skipidentifierpart(source, i + 1, len);
  return i;
}

// ============================================================
// §4 — Function-value validation (OP-164..OP-166; FB-1)
// ============================================================

function checkfnvalue(fn, label, defaultfnkeys) {
  var errors = [];
  var src = fn.toString();
  if (src.indexOf('[native code]') !== -1) {
    errors.push('[REVIVABILITY] ' + label + ' contains a native function');
  }
  if (fn.name === 'bound ') {
    errors.push('[REVIVABILITY] ' + label + ' contains a bound function');
  }
  if (containsidentifier(src, 'this')) {
    errors.push('[REVIVABILITY] ' + label + ' uses "this"');
  }
  var customkeys = Object.getOwnPropertyNames(fn).filter(function(k) {
    return defaultfnkeys.indexOf(k) === -1;
  });
  if (customkeys.length > 0) {
    errors.push('[REVIVABILITY] ' + label + ' has custom function properties: ' + customkeys.join(', '));
  }
  return errors;
}

function validaterevivablefunctionblock(block, blocktypes, constants) {
  if (block.type !== blocktypes.fn && block.type !== blocktypes.writer) return [];
  var fn = block.type === blocktypes.fn ? block.fn : (block.fn || block.ref);
  if (typeof fn !== 'function') return [];

  var label = 'block "' + block.id + '"';
  return checkfnvalue(fn, label, constants.defaultfnkeys);
}

function validaterevivableobject(obj, label, constants) {
  if (label === undefined) label = 'briefcase';
  var errors = [];
  if (typeof obj !== 'object' || obj === null) return errors;
  Object.keys(obj).forEach(function(key) {
    var value = obj[key];
    if (typeof value === 'function') {
      errors = errors.concat(checkfnvalue(value, label + '.' + key, constants.defaultfnkeys));
    } else if (typeof value === 'object' && value !== null) {
      errors = errors.concat(validaterevivableobject(value, label + '.' + key, constants));
    }
  });
  return errors;
}

// ============================================================
// §5 — Briefcase resolution (OP-167)
// ============================================================

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

// ============================================================
// §6 — Serialization pipeline
// ============================================================

// ---- OP-155 + OP-188 (FB-3): single module-level dep store; two dead vars removed ----
var serializeddepsstore = {};

// ---- OP-168: preparefunctionforserialization ----
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
    throw new Error('[preparednaforserialization] Missing dependencies for function ' +
      (fn.name || '<anonymous>') + ': ' + missing.join(', ') +
      '. Add them to the briefcase or deps.');
  }

  var depkeys = Object.keys(resolveddeps);
  var destructure = depkeys.length
    ? '\n    ' + depkeys.map(function(k) { return 'var ' + k + ' = __deps.' + k + ';'; }).join('\n    ')
    : '';
  var rewritten = depkeys.length ? rewritefunctionsource(source, destructure) : source;

  return { fn: true, source: rewritten, deps: resolveddeps };
}

// ---- OP-169: structuralhash (canonical; closureconsolidator re-exports) ----
function structuralhash(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

// ---- OP-170: getdepstorekey ----
function getdepstorekey(value) {
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

// ---- OP-171: defaultanalyzer ----
function defaultanalyzer(source) {
  return { ok: false, identifiers: [], errors: ['analyzer not provided'] };
}

// ---- OP-172: serializedepvalue ----
function serializedepvalue(value, seen, analyzer) {
  if (analyzer === undefined) analyzer = defaultanalyzer;
  if (seen === undefined) seen = [];
  if (seen.indexOf(value) !== -1) return { circular: true };
  seen.push(value);

  if (value === null || value === undefined) return value;
  var t = typeof value;
  if (t === 'string' || t === 'boolean' || t === 'number') return value;
  if (t === 'function') {
    var key = getdepstorekey(value);
    if (!serializeddepsstore[key]) {
      var serializedFn = serializefunctionwithdeps(value, {}, {}, seen, analyzer);
      if (serializedFn.opaque) {
        serializeddepsstore[key] = { type: 'opaque-fn', source: serializedFn.source };
      } else {
        serializeddepsstore[key] = { type: 'fn', source: serializedFn.source, deps: serializedFn.deps || {} };
      }
    }
    return { depref: key };
  }
  if (Array.isArray(value)) {
    return value.map(function(item) { return serializedepvalue(item, seen.slice(), analyzer); });
  }
  if (t === 'object') {
    var out = {};
    Object.keys(value).forEach(function(k) {
      out[k] = serializedepvalue(value[k], seen.slice(), analyzer);
    });
    return out;
  }
  return value;
}

// ---- OP-173: serializefunctionwithdeps ----
function serializefunctionwithdeps(fn, deps, capturedenv, seen, analyzer) {
  if (analyzer === undefined) analyzer = defaultanalyzer;
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
    var sval = serializedepvalue(val, seen || [], analyzer);
    serializedDepsMap[name] = sval;
  });

  var depLines = order.map(function(name) {
    var serialized = serializedDepsMap[name];
    if (serialized && serialized.depref) {
      return '  var ' + name + ' = __recallDep(' + JSON.stringify(serialized.depref) + ');';
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
    if (arrowidx === -1) {
      return { source: 'function() { ' + depLines + '\n  return (' + src + ');\n}', deps: serializedDepsMap, opaque: false };
    }
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

// ---- OP-174: serializeselfcontainedclosure ----
function serializeselfcontainedclosure(fn, actualargs, capturedenv, deps, analyzer) {
  if (analyzer === undefined) analyzer = defaultanalyzer;
  if (typeof fn !== 'function') return null;
  var serialized = serializefunctionwithdeps(fn, deps || {}, capturedenv || {}, [], analyzer);
  if (serialized.opaque) {
    return {
      fn: true,
      source: '(function() { return ' + JSON.stringify(serialized.source) + '; })()',
      deps: {}
    };
  }
  var source = serialized.source;
  var depsObj = serialized.deps || {};

  var depDefs = [];
  Object.keys(serializeddepsstore).forEach(function(key) {
    var entry = serializeddepsstore[key];
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
    fn: true,
    source: iife,
    deps: depsObj
  };
}

// ---- OP-175: preparednaforserialization ----
function preparednaforserialization(node, env, briefcase, deps, analyzer) {
  if (analyzer === undefined) analyzer = defaultanalyzer;
  if (typeof node === 'function') {
    return preparefunctionforserialization(node, env, briefcase, deps);
  }
  if (Array.isArray(node)) {
    return node.map(function(item) {
      return preparednaforserialization(item, env, briefcase, deps, analyzer);
    });
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

// ---- END segment 2 of 3 ----



// ============================================================
// §7 — fn-block analysis
// ============================================================

// ---- OP-176: containsstyleaccess ----
function containsstyleaccess(source) {
  if (typeof source !== 'string') return false;

  function matchestyl(j, k) {
    var expected = 'tyle';
    if (k >= expected.length) return j;
    if (j >= source.length || source.charAt(j).toLowerCase() !== expected.charAt(k)) return -1;
    return matchestyl(j + 1, k + 1);
  }

  function skipwhitespace(j) {
    if (j >= source.length) return j;
    var c = source.charAt(j);
    if (c === ' ' || c === '\t' || c === '\n') return skipwhitespace(j + 1);
    return j;
  }

  function scan(i) {
    if (i >= source.length) return false;
    var ch = source.charAt(i);
    if (ch === 's' || ch === 'S') {
      var after = matchestyl(i + 1, 0);
      if (after !== -1) {
        var ws = skipwhitespace(after);
        if (source.charAt(ws) === '.') return true;
      }
    }
    return scan(i + 1);
  }

  return scan(0);
}

// ---- OP-177: mapoutputs ----
function mapoutputs(rawresult, outputkeys) {
  if (rawresult === null || typeof rawresult !== 'object' || Array.isArray(rawresult)) {
    throw new Error('mapoutputs: rawresult must be an object');
  }
  if (!Array.isArray(outputkeys)) {
    throw new Error('mapoutputs: outputkeys must be an array');
  }
  function scan(index, acc) {
    if (index >= outputkeys.length) return acc;
    var key = outputkeys[index];
    if (rawresult[key] === undefined) {
      throw new Error('missing required output "' + key + '" from block result');
    }
    acc[key] = rawresult[key];
    return scan(index + 1, acc);
  }
  return scan(0, {});
}

// ---- OP-178: assertdefinedinputs (imperative loop accepted; R-ARC-20) ----
function assertdefinedinputs(blockid, iokeys, env, accessor, allowundefined) {
  if (allowundefined === true) return;
  var keys = iokeys || [];
  var missing = [];
  for (var i = 0; i < keys.length; i++) {
    var value = accessor(keys[i])(env);
    if (typeof value === 'undefined') missing.push(keys[i]);
  }
  if (missing.length > 0) {
    var err = new Error('[BLOCK_INPUT_UNDEFINED] block "' + blockid +
      '" has undefined inputs: ' + missing.join(', '));
    err.diagnostic = {
      BLOCKID: blockid,
      KIND: 'block-input-undefined',
      MISSING: missing
    };
    throw err;
  }
}

// ---- OP-179: analyzecontainerusage (FR-3 recursion applied) ----
function analyzecontainerusage(src, container, declared, opts) {
  if (opts === undefined) opts = {};
  var usealiases = opts.aliases === true;
  var declaredarr = Array.isArray(declared) ? declared : [];
  var declaredset = {};
  declaredarr.forEach(function(n) { declaredset[n] = true; });

  var tokens = tokenize(src);
  var aliases = { properties: true };
  var aliasroot = {};
  var used = {};
  var usedorder = [];

  function recordname(n) {
    if (!used[n]) { used[n] = true; usedorder.push(n); }
  }

  function isident(t, v) { return t && t.type === 'identifier' && t.value === v; }
  function isdot(t) { return t && t.type === 'punctuator' && t.value === '.'; }
  function iseq(t) { return t && t.type === 'punctuator' && t.value === '='; }

  function bindaliases(i) {
    if (i >= tokens.length) return;
    var t = tokens[i];
    if (t.type === 'keyword' && t.value === 'var' && tokens[i + 1] &&
        tokens[i + 1].type === 'identifier') {
      var localname = tokens[i + 1].value;
      if (tokens[i + 2] && iseq(tokens[i + 2])) {
        var rhs = tokens[i + 3];
        if (rhs && rhs.type === 'identifier' && rhs.value === 'properties' &&
            isdot(tokens[i + 4]) && isident(tokens[i + 5], container)) {
          aliases[localname] = true;
          aliasroot[localname] = container;
        } else if (usealiases && rhs && rhs.type === 'identifier' && aliasroot[rhs.value] === container) {
          aliases[localname] = true;
          aliasroot[localname] = container;
        }
      }
    }
    return bindaliases(i + 1);
  }
  bindaliases(0);

  function collectreads(i) {
    if (i >= tokens.length) return;
    var a = tokens[i];
    if (a && a.type === 'identifier' && aliases[a.value] &&
        isdot(tokens[i + 1]) &&
        tokens[i + 2] && tokens[i + 2].type === 'identifier') {
      if (a.value === 'properties') {
        if (isident(tokens[i + 2], container) &&
            isdot(tokens[i + 3]) &&
            tokens[i + 4] && tokens[i + 4].type === 'identifier') {
          recordname(tokens[i + 4].value);
          return collectreads(i + 5);
        }
      } else if (aliasroot[a.value] === container) {
        recordname(tokens[i + 2].value);
        return collectreads(i + 3);
      }
    }
    return collectreads(i + 1);
  }
  collectreads(0);

  var missingdecl = usedorder.filter(function(n) { return !declaredset[n]; });
  var missinguse = declaredarr.filter(function(n) { return !used[n]; });

  return {
    used: usedorder,
    declared: declaredarr.slice(),
    missingdecl: missingdecl,
    missinguse: missinguse
  };
}

// ---- OP-180: analyzeinputusage ----
function analyzeinputusage(src, declared) {
  return analyzecontainerusage(src, 'inputs', declared, { aliases: false });
}

// ---- OP-181: analyzedepusage ----
function analyzedepusage(src, declared) {
  return analyzecontainerusage(src, 'deps', declared, { aliases: true });
}

// ---- OP-182: analyzefnblock ----
function analyzefnblock(block, depsmap, env, parser) {
  if (parser === undefined) parser = parsesource;
  var fn = block.fn;
  if (typeof fn !== 'function') {
    return { valid: false, violations: ['fn is not a function'], free: [], declared: [] };
  }
  var src = fn.toString();
  if (src.indexOf('[native code]') !== -1) {
    return { valid: false, violations: ['native function not allowed'], free: [], declared: [] };
  }
  if (typeof src === 'string' && src.length > fnmaxsourcechars) {
    return {
      valid: false,
      violations: ['[FN_TOO_LARGE] block "' + (block.id || 'unknown') +
        '" has ' + src.length + ' chars, ceiling=' + fnmaxsourcechars],
      free: [], declared: [],
      diagnostics: {
        kind: 'fn-too-large',
        srclen: src.length,
        ceiling: fnmaxsourcechars
      }
    };
  }
  if (typeof parser !== 'function') {
    return {
      valid: false,
      violations: ['parser not supplied (typeof parser=' + (typeof parser) + ')'],
      free: [], declared: [],
      diagnostics: { kind: 'parser-absent', parser: typeof parser }
    };
  }
  var parsed = parser(src);
  if (!parsed) {
    return {
      valid: false,
      violations: ['parser returned no value (typeof return=' + (typeof parsed) + ')'],
      free: [], declared: [],
      diagnostics: { kind: 'parser-absent', returned: typeof parsed }
    };
  }
  if (parsed.ok !== true) {
    var errs = Array.isArray(parsed.errors) ? parsed.errors : [];
    var errstr = errs.length ? errs.join('; ') : 'no error message returned';
    var fingerprint = src.length > 120 ? src.slice(0, 120) + '\u2026' : src;
    var parsestack = (parsed.diagnostic && parsed.diagnostic.stack) ? String(parsed.diagnostic.stack) : null;
    try {
      console.warn('[FN_ANALYSIS_FAILED][parser-rejected] block="' +
        (block.id || 'unknown') + '" srclen=' + src.length +
        ' err="' + errstr + '" src="' + fingerprint + '"' +
        (parsestack ? ' stack="' + parsestack.slice(0, 500) + '"' : ''));
    } catch (_) { /* non-fatal */ }
    return {
      valid: false,
      // OP-027 (R-29b): the violation TEXT itself must announce a failed analysis, so that a consumer which
      // reads only the string (as the purity branch did) cannot mistake it for computed free identifiers.
      // diagnostics.kind stays 'parser-rejected' for compatibility with existing readers.
      violations: ['analysis could not complete (the parser rejected the source): ' + errstr],
      free: [], declared: [],
      diagnostics: {
        kind: 'parser-rejected',
        errors: errs,
        srclen: src.length,
        srcfingerprint: fingerprint,
        parserdiagnostic: parsed.diagnostic || null
      }
    };
  }
  var declared = {};
  Object.keys(depsmap || {}).forEach(function(k) { declared[k] = true; });
  (block.inputs || []).forEach(function(k) { declared[k] = true; });
  var builtinsarr = ['console','window','document','globalThis','Math','JSON','Object','Array','String','Number','Boolean','Promise','Date','RegExp','Error','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent'];
  builtinsarr.forEach(function(k) { declared[k] = true; });
  var violations = parsed.identifiers.filter(function(id) { return !declared[id]; });

  if (violations.length === 0) {
    var inputusage = analyzeinputusage(src, block.inputs || []);
    if (inputusage.missingdecl.length > 0) {
      violations = violations.concat(inputusage.missingdecl.map(function(n) {
        return '[FN_INPUT_UNDECLARED] reads properties.inputs.' + n + ' but does not declare it in inputs';
      }));
    }
    if (block.strictinputs === true && inputusage.missinguse.length > 0) {
      violations = violations.concat(inputusage.missinguse.map(function(n) {
        return '[FN_INPUT_UNUSED] declares input "' + n + '" but never reads it';
      }));
    }
    var depusage = analyzedepusage(src, block.deps || []);
    if (depusage.missingdecl.length > 0) {
      violations = violations.concat(depusage.missingdecl.map(function(n) {
        return '[FN_DEP_UNDECLARED] reads properties.deps.' + n + ' but does not declare it in deps';
      }));
    }
  }

  return {
    valid: violations.length === 0,
    violations: violations,
    free: parsed.identifiers,
    declared: Object.keys(declared)
  };
}

// ---- OP-183: createblockanalyzer ----
function createblockanalyzer(rules) {
  return function(block) {
    var errors = [];
    rules.forEach(function(rule) {
      var value = block[rule.field];
      if (rule.required && (value === undefined || value === null)) {
        errors.push(rule.message);
      } else if (value !== undefined && value !== null) {
        if (rule.type && typeof value !== rule.type) {
          errors.push(rule.message + ' (expected ' + rule.type + ', got ' + typeof value + ')');
        }
        if (rule.custom && !rule.custom(value, block)) errors.push(rule.message);
      }
    });
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs || {}, contracts: [] };
  };
}

// ---- OP-184: createblockanalyzers ----
function createblockanalyzers(blocktypes, dnaconstants) {
  var analyzers = {};
  analyzers[blocktypes.fn] = function(block) {
    var errors = [];
    if (!block.fn) errors.push('fn block must have a function');
    if (typeof block.fn === 'function') {
      if (block.fn.toString().indexOf('document.') !== -1 || containsstyleaccess(block.fn.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors = errors.concat(validaterevivablefunctionblock(block, blocktypes, dnaconstants));
    }
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs || {}, contracts: [] };
  };
  analyzers[blocktypes.writer] = analyzers[blocktypes.fn];
  return analyzers;
}

// ---- OP-185: compilefnblock ----
function compilefnblock(merged, id, sig, inheritedproperties, dependencies, options, runtime) {
  if (inheritedproperties === undefined) inheritedproperties = {};
  var blockcompilerstate = runtime.blockcompilerstate;
  var logdebug = runtime.logdebug;
  var logblockdebug = runtime.logblockdebug;
  var callwithstack = runtime.callwithstack;
  var evalstack = runtime.evalstack;
  var compilepathaccessor = runtime.compilepathaccessor;
  var buildblockproperties = runtime.buildblockproperties;
  var createerrorcontext = runtime.createerrorcontext;

  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling FN block:', id);
  var blockfn = function(env) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing FN block:', id);
    var fn = merged.fn;
    if (!fn) throw new Error('fn block must have a function: ' + id);
    var properties = buildblockproperties(merged, inheritedproperties, sig, env, dependencies);
    var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
    var fnargs = [properties].concat(inputargs);
    return callwithstack(evalstack, 'fn:' + (merged.ref || id), 'async-await', function() {
      return Promise.resolve(fn.apply(null, fnargs)).then(function(result) { return result || {}; });
    }, [env], { context: { env: env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') })
    .then(function(result) {
      if (typeof logblockdebug === 'function') {
        logblockdebug(blockcompilerstate, '[BLOCKCOMPILER]', id, {
          inputs: properties.inputs,
          deps: Object.keys(properties.deps || {}),
          result: result
        });
      }
      return result;
    });
  };
  blockfn.id = id;
  return blockfn;
}

// ============================================================
// §8 — Exports (OP-186)
// ============================================================
