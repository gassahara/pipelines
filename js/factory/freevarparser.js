const isWhitespace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f' || ch === '\uFEFF';
const isLineTerminator = (ch) => ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
const isDigit = (ch) => ch >= '0' && ch <= '9';
const isIdentifierStart = (ch) =>
  (ch >= 'a' && ch <= 'z') ||
  (ch >= 'A' && ch <= 'Z') ||
  ch === '_' || ch === '$';
const isIdentifierPart = (ch) => isIdentifierStart(ch) || isDigit(ch);

const RESERVED = new Set([
  'function','if','return','let','const','var','switch','case','break','continue',
  'null','true','false','of','in','new','typeof','instanceof','else','do','while','for',
  'try','catch','finally','throw','this','super','class','extends','import','export','default',
  'void','delete','yield','await','async','static','get','set','debugger','with','enum',
  'implements','interface','package','private','protected','public'
]);

const BUILTINS = new Set([
  'Math','Date','JSON','Object','Array','String','Number','Boolean','Promise','RegExp',
  'Error','TypeError','ReferenceError','console','document','window','globalThis','undefined',
  'NaN','Infinity','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent',
  'decodeURIComponent','DOMParser','HTMLElement','Node','EventTarget','Set','Map',
  'WeakMap','WeakSet','Reflect','Proxy','Symbol','BigInt','arguments'
]);

const PUNCTUATORS = [
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

function matchPunctuator(source, i) {
  for (const [str, kind] of PUNCTUATORS) {
    if (source.startsWith(str, i)) return { value: str, kind, length: str.length };
  }
  return null;
}

function scanRegExp(source, start) {
  if (source[start] !== '/') return null;
  let i = start + 1;
  let body = '';
  let inClass = false;
  let escaped = false;
  while (i < source.length) {
    const c = source[i];
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
      let flags = '';
      while (i < source.length && isIdentifierPart(source[i])) {
        flags += source[i];
        i += 1;
      }
      return { body, flags, end: i };
    }
    if (isLineTerminator(c)) return null;
    body += c;
    i += 1;
  }
  return null;
}

function scanString(source, start, quote) {
  let i = start + 1;
  let value = '';
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      value += c + (source[i + 1] || '');
      i += 2;
      continue;
    }
    if (c === quote) {
      i += 1;
      return { value, end: i };
    }
    if (isLineTerminator(c)) return null;
    value += c;
    i += 1;
  }
  return null;
}

function scanTemplate(source, start) {
  let i = start + 1;
  let value = '';
  const expressions = [];
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      value += c + (source[i + 1] || '');
      i += 2;
      continue;
    }
    if (c === '`') {
      i += 1;
      return { value, expressions, end: i };
    }
    if (c === '$' && source[i + 1] === '{') {
      const exprStart = i + 2;
      let j = exprStart;
      let depth = 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '{') depth += 1;
        else if (source[j] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        j += 1;
      }
      if (depth === 0) {
        const expr = source.slice(exprStart, j);
        expressions.push({ raw: expr });
        i = j + 1;
        continue;
      }
    }
    value += c;
    i += 1;
  }
  return { value, expressions, end: i };
}

