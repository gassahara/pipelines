// ============================================================
// UPDATED FILE: js/factory/freevarparser.js
// Change applied: ESM purge (export block → module.exports).
// Body already ES5 (var/function only). PUNCTUATORS/scanner string
// data ('=>', '?.', '`') is DATA, not syntax. Trivial linear scans
// simplified to indexOf/reduce; state-machine scanner/parser loops
// retained (ES5-legal; functional conversion deferred — see trace).
// ============================================================

var hasOwn = Object.prototype.hasOwnProperty;

// trampoline — plan Phase 3 TIP: avoid stack overflow with deep recursion.
function trampoline(fn) {
  return function() {
    var result = fn.apply(null, arguments);
    while (typeof result === 'function') { result = result(); }
    return result;
  };
}

function cloneObj(obj) {
  return Object.keys(obj).reduce(function(out, k) {
    if (hasOwn.call(obj, k)) out[k] = obj[k];
    return out;
  }, {});
}

function has(obj, key) {
  return hasOwn.call(obj, key);
}

function contains(arr, item) {
  return arr.indexOf(item) !== -1;
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f' || ch === '\uFEFF';
}

function isLineTerminator(ch) {
  return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isIdentifierPart(ch) {
  return isIdentifierStart(ch) || isDigit(ch);
}

var RESERVED = (function() {
  var words = [
    'function','if','return','let','const','var','switch','case','break','continue',
    'null','true','false','of','in','new','typeof','instanceof','else','do','while',
    'for','try','catch','finally','throw','this','super','class','extends','import',
    'export','default','void','delete','yield','await','async','static','get','set',
    'debugger','with','enum','implements','interface','package','private','protected','public'
  ];
  var map = words.reduce(function(acc, word) { acc[word] = true; return acc; }, {});
  return map;
})();

var BUILTINS = (function() {
  var words = [
    'Math','Date','JSON','Object','Array','String','Number','Boolean','Promise','RegExp',
    'Error','TypeError','ReferenceError','console','document','window','globalThis','undefined',
    'NaN','Infinity','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent',
    'decodeURIComponent','DOMParser','HTMLElement','Node','EventTarget','Set','Map',
    'WeakMap','WeakSet','Reflect','Proxy','Symbol','BigInt','arguments'
  ];
  var map = words.reduce(function(acc, word) { acc[word] = true; return acc; }, {});
  return map;
})();

function isReserved(word) { return has(RESERVED, word); }
function isBuiltin(word) { return has(BUILTINS, word); }

var PUNCTUATORS = [
  ['===','binary'], ['!==','binary'], ['>>>','binary'], ['**=','assignment'],
  ['==','binary'], ['!=','binary'], ['<=','binary'], ['>=','binary'],
  ['&&','binary'], ['||','binary'], ['??','binary'],
  ['++','prefixOrPostfix'], ['--','prefixOrPostfix'],
  ['+=','assignment'], ['-=','assignment'], ['*=','assignment'], ['/=','assignment'],
  ['%=','assignment'], ['&=','assignment'], ['|=','assignment'], ['^=','assignment'],
  ['<<=','assignment'], ['>>=','assignment'], ['>>>=','assignment'],
  ['<<','binary'], ['>>','binary'], ['**','binary'], ['=>','arrow'], ['...','spread'],
  ['{','open'], ['}','close'], ['(','open'], [')','close'], ['[','open'], [']','close'],
  ['.','dot'], [';','separator'], [',','separator'], [':','colon'],
  ['?.','optionalAccess'],
  ['?','conditional'],
  ['+','binaryOrPrefix'], ['-','binaryOrPrefix'], ['*','binary'], ['%','binary'],
  ['&','binary'], ['|','binary'], ['^','binary'], ['~','prefix'], ['!','prefix'],
  ['<','binary'], ['>','binary'], ['=','assignment']
];

function startsWithAt(source, str, index) {
  return source.slice(index, index + str.length) === str;
}

function matchPunctuator(source, i) {
  var found = null;
  PUNCTUATORS.some(function(p) {
    if (startsWithAt(source, p[0], i)) {
      found = { value: p[0], kind: p[1], length: p[0].length };
      return true;
    }
    return false;
  });
  return found;
}

function scanRegExp(source, start) {
  if (source.charAt(start) !== '/') return null;

  function loop(i, body, escaped, inClass) {
    if (i >= source.length) return null;
    var c = source.charAt(i);
    if (escaped) {
      return function() { return loop(i + 1, body + '\\' + c, false, inClass); };
    }
    if (c === '\\') {
      return function() { return loop(i + 1, body + c, true, inClass); };
    }
    if (c === '[') {
      return function() { return loop(i + 1, body + c, false, true); };
    }
    if (c === ']') {
      return function() { return loop(i + 1, body + c, false, false); };
    }
    if (c === '/' && !inClass) {
      function scanFlags(j, flags) {
        if (j < source.length && isIdentifierPart(source.charAt(j))) {
          return scanFlags(j + 1, flags + source.charAt(j));
        }
        return { body: body, flags: flags, end: j };
      }
      return scanFlags(i + 1, '');
    }
    if (isLineTerminator(c)) return null;
    return function() { return loop(i + 1, body + c, false, inClass); };
  }

  return trampoline(loop)(start + 1, '', false, false);
}

function scanString(source, start, quote) {
  function loop(i, value) {
    if (i >= source.length) return null;
    var c = source.charAt(i);
    if (c === '\\') {
      return function() { return loop(i + 2, value + c + (source.charAt(i + 1) || '')); };
    }
    if (c === quote) {
      return { value: value, end: i + 1 };
    }
    if (isLineTerminator(c)) return null;
    return function() { return loop(i + 1, value + c); };
  }
  return trampoline(loop)(start + 1, '');
}

function scanTemplate(source, start) {
  function scanExpr(j, depth) {
    if (j >= source.length) return { depth: depth, end: j };
    var cc = source.charAt(j);
    if (cc === '{') return scanExpr(j + 1, depth + 1);
    if (cc === '}') {
      var d = depth - 1;
      if (d === 0) return { depth: 0, end: j };
      return scanExpr(j + 1, d);
    }
    return scanExpr(j + 1, depth);
  }

  function loop(i, value, expressions) {
    if (i >= source.length) return { value: value, expressions: expressions, end: i };
    var c = source.charAt(i);
    if (c === '\\') {
      return function() { return loop(i + 2, value + c + (source.charAt(i + 1) || ''), expressions); };
    }
    if (c === '`') {
      return { value: value, expressions: expressions, end: i + 1 };
    }
    if (c === '$' && source.charAt(i + 1) === '{') {
      var exprResult = scanExpr(i + 2, 1);
      if (exprResult.depth === 0) {
        var expr = source.slice(i + 2, exprResult.end);
        return function() {
          return loop(exprResult.end + 1, value, expressions.concat([{ raw: expr }]));
        };
      }
    }
    return function() { return loop(i + 1, value + c, expressions); };
  }

  return trampoline(loop)(start + 1, '', []);
}

function scanNumber(source, start) {
  function loop(i, value) {
    if (i >= source.length) return { value: value, end: i };
    var c = source.charAt(i);
    if (isDigit(c) || c === '.' || c === '_') {
      return function() { return loop(i + 1, value + c); };
    }
    return { value: value, end: i };
  }
  var result = trampoline(loop)(start, '');
  if (result.value.length === 0) return null;
  return result;
}

function containsIdentifier(src, target) {
  var len = src.length;

  function skipIdent(i) {
    if (i < len && isIdentifierPart(src[i])) return skipIdent(i + 1);
    return i;
  }

  function scan(i) {
    if (i >= len) return false;
    if (isIdentifierStart(src[i])) {
      var start = i;
      var end = skipIdent(i + 1);
      var word = src.slice(start, end);
      if (word === target) return true;
      return scan(end);
    }
    return scan(i + 1);
  }

  return scan(0);
}

function findMatchingParen(src, openIndex) {
  function skipQuoted(i, quote) {
    if (i >= src.length) return i;
    if (src[i] === '\\') return skipQuoted(i + 2, quote);
    if (src[i] === quote) return i + 1;
    return skipQuoted(i + 1, quote);
  }

  function loop(i, depth) {
    if (i >= src.length) return -1;
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipQuoted(i + 1, ch), depth); };
    }
    if (ch === '(') return function() { return loop(i + 1, depth + 1); };
    if (ch === ')') {
      var d = depth - 1;
      if (d === 0) return i;
      return function() { return loop(i + 1, d); };
    }
    return function() { return loop(i + 1, depth); };
  }

  return trampoline(loop)(openIndex, 0);
}

