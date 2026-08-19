import {
  detectFreeIdentifiers,
  isIdentifierStart,
  isIdentifierPart,
  containsIdentifier,
  findMatchingParen,
  findBodyBrace
} from './freevarparser.js';

function createDnaSerializerConstants() {
  return Object.freeze({
    DEFAULT_FN_KEYS: Object.freeze(['length', 'name', 'prototype'])
  });
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
    var openParen2 = i;
    var closeParen2 = findMatchingParen(source, openParen2);
    if (closeParen2 === -1) throw new Error('[dnaserializer] unmatched paren');
    var params2 = source.slice(openParen2 + 1, closeParen2).trim();
    var newParams2 = params2.length === 0 ? '__deps' : params2 + ', __deps';
    var newSource2 = source.slice(0, openParen2 + 1) + newParams2 + source.slice(closeParen2);

    var newCloseParen2 = findMatchingParen(newSource2, openParen2);
    if (newCloseParen2 === -1) throw new Error('[dnaserializer] unmatched paren after injection');

    var arrowIndex = newSource2.indexOf('=>', newCloseParen2 + 1);
    if (arrowIndex === -1) throw new Error('[dnaserializer] arrow not found');

    var afterArrow = arrowIndex + 2;
    while (afterArrow < newSource2.length && newSource2[afterArrow] === ' ') afterArrow++;
    if (newSource2[afterArrow] !== '{') {
      if (destructure) {
        var exprBody = newSource2.slice(afterArrow);
        return newSource2.slice(0, afterArrow) + '{' + destructure + '\n    return ' + exprBody + ';\n  }';
      }
      return source;
    }

    var bodyBrace2 = afterArrow;
    return newSource2.slice(0, bodyBrace2 + 1) + destructure + newSource2.slice(bodyBrace2 + 1);
  }

  if (isIdentifierStart(source[i])) {
    var identStart = i;
    while (i < len && isIdentifierPart(source[i])) i++;
    var ident = source.slice(identStart, i);
    while (i < len && source[i] === ' ') i++;
    if (source.slice(i, i + 2) !== '=>') return source;

    var newParams3 = '(' + ident + ', __deps) =>';
    var beforeArrow3 = source.slice(0, identStart);
    var afterIdent3 = source.slice(i);
    var newSource3 = beforeArrow3 + newParams3 + afterIdent3;

    var arrowPos3 = newSource3.indexOf('=>');
    if (arrowPos3 === -1) return source;

    var afterArrow3 = arrowPos3 + 2;
    while (afterArrow3 < newSource3.length && newSource3[afterArrow3] === ' ') afterArrow3++;
    if (newSource3[afterArrow3] !== '{') {
      if (destructure) {
        var exprBody3 = newSource3.slice(afterArrow3);
        return newSource3.slice(0, afterArrow3) + '{' + destructure + '\n    return ' + exprBody3 + ';\n  }';
      }
      return source;
    }

    var bodyBrace3 = afterArrow3;
    return newSource3.slice(0, bodyBrace3 + 1) + destructure + newSource3.slice(bodyBrace3 + 1);
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

function safeLiteral(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'null';
  try {
    var json = JSON.stringify(value);
    return json === undefined ? 'undefined' : json;
  } catch (e) {
    return 'null';
  }
}

function serializeSelfContainedClosure(fn, actualArgs, capturedEnv) {
  if (typeof fn !== 'function') return null;

  var src = fn.toString();
  if (src.indexOf('[native code]') !== -1) {
    throw new Error('[serializeSelfContainedClosure] native function not serializable');
  }

  var freeIds = detectFreeIdentifiers(src);
  var bindings = {};
  var order = [];

  freeIds.forEach(function(id) {
    if (capturedEnv && capturedEnv[id] !== undefined) {
      bindings[id] = capturedEnv[id];
      order.push(id);
    }
  });

  if (actualArgs) {
    actualArgs.forEach(function(arg, i) {
      var name = '__arg' + i;
      bindings[name] = arg;
      order.push(name);
    });
  }

  var bindingLines = order.map(function(name) {
    return '  const ' + name + ' = ' + safeLiteral(bindings[name]) + ';';
  }).join('\n');

  var openParen = src.indexOf('(');
  var closeParen = openParen === -1 ? -1 : findMatchingParen(src, openParen);
  if (openParen === -1 || closeParen === -1) {
    return { __fn__: true, source: '(' + src + ')' };
  }

  var bodyBrace = findBodyBrace(src, closeParen + 1);
  if (bodyBrace === -1) {
    var afterArrowMaybe = closeParen + 1;
    var arrowIdx = src.indexOf('=>', afterArrowMaybe);
    if (arrowIdx === -1) return { __fn__: true, source: '(' + src + ')' };
    var afterArrow = arrowIdx + 2;
    while (afterArrow < src.length && src[afterArrow] === ' ') afterArrow++;
    var expr = src.slice(afterArrow);
    var zeroArgSource = '(function() {\n' + bindingLines + '\n  return (' + expr + ');\n})';
    return { __fn__: true, source: zeroArgSource };
  }

  var bodyStart = bodyBrace + 1;
  var bodyEnd = src.lastIndexOf('}');
  var innerBody = src.slice(bodyStart, bodyEnd);
  var zeroArgSource = 'function() {\n' + (bindingLines ? bindingLines + '\n' : '') + innerBody + '\n}';
  return { __fn__: true, source: zeroArgSource };
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
  serializeSelfContainedClosure
};
