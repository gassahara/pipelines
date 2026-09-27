// fnblock.js — function-value concern
// Top of the DAG: reads tokenscanner.js and parser.js globals;
// provides the fn-value surface.
//
// @proposal=P2 — assertdefinedinputs and containsstyleaccess use
// trampolined recursion. No `for` / `while` remains in this file.
// @proposal=P3 — camelCase local identifiers normalized to lowercase.
// @proposal=P5 — compilefnblock does not read runtime.evalstack.
// @proposal=P9 (Cycle P9-06) — validaterevivableobject removed;
// compilefnblock signature aligned (no `dependencies` parameter).
// @proposal=P11 (Cycle P11-01) — reader alignment: the fn/writer block's
// behaviour lives on the canonical `behaviour` field.
// @proposal=P11 (Cycle P11-03, batch 11.2) — the DNA-era serialization
// pipeline is removed. Under the corrected P5 model, a pipeline is a
// program and its fn blocks are live function values passed by
// reference; nothing is serialized and nothing is revived. The
// string-scanning helpers (`skipspaces`, `readidentifier`,
// `skipquoted`, `findmatchingparen`, `findbodybrace`,
// `skipidentifierpart`) and `rewritefunctionsource` existed only to
// serve the removed pipeline and are removed with it.
// `resolvefrombriefcase`, `structuralhash`, `getdepstorekey`,
// `defaultanalyzer`, `serializedepvalue`, `serializefunctionwithdeps`,
// `serializeselfcontainedclosure`, `preparednaforserialization`, and
// `preparefunctionforserialization` are removed.

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

// containsidentifier is retained: it is the source-identifier test used
// by checkfnvalue. It uses isidentifierstart / isidentifierpart from
// tokenscanner.js.
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

// ============================================================
// §3 — Function-value validation
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

// @proposal=P11 (Cycle P11-01) — the fn/writer block's behaviour lives on
// the canonical `behaviour` field.
function validaterevivablefunctionblock(block, blocktypes, constants) {
  if (block.type !== blocktypes.fn && block.type !== blocktypes.writer) return [];
  var fn = block.behaviour;
  if (typeof fn !== 'function') return [];

  var label = 'block "' + block.id + '"';
  return checkfnvalue(fn, label, constants.defaultfnkeys);
}

// ============================================================
// §4 — fn-block analysis
// ============================================================

function containsstyleaccess(source) {
  if (typeof source !== 'string') return false;

  var len = source.length;
  var masked = new Array(len);

  function isidstart(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
  }
  function isidchar(c) {
    return isidstart(c) || (c >= '0' && c <= '9');
  }

  function scanline(i) {
    if (i >= len) return i;
    if (source.charAt(i) === '\n') return i;
    masked[i] = 1;
    return function() { return scanline(i + 1); };
  }
  function scanblock(i) {
    if (i + 1 >= len) return i;
    if (source.charAt(i) === '*' && source.charAt(i + 1) === '/') {
      masked[i] = 1;
      masked[i + 1] = 1;
      return i + 2;
    }
    masked[i] = 1;
    return function() { return scanblock(i + 1); };
  }
  function scanstring(i, quote) {
    if (i >= len) return i;
    var sc = source.charAt(i);
    if (sc === '\\') {
      masked[i] = 1;
      if (i + 1 < len) masked[i + 1] = 1;
      return function() { return scanstring(i + 2, quote); };
    }
    masked[i] = 1;
    if (sc === quote) return i + 1;
    return function() { return scanstring(i + 1, quote); };
  }
  function maskpass(i) {
    if (i >= len) return null;
    var c = source.charAt(i);
    if (c === '/' && i + 1 < len && source.charAt(i + 1) === '/') {
      masked[i] = 1;
      masked[i + 1] = 1;
      var lineend = trampoline(scanline)(i + 2);
      return function() { return maskpass(lineend); };
    }
    if (c === '/' && i + 1 < len && source.charAt(i + 1) === '*') {
      masked[i] = 1;
      masked[i + 1] = 1;
      var blockend = trampoline(scanblock)(i + 2);
      return function() { return maskpass(blockend); };
    }
    if (c === '"' || c === "'" || c === '`') {
      masked[i] = 1;
      var stringend = trampoline(scanstring)(i + 1, c);
      return function() { return maskpass(stringend); };
    }
    return function() { return maskpass(i + 1); };
  }
  trampoline(maskpass)(0);

  var localbindings = {};

  function skipspacesat(j) {
    if (j >= len) return j;
    var c = source.charAt(j);
    if (c === ' ' || c === '\t') return function() { return skipspacesat(j + 1); };
    return j;
  }
  function scanident(j) {
    if (j >= len) return j;
    if (isidchar(source.charAt(j))) return function() { return scanident(j + 1); };
    return j;
  }
  function pass2(i) {
    if (i >= len) return null;
    if (masked[i]) return function() { return pass2(i + 1); };
    if (i > 0 && isidchar(source.charAt(i - 1))) return function() { return pass2(i + 1); };
    var kind = 0;
    if (source.substr(i, 4) === 'var ') kind = 4;
    else if (source.substr(i, 4) === 'let ') kind = 4;
    else if (source.substr(i, 6) === 'const ') kind = 6;
    if (kind === 0) return function() { return pass2(i + 1); };
    if (i + kind < len && isidchar(source.charAt(i + kind))) return function() { return pass2(i + 1); };
    var j = trampoline(skipspacesat)(i + kind);
    var namestart = j;
    if (j < len && isidstart(source.charAt(j))) {
      j = trampoline(scanident)(j + 1);
      var name = source.substring(namestart, j);
      var lowername = name.toLowerCase();
      if (lowername.length >= 5 && lowername.slice(-5) === 'style') {
        localbindings[name] = true;
      }
    }
    var nexti = j > i + kind ? j : i + kind;
    return function() { return pass2(nexti); };
  }
  trampoline(pass2)(0);

  function skipwhitespaceafterstyle(start) {
    if (start >= len) return start;
    if (masked[start]) return start;
    var wc = source.charAt(start);
    if (wc === ' ' || wc === '\t' || wc === '\n' || wc === '\r') {
      return function() { return skipwhitespaceafterstyle(start + 1); };
    }
    return start;
  }
  function findidstart(k) {
    if (k <= 0) return k;
    if (masked[k - 1]) return k;
    if (!isidchar(source.charAt(k - 1))) return k;
    return function() { return findidstart(k - 1); };
  }
  function pass3(i) {
    if (i + 5 > len) return false;
    if (masked[i]) return function() { return pass3(i + 1); };
    var ch = source.charAt(i);
    if ((ch === 's' || ch === 'S') && source.substr(i, 5).toLowerCase() === 'style') {
      var after = trampoline(skipwhitespaceafterstyle)(i + 5);
      if (after < len && !masked[after] && source.charAt(after) === '.') {
        var idstart = trampoline(findidstart)(i);
        var identifier = source.substring(idstart, i + 5);
        if (!localbindings[identifier]) return true;
        return function() { return pass3(after + 1); };
      }
    }
    return function() { return pass3(i + 1); };
  }
  return trampoline(pass3)(0);
}

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