function scanNumber(source, start) {
  let i = start;
  let value = '';
  while (i < source.length) {
    const c = source[i];
    if (isDigit(c) || c === '.' || c === '_') {
      value += c;
      i += 1;
      continue;
    }
    break;
  }
  if (value.length === 0) return null;
  return { value, end: i };
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  let exprAllowed = true;

  const pushToken = (token) => {
    tokens.push(token);
    // update exprAllowed from token grammatical role
    if (token.type === 'RegExpLiteral' || token.type === 'StringLiteral' ||
        token.type === 'NumericLiteral' || token.type === 'Identifier' ||
        token.type === 'TemplateLiteral' || token.type === 'CloseParen' ||
        token.type === 'CloseBracket' || token.type === 'CloseBrace') {
      exprAllowed = false;
    } else if (token.type === 'Punctuator') {
      if (token.kind === 'open' || token.kind === 'separator' ||
          token.kind === 'prefix' || token.kind === 'binary' ||
          token.kind === 'assignment' || token.kind === 'conditional' ||
          token.kind === 'colon' || token.kind === 'arrow' ||
          token.kind === 'spread' || token.kind === 'prefixOrPostfix') {
        exprAllowed = true;
      } else if (token.kind === 'close' || token.kind === 'dot') {
        exprAllowed = false;
      } else {
        exprAllowed = false;
      }
    } else if (token.type === 'Keyword') {
      exprAllowed = ['return','throw','case','new','typeof','void','delete','yield','await','else','in','instanceof'].includes(token.value);
    } else {
      exprAllowed = false;
    }
  };

  while (i < source.length) {
    if (isWhitespace(source[i]) || isLineTerminator(source[i])) { i += 1; continue; }

    // comments
    if (source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    // regex or division
    if (source[i] === '/') {
      const regex = exprAllowed ? scanRegExp(source, i) : null;
      if (regex) {
        pushToken({ type: 'RegExpLiteral', value: regex.body, flags: regex.flags });
        i = regex.end;
        continue;
      }
      pushToken({ type: 'Punctuator', value: '/', kind: 'binary' });
      i += 1;
      continue;
    }

    // strings and template
    if (source[i] === '"' || source[i] === "'") {
      const str = scanString(source, i, source[i]);
      if (str) {
        pushToken({ type: 'StringLiteral', value: str.value });
        i = str.end;
        continue;
      }
      throw new Error('[freevarparser] Unterminated string literal at ' + i);
    }
    if (source[i] === '`') {
      const tpl = scanTemplate(source, i);
      if (tpl) {
        pushToken({ type: 'TemplateLiteral', value: tpl.value, expressions: tpl.expressions });
        i = tpl.end;
        continue;
      }
      throw new Error('[freevarparser] Unterminated template literal at ' + i);
    }

    // number
    if (isDigit(source[i]) || (source[i] === '.' && isDigit(source[i + 1]))) {
      const num = scanNumber(source, i);
      if (num) {
        pushToken({ type: 'NumericLiteral', value: num.value });
        i = num.end;
        continue;
      }
    }

    // identifier/keyword
    if (isIdentifierStart(source[i])) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i])) i += 1;
      const value = source.slice(start, i);
      if (RESERVED.has(value)) {
        pushToken({ type: 'Keyword', value });
      } else {
        pushToken({ type: 'Identifier', value });
      }
      continue;
    }

    // punctuator
    const punct = matchPunctuator(source, i);
    if (punct) {
      pushToken({ type: 'Punctuator', value: punct.value, kind: punct.kind });
      i += punct.length;
      continue;
    }

    i += 1; // unknown, skip
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens, scopes = null, freeVars = null) {
    this.tokens = tokens;
    this.pos = 0;
    this.scopes = scopes || [Object.create(null)];
    this.freeVars = freeVars || new Set();
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  eat(type, value) {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type} ${value ?? ''} but got ${t.type} ${t.value}`);
    }
    return this.next();
  }
  match(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  currentScope() { return this.scopes[this.scopes.length - 1]; }
  pushScope() { this.scopes.push(Object.create(this.currentScope())); }
  popScope() { this.scopes.pop(); }
  declare(id) { this.currentScope()[id] = true; }
  isDeclared(id) {
    for (let s = this.scopes.length - 1; s >= 0; s -= 1) {
      if (s < this.scopes.length && this.scopes[s][id] !== undefined) return true;
    }
    return false;
  }
  recordFree(id) {
    if (!this.isDeclared(id) && !BUILTINS.has(id) && !RESERVED.has(id)) {
      this.freeVars.add(id);
    }
  }

  parseProgram() {
    while (this.peek().type !== 'EOF') {
      this.parseStatement();
    }
    return Array.from(this.freeVars);
  }

  parseStatement() {
    const t = this.peek();
    if (t.type === 'Punctuator' && t.value === '{') {
      this.parseBlock();
      return;
    }
    if (t.type === 'Keyword') {
      switch (t.value) {
        case 'const': case 'let': case 'var':
          this.parseVariableDeclaration();
          return;
        case 'function':
          this.parseFunctionDeclaration();
          return;
        case 'if':
          this.parseIfStatement();
          return;
        case 'for':
          this.parseForStatement();
          return;
        case 'while':
          this.parseWhileStatement();
          return;
        case 'do':
          this.parseDoStatement();
          return;
        case 'try':
          this.parseTryStatement();
          return;
        case 'switch':
          this.parseSwitchStatement();
          return;
        case 'return':
          this.next();
          if (!this.match('Punctuator',';') && !this.match('Punctuator','}') && this.peek().type !== 'EOF') {
            this.parseExpression();
          }
          this.consumeSemicolon();
          return;
        case 'throw':
          this.next();
          this.parseExpression();
          this.consumeSemicolon();
          return;
        case 'break':
        case 'continue':
          this.next();
          this.consumeSemicolon();
          return;
        case 'class':
          this.parseClassDeclaration();
          return;
      }
    }
    // expression statement
    this.parseExpression();
    this.consumeSemicolon();
  }

  parseBlock() {
    this.eat('Punctuator', '{');
    this.pushScope();
    while (!this.match('Punctuator','}') && this.peek().type !== 'EOF') {
      this.parseStatement();
    }
    this.eat('Punctuator','}');
    this.popScope();
  }

  parseVariableDeclaration() {
    this.next(); // var/let/const
    while (true) {
      const t = this.peek();
      if (t.type === 'Identifier') {
        this.next();
        this.declare(t.value);
        this.freeVars.delete(t.value);
      } else if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) {
        this.parseBindingPattern();
      }
      if (this.match('Punctuator','=')) {
        this.next();
        this.parseExpression();
      }
      if (this.match('Punctuator',',')) { this.next(); continue; }
      break;
    }
    this.consumeSemicolon();
  }

  parseBindingPattern() {
    // destructuring: declare all identifiers inside pattern
    let depth = 0;
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t.type === 'Punctuator' && (t.value === '{' || t.value === '[')) depth += 1;
      else if (t.type === 'Punctuator' && (t.value === '}' || t.value === ']')) {
        depth -= 1;
        if (depth === 0) { this.next(); return; }
      } else if (t.type === 'Identifier') {
        this.declare(t.value);
        this.freeVars.delete(t.value);
      }
      this.next();
    }
  }

  parseFunctionDeclaration() {
    this.next(); // function
    const name = this.peek();
    if (name.type === 'Identifier') {
      this.next();
      this.declare(name.value);
      this.freeVars.delete(name.value);
    }
    this.parseFunctionBody();
  }

  parseFunctionBody() {
    if (this.match('Punctuator','(')) {
      this.pushScope();
      this.next();
      while (!this.match('Punctuator',')') && this.peek().type !== 'EOF') {
        const p = this.peek();
        if (p.type === 'Identifier') {
          this.next();
          this.declare(p.value);
        } else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) {
          this.parseBindingPattern();
        } else {
          this.next();
        }
        if (this.match('Punctuator',',')) this.next();
      }
      this.eat('Punctuator',')');
    }
    if (this.match('Punctuator','{')) {
      this.parseBlock();
    } else {
      this.parseExpression();
    }
    this.popScope();
  }

  parseIfStatement() {
    this.next(); // if
    if (this.match('Punctuator','(')) {
      this.next();
      this.parseExpression();
      this.eat('Punctuator',')');
    }
    this.parseStatement();
    if (this.peek().type === 'Keyword' && this.peek().value === 'else') {
      this.next();
      this.parseStatement();
    }
  }

  parseForStatement() {
    this.next(); // for
    this.pushScope();
    if (this.match('Punctuator','(')) this.next();
    // init
    if (this.peek().type === 'Keyword' && ['var','let','const'].includes(this.peek().value)) {
      this.parseVariableDeclaration();
    } else {
      if (!this.match('Punctuator',';')) this.parseExpression();
      this.eat('Punctuator',';');
    }
    if (!this.match('Punctuator',';')) this.parseExpression();
    this.eat('Punctuator',';');
    if (!this.match('Punctuator',')')) this.parseExpression();
    if (this.match('Punctuator',')')) this.next();
    this.parseStatement();
    this.popScope();
  }

  parseWhileStatement() {
    this.next(); // while
    if (this.match('Punctuator','(')) {
      this.next();
      this.parseExpression();
      this.eat('Punctuator',')');
    }
    this.parseStatement();
  }

  parseDoStatement() {
    this.next(); // do
    this.parseStatement();
    this.eat('Keyword','while');
    if (this.match('Punctuator','(')) {
      this.next();
      this.parseExpression();
      this.eat('Punctuator',')');
    }
    this.consumeSemicolon();
  }

  parseTryStatement() {
    this.next(); // try
    if (this.match('Punctuator','{')) this.parseBlock();
    if (this.peek().type === 'Keyword' && this.peek().value === 'catch') {
      this.next();
      this.pushScope();
      if (this.match('Punctuator','(')) {
        this.next();
        const p = this.peek();
        if (p.type === 'Identifier') { this.next(); this.declare(p.value); }
        else if (p.type === 'Punctuator' && (p.value === '{' || p.value === '[')) this.parseBindingPattern();
        this.eat('Punctuator',')');
      }
      if (this.match('Punctuator','{')) this.parseBlock();
      this.popScope();
    }
    if (this.peek().type === 'Keyword' && this.peek().value === 'finally') {
      this.next();
      if (this.match('Punctuator','{')) this.parseBlock();
    }
  }

  parseSwitchStatement() {
    this.next(); // switch
    if (this.match('Punctuator','(')) {
      this.next();
      this.parseExpression();
      this.eat('Punctuator',')');
    }
    if (this.match('Punctuator','{')) {
      this.next();
      while (!this.match('Punctuator','}') && this.peek().type !== 'EOF') {
        const t = this.peek();
        if (t.type === 'Keyword' && t.value === 'case') {
          this.next();
          this.parseExpression();
          this.eat('Punctuator',':');
        } else if (t.type === 'Keyword' && t.value === 'default') {
          this.next();
          this.eat('Punctuator',':');
        } else {
          this.parseStatement();
        }
      }
      this.eat('Punctuator','}');
    }
  }

  parseClassDeclaration() {
    this.next(); // class
    const name = this.peek();
    if (name.type === 'Identifier') {
      this.next();
      this.declare(name.value);
      this.freeVars.delete(name.value);
    }
    if (this.match('Keyword','extends')) {
      this.next();
      this.parseExpression();
    }
    if (this.match('Punctuator','{')) {
      // class body; collect identifiers in methods as nested scopes
      this.pushScope();
      this.next();
      while (!this.match('Punctuator','}') && this.peek().type !== 'EOF') {
        if (this.peek().type === 'Identifier' || this.peek().type === 'Keyword') {
          this.next(); // method name
        }
        if (this.match('Punctuator','(')) {
          this.pushScope();
          this.next();
          while (!this.match('Punctuator',')')) {
            const p = this.peek();
            if (p.type === 'Identifier') { this.next(); this.declare(p.value); }
            else this.next();
          }
          this.eat('Punctuator',')');
          if (this.match('Punctuator','{')) this.parseBlock();
          this.popScope();
        } else {
          this.next();
        }
      }
      this.eat('Punctuator','}');
      this.popScope();
    }
  }

  consumeSemicolon() {
    if (this.match('Punctuator',';')) this.next();
  }

  parseExpression() {
    this.parseExpressionWithScope(new Set([',', ';', ')', ']', '}']));
  }

  parseExpressionWithScope(stopTokens) {
    let depth = 0;
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t.type === 'EOF') return;
      if (t.type === 'Punctuator') {
        if (t.value === '(' || t.value === '[' || t.value === '{') {
          depth += 1;
          this.next();
          continue;
        }
        if (t.value === ')' || t.value === ']' || t.value === '}') {
          if (depth === 0) return;
          depth -= 1;
          this.next();
          continue;
        }
        if (depth === 0 && stopTokens.has(t.value)) return;
      }
      if (t.type === 'Identifier') {
        this.recordFree(t.value);
        this.next();
        continue;
      }
      if (t.type === 'TemplateLiteral') {
        this.next();
        for (const expr of t.expressions) {
          this.parseExpressionFromSource(expr.raw);
        }
        continue;
      }
      if (t.type === 'Keyword' && t.value === 'function') {
        this.next();
        this.parseFunctionBody();
        continue;
      }
      this.next();
    }
  }

  parseExpressionFromSource(source) {
    const subTokens = tokenize(source);
    const subParser = new Parser(subTokens, this.scopes, this.freeVars);
    subParser.parseExpression();
  }
}

export function detectFreeIdentifiers(source) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
