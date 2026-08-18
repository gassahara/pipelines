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

// ---------------------------------------------------------------------------
// ES5 character predicates
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ES5 reserved word / built-in sets as object maps
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Punctuator table — order longest first
// ---------------------------------------------------------------------------

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
  ['.','dot'], [';','separator'], [',','separator'], [':','colon'], ['?','conditional'],
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

// ---------------------------------------------------------------------------
// Token scanners — pure ES5 functions returning token or null
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

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
      } else if (kind === 'close' || kind === 'dot') {
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

    i += 1; // unknown, skip
  }

  tokens.push(makeToken('EOF', null));
  return tokens;
}

// ---------------------------------------------------------------------------
// Functional parser: immutable state
// ---------------------------------------------------------------------------

function createState(tokens) {
  return {
    tokens: tokens,
    index: 0,
    scopes: [{}],
    freeVars: {},
    contextStack: ['program']
  };
}

function peek(state) { return state.tokens[state.index]; }

function advance(state) {
  var next = cloneObj(state);
  next.index = state.index + 1;
  return next;
}

function cloneFreeVars(freeVars) {
  return cloneObj(freeVars);
}

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

// ---------------------------------------------------------------------------
// Recursive descent parser
// ---------------------------------------------------------------------------

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

  // expression statement
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
  state = advance(state); // var/let/const

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
  state = advance(state); // function
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
      if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
        state = advance(state);
      }
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
  state = advance(state); // if
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
  state = advance(state); // for
  state = pushScope(state);
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') state = advance(state);

  if (peek(state).type === 'Keyword' && contains(['var','let','const'], peek(state).value)) {
    state = parseVariableDeclaration(state);
  } else {
    if (!(peek(state).type === 'Punctuator' && peek(state).value === ';')) {
      state = parseExpression(state, [';']);
    }
    state = expectPunctuator(state, ';');
  }

  if (!(peek(state).type === 'Punctuator' && peek(state).value === ';')) {
    state = parseExpression(state, [';']);
  }
  state = expectPunctuator(state, ';');

  if (!(peek(state).type === 'Punctuator' && peek(state).value === ')')) {
    state = parseExpression(state, [')']);
  }
  if (peek(state).type === 'Punctuator' && peek(state).value === ')') state = advance(state);

  state = parseStatement(state);
  return popScope(state);
}

function parseWhileStatement(state) {
  state = advance(state); // while
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  return parseStatement(state);
}

function parseDoStatement(state) {
  state = advance(state); // do
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
  state = advance(state); // try
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);

  if (peek(state).type === 'Keyword' && peek(state).value === 'catch') {
    state = advance(state);
    state = pushScope(state);
    if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
      state = advance(state);
      var p = peek(state);
      if (p.type === 'Identifier') {
        state = declare(state, p.value);
        state = advance(state);
      } else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) {
        state = parseBindingPattern(state);
      }
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
  state = advance(state); // switch
  if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseExpression(state, [')']);
    state = expectPunctuator(state, ')');
  }
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = advance(state);
    while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') &&
           peek(state).type !== 'EOF') {
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
  state = advance(state); // class
  var name = peek(state);
  if (name.type === 'Identifier') {
    state = declare(state, name.value);
    state = advance(state);
  }
  if (peek(state).type === 'Keyword' && peek(state).value === 'extends') {
    state = advance(state);
    state = parseExpression(state, ['{']);
  }
  if (peek(state).type === 'Punctuator' && peek(state).value === '{') {
    state = pushScope(state);
    state = advance(state);
    while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') &&
           peek(state).type !== 'EOF') {
      if (peek(state).type === 'Identifier' || peek(state).type === 'Keyword') {
        state = advance(state); // method name
      }
      if (peek(state).type === 'Punctuator' && peek(state).value === '(') {
        state = pushScope(state);
        state = advance(state);
        while (!(peek(state).type === 'Punctuator' && peek(state).value === ')')) {
          var p = peek(state);
          if (p.type === 'Identifier') {
            state = declare(state, p.value);
            state = advance(state);
          } else {
            state = advance(state);
          }
        }
        state = expectPunctuator(state, ')');
        if (peek(state).type === 'Punctuator' && peek(state).value === '{') state = parseBlock(state);
        state = popScope(state);
      } else {
        state = advance(state);
      }
    }
    state = expectPunctuator(state, '}');
    state = popScope(state);
  }
  return state;
}