function findBodyBrace(src, startIndex) {
  function skipQuoted(i, quote) {
    if (i >= src.length) return i;
    if (src[i] === '\\') return skipQuoted(i + 2, quote);
    if (src[i] === quote) return i + 1;
    return skipQuoted(i + 1, quote);
  }

  function skipLineComment(i) {
    if (i < src.length && src[i] !== '\n') return skipLineComment(i + 1);
    return i;
  }

  function skipBlockComment(i) {
    if (i >= src.length) return i;
    if (src[i] === '*' && src[i + 1] === '/') return i + 2;
    return skipBlockComment(i + 1);
  }

  function loop(i, depthParen, depthBrace, depthBracket) {
    if (i >= src.length) return -1;
    var ch = src[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipQuoted(i + 1, ch), depthParen, depthBrace, depthBracket); };
    }

    if (ch === '/' && i + 1 < src.length && src[i + 1] === '/') {
      return function() { return loop(skipLineComment(i + 2), depthParen, depthBrace, depthBracket); };
    }
    if (ch === '/' && i + 1 < src.length && src[i + 1] === '*') {
      return function() { return loop(skipBlockComment(i + 2), depthParen, depthBrace, depthBracket); };
    }

    if (ch === '(') return function() { return loop(i + 1, depthParen + 1, depthBrace, depthBracket); };
    if (ch === ')') return function() { return loop(i + 1, depthParen - 1, depthBrace, depthBracket); };
    if (ch === '[') return function() { return loop(i + 1, depthParen, depthBrace, depthBracket + 1); };
    if (ch === ']') return function() { return loop(i + 1, depthParen, depthBrace, depthBracket - 1); };
    if (ch === '{') {
      if (depthParen === 0 && depthBracket === 0) return i;
      return function() { return loop(i + 1, depthParen, depthBrace + 1, depthBracket); };
    }
    if (ch === '}') {
      return function() { return loop(i + 1, depthParen, depthBrace > 0 ? depthBrace - 1 : 0, depthBracket); };
    }

    return function() { return loop(i + 1, depthParen, depthBrace, depthBracket); };
  }

  return trampoline(loop)(startIndex, 0, 0, 0);
}

function makeToken(type, value, kind, extra) {
  var token = { type: type, value: value };
  if (kind !== undefined) token.kind = kind;
  if (extra !== undefined) token.extra = extra;
  return token;
}

