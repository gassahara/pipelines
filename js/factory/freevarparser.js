var hasOwn = Object.prototype.hasOwnProperty;

function cloneObj(obj) {
  var out = {};
  for (var k in obj) {
    if (hasOwn.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function has(obj, key) {
  return hasOwn.call(obj, key);
}

function contains(arr, item) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === item) return true;
  }
  return false;
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
  var map = {};
  for (var i = 0; i < words.length; i++) map[words[i]] = true;
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
  var map = {};
  for (var j = 0; j < words.length; j++) map[words[j]] = true;
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
  for (var idx = 0; idx < PUNCTUATORS.length; idx++) {
    var p = PUNCTUATORS[idx];
    if (startsWithAt(source, p[0], i)) {
      return { value: p[0], kind: p[1], length: p[0].length };
    }
  }
  return null;
}

function scanRegExp(source, start) {
  if (source.charAt(start) !== '/') return null;
  var i = start + 1;
  var body = '';
  var inClass = false;
  var escaped = false;
  while (i < source.length) {
    var c = source.charAt(i);
    if (escaped) {
      body += '\\' + c;
      escaped = false;
      i += 1;
      continue;
    }
    if (c === '\\') {
      body += c;
      escaped = true;
      i += 1;
      continue;
    }
    if (c === '[') {
      inClass = true;
      body += c;
      i += 1;
      continue;
    }
    if (c === ']') {
      inClass = false;
      body += c;
      i += 1;
      continue;
    }
    if (c === '/' && !inClass) {
      i += 1;
      var flags = '';
      while (i < source.length && isIdentifierPart(source.charAt(i))) {
        flags += source.charAt(i);
        i += 1;
      }
      return { body: body, flags: flags, end: i };
    }
    if (isLineTerminator(c)) return null;
    body += c;
    i += 1;
  }
  return null;
}

function scanString(source, start, quote) {
  var i = start + 1;
  var value = '';
  while (i < source.length) {
    var c = source.charAt(i);
    if (c === '\\') {
      value += c + (source.charAt(i + 1) || '');
      i += 2;
      continue;
    }
    if (c === quote) {
      i += 1;
      return { value: value, end: i };
    }
    if (isLineTerminator(c)) return null;
    value += c;
    i += 1;
  }
  return null;
}