function consumeSemicolon(state) {
  if (peek(state).type === 'Punctuator' && peek(state).value === ';') {
    return advance(state);
  }
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

// ---------------------------------------------------------------------------
// Expression parsing
// ---------------------------------------------------------------------------

function parseExpression(state, stopTokens) {
  state = pushContext(state, 'expression');
  state = parseOperandAndThenBinary(state, stopTokens);
  return popContext(state);
}

function parseOperandAndThenBinary(state, stopTokens) {
  state = parsePrimaryAndMemberAndCall(state);

  while (true) {
    var t = peek(state);
    if (t.type === 'EOF') break;
    if (t.type === 'Punctuator') {
      if (contains(stopTokens, t.value)) break;
      state = advance(state); // operator
      if (t.value === '?') {
        state = parsePrimaryAndMemberAndCall(state);
        if (peek(state).type === 'Punctuator' && peek(state).value === ':') {
          state = advance(state);
          state = parsePrimaryAndMemberAndCall(state);
        }
        continue;
      }
      state = parsePrimaryAndMemberAndCall(state);
      continue;
    }
    break;
  }

  return state;
}

function parsePrimaryAndMemberAndCall(state) {
  var t = peek(state);

  if (t.type === 'Identifier') {
    state = addFreeVar(state, t.value);
    state = advance(state);
  } else if (t.type === 'StringLiteral' || t.type === 'NumericLiteral' || t.type === 'RegExpLiteral') {
    state = advance(state);
  } else if (t.type === 'TemplateLiteral') {
    state = advance(state);
    var expressions = t.extra ? t.extra.expressions : [];
    for (var i = 0; i < expressions.length; i++) {
      state = parseExpressionFromSource(state, expressions[i].raw);
    }
  } else if (t.type === 'Keyword' && t.value === 'function') {
    state = advance(state);
    state = parseFunctionBody(state);
  } else if (t.type === 'Keyword' && t.value === 'new') {
    state = advance(state);
    state = parsePrimaryAndMemberAndCall(state);
  } else if (t.type === 'Keyword' && t.value === 'this') {
    state = advance(state);
  } else if (t.type === 'Punctuator' && t.value === '(') {
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
    if (ct.type === 'Punctuator' && ct.value === '.') {
      state = advance(state);
      var prop = peek(state);
      if (prop.type === 'Identifier' || prop.type === 'Keyword') {
        state = advance(state); // property name, not free
      } else {
        state = advance(state);
      }
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

function parseObjectLiteral(state) {
  state = expectPunctuator(state, '{');

  while (!(peek(state).type === 'Punctuator' && peek(state).value === '}') &&
         peek(state).type !== 'EOF') {
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
      state = advance(state); // method name token
    }

    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
    }
  }

  return expectPunctuator(state, '}');
}

function parseArrayLiteral(state) {
  state = expectPunctuator(state, '[');

  while (!(peek(state).type === 'Punctuator' && peek(state).value === ']') &&
         peek(state).type !== 'EOF') {
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
      continue;
    }

    state = parseExpression(state, [',', ']']);

    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
    }
  }

  return expectPunctuator(state, ']');
}

function parseArguments(state) {
  while (!(peek(state).type === 'Punctuator' && peek(state).value === ')') &&
         peek(state).type !== 'EOF') {
    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
      continue;
    }

    state = parseExpression(state, [',', ')']);

    if (peek(state).type === 'Punctuator' && peek(state).value === ',') {
      state = advance(state);
    }
  }

  return expectPunctuator(state, ')');
}

function parseExpressionFromSource(state, source) {
  var subTokens = tokenize(source);
  var subState = createState(subTokens);
  subState.scopes = state.scopes;
  subState.freeVars = state.freeVars;
  subState = parseExpression(subState, [';', ',', ')', ']', '}']);
  var next = cloneObj(state);
  next.freeVars = subState.freeVars;
  return next;
}

// ---------------------------------------------------------------------------
// Exported entry point
// ---------------------------------------------------------------------------

function detectFreeIdentifiers(source) {
  var tokens = tokenize(source);
  var state = createState(tokens);
  return parseProgram(state);
}

export {
  detectFreeIdentifiers
};
