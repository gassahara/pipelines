// freevarparser.js — Standalone lexer/parser for free-variable detection.
// Exports: detectFreeIdentifiers
// Pure module; no dependencies.

const isWhitespace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f' || ch === '\uFEFF';
const isLineTerminator = (ch) => ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
const isDigit = (ch) => ch >= '0' && ch <= '9';
const isIdentifierStart = (ch) =>
  (ch >= 'a' && ch <= 'z') ||
  (ch >= 'A' && ch <= 'Z') ||
  ch === '_' || ch === '$';
const isIdentifierPart = (ch) => isIdentifierStart(ch) || isDigit(ch);

const RESERVED = new Set([
  'function','if','return','let','const','var','switch','case','break','continue','null','true','false','of','in','new','typeof','instanceof','else','do','while','for','try','catch','finally','throw','this','super','class','extends','import','export','default','void','delete','yield','await','async','static','get','set','debugger','with','enum','implements','interface','package','private','protected','public'
]);

const BUILTINS = new Set(['Math','Date','JSON','Object','Array','String','Number','Boolean','Promise','RegExp','Error','TypeError','ReferenceError','console','document','window','globalThis','undefined','NaN','Infinity','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','DOMParser','HTMLElement','Node','EventTarget','Set','Map','WeakMap','WeakSet','Reflect','Proxy','Symbol','BigInt', 'arguments']);

const tokenize = (source) => {
  const tokens = [];
  let i = 0;
  let previousToken = null;

  const lastSignificant = () => previousToken;

  const canStartRegex = () => {
    const prev = lastSignificant();
    if (!prev) return true;
    if (prev.type === 'keyword') {
      return ['return','typeof','instanceof','in','of','new','delete','void','case'].includes(prev.value);
    }
    if (prev.type === 'punctuator') {
      return ['(', '=', ',', '[', ':', '=>', ';', '{', '}'].includes(prev.value);
    }
    return false;
  };

  while (i < source.length) {
    const ch = source[i];

    if (isWhitespace(ch) || isLineTerminator(ch)) { i += 1; continue; }

    if (ch === '/' && i + 1 < source.length && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && i + 1 < source.length && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    if (ch === '/' && canStartRegex()) {
      i += 1;
      let escaped = false;
      let charClass = false;
      while (i < source.length) {
        const c = source[i];
        if (escaped) { escaped = false; i += 1; continue; }
        if (c === '\\') { escaped = true; i += 1; continue; }
        if (c === '[') { charClass = true; i += 1; continue; }
        if (c === ']') { charClass = false; i += 1; continue; }
        if (c === '/' && !charClass) { i += 1; break; }
        i += 1;
      }
      while (i < source.length && isIdentifierPart(source[i])) i += 1;
      tokens.push({ type: 'literal', value: 'regex' });
      previousToken = tokens[tokens.length - 1];
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i += 1; break; }
        i += 1;
      }
      tokens.push({ type: 'literal', value: 'string' });
      previousToken = tokens[tokens.length - 1];
      continue;
    }

    if (isDigit(ch) || (ch === '.' && i + 1 < source.length && isDigit(source[i + 1]))) {
      i += 1;
      while (i < source.length) {
        const c = source[i];
        if (isDigit(c) || c === '.' || c === '_' || c === 'x' || c === 'X' || c === 'a' || c === 'A' || c === 'b' || c === 'B' || c === 'c' || c === 'C' || c === 'd' || c === 'D' || c === 'e' || c === 'E' || c === 'f' || c === 'F') i += 1;
        else break;
      }
      tokens.push({ type: 'literal', value: 'number' });
      previousToken = tokens[tokens.length - 1];
      continue;
    }

    if (ch === '=' && i + 1 < source.length && source[i + 1] === '>') {
      tokens.push({ type: 'punctuator', value: '=>' });
      previousToken = tokens[tokens.length - 1];
      i += 2;
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i])) i += 1;
      const value = source.slice(start, i);
      tokens.push({ type: RESERVED.has(value) ? 'keyword' : 'identifier', value });
      previousToken = tokens[tokens.length - 1];
      continue;
    }

    if ('{}()[].,;:=<>+-*/%&|!?~'.includes(ch)) {
      tokens.push({ type: 'punctuator', value: ch });
      previousToken = tokens[tokens.length - 1];
      i += 1;
      continue;
    }

    i += 1;
  }

  return tokens;
};