function tokenize(source) {
  var tokens = [];

  function pushToken(token, exprAllowed) {
    tokens.push(token);
    var type = token.type;
    if (type === 'RegExpLiteral' || type === 'StringLiteral' ||
        type === 'NumericLiteral' || type === 'Identifier' ||
        type === 'TemplateLiteral' || type === 'CloseParen' ||
        type === 'CloseBracket' || type === 'CloseBrace') {
      return false;
    } else if (type === 'Punctuator') {
      var kind = token.kind;
      if (kind === 'open' || kind === 'separator' ||
          kind === 'prefix' || kind === 'binary' ||
          kind === 'assignment' || kind === 'conditional' ||
          kind === 'colon' || kind === 'arrow' ||
          kind === 'spread' || kind === 'prefixOrPostfix') {
        return true;
      } else if (kind === 'close' || kind === 'dot' || kind === 'optionalAccess') {
        return false;
      } else {
        return false;
      }
    } else if (type === 'Keyword') {
      return contains(['return','throw','case','new','typeof','void','delete','yield','await','else','in','instanceof'], token.value);
    } else {
      return false;
    }
  }

  function skipLineComment(i) {
    if (i < source.length && source.charAt(i) !== '\n') return skipLineComment(i + 1);
    return i;
  }

  function skipBlockComment(i) {
    if (i >= source.length) return i;
    if (source.charAt(i) === '*' && source.charAt(i + 1) === '/') return i + 2;
    return skipBlockComment(i + 1);
  }

  function skipIdentifier(i) {
    if (i < source.length && isIdentifierPart(source.charAt(i))) return skipIdentifier(i + 1);
    return i;
  }

  function loop(i, exprAllowed) {
    if (i >= source.length) return exprAllowed;
    var ch = source.charAt(i);

    if (isWhitespace(ch) || isLineTerminator(ch)) {
      return function() { return loop(i + 1, exprAllowed); };
    }

    if (ch === '/' && source.charAt(i + 1) === '/') {
      return function() { return loop(skipLineComment(i + 2), exprAllowed); };
    }
    if (ch === '/' && source.charAt(i + 1) === '*') {
      return function() { return loop(skipBlockComment(i + 2), exprAllowed); };
    }

    if (ch === '/') {
      var regex = exprAllowed ? scanRegExp(source, i) : null;
      if (regex) {
        pushToken(makeToken('RegExpLiteral', regex.body, undefined, { flags: regex.flags }), exprAllowed);
        return function() { return loop(regex.end, false); };
      }
      pushToken(makeToken('Punctuator', '/', 'binary'), exprAllowed);
      return function() { return loop(i + 1, true); };
    }

    if (ch === '"' || ch === "'") {
      var str = scanString(source, i, ch);
      if (str) {
        pushToken(makeToken('StringLiteral', str.value), exprAllowed);
        return function() { return loop(str.end, false); };
      }
      throw new Error('[freevarparser] Unterminated string literal at ' + i);
    }

    if (ch === '`') {
      var tpl = scanTemplate(source, i);
      if (tpl) {
        pushToken(makeToken('TemplateLiteral', tpl.value, undefined, { expressions: tpl.expressions }), exprAllowed);
        return function() { return loop(tpl.end, false); };
      }
      throw new Error('[freevarparser] Unterminated template literal at ' + i);
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source.charAt(i + 1)))) {
      var num = scanNumber(source, i);
      if (num) {
        pushToken(makeToken('NumericLiteral', num.value), exprAllowed);
        return function() { return loop(num.end, false); };
      }
    }

    if (isIdentifierStart(ch)) {
      var start = i;
      var wordEnd = skipIdentifier(i + 1);
      var word = source.slice(start, wordEnd);
      if (isReserved(word)) {
        pushToken(makeToken('Keyword', word), exprAllowed);
      } else {
        pushToken(makeToken('Identifier', word), exprAllowed);
      }
      return function() { return loop(wordEnd, false); };
    }

    var punct = matchPunctuator(source, i);
    if (punct) {
      var nextExpr = pushToken(makeToken('Punctuator', punct.value, punct.kind), exprAllowed);
      return function() { return loop(i + punct.length, nextExpr); };
    }

    return function() { return loop(i + 1, exprAllowed); };
  }

  trampoline(loop)(0, true);

  tokens.push(makeToken('EOF', null));
  return tokens;
}

function createState(tokens) {
  return {
    tokens: tokens,
    index: 0,
    scopes: [{}],
    freeVars: {},
    contextStack: ['program'],
    expectExpression: true,
    tentativeStack: []
  };
}

function peek(state) { return state.tokens[state.index]; }

function advance(state) {
  var next = cloneObj(state);
  next.index = state.index + 1;
  return next;
}

function cloneFreeVars(freeVars) { return cloneObj(freeVars); }

function addFreeVar(state, id) {
  if (isDeclared(state.scopes, id) || isBuiltin(id) || isReserved(id)) return state;
  var nextFreeVars = cloneFreeVars(state.freeVars);
  nextFreeVars[id] = true;
  var next = cloneObj(state);
  next.freeVars = nextFreeVars;
  return next;
}

function pushScope(state) {
  var next = cloneObj(state);
  next.scopes = state.scopes.concat([{}]);
  return next;
}

function popScope(state) {
  if (state.scopes.length <= 1) return state;
  var next = cloneObj(state);
  next.scopes = state.scopes.slice(0, -1);
  return next;
}

function declare(state, id) {
  var scopes = state.scopes.slice();
  var current = scopes[scopes.length - 1];
  var newCurrent = cloneObj(current);
  newCurrent[id] = true;
  scopes[scopes.length - 1] = newCurrent;
  var next = cloneObj(state);
  next.scopes = scopes;
  var newFree = cloneObj(state.freeVars);
  delete newFree[id];
  next.freeVars = newFree;
  return next;
}

function isDeclared(scopes, id) {
  function scan(i) {
    if (i < 0) return false;
    if (has(scopes[i], id)) return true;
    return scan(i - 1);
  }
  return scan(scopes.length - 1);
}

