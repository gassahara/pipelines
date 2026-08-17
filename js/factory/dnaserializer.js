import { detectFreeIdentifiers } from './freevarparser.js';

function createDnaSerializerConstants() {
  return Object.freeze({
    DEFAULT_FN_KEYS: Object.freeze(['length', 'name', 'prototype'])
  });
}

function isIdentifierStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isIdentifierPart(ch) {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9');
}

function containsIdentifier(src, target) {
  var i = 0;
  var len = src.length;
  while (i < len) {
    if (isIdentifierStart(src[i])) {
      var start = i;
      i++;
      while (i < len && isIdentifierPart(src[i])) i++;
      var word = src.slice(start, i);
      if (word === target) return true;
    } else {
      i++;
    }
  }
  return false;
}

function findMatchingParen(src, openIndex) {
  var depth = 0;
  var i = openIndex;
  while (i < src.length) {
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      var quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function findBodyBrace(src, startIndex) {
  var i = startIndex;
  var depthParen = 0;
  var depthBrace = 0;
  var depthBracket = 0;
  while (i < src.length) {
    var ch = src[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      var quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }

    if (ch === '/' && i + 1 < src.length && src[i + 1] === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && i + 1 < src.length && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (ch === '{') {
      if (depthParen === 0 && depthBracket === 0) return i;
      depthBrace++;
    }
    else if (ch === '}') {
      if (depthBrace > 0) depthBrace--;
    }

    i++;
  }
  return -1;
}

function rewriteFunctionSource(source, destructure) {
  var i = 0;
  var len = source.length;

  while (i < len && source[i] === ' ') i++;
  if (source.slice(i, i + 5) === 'async') {
    i += 5;
    while (i < len && source[i] === ' ') i++;
  }

  var start = i;
  var nextWord = '';
  var j = i;
  while (j < len && (isIdentifierPart(source[j]))) {
    nextWord += source[j];
    j++;
  }

  if (nextWord === 'function') {
    i = j;
    while (i < len && source[i] === ' ') i++;
    if (isIdentifierStart(source[i])) {
      while (i < len && isIdentifierPart(source[i])) i++;
      while (i < len && source[i] === ' ') i++;
    }
    if (source[i] !== '(') throw new Error('[dnaserializer] invalid function signature');
    var openParen = i;
    var closeParen = findMatchingParen(source, openParen);
    if (closeParen === -1) throw new Error('[dnaserializer] unmatched paren');
    var params = source.slice(openParen + 1, closeParen).trim();
    var newParams = params.length === 0 ? '__deps' : params + ', __deps';
    var newSource = source.slice(0, openParen + 1) + newParams + source.slice(closeParen);

    var newCloseParen = findMatchingParen(newSource, openParen);
    if (newCloseParen === -1) throw new Error('[dnaserializer] unmatched paren after injection');

    var bodyBrace = findBodyBrace(newSource, newCloseParen + 1);
    if (bodyBrace === -1) throw new Error('[dnaserializer] function body not found');

    return newSource.slice(0, bodyBrace + 1) + destructure + newSource.slice(bodyBrace + 1);
  }

  if (source[i] === '(') {
    var openParen = i;
    var closeParen = findMatchingParen(source, openParen);
    if (closeParen === -1) throw new Error('[dnaserializer] unmatched paren');
    var params = source.slice(openParen + 1, closeParen).trim();
    var newParams = params.length === 0 ? '__deps' : params + ', __deps';
    var newSource = source.slice(0, openParen + 1) + newParams + source.slice(closeParen);

    var newCloseParen = findMatchingParen(newSource, openParen);
    if (newCloseParen === -1) throw new Error('[dnaserializer] unmatched paren after injection');

    var arrowIndex = newSource.indexOf('=>', newCloseParen + 1);
    if (arrowIndex === -1) throw new Error('[dnaserializer] arrow not found');

    var afterArrow = arrowIndex + 2;
    while (afterArrow < newSource.length && newSource[afterArrow] === ' ') afterArrow++;
    if (newSource[afterArrow] !== '{') {
      return source;
    }

    var bodyBrace = afterArrow;
    return newSource.slice(0, bodyBrace + 1) + destructure + newSource.slice(bodyBrace + 1);
  }

  if (isIdentifierStart(source[i])) {
    var identStart = i;
    while (i < len && isIdentifierPart(source[i])) i++;
    var ident = source.slice(identStart, i);
    while (i < len && source[i] === ' ') i++;
    if (source.slice(i, i + 2) !== '=>') return source;

    var newParams = '(' + ident + ', __deps) =>';
    var beforeArrow = source.slice(0, identStart);
    var afterIdent = source.slice(i);
    var newSource = beforeArrow + newParams + afterIdent;

    var arrowPos = newSource.indexOf('=>');
    if (arrowPos === -1) return source;

    var afterArrow = arrowPos + 2;
    while (afterArrow < newSource.length && newSource[afterArrow] === ' ') afterArrow++;
    if (newSource[afterArrow] !== '{') return source;

    var bodyBrace = afterArrow;
    return newSource.slice(0, bodyBrace + 1) + destructure + newSource.slice(bodyBrace + 1);
  }

  return source;
}

function validaterevivablefunctionblock(block, BLOCKTYPES, constants) {
  if (block.type !== BLOCKTYPES.FN && block.type !== BLOCKTYPES.WRITER) return [];
  var fn = block.type === BLOCKTYPES.FN ? block.fn : (block.fn || block.ref);
  if (typeof fn !== 'function') return [];

  var errors = [];
  var src = fn.toString();

  if (src.indexOf('[native code]') !== -1) {
    errors.push('[REVIVABILITY] block "' + block.id + '" contains a native function');
  }

  if (fn.name === 'bound ') {
    errors.push('[REVIVABILITY] block "' + block.id + '" contains a bound function');
  }

  if (containsIdentifier(src, 'this')) {
    errors.push('[REVIVABILITY] block "' + block.id + '" uses "this"');
  }

  var defaultFnKeys = constants.DEFAULT_FN_KEYS;
  var customKeys = Object.getOwnPropertyNames(fn).filter(function(k) { return defaultFnKeys.indexOf(k) === -1; });
  if (customKeys.length > 0) {
    errors.push('[REVIVABILITY] block "' + block.id + '" has custom function properties: ' + customKeys.join(', '));
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
      if (containsIdentifier(src, 'this')) errors.push('[REVIVABILITY] ' + label + '.' + key + ' uses "this"');
      var defaultFnKeys = constants.DEFAULT_FN_KEYS;
      var customKeys = Object.getOwnPropertyNames(value).filter(function(k) { return defaultFnKeys.indexOf(k) === -1; });
      if (customKeys.length > 0) errors.push('[REVIVABILITY] ' + label + '.' + key + ' has custom function properties: ' + customKeys.join(', '));
    } else if (typeof value === 'object' && value !== null) {
      errors = errors.concat(validaterevivableobject(value, label + '.' + key, constants));
    }
  });
  return errors;
}

function resolveFromBriefcase(id, container) {
  if (container === null || typeof container !== 'object') {
    return { found: false, value: undefined };
  }

  if (container[id] !== undefined) {
    return { found: true, value: container[id] };
  }

  var values = Object.keys(container).map(function(k) { return container[k]; });
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    if (value && typeof value === 'object') {
      var result = resolveFromBriefcase(id, value);
      if (result.found) return result;
    }
  }

  return { found: false, value: undefined };
}