const scopes = [];
const pushScope = () => { scopes.push(Object.create(currentScope())); };
const popScope = () => { scopes.pop(); };
const currentScope = () => scopes.length > 0 ? scopes[scopes.length - 1] : null;
const declareInScope = (id) => { if (currentScope()) currentScope()[id] = true; };
const isDeclared = (id) => {
  for (let s = scopes.length - 1; s >= 0; s -= 1) {
    if (scopes[s][id] !== undefined) return true;
  }
  return false;
};

const parseBindingPattern = (tokens, start) => {
  let depth = 0;
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'punctuator') {
      if (t.value === '{' || t.value === '[') {
        depth += 1;
        i += 1;
        continue;
      }
      if (t.value === '}' || t.value === ']') {
        depth -= 1;
        i += 1;
        if (depth === 0) return i;
        continue;
      }
    }
    if (t.type === 'identifier') {
      declareInScope(t.value);
    }
    i += 1;
  }
  return i;
};

const isExpressionContext = (tokens, index) => {
  if (index === 0) return false;
  const prev = tokens[index - 1];
  if (!prev) return false;
  if (prev.type === 'keyword' && prev.value === 'return') return true;
  if (prev.type === 'punctuator') {
    if (['(', '=', ',', '[', ':', '=>'].includes(prev.value)) return true;
  }
  return false;
};