function pushContext(state, ctx) {
  var next = cloneObj(state);
  next.contextStack = state.contextStack.concat([ctx]);
  return next;
}

function popContext(state) {
  var next = cloneObj(state);
  next.contextStack = state.contextStack.slice(0, -1);
  return next;
}

function setExpectExpression(state, value) {
  var next = cloneObj(state);
  next.expectExpression = value;
  return next;
}

function openTentative(state, kindKey, startIndex) {
  var t = {
    kindKey: kindKey,
    startIndex: startIndex,
    tokens: [],
    scopeDepth: state.scopes.length,
    contextAtOpen: state.contextStack[state.contextStack.length - 1],
    status: 'open',
    decision: null
  };
  var next = cloneObj(state);
  next.tentativeStack = state.tentativeStack.concat([t]);
  return next;
}

function topTentative(state) {
  var ts = state.tentativeStack;
  return ts.length > 0 ? ts[ts.length - 1] : null;
}

function appendTentative(state, token) {
  var ts = state.tentativeStack;
  if (ts.length === 0) return state;
  var top = ts[ts.length - 1];
  var nextTop = cloneObj(top);
  nextTop.tokens = top.tokens.concat([token]);
  var nextTs = ts.slice(0, -1).concat([nextTop]);
  var next = cloneObj(state);
  next.tentativeStack = nextTs;
  return next;
}

function popTentative(state) {
  if (state.tentativeStack.length === 0) return state;
  var next = cloneObj(state);
  next.tentativeStack = state.tentativeStack.slice(0, -1);
  return next;
}

function findKind(kindKey) {
  var found = null;
  KINDS.some(function(kind) {
    if (kind.name === kindKey) { found = kind; return true; }
    return false;
  });
  return found;
}

function parsePrimaryFromBuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseBlockFromBuffer(state, tokens) {
  var next = pushScope(state);
  var inner = tokens.slice(1, -1);
  inner.forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = popScope(next);
  next = advance(next);
  return next;
}

function parseObjectLiteralFromBuffer(state, tokens) {
  var next = state;
  var inner = tokens.slice(1, -1);

  function scan(i) {
    if (i >= inner.length) return next;
    var t = inner[i];
    if (t.type === 'Identifier') {
      var ahead = inner[i + 1];
      if (ahead && ahead.type === 'Punctuator' && ahead.value === ':') {
        return scan(i + 3);
      }
      next = addFreeVar(next, t.value);
    }
    return scan(i + 1);
  }
  scan(0);
  next = advance(next);
  return next;
}

function parseArrayLiteralFromBuffer(state, tokens) {
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseJsonFromBuffer(state, tokens) {
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseArrowFunctionFromBuffer(state, tokens) {
  var next = pushScope(state);
  var arrowIndex = tokens.reduce(function(acc, t, i) {
    return acc !== -1 ? acc : (t.type === 'Punctuator' && t.value === '=>' ? i : acc);
  }, -1);

  tokens.slice(0, arrowIndex).forEach(function(t) {
    if (t.type === 'Identifier') {
      next = declare(next, t.value);
    }
  });
  tokens.slice(arrowIndex + 1).forEach(function(b) {
    if (b.type === 'Identifier') {
      next = addFreeVar(next, b.value);
    }
  });
  next = popScope(next);
  next = advance(next);
  return next;
}

function parseOptionalAccessFromBuffer(state, tokens) {
  // Original loop body was a no-op (only `continue` on Identifier, no effect).
  var next = state;
  next = advance(next);
  return next;
}

function parseArgumentsFromBuffer(state, tokens) {
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseForHeaderFromBuffer(state, tokens) {
  var next = state;
  var hasInOf = false;
  tokens.forEach(function(t) {
    if (t.type === 'Keyword' && (t.value === 'in' || t.value === 'of')) {
      hasInOf = true;
    }
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseTemplateFromBuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'TemplateLiteral' && t.extra && t.extra.expressions) {
      t.extra.expressions.forEach(function(expr) {
        var subTokens = tokenize(expr.raw);
        var subState = createState(subTokens);
        subState.scopes = next.scopes;
        subState.freeVars = next.freeVars;
        subState = parseExpression(subState, [';', ',', ')', ']', '}']);
        next = cloneObj(next);
        next.freeVars = subState.freeVars;
      });
    }
  });
  next = advance(next);
  return next;
}

function parseConditionalFromBuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseMapConstructFromBuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

var KINDS = [
  {
    name: 'regex',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '/' && state.expectExpression === true;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === '/' && tentative.tokens.length > 1) return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return advance(state);
    },
    reject: function(state, tentative) {
      var next = cloneObj(state);
      next.index = tentative.startIndex;
      return next;
    }
  },
  {
    name: 'objectLiteral',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '{' && state.expectExpression === true;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === '}') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseObjectLiteralFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return parseBlockFromBuffer(state, tentative.tokens);
    }
  },
  {
    name: 'block',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '{' && state.expectExpression !== true;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === '}') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseBlockFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'arrayLiteral',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '[' && state.expectExpression === true;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === ']') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseArrayLiteralFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'json',
    start: function(state, token) {
      return (token.type === 'Punctuator' && token.value === '{') ||
             (token.type === 'Punctuator' && token.value === '[');
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && (token.value === '}' || token.value === ']')) return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseJsonFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'arrowFunction',
    start: function(state, token) {
      return isArrowFunctionStart(state);
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === '=>') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseArrowFunctionFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return parsePrimaryFromBuffer(state, tentative.tokens);
    }
  },
  {
    name: 'memberAccess',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '.';
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Identifier' || token.type === 'Keyword') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return advance(state);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'optionalAccess',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '?.';
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Identifier' || token.type === 'Keyword' ||
          (token.type === 'Punctuator' && token.value === '(')) return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseOptionalAccessFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'call',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '(';
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === ')') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseArgumentsFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'forHeader',
    start: function(state, token) {
      return token.type === 'Keyword' && token.value === 'for';
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Keyword' && (token.value === 'in' || token.value === 'of')) return 'ACCEPT';
      if (token.type === 'Punctuator' && token.value === ';') return 'ACCEPT';
      if (token.type === 'Punctuator' && token.value === ')') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseForHeaderFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'templateSubstitution',
    start: function(state, token) {
      return token.type === 'TemplateLiteral' && token.extra && token.extra.expressions.length > 0;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      return 'ACCEPT';
    },
    commit: function(state, tentative) {
      return parseTemplateFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'conditional',
    start: function(state, token) {
      return token.type === 'Punctuator' && token.value === '?';
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === ':') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseConditionalFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'mapConstruct',
    start: function(state, token) {
      return token.type === 'Keyword' && token.value === 'new' && state.expectExpression === true;
    },
    append: function(tentative, token) {
      var next = cloneObj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'Punctuator' && token.value === ')') return 'ACCEPT';
      if (token.type === 'EOF') return 'REJECT';
      return 'HOLD';
    },
    commit: function(state, tentative) {
      return parseMapConstructFromBuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  }
];