function scanTemplate(source, start) {
  var i = start + 1;
  var value = '';
  var expressions = [];
  while (i < source.length) {
    var c = source.charAt(i);
    if (c === '\\') {
      value += c + (source.charAt(i + 1) || '');
      i += 2;
      continue;
    }
    if (c === '`') {
      i += 1;
      return { value: value, expressions: expressions, end: i };
    }
    if (c === '$' && source.charAt(i + 1) === '{') {
      var exprStart = i + 2;
      var j = exprStart;
      var depth = 1;
      while (j < source.length && depth > 0) {
        var cc = source.charAt(j);
        if (cc === '{') depth += 1;
        else if (cc === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        j += 1;
      }
      if (depth === 0) {
        var expr = source.slice(exprStart, j);
        expressions.push({ raw: expr });
        i = j + 1;
        continue;
      }
    }
    value += c;
    i += 1;
  }
  return { value: value, expressions: expressions, end: i };
}

function scanNumber(source, start) {
  var i = start;
  var value = '';
  while (i < source.length) {
    var c = source.charAt(i);
    if (isDigit(c) || c === '.' || c === '_') {
      value += c;
      i += 1;
      continue;
    }
    break;
  }
  if (value.length === 0) return null;
  return { value: value, end: i };
}

function makeToken(type, value, kind, extra) {
  var token = { type: type, value: value };
  if (kind !== undefined) token.kind = kind;
  if (extra !== undefined) token.extra = extra;
  return token;
}

function tokenize(source) {
  var tokens = [];
  var i = 0;
  var exprAllowed = true;

  function pushToken(token) {
    tokens.push(token);
    var type = token.type;
    if (type === 'RegExpLiteral' || type === 'StringLiteral' ||
        type === 'NumericLiteral' || type === 'Identifier' ||
        type === 'TemplateLiteral' || type === 'CloseParen' ||
        type === 'CloseBracket' || type === 'CloseBrace') {
      exprAllowed = false;
    } else if (type === 'Punctuator') {
      var kind = token.kind;
      if (kind === 'open' || kind === 'separator' ||
          kind === 'prefix' || kind === 'binary' ||
          kind === 'assignment' || kind === 'conditional' ||
          kind === 'colon' || kind === 'arrow' ||
          kind === 'spread' || kind === 'prefixOrPostfix') {
        exprAllowed = true;
      } else if (kind === 'close' || kind === 'dot' || kind === 'optionalAccess') {
        exprAllowed = false;
      } else {
        exprAllowed = false;
      }
    } else if (type === 'Keyword') {
      exprAllowed = contains(['return','throw','case','new','typeof','void','delete','yield','await','else','in','instanceof'], token.value);
    } else {
      exprAllowed = false;
    }
  }

  while (i < source.length) {
    var ch = source.charAt(i);

    if (isWhitespace(ch) || isLineTerminator(ch)) { i += 1; continue; }

    if (ch === '/' && source.charAt(i + 1) === '/') {
      i += 2;
      while (i < source.length && source.charAt(i) !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source.charAt(i + 1) === '*') {
      i += 2;
      while (i < source.length && !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')) i += 1;
      i += 2;
      continue;
    }

    if (ch === '/') {
      var regex = exprAllowed ? scanRegExp(source, i) : null;
      if (regex) {
        pushToken(makeToken('RegExpLiteral', regex.body, undefined, { flags: regex.flags }));
        i = regex.end;
        continue;
      }
      pushToken(makeToken('Punctuator', '/', 'binary'));
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      var str = scanString(source, i, ch);
      if (str) {
        pushToken(makeToken('StringLiteral', str.value));
        i = str.end;
        continue;
      }
      throw new Error('[freevarparser] Unterminated string literal at ' + i);
    }

    if (ch === '`') {
      var tpl = scanTemplate(source, i);
      if (tpl) {
        pushToken(makeToken('TemplateLiteral', tpl.value, undefined, { expressions: tpl.expressions }));
        i = tpl.end;
        continue;
      }
      throw new Error('[freevarparser] Unterminated template literal at ' + i);
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source.charAt(i + 1)))) {
      var num = scanNumber(source, i);
      if (num) {
        pushToken(makeToken('NumericLiteral', num.value));
        i = num.end;
        continue;
      }
    }

    if (isIdentifierStart(ch)) {
      var start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source.charAt(i))) i += 1;
      var word = source.slice(start, i);
      if (isReserved(word)) {
        pushToken(makeToken('Keyword', word));
      } else {
        pushToken(makeToken('Identifier', word));
      }
      continue;
    }

    var punct = matchPunctuator(source, i);
    if (punct) {
      pushToken(makeToken('Punctuator', punct.value, punct.kind));
      i += punct.length;
      continue;
    }

    i += 1;
  }

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
  for (var i = scopes.length - 1; i >= 0; i--) {
    if (has(scopes[i], id)) return true;
  }
  return false;
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
  for (var i = 0; i < KINDS.length; i++) {
    if (KINDS[i].name === kindKey) return KINDS[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Buffer parsers — all pure, used by KINDS commit/reject
// ---------------------------------------------------------------------------

function parsePrimaryFromBuffer(state, tokens) {
  // Re-parse buffered tokens starting at state.index using primary parser.
  // This is a safe fallback: advance through the buffered tokens, recording free identifiers.
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseBlockFromBuffer(state, tokens) {
  var next = pushScope(state);
  for (var i = 1; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      // In block parsing, identifiers are usually statements; this fallback records free vars.
      next = addFreeVar(next, t.value);
    }
  }
  next = popScope(next);
  next = advance(next);
  return next;
}

function parseObjectLiteralFromBuffer(state, tokens) {
  var next = state;
  for (var i = 1; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      var ahead = tokens[i + 1];
      if (ahead && ahead.type === 'Punctuator' && ahead.value === ':') {
        i += 2; // skip key and colon
        continue;
      }
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseArrayLiteralFromBuffer(state, tokens) {
  var next = state;
  for (var i = 1; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseJsonFromBuffer(state, tokens) {
  // JSON-like structures treat string keys as not free, but any identifier-valued entries are free.
  var next = state;
  for (var i = 1; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseArrowFunctionFromBuffer(state, tokens) {
  var next = pushScope(state);
  var arrowIndex = -1;
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'Punctuator' && tokens[i].value === '=>') {
      arrowIndex = i;
      break;
    }
  }
  for (var j = 0; j < arrowIndex; j++) {
    var t = tokens[j];
    if (t.type === 'Identifier') {
      next = declare(next, t.value);
    }
  }
  for (var k = arrowIndex + 1; k < tokens.length; k++) {
    var b = tokens[k];
    if (b.type === 'Identifier') {
      next = addFreeVar(next, b.value);
    }
  }
  next = popScope(next);
  next = advance(next);
  return next;
}

function parseOptionalAccessFromBuffer(state, tokens) {
  var next = state;
  for (var i = 1; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      // property names are not free; only computed expressions would be parsed separately.
      continue;
    }
  }
  next = advance(next);
  return next;
}

function parseArgumentsFromBuffer(state, tokens) {
  var next = state;
  for (var i = 1; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseForHeaderFromBuffer(state, tokens) {
  var next = state;
  var hasInOf = false;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'Keyword' && (t.value === 'in' || t.value === 'of')) {
      hasInOf = true;
    }
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseTemplateFromBuffer(state, tokens) {
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'TemplateLiteral' && t.extra && t.extra.expressions) {
      for (var j = 0; j < t.extra.expressions.length; j++) {
        var subTokens = tokenize(t.extra.expressions[j].raw);
        var subState = createState(subTokens);
        subState.scopes = next.scopes;
        subState.freeVars = next.freeVars;
        subState = parseExpression(subState, [';', ',', ')', ']', '}']);
        next = cloneObj(next);
        next.freeVars = subState.freeVars;
      }
    }
  }
  next = advance(next);
  return next;
}

function parseConditionalFromBuffer(state, tokens) {
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

function parseMapConstructFromBuffer(state, tokens) {
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'Identifier') {
      next = addFreeVar(next, t.value);
    }
  }
  next = advance(next);
  return next;
}

// ---------------------------------------------------------------------------
// KINDS declarative registry
// ---------------------------------------------------------------------------

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
    var depth = 0;
    for (var i = idx; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'Punctuator') {
        if (t.value === '(') depth += 1;
        else if (t.value === ')') {
          depth -= 1;
          if (depth === 0) {
            return tokens[i + 1] && tokens[i + 1].type === 'Punctuator' && tokens[i + 1].value === '=>';
          }
        }
      }
      if (t.type === 'EOF') break;
    }
  }

  return false;
}

function parseProgram(state) {
  while (peek(state).type !== 'EOF') {
    state = parseStatement(state);
  }
  var keys = [];
  for (var k in state.freeVars) {
    if (has(state.freeVars, k)) keys.push(k);
  }
  return keys;
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
  while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') &&
         peek(state).type !== 'EOF') {
    state = parseStatement(state);
  }
  state = expectPunctuator(state, '}');
  return popScope(state);
}