const parseObjectLiteral = (tokens, start, free) => {
  let depth = 1;
  let i = start + 1;

  while (i < tokens.length && depth > 0) {
    const t = tokens[i];

    if (t.type === 'punctuator') {
      if (t.value === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (t.value === '}') {
        depth -= 1;
        i += 1;
        if (depth === 0) return i;
        continue;
      }
    }

    if (t.type === 'identifier') {
      const next = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (next && next.type === 'punctuator' && next.value === ':') {
        i = parseExpressionWithScope(tokens, i + 2, free, [',', '}']);
        continue;
      }
      if (next && next.type === 'punctuator' && (next.value === ',' || next.value === '}')) {
        i += 1;
        continue;
      }
    }

    if (t.type === 'literal') {
      const next = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (next && next.type === 'punctuator' && next.value === ':') {
        i = parseExpressionWithScope(tokens, i + 2, free, [',', '}']);
        continue;
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return i;
};

const removeFree = (free, id) => {
  const idx = free.indexOf(id);
  if (idx !== -1) free.splice(idx, 1);
};

const parseExpressionWithScope = (tokens, start, free, stopTokens) => {
  let depth = 0;
  let i = start;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === 'punctuator' && t.value === '{' && isExpressionContext(tokens, i)) {
      i = parseObjectLiteral(tokens, i, free);
      continue;
    }

    if (t.type === 'punctuator') {
      if (t.value === '(' || t.value === '[' || t.value === '{') {
        depth += 1;
        i += 1;
        continue;
      }

      if (t.value === ')' || t.value === ']' || t.value === '}') {
        if (depth === 0) return i;
        depth -= 1;
        i += 1;
        continue;
      }

      if (depth === 0 && stopTokens && stopTokens.includes(t.value)) {
        return i;
      }
    }

    if (t.type === 'punctuator' && t.value === '=>') {
      i = parseArrowExpression(tokens, i, free);
      continue;
    }

    if (t.type === 'keyword' && t.value === 'function') {
      i = parseFunctionExpression(tokens, i, free);
      continue;
    }

    if (t.type === 'keyword' && (t.value === 'const' || t.value === 'let' || t.value === 'var')) {
      i = parseDeclarationList(tokens, i + 1, free, [',', ';', ')']);
      continue;
    }

    if (t.type === 'identifier') {
      if (!isDeclared(t.value) && !BUILTINS.has(t.value) && !RESERVED.has(t.value)) {
        const prev = i > 0 ? tokens[i - 1] : null;
        const next = i + 1 < tokens.length ? tokens[i + 1] : null;
        const isProperty = prev && prev.type === 'punctuator' && prev.value === '.';
        const isKey = next && next.type === 'punctuator' && next.value === ':';
        if (!isProperty && !isKey && free.indexOf(t.value) === -1) {
          free.push(t.value);
        }
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return i;
};

// Corrected declaration list parser.
// Follows ECMAScript BindingList / VariableDeclarationList grammar:
//   BindingList : LexicalBinding (',' LexicalBinding)*
// Each LexicalBinding may have an initializer.
const parseDeclarationList = (tokens, start, free, outerStopTokens = [',', ';', ')']) => {
  let i = start;

  while (i < tokens.length) {
    const t = tokens[i];

    // Parse one binding.
    if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) {
      i = parseBindingPattern(tokens, i);
    } else if (t.type === 'identifier') {
      declareInScope(t.value);
      removeFree(free, t.value);
      i += 1;
    } else {
      // Unexpected token; avoid infinite loop.
      return i;
    }

    // Optional initializer.
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '=') {
      // The initializer must stop at comma or any outer terminator.
      const initStopTokens = [',', ...outerStopTokens];
      i = parseExpressionWithScope(tokens, i + 1, free, initStopTokens);
    }

    // After the binding, expect either a comma (continue) or outer terminator (stop).
    const next = tokens[i];
    if (next && next.type === 'punctuator' && next.value === ',') {
      i += 1;
      continue;
    }

    if (next && next.type === 'keyword' && (next.value === 'of' || next.value === 'in') && outerStopTokens.includes(next.value)) {
      // For-of/in loop header; do not consume the keyword.
      return i;
    }

    // Outer terminator: return without consuming it.
    return i;
  }

  return i;
};

const parseStatement = (tokens, start, free) => {
  let i = start;
  const t = tokens[i];
  if (!t) return i;

  if (t.type === 'punctuator' && t.value === '{') {
    return parseBlock(tokens, i, free);
  }

  if (t.type === 'punctuator' && t.value === ';') {
    return i + 1;
  }

  if (t.type === 'keyword') {
    switch (t.value) {
      case 'const':
      case 'let':
      case 'var':
        return parseDeclarationList(tokens, i + 1, free, [';']);

      case 'function': {
        const next = i + 1 < tokens.length ? tokens[i + 1] : null;
        if (next && next.type === 'identifier') {
          declareInScope(next.value);
          removeFree(free, next.value);
        }
        return parseFunctionExpression(tokens, i, free);
      }

      case 'if':
        return parseIfStatement(tokens, i, free);

      case 'for':
        return parseForStatement(tokens, i, free);

      case 'while':
        return parseWhileStatement(tokens, i, free);

      case 'try':
        return parseTryStatement(tokens, i, free);

      case 'switch':
        return parseSwitchStatement(tokens, i, free);

      case 'return':
      case 'throw':
      case 'break':
      case 'continue': {
        let idx = parseExpressionWithScope(tokens, i + 1, free, [';']);
        if (tokens[idx] && tokens[idx].type === 'punctuator' && tokens[idx].value === ';') idx += 1;
        return idx;
      }

      default:
        return parseExpressionWithScope(tokens, i, free, [';']);
    }
  }

  let idx = parseExpressionWithScope(tokens, i, free, [';']);
  if (tokens[idx] && tokens[idx].type === 'punctuator' && tokens[idx].value === ';') idx += 1;
  return idx;
};

const parseIfStatement = (tokens, start, free) => {
  let i = start + 1;

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    i = parseExpressionWithScope(tokens, i + 1, free, [')']);
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') i += 1;
  }

  i = parseStatement(tokens, i, free);

  if (tokens[i] && tokens[i].type === 'keyword' && tokens[i].value === 'else') {
    i += 1;
    i = parseStatement(tokens, i, free);
  }

  return i;
};

const parseForStatement = (tokens, start, free) => {
  let i = start + 1;

  if (tokens[i] && tokens[i].type === 'keyword' && tokens[i].value === 'await') {
    i += 1;
  }

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    pushScope();
    i = parseForHeader(tokens, i, free);
    i = parseStatement(tokens, i, free);
    popScope();
  }

  return i;
};

const parseForHeader = (tokens, start, free) => {
  let i = start + 1; // after '('

  if (tokens[i] && tokens[i].type === 'keyword' && (tokens[i].value === 'const' || tokens[i].value === 'let' || tokens[i].value === 'var')) {
    i = parseDeclarationList(tokens, i + 1, free, ['of', 'in', ';', ')']);

    if (tokens[i] && tokens[i].type === 'keyword' && (tokens[i].value === 'of' || tokens[i].value === 'in')) {
      i += 1;
      i = parseExpressionWithScope(tokens, i, free, [')']);
      if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') return i + 1;
      return i;
    }

    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';') {
      i += 1;
      if (!(tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';')) {
        i = parseExpressionWithScope(tokens, i, free, [';']);
      }
      if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';') i += 1;
      if (!(tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')')) {
        i = parseExpressionWithScope(tokens, i, free, [')']);
      }
      if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') return i + 1;
      return i;
    }

    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') return i + 1;
    return i;
  }

  if (!(tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';')) {
    i = parseExpressionWithScope(tokens, i, free, [';']);
  }
  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';') i += 1;
  if (!(tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';')) {
    i = parseExpressionWithScope(tokens, i, free, [';']);
  }
  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ';') i += 1;
  if (!(tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')')) {
    i = parseExpressionWithScope(tokens, i, free, [')']);
  }
  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') return i + 1;
  return i;
};