function isArrowFunctionStart(state) {
  var idx = state.index;
  var tokens = state.tokens;

  if (tokens[idx].type === 'Identifier') {
    return tokens[idx + 1] && tokens[idx + 1].type === 'Punctuator' && tokens[idx + 1].value === '=>';
  }

  if (tokens[idx].type === 'Punctuator' && tokens[idx].value === '(') {
    function scanParen(i, depth) {
      if (i >= tokens.length) return false;
      var t = tokens[i];
      if (t.type === 'Punctuator') {
        if (t.value === '(') return scanParen(i + 1, depth + 1);
        if (t.value === ')') {
          var d = depth - 1;
          if (d === 0) {
            return tokens[i + 1] && tokens[i + 1].type === 'Punctuator' && tokens[i + 1].value === '=>';
          }
          return scanParen(i + 1, d);
        }
      }
      if (t.type === 'EOF') return false;
      return scanParen(i + 1, depth);
    }
    return scanParen(idx, 0);
  }

  return false;
}

function parseProgram(state) {
  function loop(s) {
    if (peek(s).type === 'EOF') return s;
    return function() { return loop(parseStatement(s)); };
  }
  var finalState = trampoline(loop)(state);
  return Object.keys(finalState.freeVars).filter(function(k) {
    return has(finalState.freeVars, k);
  });
}

function parseStatement(state) {
  var t = peek(state);

  if (t.type === 'Punctuator') {
    if (t.value === '{') return parseBlock(state);
    if (t.value === ';') return advance(state);
  }

  if (t.type === 'Keyword') {
    switch (t.value) {
      case 'const': case 'let': case 'var':
        return parseVariableDeclaration(state);
      case 'function':
        return parseFunctionDeclaration(state);
      case 'if':
        return parseIfStatement(state);
      case 'for':
        return parseForStatement(state);
      case 'while':
        return parseWhileStatement(state);
      case 'do':
        return parseDoStatement(state);
      case 'try':
        return parseTryStatement(state);
      case 'switch':
        return parseSwitchStatement(state);
      case 'return':
        state = advance(state);
        if (!(peek(state).type === 'Punctuator' && peek(state).value === ';') &&
            !(peek(state).type === 'Punctuator' && peek(state).value === '}') &&
            peek(state).type !== 'EOF') {
          state = parseExpression(state, [';', '}']);
        }
        return consumeSemicolon(state);
      case 'throw':
        state = advance(state);
        state = parseExpression(state, [';']);
        return consumeSemicolon(state);
      case 'break':
      case 'continue':
        state = advance(state);
        return consumeSemicolon(state);
      case 'class':
        return parseClassDeclaration(state);
      case 'debugger':
        state = advance(state);
        return consumeSemicolon(state);
    }
  }

  state = parseExpression(state, [';']);
  return consumeSemicolon(state);
}

function parseBlock(state) {
  state = expectPunctuator(state, '{');
  state = pushScope(state);
  function loop(s) {
    if (peek(s).type === 'Punctuator' && peek(s).value === '}') return s;
    if (peek(s).type === 'EOF') return s;
    return function() { return loop(parseStatement(s)); };
  }
  state = trampoline(loop)(state);
  state = expectPunctuator(state, '}');
  return popScope(state);
}

function parseVariableDeclaration(state) {
  state = advance(state);
  function loop(s) {
    var t = peek(s);
    var nextState;
    if (t.type === 'Identifier') {
      nextState = declare(s, t.value);
      nextState = advance(nextState);
    } else if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) {
      nextState = parseBindingPattern(s);
    } else {
      return s;
    }

    if (peek(nextState).type === 'Punctuator' && peek(nextState).value === '=') {
      nextState = advance(nextState);
      nextState = parseExpression(nextState, [',', ';']);
    }

    if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') {
      return function() { return loop(advance(nextState)); };
    }
    return nextState;
  }
  state = trampoline(loop)(state);
  return consumeSemicolon(state);
}

function parseBindingPattern(state) {
  function loop(s, depth) {
    var t = peek(s);
    if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) {
      return function() { return loop(advance(s), depth + 1); };
    }
    if (t.type === 'Punctuator' && (t.value === '}' || t.value === ']')) {
      var d = depth - 1;
      if (d === 0) return advance(s);
      return function() { return loop(advance(s), d); };
    }
    if (t.type === 'Identifier') {
      return function() { return loop(advance(declare(s, t.value)), depth); };
    }
    return function() { return loop(advance(s), depth); };
  }
  return trampoline(loop)(state, 0);
}