function assertdefinedinputs(blockid, iokeys, env, accessor, allowundefined) {
  if (allowundefined === true) return;
  var keys = iokeys || [];
  function scan(i, acc) {
    if (i >= keys.length) return acc;
    var value = accessor(keys[i])(env);
    var nextacc = (typeof value === 'undefined') ? acc.concat([keys[i]]) : acc;
    return function() { return scan(i + 1, nextacc); };
  }
  var missing = trampoline(scan)(0, []);
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

function analyzeinputusage(src, declared) {
  return analyzecontainerusage(src, 'inputs', declared, { aliases: false });
}

function analyzedepusage(src, declared) {
  return analyzecontainerusage(src, 'deps', declared, { aliases: true });
}

// @proposal=P11 (Cycle P11-01) — analyzefnblock reads the canonical
// `behaviour` field.
function analyzefnblock(block, depsmap, env, parser) {
  if (parser === undefined) parser = parsesource;
  var fn = block.behaviour;
  if (typeof fn !== 'function') {
    return { valid: false, violations: ['behaviour is not a function'], free: [], declared: [] };
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

function createblockanalyzers(blocktypes, dnaconstants) {
  var analyzers = {};
  analyzers[blocktypes.fn] = function(block) {
    var errors = [];
    if (typeof block.behaviour !== 'function') errors.push('fn block must have a behaviour function');
    if (typeof block.behaviour === 'function') {
      if (block.behaviour.toString().indexOf('document.') !== -1 || containsstyleaccess(block.behaviour.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors = errors.concat(validaterevivablefunctionblock(block, blocktypes, dnaconstants));
    }
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs || {}, contracts: [] };
  };
  analyzers[blocktypes.writer] = analyzers[blocktypes.fn];
  return analyzers;
}

// @proposal=P11 (Cycle P11-01) — compilefnblock reads `merged.behaviour`.
function compilefnblock(merged, id, sig, inheritedproperties, options, runtime) {
  if (inheritedproperties === undefined) inheritedproperties = {};
  var blockcompilerstate = runtime.blockcompilerstate;
  var logdebug = runtime.logdebug;
  var logblockdebug = runtime.logblockdebug;
  var callwithstack = runtime.callwithstack;
  var compilepathaccessor = runtime.compilepathaccessor;
  var buildblockproperties = runtime.buildblockproperties;
  var createerrorcontext = runtime.createerrorcontext;

  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling FN block:', id);
  var blockfn = function(env) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing FN block:', id);
    var fn = merged.behaviour;
    if (typeof fn !== 'function') throw new Error('fn block must have a behaviour function: ' + id);
    var properties = buildblockproperties(merged, inheritedproperties, sig, env);
    var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
    var fnargs = [properties].concat(inputargs);
    return callwithstack(null, 'fn:' + id, 'async-await', function() {
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