const parseWhileStatement = (tokens, start, free) => {
  let i = start + 1;

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    i = parseExpressionWithScope(tokens, i + 1, free, [')']);
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') i += 1;
  }

  return parseStatement(tokens, i, free);
};

const parseTryStatement = (tokens, start, free) => {
  let i = start + 1;

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '{') {
    i = parseBlock(tokens, i, free);
  }

  if (tokens[i] && tokens[i].type === 'keyword' && tokens[i].value === 'catch') {
    i = handleCatchParameter(tokens, i, free);
  }

  if (tokens[i] && tokens[i].type === 'keyword' && tokens[i].value === 'finally') {
    i += 1;
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '{') {
      i = parseBlock(tokens, i, free);
    }
  }

  return i;
};

const parseSwitchStatement = (tokens, start, free) => {
  let i = start + 1;

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    i = parseExpressionWithScope(tokens, i + 1, free, [')']);
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ')') i += 1;
  }

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '{') {
    pushScope();
    let depth = 1;
    i += 1;

    while (i < tokens.length && depth > 0) {
      const t = tokens[i];

      if (t.type === 'keyword' && (t.value === 'case' || t.value === 'default')) {
        const isCase = t.value === 'case';
        i += 1;
        if (isCase) {
          i = parseExpressionWithScope(tokens, i, free, [':']);
          if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ':') i += 1;
        } else {
          if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === ':') i += 1;
        }
        continue;
      }

      if (t.type === 'punctuator') {
        if (t.value === '{') depth += 1;
        else if (t.value === '}') {
          depth -= 1;
          i += 1;
          if (depth === 0) break;
          continue;
        }
      }

      i += 1;
    }

    popScope();
  }

  return i;
};

const findMatchingParen = (tokens, start) => {
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'punctuator') continue;
    if (t.value === '(') depth += 1;
    else if (t.value === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return tokens.length;
};