function parseFunctionDeclaration(state) {
  state = advance(state);
  var name = peek(state);
  if (name.type === 'Identifier') {
    state = declare(state, name.value);
    state = advance(state);
  }
  return parseFunctionBody(state);
}

function parseFunctionBody(state) {
  state = pushScope(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    function loopParams(s) {
      if (peek(s).type === 'Punctuator' && peek(s).value === ')') return s;
      if (peek(s).type === 'EOF') return s;
      var p = peek(s);
      var nextState;
      if (p.type === 'Identifier') {
        nextState = declare(s, p.value);
        nextState = advance(nextState);
      } else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) {
        nextState = parseBindingPattern(s);
      } else {
        nextState = advance(s);
      }
      if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') nextState = advance(nextState);
      return function() { return loopParams(nextState); };
    }
    state = trampoline(loopParams)(state);
    state = expectPunctuator(state, ')');
  }

  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = parseBlock(state);
  } else {
    state = parseExpression(state, [';']);
  }

  return popScope(state);
}

function parseIfStatement(state) {
  state = advance(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  state = parseStatement(state);
  if (peek(state).type === 'Keyword' && peek(state).value === 'else') {
    state = advance(state);
    state = parseStatement(state);
  }
  return state;
}

function parseForStatement(state) {
  state = advance(state);
  state = pushScope(state);

  if (peek(state).type === 'Keyword' && peek(state).value === 'await') state = advance(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') state = advance(state);

  if (peek(state).type === 'Keyword' && contains(['var','let','const'], peek(state).value)) {
    state = parseVariableDeclaration(state);
  } else {
    if (!(peek(state).type === 'Punctuator' && peek(state).value === ';')) state = parseExpression(state, [';']);
    if (peek(state).type === 'Keyword' && (peek(state).value === 'in' || peek(state).value === 'of')) {
      state = advance(state);
      state = parseExpression(state, [')']);
      state = expectPunctuator(state, ')');
      state = parseStatement(state);
      return popScope(state);
    }
    state = expectPunctuator(state, ';');
  }

  if (peek(state).type === 'Keyword' && (peek(state).value === 'in' || peek(state).value === 'of')) {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
    state = parseStatement(state);
    return popScope(state);
  }

  if (!(peek(state).type === 'Punctuator' && peek(state).value === ';')) state = parseExpression(state, [';']);
  state = expectPunctuator(state, ';');

  if (!(peek(state).type === 'Punctuator' && peek(state).value === ')')) state = parseExpression(state, [')']);
  if (peek(state).type === 'Punctuator' && peek(state).value === ')') state = advance(state);

  state = parseStatement(state);
  return popScope(state);
}

function parseWhileStatement(state) {
  state = advance(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  return parseStatement(state);
}

function parseDoStatement(state) {
  state = advance(state);
  state = parseStatement(state);
  state = expectKeyword(state, 'while');
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  return consumeSemicolon(state);
}

function parseTryStatement(state) {
  state = advance(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);

  if (peek(state).type === 'Keyword' && peek(state).value === 'catch') {
    state = advance(state);
    state = pushScope(state);
    if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
      state = advance(state);
      var p = peek(state);
      if (p.type === 'Identifier') { state = declare(state, p.value); state = advance(state); }
      else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) state = parseBindingPattern(state);
      state = expectPunctuator(state, ')');
    }
    if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);
    state = popScope(state);
  }

  if (peek(state).type === 'Keyword' && peek(state).value === 'finally') {
    state = advance(state);
    if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);
  }
  return state;
}

function parseSwitchStatement(state) {
  state = advance(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = advance(state);
    function loop(s) {
      if (peek(s).type === 'Punctuator' && peek(s).value === '}') return s;
      if (peek(s).type === 'EOF') return s;
      var t = peek(s);
      var nextState;
      if (t.type === 'Keyword' && t.value === 'case') {
        nextState = advance(s);
        nextState = parseExpression(nextState, [':']);
        nextState = expectPunctuator(nextState, ':');
      } else if (t.type === 'Keyword' && t.value === 'default') {
        nextState = advance(s);
        nextState = expectPunctuator(nextState, ':');
      } else {
        nextState = parseStatement(s);
      }
      return function() { return loop(nextState); };
    }
    state = trampoline(loop)(state);
    state = expectPunctuator(state, '}');
  }
  return state;
}

function parseClassDeclaration(state) {
  state = advance(state);
  var name = peek(state);
  if (name.type === 'Identifier') { state = declare(state, name.value); state = advance(state); }
  if (peek(state).type === 'Keyword' && peek(state).value === 'extends') {
    state = advance(state);
    state = parseExpression(state, ['{']);
  }
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = pushScope(state);
    state = advance(state);
    function loopMembers(s) {
      if (peek(s).type === 'Punctuator' && peek(s).value === '}') return s;
      if (peek(s).type === 'EOF') return s;
      var nextState = s;
      if (peek(nextState).type === 'Identifier' || peek(nextState).type === 'Keyword') nextState = advance(nextState);
      if (peek(nextState).type === 'Punctuator' && peek(nextState).value === '(') {
        nextState = pushScope(nextState);
        nextState = advance(nextState);
        function loopParams(s2) {
          if (peek(s2).type === 'Punctuator' && peek(s2).value === ')') return s2;
          var p = peek(s2);
          var ns = s2;
          if (p.type === 'Identifier') { ns = declare(ns, p.value); ns = advance(ns); }
          else ns = advance(ns);
          return function() { return loopParams(ns); };
        }
        nextState = trampoline(loopParams)(nextState);
        nextState = expectPunctuator(nextState, ')');
        if (peek(nextState).type === 'Punctuator' && peek(nextState).value === '{') nextState = parseBlock(nextState);
        nextState = popScope(nextState);
      } else nextState = advance(nextState);
      return function() { return loopMembers(nextState); };
    }
    state = trampoline(loopMembers)(state);
    state = expectPunctuator(state, '}');
    state = popScope(state);
  }
  return state;
}