function prepareFunctionForSerialization(fn, env, briefcase) {
  var source = fn.toString();
  var freeIds = detectFreeIdentifiers(source);
  var deps = {};
  var missing = [];

  freeIds.forEach(function(id) {
    var resolved = resolveFromBriefcase(id, briefcase);
    if (resolved.found) {
      deps[id] = resolved.value;
    } else if (env && env[id] !== undefined) {
      deps[id] = env[id];
      if (briefcase) briefcase[id] = env[id];
    } else {
      missing.push(id);
    }
  });

  if (missing.length > 0) {
    throw new Error('[prepareDnaForSerialization] Missing dependencies for function ' + (fn.name || '<anonymous>') + ': ' + missing.join(', ') + '. Add them to the briefcase.');
  }

  var depKeys = Object.keys(deps);
  var destructure = depKeys.length ? '\n    const { ' + depKeys.join(', ') + ' } = __deps;' : '';
  var rewritten = depKeys.length ? rewriteFunctionSource(source, destructure) : source;

  return { __fn__: true, source: rewritten, deps: deps };
}

function prepareDnaForSerialization(node, env, briefcase) {
  if (typeof node === 'function') {
    return prepareFunctionForSerialization(node, env, briefcase);
  }
  if (Array.isArray(node)) {
    return node.map(function(item) { return prepareDnaForSerialization(item, env, briefcase); });
  }
  if (node && typeof node === 'object') {
    var out = {};
    Object.keys(node).forEach(function(key) {
      out[key] = prepareDnaForSerialization(node[key], env, briefcase);
    });
    return out;
  }
  return node;
}

export {
  createDnaSerializerConstants,
  validaterevivablefunctionblock,
  validaterevivableobject,
  resolveFromBriefcase,
  prepareFunctionForSerialization,
  prepareDnaForSerialization
};