const parseBlock = (tokens, start, free) => {
  pushScope();
  let i = start + 1;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === 'punctuator' && t.value === '}') {
      i += 1;
      break;
    }

    i = parseStatement(tokens, i, free);
  }

  popScope();
  return i;
};

const parseArrowExpression = (tokens, arrowIndex, free) => {
  pushScope();

  const prev = arrowIndex > 0 ? tokens[arrowIndex - 1] : null;
  if (prev) {
    if (prev.type === 'identifier') {
      declareInScope(prev.value);
      removeFree(free, prev.value);
    } else if (prev.type === 'punctuator' && prev.value === ')') {
      let openIdx = -1;
      let depth = 0;
      for (let k = arrowIndex - 1; k >= 0; k -= 1) {
        const tk = tokens[k];
        if (tk.type === 'punctuator') {
          if (tk.value === ')') depth += 1;
          else if (tk.value === '(') {
            depth -= 1;
            if (depth === 0) { openIdx = k; break; }
          }
        }
      }
      if (openIdx !== -1) {
        let m = openIdx + 1;
        while (m < arrowIndex - 1) {
          const t = tokens[m];
          if (t.type === 'identifier') {
            declareInScope(t.value);
            removeFree(free, t.value);
          } else if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) {
            m = parseBindingPattern(tokens, m) - 1;
          }
          m += 1;
        }
      }
    }
  }

  const bodyStart = arrowIndex + 1;
  const next = bodyStart < tokens.length ? tokens[bodyStart] : null;
  let index;
  if (next && next.type === 'punctuator' && next.value === '{') {
    index = parseBlock(tokens, bodyStart, free);
  } else {
    index = parseExpressionWithScope(tokens, bodyStart, free, [',', ';', ')', ']', '}']);
  }

  popScope();
  return index;
};

const parseFunctionExpression = (tokens, start, free) => {
  let i = start + 1;
  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '*') i += 1;

  let functionName = null;
  if (tokens[i] && tokens[i].type === 'identifier') {
    functionName = tokens[i].value;
    i += 1;
  }

  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    pushScope();
    if (functionName) {
      declareInScope(functionName);
    }
    const endParen = findMatchingParen(tokens, i);
    for (let m = i + 1; m < endParen; m += 1) {
      const t = tokens[m];
      if (t.type === 'identifier') {
        declareInScope(t.value);
        removeFree(free, t.value);
      } else if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) {
        m = parseBindingPattern(tokens, m) - 1;
      }
    }
    i = endParen + 1;
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '{') {
      i = parseBlock(tokens, i, free);
    } else {
      i = parseExpressionWithScope(tokens, i, free, [',', ';', ')', ']', '}']);
    }
    popScope();
  }

  return i;
};

const handleCatchParameter = (tokens, start, free) => {
  let i = start + 1;
  if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '(') {
    pushScope();
    i += 1;
    if (tokens[i] && tokens[i].type === 'identifier') {
      declareInScope(tokens[i].value);
      removeFree(free, tokens[i].value);
      i += 1;
    } else if (tokens[i] && tokens[i].type === 'punctuator' && (tokens[i].value === '{' || tokens[i].value === '[')) {
      i = parseBindingPattern(tokens, i);
    }
    while (i < tokens.length && !(tokens[i].type === 'punctuator' && tokens[i].value === ')')) i += 1;
    i += 1;
    if (tokens[i] && tokens[i].type === 'punctuator' && tokens[i].value === '{') {
      i = parseBlock(tokens, i, free);
    }
    popScope();
  }
  return i;
};

export function detectFreeIdentifiers(source) {
  const tokens = tokenize(source);
  scopes.length = 0;
  scopes.push({});
  const free = [];

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === 'punctuator' && t.value === ';') {
      i += 1;
      continue;
    }

    i = parseStatement(tokens, i, free);
  }

  return free;
}