function consumeSemicolon(state) {
  if (peek(state).type === 'Punctuator' && peek(state).value === ';') return advance(state);
  return state;
}

function expectPunctuator(state, value) {
  var t = peek(state);
  if (t.type !== 'Punctuator' || t.value !== value) {
    throw new Error('Expected punctuator ' + value + ' but got ' + t.type + ' ' + t.value);
  }
  return advance(state);
}

function expectKeyword(state, value) {
  var t = peek(state);
  if (t.type !== 'Keyword' || t.value !== value) {
    throw new Error('Expected keyword ' + value + ' but got ' + t.type + ' ' + t.value);
  }
  return advance(state);
}

function parseExpression(state, stopTokens) {
  state = pushContext(state, 'expression');
  state = parseAssignmentExpression(state, stopTokens);
  return popContext(state);
}

function parseAssignmentExpression(state, stopTokens) {
  state = parseConditionalExpression(state, stopTokens);
  var t = peek(state);
  if (t.type === 'Punctuator' && contains(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^='], t.value)) {
    state = advance(state);
    state = parseAssignmentExpression(state, stopTokens);
  }
  return state;
}

function parseConditionalExpression(state, stopTokens) {
  state = parseBinaryExpression(state, stopTokens);
  var t = peek(state);
  if (t.type === 'Punctuator' && t.value === '?') {
    state = advance(state);
    state = parseExpression(state, [':']);
    state = expectPunctuator(state, ':');
    state = parseExpression(state, stopTokens);
  }
  return state;
}

function parseBinaryExpression(state, stopTokens) {
  state = parseUnaryExpression(state);
  function loop(s) {
    var t = peek(s);
    if (t.type === 'EOF') return s;
    if (t.type === 'Punctuator') {
      if (contains(stopTokens, t.value)) return s;
      if (t.kind === 'binary' || t.kind === 'assignment' || t.kind === 'conditional' ||
          t.kind === 'colon' || t.kind === 'binaryOrPrefix') {
        var nextState = advance(s);
        nextState = parseUnaryExpression(nextState);
        return function() { return loop(nextState); };
      }
      return s;
    }
    return s;
  }
  return trampoline(loop)(state);
}

function parseUnaryExpression(state) {
  var t = peek(state);
  if (t.type === 'Punctuator' && contains(['!', '~', '+', '-', '++', '--'], t.value)) {
    state = advance(state);
    return parseUnaryExpression(state);
  }
  if (t.type === 'Keyword' && contains(['typeof', 'void', 'delete', 'await', 'yield'], t.value)) {
    state = advance(state);
    return parseUnaryExpression(state);
  }
  return parsePostfixExpression(state);
}

function parsePostfixExpression(state) {
  state = parsePrimaryAndMemberAndCall(state);
  var t = peek(state);
  if (t.type === 'Punctuator' && (t.value === '++' || t.value === '--')) state = advance(state);
  return state;
}

function parsePrimaryAndMemberAndCall(state) {
  var t = peek(state);

  if (t.type === 'Keyword' && t.value === 'async') {
    if (isAsyncArrowStart(state)) return parseArrowFunctionFromTokens(state);
    state = advance(state);
  } else if (t.type === 'Identifier') {
    if (isArrowFunctionStart(state)) return parseArrowFunctionFromTokens(state);
    state = addFreeVar(state, t.value);
    state = advance(state);
  } else if (t.type === 'StringLiteral' || t.type === 'NumericLiteral' || t.type === 'RegExpLiteral') {
    state = advance(state);
  } else if (t.type === 'TemplateLiteral') {
    state = parseTemplateToken(state);
    return state;
  } else if (t.type === 'Keyword' && t.value === 'function') {
    state = advance(state);
    state = parseFunctionBody(state);
  } else if (t.type === 'Keyword' && t.value === 'new') {
    state = advance(state);
    state = parsePrimaryAndMemberAndCall(state);
  } else if (t.type === 'Keyword' && t.value === 'this') {
    state = advance(state);
  } else if (t.type === 'Punctuator' && t.value === '(') {
    if (isArrowFunctionStart(state)) return parseArrowFunctionFromTokens(state);
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  } else if (t.type === 'Punctuator' && t.value === '[') {
    state = parseArrayLiteral(state);
  } else if (t.type === 'Punctuator' && t.value === '{') {
    state = parseObjectLiteral(state);
  } else {
    state = advance(state);
  }

  function loopMember(s) {
    var ct = peek(s);
    if (ct.type === 'Punctuator' && (ct.value === '.' || ct.value === '?.')) {
      var nextState = advance(s);
      var prop = peek(nextState);
      if (prop.type === 'Identifier' || prop.type === 'Keyword') nextState = advance(nextState);
      else if (prop.type === 'Punctuator' && prop.value === '(') {
        nextState = advance(nextState);
        nextState = parseArguments(nextState);
      } else nextState = advance(nextState);
      return function() { return loopMember(nextState); };
    }
    if (ct.type === 'Punctuator' && ct.value === '[') {
      var nextState2 = advance(s);
      nextState2 = parseExpression(nextState2, [']']);
      nextState2 = expectPunctuator(nextState2, ']');
      return function() { return loopMember(nextState2); };
    }
    if (ct.type === 'Punctuator' && ct.value === '(') {
      var nextState3 = advance(s);
      nextState3 = parseArguments(nextState3);
      return function() { return loopMember(nextState3); };
    }
    return s;
  }

  return trampoline(loopMember)(state);
}

function isAsyncArrowStart(state) {
  var tokens = state.tokens;
  var idx = state.index;
  if (tokens[idx].type !== 'Keyword' || tokens[idx].value !== 'async') return false;
  var nxt = tokens[idx + 1];
  if (!nxt) return false;
  if (nxt.type === 'Identifier') {
    return tokens[idx + 2] && tokens[idx + 2].type === 'Punctuator' && tokens[idx + 2].value === '=>';
  }
  if (nxt.type === 'Punctuator' && nxt.value === '(') {
    function scanParen(i, depth) {
      if (i >= tokens.length) return false;
      var t = tokens[i];
      if (t.type === 'Punctuator') {
        if (t.value === '(') return scanParen(i + 1, depth + 1);
        if (t.value === ')') {
          var d = depth - 1;
          if (d === 0) return tokens[i + 1] && tokens[i + 1].type === 'Punctuator' && tokens[i + 1].value === '=>';
          return scanParen(i + 1, d);
        }
      }
      if (t.type === 'EOF') return false;
      return scanParen(i + 1, depth);
    }
    return scanParen(idx + 1, 0);
  }
  return false;
}

function parseArrowFunctionFromTokens(state) {
  state = pushScope(state);
  var t = peek(state);
  if (t.type === 'Keyword' && t.value === 'async') state = advance(state);

  t = peek(state);
  if (t.type === 'Identifier') {
    state = declare(state, t.value);
    state = advance(state);
  } else if (t.type === 'Punctuator' && t.value === '(') {
    state = advance(state);
    function loopParams(s) {
      if (peek(s).type === 'Punctuator' && peek(s).value === ')') return s;
      if (peek(s).type === 'EOF') return s;
      var p = peek(s);
      var nextState;
      if (p.type === 'Identifier') { nextState = declare(s, p.value); nextState = advance(nextState); }
      else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) nextState = parseBindingPattern(s);
      else nextState = advance(s);
      if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') nextState = advance(nextState);
      return function() { return loopParams(nextState); };
    }
    state = trampoline(loopParams)(state);
    state = expectPunctuator(state, ')');
  }

  state = expectPunctuator(state, '=>');

  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = parseBlock(state);
  } else {
    state = parseExpression(state, [';', ',', ')', ']', '}']);
  }

  return popScope(state);
}