function parseVariableDeclaration(state) {
  state = advance(state);
  while (true) {
    var t = peek(state);
    if (t.type === 'Identifier') {
      state = declare(state, t.value);
      state = advance(state);
    } else if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) {
      state = parseBindingPattern(state);
    } else {
      break;
    }

    if (peek(state).type === 'Punctuator' && peek(state).value === '=') {
      state = advance(state);
      state = parseExpression(state, [',', ';']);
    }

    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
      continue;
    }
    break;
  }
  return consumeSemicolon(state);
}

function parseBindingPattern(state) {
  var depth = 0;
  while (true) {
    var t = peek(state);
    if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) {
      depth += 1;
      state = advance(state);
      continue;
    }
    if (t.type === 'Punctuator' && (t.value === '}' || t.value === ']')) {
      depth -= 1;
      state = advance(state);
      if (depth === 0) return state;
      continue;
    }
    if (t.type === 'Identifier') {
      state = declare(state, t.value);
    }
    state = advance(state);
  }
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
    while (!(peek(state).type === 'Punctuator' && peek(state).value === ')') &&
           peek(state).type !== 'EOF') {
      var p = peek(state);
      if (p.type === 'Identifier') {
        state = declare(state, p.value);
        state = advance(state);
      } else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) {
        state = parseBindingPattern(state);
      } else {
        state = advance(state);
      }
      if (peek(state).type === 'Punctuator' && peek(state).value === ',') state = advance(state);
    }
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
    while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') && peek(state).type !== 'EOF') {
      var t = peek(state);
      if (t.type === 'Keyword' && t.value === 'case') {
        state = advance(state);
        state = parseExpression(state, [':']);
        state = expectPunctuator(state, ':');
      } else if (t.type === 'Keyword' && t.value === 'default') {
        state = advance(state);
        state = expectPunctuator(state, ':');
      } else {
        state = parseStatement(state);
      }
    }
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
    while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') && peek(state).type !== 'EOF') {
      if (peek(state).type === 'Identifier' || peek(state).type === 'Keyword') state = advance(state);
      if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
        state = pushScope(state);
        state = advance(state);
        while (!(peek(state).type === 'Punctuator' && peek(state).value === ')')) {
          var p = peek(state);
          if (p.type === 'Identifier') { state = declare(state, p.value); state = advance(state); }
          else state = advance(state);
        }
        state = expectPunctuator(state, ')');
        if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);
        state = popScope(state);
      } else state = advance(state);
    }
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
  while (true) {
    var t = peek(state);
    if (t.type === 'EOF') break;
    if (t.type === 'Punctuator') {
      if (contains(stopTokens, t.value)) break;
      if (t.kind === 'binary' || t.kind === 'assignment' || t.kind === 'conditional' ||
          t.kind === 'colon' || t.kind === 'binaryOrPrefix') {
        state = advance(state);
        state = parseUnaryExpression(state);
        continue;
      }
      break;
    }
    break;
  }
  return state;
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

  while (true) {
    var ct = peek(state);
    if (ct.type === 'Punctuator' && (ct.value === '.' || ct.value === '?.')) {
      state = advance(state);
      var prop = peek(state);
      if (prop.type === 'Identifier' || prop.type === 'Keyword') state = advance(state);
      else if (prop.type === 'Punctuator' && prop.value === '(') {
        state = advance(state);
        state = parseArguments(state);
      } else state = advance(state);
      continue;
    }
    if (ct.type === 'Punctuator' && ct.value === '[') {
      state = advance(state);
      state = parseExpression(state, [']']);
      state = expectPunctuator(state, ']');
      continue;
    }
    if (ct.type === 'Punctuator' && ct.value === '(') {
      state = advance(state);
      state = parseArguments(state);
      continue;
    }
    break;
  }

  return state;
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
    var depth = 0;
    for (var i = idx + 1; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'Punctuator') {
        if (t.value === '(') depth += 1;
        else if (t.value === ')') {
          depth -= 1;
          if (depth === 0) return tokens[i + 1] && tokens[i + 1].type === 'Punctuator' && tokens[i + 1].value === '=>';
        }
      }
      if (t.type === 'EOF') break;
    }
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
    while (!(peek(state).type === 'Punctuator' && peek(state).value === ')') && peek(state).type !== 'EOF') {
      var p = peek(state);
      if (p.type === 'Identifier') { state = declare(state, p.value); state = advance(state); }
      else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) state = parseBindingPattern(state);
      else state = advance(state);
      if (peek(state).type === 'Punctuator' && peek(state).value === ',') state = advance(state);
    }
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
    for (var i = 0; i < token.extra.expressions.length; i++) {
      var subTokens = tokenize(token.extra.expressions[i].raw);
      var subState = createState(subTokens);
      subState.scopes = state.scopes;
      subState.freeVars = state.freeVars;
      subState = parseExpression(subState, [';', ',', ')', ']', '}']);
      var next = cloneObj(state);
      next.freeVars = subState.freeVars;
      state = next;
    }
  }
  return state;
}