function parseTemplateToken(state) {
  var token = peek(state);
  state = advance(state);
  if (token.extra && token.extra.expressions) {
    token.extra.expressions.forEach(function(expr) {
      var subTokens = tokenize(expr.raw);
      var subState = createState(subTokens);
      subState.scopes = state.scopes;
      subState.freeVars = state.freeVars;
      subState = parseExpression(subState, [';', ',', ')', ']', '}']);
      var next = cloneObj(state);
      next.freeVars = subState.freeVars;
      state = next;
    });
  }
  return state;
}

function parseObjectLiteral(state) {
  state = expectPunctuator(state, '{');
  function loop(s) {
    if (peek(s).type === 'Punctuator' && peek(s).value === '}') return s;
    if (peek(s).type === 'EOF') return s;
    var t = peek(s);
    var nextState = s;
    if (t.type === 'Identifier' || t.type === 'StringLiteral' || t.type === 'NumericLiteral') {
      var lookahead = s.tokens[s.index + 1];
      if (lookahead && lookahead.type === 'Punctuator' && lookahead.value === ':') {
        nextState = advance(s);
        nextState = expectPunctuator(nextState, ':');
        nextState = parseExpression(nextState, [',', '}']);
      } else {
        nextState = parsePrimaryAndMemberAndCall(s);
      }
    } else if (t.type === 'Punctuator' && t.value === '[') {
      nextState = advance(s);
      nextState = parseExpression(nextState, [']']);
      nextState = expectPunctuator(nextState, ']');
      if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ':') {
        nextState = advance(nextState);
        nextState = parseExpression(nextState, [',', '}']);
      }
    } else if (t.type === 'Punctuator' && t.value === ',') {
      nextState = advance(s);
    } else {
      nextState = advance(s);
    }
    if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') nextState = advance(nextState);
    return function() { return loop(nextState); };
  }
  state = trampoline(loop)(state);
  return expectPunctuator(state, '}');
}

function parseArrayLiteral(state) {
  state = expectPunctuator(state, '[');
  function loop(s) {
    if (peek(s).type === 'Punctuator' && peek(s).value === ']') return s;
    if (peek(s).type === 'EOF') return s;
    if (peek(s).type === 'Punctuator' && peek(s).value === ',') {
      return function() { return loop(advance(s)); };
    }
    var nextState = parseExpression(s, [',', ']']);
    if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') nextState = advance(nextState);
    return function() { return loop(nextState); };
  }
  state = trampoline(loop)(state);
  return expectPunctuator(state, ']');
}

function parseArguments(state) {
  function loop(s) {
    if (peek(s).type === 'Punctuator' && peek(s).value === ')') return s;
    if (peek(s).type === 'EOF') return s;
    if (peek(s).type === 'Punctuator' && peek(s).value === ',') {
      return function() { return loop(advance(s)); };
    }
    var nextState = parseExpression(s, [',', ')']);
    if (peek(nextState).type === 'Punctuator' && peek(nextState).value === ',') nextState = advance(nextState);
    return function() { return loop(nextState); };
  }
  state = trampoline(loop)(state);
  return expectPunctuator(state, ')');
}

function detectFreeIdentifiers(source) {
  var tokens = tokenize(source);
  var state = createState(tokens);
  return parseProgram(state);
}