function parseObjectLiteral(state) {
  state = expectPunctuator(state, '{');
  while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') && peek(state).type !== 'EOF') {
    var t = peek(state);
    if (t.type === 'Identifier' || t.type === 'StringLiteral' || t.type === 'NumericLiteral') {
      var lookahead = state.tokens[state.index + 1];
      if (lookahead && lookahead.type === 'Punctuator' && lookahead.value === ':') {
        state = advance(state);
        state = expectPunctuator(state, ':');
        state = parseExpression(state, [',', '}']);
      } else {
        state = parsePrimaryAndMemberAndCall(state);
      }
    } else if (t.type === 'Punctuator' && t.value === '[') {
      state = advance(state);
      state = parseExpression(state, [']']);
      state = expectPunctuator(state, ']');
      if (peek(state).type === 'Punctuator' && peek(state).value === ':') {
        state = advance(state);
        state = parseExpression(state, [',', '}']);
      }
    } else if (t.type === 'Punctuator' && t.value === ',') {
      state = advance(state);
    } else {
      state = advance(state);
    }
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') state = advance(state);
  }
  return expectPunctuator(state, '}');
}

function parseArrayLiteral(state) {
  state = expectPunctuator(state, '[');
  while (!(peek(state).type === 'Punctuator' && peek(state).value === ']') && peek(state).type !== 'EOF') {
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') { state = advance(state); continue; }
    state = parseExpression(state, [',', ']']);
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') state = advance(state);
  }
  return expectPunctuator(state, ']');
}

function parseArguments(state) {
  while (!(peek(state).type === 'Punctuator' && peek(state).value === ')') && peek(state).type !== 'EOF') {
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') { state = advance(state); continue; }
    state = parseExpression(state, [',', ')']);
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') state = advance(state);
  }
  return expectPunctuator(state, ')');
}

function detectFreeIdentifiers(source) {
  var tokens = tokenize(source);
  var state = createState(tokens);
  return parseProgram(state);
}

export {
  detectFreeIdentifiers
};
