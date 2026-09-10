var hasown = Object.prototype.hasOwnProperty;

function trampoline(fn) {
  return function() {
    var result = fn.apply(null, arguments);
    function unwind(r) {
      if (typeof r === 'function') {
        return unwind(r());
      }
      return r;
    }
    return unwind(result);
  };
}

function cloneobj(obj) {
  return Object.keys(obj).reduce(function(out, k) {
    if (hasown.call(obj, k)) out[k] = obj[k];
    return out;
  }, {});
}

function has(obj, key) {
  return hasown.call(obj, key);
}

function contains(arr, item) {
  return arr.indexOf(item) !== -1;
}

function iswhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f' || ch === '\ufeff';
}

function islineterminator(ch) {
  return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

function isdigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isidentifierstart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isidentifierpart(ch) {
  return isidentifierstart(ch) || isdigit(ch);
}

var reserved = (function() {
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

var builtins = (function() {
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

function isreserved(word) { return has(reserved, word); }
function isbuiltin(word) { return has(builtins, word); }

var punctuators = [
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
  ['?.','optionalaccess'],
  ['?','conditional'],
  ['+','binaryorprefix'], ['-','binaryorprefix'], ['*','binary'], ['%','binary'],
  ['&','binary'], ['|','binary'], ['^','binary'], ['~','prefix'], ['!','prefix'],
  ['<','binary'], ['>','binary'], ['=','assignment']
];

function startswithat(source, str, index) {
  return source.slice(index, index + str.length) === str;
}

function matchpunctuator(source, i) {
  var found = null;
  punctuators.some(function(p) {
    if (startswithat(source, p[0], i)) {
      found = { value: p[0], kind: p[1], length: p[0].length };
      return true;
    }
    return false;
  });
  return found;
}

function scanregexp(source, start) {
  if (source.charAt(start) !== '/') return null;

  function loop(i, body, escaped, inclass) {
    if (i >= source.length) return null;
    var c = source.charAt(i);
    if (escaped) {
      return function() { return loop(i + 1, body + '\\' + c, false, inclass); };
    }
    if (c === '\\') {
      return function() { return loop(i + 1, body + c, true, inclass); };
    }
    if (c === '[') {
      return function() { return loop(i + 1, body + c, false, true); };
    }
    if (c === ']') {
      return function() { return loop(i + 1, body + c, false, false); };
    }
    if (c === '/' && !inclass) {
      function scanflags(j, flags) {
        if (j < source.length && isidentifierpart(source.charAt(j))) {
          return scanflags(j + 1, flags + source.charAt(j));
        }
        return { body: body, flags: flags, end: j };
      }
      return scanflags(i + 1, '');
    }
    if (islineterminator(c)) return null;
    return function() { return loop(i + 1, body + c, false, inclass); };
  }

  return trampoline(loop)(start + 1, '', false, false);
}

function scanstring(source, start, quote) {
  function loop(i, value) {
    if (i >= source.length) return null;
    var c = source.charAt(i);
    if (c === '\\') {
      return function() { return loop(i + 2, value + c + (source.charAt(i + 1) || '')); };
    }
    if (c === quote) {
      return { value: value, end: i + 1 };
    }
    if (islineterminator(c)) return null;
    return function() { return loop(i + 1, value + c); };
  }
  return trampoline(loop)(start + 1, '');
}

function scantemplate(source, start) {
  function scanexpr(j, depth) {
    if (j >= source.length) return { depth: depth, end: j };
    var cc = source.charAt(j);
    if (cc === '{') return scanexpr(j + 1, depth + 1);
    if (cc === '}') {
      var d = depth - 1;
      if (d === 0) return { depth: 0, end: j };
      return scanexpr(j + 1, d);
    }
    return scanexpr(j + 1, depth);
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
      var exprresult = scanexpr(i + 2, 1);
      if (exprresult.depth === 0) {
        var expr = source.slice(i + 2, exprresult.end);
        return function() {
          return loop(exprresult.end + 1, value, expressions.concat([{ raw: expr }]));
        };
      }
    }
    return function() { return loop(i + 1, value + c, expressions); };
  }

  return trampoline(loop)(start + 1, '', []);
}

function scannumber(source, start) {
  function loop(i, value) {
    if (i >= source.length) return { value: value, end: i };
    var c = source.charAt(i);
    if (isdigit(c) || c === '.' || c === '_') {
      return function() { return loop(i + 1, value + c); };
    }
    return { value: value, end: i };
  }
  var result = trampoline(loop)(start, '');
  if (result.value.length === 0) return null;
  return result;
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

function findmatchingparen(src, openindex) {
  function skipquoted(i, quote) {
    if (i >= src.length) return i;
    if (src[i] === '\\') return skipquoted(i + 2, quote);
    if (src[i] === quote) return i + 1;
    return skipquoted(i + 1, quote);
  }

  function loop(i, depth) {
    if (i >= src.length) return -1;
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipquoted(i + 1, ch), depth); };
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

function findbodybrace(src, startindex) {
  function skipquoted(i, quote) {
    if (i >= src.length) return i;
    if (src[i] === '\\') return skipquoted(i + 2, quote);
    if (src[i] === quote) return i + 1;
    return skipquoted(i + 1, quote);
  }

  function skiplinecomment(i) {
    if (i < src.length && src[i] !== '\n') return skiplinecomment(i + 1);
    return i;
  }

  function skipblockcomment(i) {
    if (i >= src.length) return i;
    if (src[i] === '*' && src[i + 1] === '/') return i + 2;
    return skipblockcomment(i + 1);
  }

  function loop(i, depthparen, depthbrace, depthbracket) {
    if (i >= src.length) return -1;
    var ch = src[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      return function() { return loop(skipquoted(i + 1, ch), depthparen, depthbrace, depthbracket); };
    }

    if (ch === '/' && i + 1 < src.length && src[i + 1] === '/') {
      return function() { return loop(skiplinecomment(i + 2), depthparen, depthbrace, depthbracket); };
    }
    if (ch === '/' && i + 1 < src.length && src[i + 1] === '*') {
      return function() { return loop(skipblockcomment(i + 2), depthparen, depthbrace, depthbracket); };
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

function maketoken(type, value, kind, extra) {
  var token = { type: type, value: value };
  if (kind !== undefined) token.kind = kind;
  if (extra !== undefined) token.extra = extra;
  return token;
}

function tokenize(source) {
  var tokens = [];

  function pushtoken(token, exprallowed) {
    tokens.push(token);
    var type = token.type;
    if (type === 'regexpliteral' || type === 'stringliteral' ||
        type === 'numericliteral' || type === 'identifier' ||
        type === 'templateliteral' || type === 'closeparen' ||
        type === 'closebracket' || type === 'closebrace') {
      return false;
    } else if (type === 'punctuator') {
      var kind = token.kind;
      if (kind === 'open' || kind === 'separator' ||
          kind === 'prefix' || kind === 'binary' ||
          kind === 'assignment' || kind === 'conditional' ||
          kind === 'colon' || kind === 'arrow' ||
          kind === 'spread' || kind === 'prefixorpostfix') {
        return true;
      } else if (kind === 'close' || kind === 'dot' || kind === 'optionalaccess') {
        return false;
      } else {
        return false;
      }
    } else if (type === 'keyword') {
      return contains(['return','throw','case','new','typeof','void','delete','yield','await','else','in','instanceof'], token.value);
    } else {
      return false;
    }
  }

  function skiplinecomment(i) {
    if (i < source.length && source.charAt(i) !== '\n') return skiplinecomment(i + 1);
    return i;
  }

  function skipblockcomment(i) {
    if (i >= source.length) return i;
    if (source.charAt(i) === '*' && source.charAt(i + 1) === '/') return i + 2;
    return skipblockcomment(i + 1);
  }

  function skipidentifier(i) {
    if (i < source.length && isidentifierpart(source.charAt(i))) return skipidentifier(i + 1);
    return i;
  }

  function loop(i, exprallowed) {
    if (i >= source.length) return exprallowed;
    var ch = source.charAt(i);

    if (iswhitespace(ch) || islineterminator(ch)) {
      return function() { return loop(i + 1, exprallowed); };
    }

    if (ch === '/' && source.charAt(i + 1) === '/') {
      return function() { return loop(skiplinecomment(i + 2), exprallowed); };
    }
    if (ch === '/' && source.charAt(i + 1) === '*') {
      return function() { return loop(skipblockcomment(i + 2), exprallowed); };
    }

    if (ch === '/') {
      var regex = exprallowed ? scanregexp(source, i) : null;
      if (regex) {
        pushtoken(maketoken('regexpliteral', regex.body, undefined, { flags: regex.flags }), exprallowed);
        return function() { return loop(regex.end, false); };
      }
      pushtoken(maketoken('punctuator', '/', 'binary'), exprallowed);
      return function() { return loop(i + 1, true); };
    }

    if (ch === '"' || ch === "'") {
      var str = scanstring(source, i, ch);
      if (str) {
        pushtoken(maketoken('stringliteral', str.value), exprallowed);
        return function() { return loop(str.end, false); };
      }
      throw new Error('[freevarparser] unterminated string literal at ' + i);
    }

    if (ch === '`') {
      var tpl = scantemplate(source, i);
      if (tpl) {
        pushtoken(maketoken('templateliteral', tpl.value, undefined, { expressions: tpl.expressions }), exprallowed);
        return function() { return loop(tpl.end, false); };
      }
      throw new Error('[freevarparser] unterminated template literal at ' + i);
    }

    if (isdigit(ch) || (ch === '.' && isdigit(source.charAt(i + 1)))) {
      var num = scannumber(source, i);
      if (num) {
        pushtoken(maketoken('numericliteral', num.value), exprallowed);
        return function() { return loop(num.end, false); };
      }
    }

    if (isidentifierstart(ch)) {
      var start = i;
      var wordend = skipidentifier(i + 1);
      var word = source.slice(start, wordend);
      if (isreserved(word)) {
        pushtoken(maketoken('keyword', word), exprallowed);
      } else {
        pushtoken(maketoken('identifier', word), exprallowed);
      }
      return function() { return loop(wordend, false); };
    }

    var punct = matchpunctuator(source, i);
    if (punct) {
      var nextexpr = pushtoken(maketoken('punctuator', punct.value, punct.kind), exprallowed);
      return function() { return loop(i + punct.length, nextexpr); };
    }

    return function() { return loop(i + 1, exprallowed); };
  }

  trampoline(loop)(0, true);

  tokens.push(maketoken('eof', null));
  return tokens;
}

function createstate(tokens) {
  return {
    tokens: tokens,
    index: 0,
    scopes: [{}],
    freevars: {},
    contextstack: ['program'],
    expectexpression: true,
    tentativestack: []
  };
}

// ---- OP-001: enriched `peek` ----
function peek(state) {
  if (!state || !state.tokens || !Array.isArray(state.tokens)) {
    var peekdiag = {
      kind: 'peek-invalid-state',
      typeofState: typeof state,
      hasTokens: !!(state && state.tokens),
      tokensIsArray: !!(state && state.tokens && Array.isArray(state.tokens)),
      stateIndex: (state && typeof state.index === 'number') ? state.index : null,
      tokensLength: (state && state.tokens && Array.isArray(state.tokens)) ? state.tokens.length : null,
      stack: (function() { try { return (new Error()).stack || null; } catch (_) { return null; } })()
    };
    var peekerr = new Error('[freevarparser] peek called with invalid state');
    peekerr.diagnostic = peekdiag;
    throw peekerr;
  }
  return state.tokens[state.index];
}

// ---- OP-002: assert parser state ----
function assertparserstate(value, production, hintindex) {
  if (value && typeof value === 'object' && value.tokens && Array.isArray(value.tokens)) {
    return value;
  }
  var assertdiag = {
    kind: 'parser-return-undefined',
    production: production,
    index: (hintindex !== undefined && hintindex !== null) ? hintindex : null,
    typeofReturn: typeof value,
    stack: (function() { try { return (new Error()).stack || null; } catch (_) { return null; } })()
  };
  var asserterr = new Error('[PARSER_RETURN_UNDEFINED] production=' + production +
    ' index=' + (assertdiag.index === null ? '?' : assertdiag.index) +
    ' typeofReturn=' + assertdiag.typeofReturn);
  asserterr.diagnostic = assertdiag;
  throw asserterr;
}

function advance(state) {
  var next = cloneobj(state);
  next.index = state.index + 1;
  return next;
}

function clonefreevars(freevars) { return cloneobj(freevars); }

function addfreevar(state, id) {
  if (isdeclared(state.scopes, id) || isbuiltin(id) || isreserved(id)) return state;
  var nextfreevars = clonefreevars(state.freevars);
  nextfreevars[id] = true;
  var next = cloneobj(state);
  next.freevars = nextfreevars;
  return next;
}

function pushscope(state) {
  var next = cloneobj(state);
  next.scopes = state.scopes.concat([{}]);
  return next;
}

function popscope(state) {
  if (state.scopes.length <= 1) return state;
  var next = cloneobj(state);
  next.scopes = state.scopes.slice(0, -1);
  return next;
}

function declare(state, id) {
  var scopes = state.scopes.slice();
  var current = scopes[scopes.length - 1];
  var newcurrent = cloneobj(current);
  newcurrent[id] = true;
  scopes[scopes.length - 1] = newcurrent;
  var next = cloneobj(state);
  next.scopes = scopes;
  var newfree = cloneobj(state.freevars);
  delete newfree[id];
  next.freevars = newfree;
  return next;
}

function isdeclared(scopes, id) {
  function scan(i) {
    if (i < 0) return false;
    if (has(scopes[i], id)) return true;
    return scan(i - 1);
  }
  return scan(scopes.length - 1);
}

function pushcontext(state, ctx) {
  var next = cloneobj(state);
  next.contextstack = state.contextstack.concat([ctx]);
  return next;
}

function popcontext(state) {
  var next = cloneobj(state);
  next.contextstack = state.contextstack.slice(0, -1);
  return next;
}

function setexpectexpression(state, value) {
  var next = cloneobj(state);
  next.expectexpression = value;
  return next;
}

function opententative(state, kindkey, startindex) {
  var t = {
    kindkey: kindkey,
    startindex: startindex,
    tokens: [],
    scopedepth: state.scopes.length,
    contextatopen: state.contextstack[state.contextstack.length - 1],
    status: 'open',
    decision: null
  };
  var next = cloneobj(state);
  next.tentativestack = state.tentativestack.concat([t]);
  return next;
}

function toptentative(state) {
  var ts = state.tentativestack;
  return ts.length > 0 ? ts[ts.length - 1] : null;
}

function appendtentative(state, token) {
  var ts = state.tentativestack;
  if (ts.length === 0) return state;
  var top = ts[ts.length - 1];
  var nexttop = cloneobj(top);
  nexttop.tokens = top.tokens.concat([token]);
  var nextts = ts.slice(0, -1).concat([nexttop]);
  var next = cloneobj(state);
  next.tentativestack = nextts;
  return next;
}

function poptentative(state) {
  if (state.tentativestack.length === 0) return state;
  var next = cloneobj(state);
  next.tentativestack = state.tentativestack.slice(0, -1);
  return next;
}

function findkind(kindkey) {
  var found = null;
  kinds.some(function(kind) {
    if (kind.name === kindkey) { found = kind; return true; }
    return false;
  });
  return found;
}

// ---- OP-021: shared free-var accumulation helper ----
function addfreevarsfromtokens(state, tokens) {
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'identifier') next = addfreevar(next, t.value);
  }
  return next;
}

// ---- OP-022: buffer parser, refactored to use addfreevarsfromtokens ----
function parseprimaryfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens);
  next = advance(next);
  return next;
}

function parseblockfrombuffer(state, tokens) {
  var next = pushscope(state);
  var inner = tokens.slice(1, -1);
  next = addfreevarsfromtokens(next, inner);
  next = popscope(next);
  next = advance(next);
  return next;
}

function parseobjectliteralfrombuffer(state, tokens) {
  // Not replaced by OP-022: custom scan with object-literal key-skip semantics.
  var next = state;
  var inner = tokens.slice(1, -1);

  function scan(i) {
    if (i >= inner.length) return next;
    var t = inner[i];
    if (t.type === 'identifier') {
      var ahead = inner[i + 1];
      if (ahead && ahead.type === 'punctuator' && ahead.value === ':') {
        return scan(i + 3);
      }
      next = addfreevar(next, t.value);
    }
    return scan(i + 1);
  }
  scan(0);
  next = advance(next);
  return next;
}

function parsearrayliteralfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens.slice(1, -1));
  next = advance(next);
  return next;
}

function parsejsonfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens.slice(1, -1));
  next = advance(next);
  return next;
}

function parsearrowfunctionfrombuffer(state, tokens) {
  // Not replaced by OP-022: contains declare/addfreevar split.
  var next = pushscope(state);
  var arrowindex = tokens.reduce(function(acc, t, i) {
    return acc !== -1 ? acc : (t.type === 'punctuator' && t.value === '=>' ? i : acc);
  }, -1);

  tokens.slice(0, arrowindex).forEach(function(t) {
    if (t.type === 'identifier') {
      next = declare(next, t.value);
    }
  });
  tokens.slice(arrowindex + 1).forEach(function(b) {
    if (b.type === 'identifier') {
      next = addfreevar(next, b.value);
    }
  });
  next = popscope(next);
  next = advance(next);
  return next;
}

function parseoptionalaccessfrombuffer(state, tokens) {
  var next = state;
  next = advance(next);
  return next;
}

function parseargumentsfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens.slice(1, -1));
  next = advance(next);
  return next;
}

function parseforheaderfrombuffer(state, tokens) {
  // Not replaced by OP-022: has secondary in/of detection.
  var next = state;
  var hasinof = false;
  tokens.forEach(function(t) {
    if (t.type === 'keyword' && (t.value === 'in' || t.value === 'of')) {
      hasinof = true;
    }
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parsetemplatefrombuffer(state, tokens) {
  // Not replaced by OP-022: nested tokenize+substate per expression.
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'templateliteral' && t.extra && t.extra.expressions) {
      t.extra.expressions.forEach(function(expr) {
        var subtokens = tokenize(expr.raw);
        var substate = createstate(subtokens);
        substate.scopes = next.scopes;
        substate.freevars = next.freevars;
        substate = parseexpression(substate, [';', ',', ')', ']', '}']);
        next = cloneobj(next);
        next.freevars = substate.freevars;
      });
    }
  });
  next = advance(next);
  return next;
}

function parseconditionalfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens);
  next = advance(next);
  return next;
}

function parsemapconstructfrombuffer(state, tokens) {
  var next = addfreevarsfromtokens(state, tokens);
  next = advance(next);
  return next;
}

var kinds = [
  {
    name: 'regex',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '/' && state.expectexpression === true;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === '/' && tentative.tokens.length > 1) return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return advance(state);
    },
    reject: function(state, tentative) {
      var next = cloneobj(state);
      next.index = tentative.startindex;
      return next;
    }
  },
  {
    name: 'objectliteral',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '{' && state.expectexpression === true;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === '}') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseobjectliteralfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return parseblockfrombuffer(state, tentative.tokens);
    }
  },
  {
    name: 'block',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '{' && state.expectexpression !== true;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === '}') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseblockfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'arrayliteral',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '[' && state.expectexpression === true;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === ']') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parsearrayliteralfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'json',
    start: function(state, token) {
      return (token.type === 'punctuator' && token.value === '{') ||
             (token.type === 'punctuator' && token.value === '[');
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && (token.value === '}' || token.value === ']')) return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parsejsonfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'arrowfunction',
    start: function(state, token) {
      return isarrowfunctionstart(state);
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === '=>') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parsearrowfunctionfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return parseprimaryfrombuffer(state, tentative.tokens);
    }
  },
  {
    name: 'memberaccess',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '.';
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'identifier' || token.type === 'keyword') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return advance(state);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'optionalaccess',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '?.';
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'identifier' || token.type === 'keyword' ||
          (token.type === 'punctuator' && token.value === '(')) return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseoptionalaccessfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'call',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '(';
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === ')') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseargumentsfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'forheader',
    start: function(state, token) {
      return token.type === 'keyword' && token.value === 'for';
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'keyword' && (token.value === 'in' || token.value === 'of')) return 'accept';
      if (token.type === 'punctuator' && token.value === ';') return 'accept';
      if (token.type === 'punctuator' && token.value === ')') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseforheaderfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'templatesubstitution',
    start: function(state, token) {
      return token.type === 'templateliteral' && token.extra && token.extra.expressions.length > 0;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      return 'accept';
    },
    commit: function(state, tentative) {
      return parsetemplatefrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'conditional',
    start: function(state, token) {
      return token.type === 'punctuator' && token.value === '?';
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === ':') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parseconditionalfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  },
  {
    name: 'mapconstruct',
    start: function(state, token) {
      return token.type === 'keyword' && token.value === 'new' && state.expectexpression === true;
    },
    append: function(tentative, token) {
      var next = cloneobj(tentative);
      next.tokens = tentative.tokens.concat([token]);
      return next;
    },
    decide: function(tentative, token) {
      if (token.type === 'punctuator' && token.value === ')') return 'accept';
      if (token.type === 'eof') return 'reject';
      return 'hold';
    },
    commit: function(state, tentative) {
      return parsemapconstructfrombuffer(state, tentative.tokens);
    },
    reject: function(state, tentative) {
      return state;
    }
  }
];

function isarrowfunctionstart(state) {
  var idx = state.index;
  var tokens = state.tokens;

  if (tokens[idx].type === 'identifier') {
    return tokens[idx + 1] && tokens[idx + 1].type === 'punctuator' && tokens[idx + 1].value === '=>';
  }

  if (tokens[idx].type === 'punctuator' && tokens[idx].value === '(') {
    function scanparen(i, depth) {
      if (i >= tokens.length) return false;
      var t = tokens[i];
      if (t.type === 'punctuator') {
        if (t.value === '(') return scanparen(i + 1, depth + 1);
        if (t.value === ')') {
          var d = depth - 1;
          if (d === 0) {
            return tokens[i + 1] && tokens[i + 1].type === 'punctuator' && tokens[i + 1].value === '=>';
          }
          return scanparen(i + 1, d);
        }
      }
      if (t.type === 'eof') return false;
      return scanparen(i + 1, depth);
    }
    return scanparen(idx, 0);
  }

  return false;
}

// ---- OP-003: parseprogram with assertparserstate ----
function parseprogram(state) {
  function loop(s) {
    if (peek(s).type === 'eof') return s;
    return function() { return loop(parsestatement(s)); };
  }
  var finalstate = assertparserstate(trampoline(loop)(state), 'parseprogram', state && state.index);
  return Object.keys(finalstate.freevars).filter(function(k) {
    return has(finalstate.freevars, k);
  });
}

function parsestatement(state) {
  var t = peek(state);

  if (t.type === 'punctuator') {
    if (t.value === '{') return parseblock(state);
    if (t.value === ';') return advance(state);
  }

  if (t.type === 'keyword') {
    switch (t.value) {
      case 'const': case 'let': case 'var':
        return parsevariabledeclaration(state);
      case 'function':
        return parsefunctiondeclaration(state);
      case 'if':
        return parseifstatement(state);
      case 'for':
        return parseforstatement(state);
      case 'while':
        return parsewhilestatement(state);
      case 'do':
        return parsedostatement(state);
      case 'try':
        return parsetrystatement(state);
      case 'switch':
        return parseswitchstatement(state);
      case 'return':
        state = advance(state);
        if (!(peek(state).type === 'punctuator' && peek(state).value === ';') &&
            !(peek(state).type === 'punctuator' && peek(state).value === '}') &&
            peek(state).type !== 'eof') {
          state = parseexpression(state, [';', '}']);
        }
        return consumesemicolon(state);
      case 'throw':
        state = advance(state);
        state = parseexpression(state, [';']);
        return consumesemicolon(state);
      case 'break':
      case 'continue':
        state = advance(state);
        return consumesemicolon(state);
      case 'class':
        return parseclassdeclaration(state);
      case 'debugger':
        state = advance(state);
        return consumesemicolon(state);
    }
  }

  state = parseexpression(state, [';']);
  return consumesemicolon(state);
}

// ---- OP-004: parseblock ----
function parseblock(state) {
  state = expectpunctuator(state, '{');
  state = pushscope(state);
  function loop(s) {
    if (peek(s).type === 'punctuator' && peek(s).value === '}') return s;
    if (peek(s).type === 'eof') return s;
    return function() { return loop(parsestatement(s)); };
  }
  state = assertparserstate(trampoline(loop)(state), 'parseblock', state && state.index);
  state = expectpunctuator(state, '}');
  return popscope(state);
}

// ---- OP-005: parsevariabledeclaration ----
function parsevariabledeclaration(state) {
  state = advance(state);
  function loop(s) {
    var t = peek(s);
    var nextstate;
    if (t.type === 'identifier') {
      nextstate = declare(s, t.value);
      nextstate = advance(nextstate);
    } else if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) {
      nextstate = parsebindingpattern(s);
    } else {
      return s;
    }

    if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === '=') {
      nextstate = advance(nextstate);
      nextstate = parseexpression(nextstate, [',', ';']);
    }

    if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') {
      return function() { return loop(advance(nextstate)); };
    }
    return nextstate;
  }
  state = assertparserstate(trampoline(loop)(state), 'parsevariabledeclaration', state && state.index);
  return consumesemicolon(state);
}

// ---- OP-007: parsebindingpattern ----
function parsebindingpattern(state) {
  function loop(s, depth) {
    var t = peek(s);
    if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) {
      return function() { return loop(advance(s), depth + 1); };
    }
    if (t.type === 'punctuator' && (t.value === '}' || t.value === ']')) {
      var d = depth - 1;
      if (d === 0) return advance(s);
      return function() { return loop(advance(s), d); };
    }
    if (t.type === 'identifier') {
      return function() { return loop(advance(declare(s, t.value)), depth); };
    }
    return function() { return loop(advance(s), depth); };
  }
  return assertparserstate(trampoline(loop)(state, 0), 'parsebindingpattern', state && state.index);
}

function parsefunctiondeclaration(state) {
  state = advance(state);
  var name = peek(state);
  if (name.type === 'identifier') {
    state = declare(state, name.value);
    state = advance(state);
  }
  return parsefunctionbody(state);
}

// ---- OP-006: parsefunctionbody ----
function parsefunctionbody(state) {
  state = pushscope(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '(') {
    state = advance(state);
    function loopparams(s) {
      if (peek(s).type === 'punctuator' && peek(s).value === ')') return s;
      if (peek(s).type === 'eof') return s;
      var p = peek(s);
      var nextstate;
      if (p.type === 'identifier') {
        nextstate = declare(s, p.value);
        nextstate = advance(nextstate);
      } else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) {
        nextstate = parsebindingpattern(s);
      } else {
        nextstate = advance(s);
      }
      if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') nextstate = advance(nextstate);
      return function() { return loopparams(nextstate); };
    }
    state = assertparserstate(trampoline(loopparams)(state), 'parsefunctionbody.loopparams', state && state.index);
    state = expectpunctuator(state, ')');
  }

  if (peek(state).type === 'punctuator' && peek(state).value === '{') {
    state = parseblock(state);
  } else {
    state = parseexpression(state, [';']);
  }

  return popscope(state);
}

function parseifstatement(state) {
  state = advance(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
  }
  state = parsestatement(state);
  if (peek(state).type === 'keyword' && peek(state).value === 'else') {
    state = advance(state);
    state = parsestatement(state);
  }
  return state;
}

function parseforstatement(state) {
  state = advance(state);
  state = pushscope(state);

  if (peek(state).type === 'keyword' && peek(state).value === 'await') state = advance(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '(') state = advance(state);

  if (peek(state).type === 'keyword' && contains(['var','let','const'], peek(state).value)) {
    state = parsevariabledeclaration(state);
  } else {
    if (!(peek(state).type === 'punctuator' && peek(state).value === ';')) state = parseexpression(state, [';']);
    if (peek(state).type === 'keyword' && (peek(state).value === 'in' || peek(state).value === 'of')) {
      state = advance(state);
      state = parseexpression(state, [')']);
      state = expectpunctuator(state, ')');
      state = parsestatement(state);
      return popscope(state);
    }
    state = expectpunctuator(state, ';');
  }

  if (peek(state).type === 'keyword' && (peek(state).value === 'in' || peek(state).value === 'of')) {
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
    state = parsestatement(state);
    return popscope(state);
  }

  if (!(peek(state).type === 'punctuator' && peek(state).value === ';')) state = parseexpression(state, [';']);
  state = expectpunctuator(state, ';');

  if (!(peek(state).type === 'punctuator' && peek(state).value === ')')) state = parseexpression(state, [')']);
  if (peek(state).type === 'punctuator' && peek(state).value === ')') state = advance(state);

  state = parsestatement(state);
  return popscope(state);
}

function parsewhilestatement(state) {
  state = advance(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
  }
  return parsestatement(state);
}

function parsedostatement(state) {
  state = advance(state);
  state = parsestatement(state);
  state = expectkeyword(state, 'while');
  if (peek(state).type === 'punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
  }
  return consumesemicolon(state);
}

function parsetrystatement(state) {
  state = advance(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '{') state = parseblock(state);

  if (peek(state).type === 'keyword' && peek(state).value === 'catch') {
    state = advance(state);
    state = pushscope(state);
    if (peek(state).type === 'punctuator' && peek(state).value === '(') {
      state = advance(state);
      var p = peek(state);
      if (p.type === 'identifier') { state = declare(state, p.value); state = advance(state); }
      else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) state = parsebindingpattern(state);
      state = expectpunctuator(state, ')');
    }
    if (peek(state).type === 'punctuator' && peek(state).value === '{') state = parseblock(state);
    state = popscope(state);
  }

  if (peek(state).type === 'keyword' && peek(state).value === 'finally') {
    state = advance(state);
    if (peek(state).type === 'punctuator' && peek(state).value === '{') state = parseblock(state);
  }
  return state;
}

// ---- OP-013: parseswitchstatement ----
function parseswitchstatement(state) {
  state = advance(state);
  if (peek(state).type === 'punctuator' && peek(state).value === '(') {
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
  }
  if (peek(state).type === 'punctuator' && peek(state).value === '{') {
    state = advance(state);
    function loop(s) {
      if (peek(s).type === 'punctuator' && peek(s).value === '}') return s;
      if (peek(s).type === 'eof') return s;
      var t = peek(s);
      var nextstate;
      if (t.type === 'keyword' && t.value === 'case') {
        nextstate = advance(s);
        nextstate = parseexpression(nextstate, [':']);
        nextstate = expectpunctuator(nextstate, ':');
      } else if (t.type === 'keyword' && t.value === 'default') {
        nextstate = advance(s);
        nextstate = expectpunctuator(nextstate, ':');
      } else {
        nextstate = parsestatement(s);
      }
      return function() { return loop(nextstate); };
    }
    state = assertparserstate(trampoline(loop)(state), 'parseswitchstatement', state && state.index);
    state = expectpunctuator(state, '}');
  }
  return state;
}

// ---- OP-014: parseclassdeclaration ----
function parseclassdeclaration(state) {
  state = advance(state);
  var name = peek(state);
  if (name.type === 'identifier') { state = declare(state, name.value); state = advance(state); }
  if (peek(state).type === 'keyword' && peek(state).value === 'extends') {
    state = advance(state);
    state = parseexpression(state, ['{']);
  }
  if (peek(state).type === 'punctuator' && peek(state).value === '{') {
    state = pushscope(state);
    state = advance(state);
    function loopmembers(s) {
      if (peek(s).type === 'punctuator' && peek(s).value === '}') return s;
      if (peek(s).type === 'eof') return s;
      var nextstate = s;
      if (peek(nextstate).type === 'identifier' || peek(nextstate).type === 'keyword') nextstate = advance(nextstate);
      if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === '(') {
        nextstate = pushscope(nextstate);
        nextstate = advance(nextstate);
        function loopparams(s2) {
          if (peek(s2).type === 'punctuator' && peek(s2).value === ')') return s2;
          var p = peek(s2);
          var ns = s2;
          if (p.type === 'identifier') { ns = declare(ns, p.value); ns = advance(ns); }
          else ns = advance(ns);
          return function() { return loopparams(ns); };
        }
        nextstate = trampoline(loopparams)(nextstate);
        nextstate = expectpunctuator(nextstate, ')');
        if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === '{') nextstate = parseblock(nextstate);
        nextstate = popscope(nextstate);
      } else nextstate = advance(nextstate);
      return function() { return loopmembers(nextstate); };
    }
    state = assertparserstate(trampoline(loopmembers)(state), 'parseclassdeclaration', state && state.index);
    state = expectpunctuator(state, '}');
    state = popscope(state);
  }
  return state;
}

function consumesemicolon(state) {
  if (peek(state).type === 'punctuator' && peek(state).value === ';') return advance(state);
  return state;
}

function expectpunctuator(state, value) {
  var t = peek(state);
  if (t.type !== 'punctuator' || t.value !== value) {
    throw new Error('expected punctuator ' + value + ' but got ' + t.type + ' ' + t.value);
  }
  return advance(state);
}

function expectkeyword(state, value) {
  var t = peek(state);
  if (t.type !== 'keyword' || t.value !== value) {
    throw new Error('expected keyword ' + value + ' but got ' + t.type + ' ' + t.value);
  }
  return advance(state);
}

function parseexpression(state, stoptokens) {
  state = pushcontext(state, 'expression');
  state = parseassignmentexpression(state, stoptokens);
  return popcontext(state);
}

function parseassignmentexpression(state, stoptokens) {
  state = parseconditionalexpression(state, stoptokens);
  var t = peek(state);
  if (t.type === 'punctuator' && contains(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^='], t.value)) {
    state = advance(state);
    state = parseassignmentexpression(state, stoptokens);
  }
  return state;
}

function parseconditionalexpression(state, stoptokens) {
  state = parsebinaryexpression(state, stoptokens);
  var t = peek(state);
  if (t.type === 'punctuator' && t.value === '?') {
    state = advance(state);
    state = parseexpression(state, [':']);
    state = expectpunctuator(state, ':');
    state = parseexpression(state, stoptokens);
  }
  return state;
}

// ---- OP-008: parsebinaryexpression ----
function parsebinaryexpression(state, stoptokens) {
  state = parseunaryexpression(state);
  function loop(s) {
    var t = peek(s);
    if (t.type === 'eof') return s;
    if (t.type === 'punctuator') {
      if (contains(stoptokens, t.value)) return s;
      if (t.kind === 'binary' || t.kind === 'assignment' || t.kind === 'conditional' ||
          t.kind === 'colon' || t.kind === 'binaryorprefix') {
        var nextstate = advance(s);
        nextstate = parseunaryexpression(nextstate);
        return function() { return loop(nextstate); };
      }
      return s;
    }
    return s;
  }
  return assertparserstate(trampoline(loop)(state), 'parsebinaryexpression', state && state.index);
}

function parseunaryexpression(state) {
  var t = peek(state);
  if (t.type === 'punctuator' && contains(['!', '~', '+', '-', '++', '--'], t.value)) {
    state = advance(state);
    return parseunaryexpression(state);
  }
  if (t.type === 'keyword' && contains(['typeof', 'void', 'delete', 'await', 'yield'], t.value)) {
    state = advance(state);
    return parseunaryexpression(state);
  }
  return parsepostfixexpression(state);
}

function parsepostfixexpression(state) {
  state = parseprimaryandmemberandcall(state);
  var t = peek(state);
  if (t.type === 'punctuator' && (t.value === '++' || t.value === '--')) state = advance(state);
  return state;
}

// ---- OP-009: parseprimaryandmemberandcall ----
function parseprimaryandmemberandcall(state) {
  var t = peek(state);

  if (t.type === 'keyword' && t.value === 'async') {
    if (isasyncarrowstart(state)) return parsearrowfunctionfromtokens(state);
    state = advance(state);
  } else if (t.type === 'identifier') {
    if (isarrowfunctionstart(state)) return parsearrowfunctionfromtokens(state);
    state = addfreevar(state, t.value);
    state = advance(state);
  } else if (t.type === 'stringliteral' || t.type === 'numericliteral' || t.type === 'regexpliteral') {
    state = advance(state);
  } else if (t.type === 'templateliteral') {
    state = parsetemplatetoken(state);
    return state;
  } else if (t.type === 'keyword' && t.value === 'function') {
    state = advance(state);
    state = parsefunctionbody(state);
  } else if (t.type === 'keyword' && t.value === 'new') {
    state = advance(state);
    state = parseprimaryandmemberandcall(state);
  } else if (t.type === 'keyword' && t.value === 'this') {
    state = advance(state);
  } else if (t.type === 'punctuator' && t.value === '(') {
    if (isarrowfunctionstart(state)) return parsearrowfunctionfromtokens(state);
    state = advance(state);
    state = parseexpression(state, [')']);
    state = expectpunctuator(state, ')');
  } else if (t.type === 'punctuator' && t.value === '[') {
    state = parsearrayliteral(state);
  } else if (t.type === 'punctuator' && t.value === '{') {
    state = parseobjectliteral(state);
  } else {
    state = advance(state);
  }

  function loopmember(s) {
    var ct = peek(s);
    if (ct.type === 'punctuator' && (ct.value === '.' || ct.value === '?.')) {
      var nextstate = advance(s);
      var prop = peek(nextstate);
      if (prop.type === 'identifier' || prop.type === 'keyword') nextstate = advance(nextstate);
      else if (prop.type === 'punctuator' && prop.value === '(') {
        nextstate = advance(nextstate);
        nextstate = parsearguments(nextstate);
      } else nextstate = advance(nextstate);
      return function() { return loopmember(nextstate); };
    }
    if (ct.type === 'punctuator' && ct.value === '[') {
      var nextstate2 = advance(s);
      nextstate2 = parseexpression(nextstate2, [']']);
      nextstate2 = expectpunctuator(nextstate2, ']');
      return function() { return loopmember(nextstate2); };
    }
    if (ct.type === 'punctuator' && ct.value === '(') {
      var nextstate3 = advance(s);
      nextstate3 = parsearguments(nextstate3);
      return function() { return loopmember(nextstate3); };
    }
    return s;
  }

  return assertparserstate(trampoline(loopmember)(state), 'parseprimaryandmemberandcall', state && state.index);
}

function isasyncarrowstart(state) {
  var tokens = state.tokens;
  var idx = state.index;
  if (tokens[idx].type !== 'keyword' || tokens[idx].value !== 'async') return false;
  var nxt = tokens[idx + 1];
  if (!nxt) return false;
  if (nxt.type === 'identifier') {
    return tokens[idx + 2] && tokens[idx + 2].type === 'punctuator' && tokens[idx + 2].value === '=>';
  }
  if (nxt.type === 'punctuator' && nxt.value === '(') {
    function scanparen(i, depth) {
      if (i >= tokens.length) return false;
      var t = tokens[i];
      if (t.type === 'punctuator') {
        if (t.value === '(') return scanparen(i + 1, depth + 1);
        if (t.value === ')') {
          var d = depth - 1;
          if (d === 0) return tokens[i + 1] && tokens[i + 1].type === 'punctuator' && tokens[i + 1].value === '=>';
          return scanparen(i + 1, d);
        }
      }
      if (t.type === 'eof') return false;
      return scanparen(i + 1, depth);
    }
    return scanparen(idx + 1, 0);
  }
  return false;
}

// ---- OP-015: parsearrowfunctionfromtokens ----
function parsearrowfunctionfromtokens(state) {
  state = pushscope(state);
  var t = peek(state);
  if (t.type === 'keyword' && t.value === 'async') state = advance(state);

  t = peek(state);
  if (t.type === 'identifier') {
    state = declare(state, t.value);
    state = advance(state);
  } else if (t.type === 'punctuator' && t.value === '(') {
    state = advance(state);
    function loopparams(s) {
      if (peek(s).type === 'punctuator' && peek(s).value === ')') return s;
      if (peek(s).type === 'eof') return s;
      var p = peek(s);
      var nextstate;
      if (p.type === 'identifier') { nextstate = declare(s, p.value); nextstate = advance(nextstate); }
      else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) nextstate = parsebindingpattern(s);
      else nextstate = advance(s);
      if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') nextstate = advance(nextstate);
      return function() { return loopparams(nextstate); };
    }
    state = assertparserstate(trampoline(loopparams)(state), 'parsearrowfunctionfromtokens.loopparams', state && state.index);
    state = expectpunctuator(state, ')');
  }

  state = expectpunctuator(state, '=>');

  if (peek(state).type === 'punctuator' && peek(state).value === '{') {
    state = parseblock(state);
  } else {
    state = parseexpression(state, [';', ',', ')', ']', '}']);
  }

  return popscope(state);
}

function parsetemplatetoken(state) {
  var token = peek(state);
  state = advance(state);
  if (token.extra && token.extra.expressions) {
    token.extra.expressions.forEach(function(expr) {
      var subtokens = tokenize(expr.raw);
      var substate = createstate(subtokens);
      substate.scopes = state.scopes;
      substate.freevars = state.freevars;
      substate = parseexpression(substate, [';', ',', ')', ']', '}']);
      var next = cloneobj(state);
      next.freevars = substate.freevars;
      state = next;
    });
  }
  return state;
}

// ---- OP-010: parseobjectliteral ----
function parseobjectliteral(state) {
  state = expectpunctuator(state, '{');
  function loop(s) {
    if (peek(s).type === 'punctuator' && peek(s).value === '}') return s;
    if (peek(s).type === 'eof') return s;
    var t = peek(s);
    var nextstate = s;
    if (t.type === 'identifier' || t.type === 'stringliteral' || t.type === 'numericliteral') {
      var lookahead = s.tokens[s.index + 1];
      if (lookahead && lookahead.type === 'punctuator' && lookahead.value === ':') {
        nextstate = advance(s);
        nextstate = expectpunctuator(nextstate, ':');
        nextstate = parseexpression(nextstate, [',', '}']);
      } else {
        nextstate = parseprimaryandmemberandcall(s);
      }
    } else if (t.type === 'punctuator' && t.value === '[') {
      nextstate = advance(s);
      nextstate = parseexpression(nextstate, [']']);
      nextstate = expectpunctuator(nextstate, ']');
      if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ':') {
        nextstate = advance(nextstate);
        nextstate = parseexpression(nextstate, [',', '}']);
      }
    } else if (t.type === 'punctuator' && t.value === ',') {
      nextstate = advance(s);
    } else {
      nextstate = advance(s);
    }
    if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') nextstate = advance(nextstate);
    return function() { return loop(nextstate); };
  }
  state = assertparserstate(trampoline(loop)(state), 'parseobjectliteral', state && state.index);
  return expectpunctuator(state, '}');
}

// ---- OP-011: parsearrayliteral ----
function parsearrayliteral(state) {
  state = expectpunctuator(state, '[');
  function loop(s) {
    if (peek(s).type === 'punctuator' && peek(s).value === ']') return s;
    if (peek(s).type === 'eof') return s;
    if (peek(s).type === 'punctuator' && peek(s).value === ',') {
      return function() { return loop(advance(s)); };
    }
    var nextstate = parseexpression(s, [',', ']']);
    if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') nextstate = advance(nextstate);
    return function() { return loop(nextstate); };
  }
  state = assertparserstate(trampoline(loop)(state), 'parsearrayliteral', state && state.index);
  return expectpunctuator(state, ']');
}

// ---- OP-012: parsearguments ----
function parsearguments(state) {
  function loop(s) {
    if (peek(s).type === 'punctuator' && peek(s).value === ')') return s;
    if (peek(s).type === 'eof') return s;
    if (peek(s).type === 'punctuator' && peek(s).value === ',') {
      return function() { return loop(advance(s)); };
    }
    var nextstate = parseexpression(s, [',', ')']);
    if (peek(nextstate).type === 'punctuator' && peek(nextstate).value === ',') nextstate = advance(nextstate);
    return function() { return loop(nextstate); };
  }
  state = assertparserstate(trampoline(loop)(state), 'parsearguments', state && state.index);
  return expectpunctuator(state, ')');
}

function detectfreeidentifiers(source) {
  var tokens = tokenize(source);
  var state = createstate(tokens);
  return parseprogram(state);
}

function parseSource(source) {
  try {
    var identifiers = detectfreeidentifiers(source);
    return { ok: true, identifiers: identifiers, errors: [] };
  } catch (err) {
    return { ok: false, identifiers: [], errors: [err && err.message ? err.message : String(err)] };
  }
}

// ============================================================
// PART 2: dnaserializer (from dnaserializer.js)
// ============================================================

var serializedDepsStore = {};
var serializedDepsCounter = 0;
var serializedDepsKeyMap = {};

function creatednaserializerconstants() {
  return Object.freeze({
    defaultfnkeys: Object.freeze(['length', 'name', 'prototype'])
  });
}

function skipspaces(source, i, len) {
  if (i < len && source[i] === ' ') return skipspaces(source, i + 1, len);
  return i;
}

function skipidentifierpart(source, i, len) {
  if (i < len && isidentifierpart(source[i])) return skipidentifierpart(source, i + 1, len);
  return i;
}

function readidentifier(source, i, len) {
  function scan(pos, word) {
    if (pos < len && isidentifierpart(source[pos])) return scan(pos + 1, word + source[pos]);
    return { word: word, end: pos };
  }
  return scan(i, '');
}

// ---- OP-023: rewritefunctionsource refactored ----
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

// ============================================================
// PART 3: new functions for fn analysis and output mapping
// ============================================================

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

// ---- OP-016: runtime block-input definedness (C11) ----
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
      blockid: blockid,
      kind: 'block-input-undefined',
      missing: missing
    };
    throw err;
  }
}

// ---- OP-017: unified container-usage scanner (C12b, C13b, C12a) ----
function analyzecontainerusage(src, container, declared, opts) {
  if (opts === undefined) opts = {};
  var usealiases = opts.aliases === true;
  var declaredarr = Array.isArray(declared) ? declared : [];
  var declaredset = {};
  for (var di = 0; di < declaredarr.length; di++) declaredset[declaredarr[di]] = true;

  var tokens = tokenize(src);
  var aliases = {};
  aliases['properties'] = true;

  var aliasroot = {};
  var used = {};
  var usedorder = [];

  function recordname(n) {
    if (!used[n]) { used[n] = true; usedorder.push(n); }
  }

  function isident(t, v) { return t && t.type === 'identifier' && t.value === v; }
  function isdot(t) { return t && t.type === 'punctuator' && t.value === '.'; }
  function iseq(t) { return t && t.type === 'punctuator' && t.value === '='; }

  // pass 1: bind aliases
  var i = 0;
  while (i < tokens.length) {
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
    i += 1;
  }

  // pass 2: collect reads
  i = 0;
  while (i < tokens.length) {
    var a = tokens[i];
    if (a && a.type === 'identifier' && aliases[a.value] &&
        isdot(tokens[i + 1]) &&
        tokens[i + 2] && tokens[i + 2].type === 'identifier') {
      if (a.value === 'properties') {
        if (isident(tokens[i + 2], container) &&
            isdot(tokens[i + 3]) &&
            tokens[i + 4] && tokens[i + 4].type === 'identifier') {
          recordname(tokens[i + 4].value);
          i += 5;
          continue;
        }
      } else if (aliasroot[a.value] === container) {
        recordname(tokens[i + 2].value);
        i += 3;
        continue;
      }
    }
    i += 1;
  }

  var missingdecl = usedorder.filter(function(n) { return !declaredset[n]; });
  var missinguse = declaredarr.filter(function(n) { return !used[n]; });

  return {
    used: usedorder,
    declared: declaredarr.slice(),
    missingdecl: missingdecl,
    missinguse: missinguse
  };
}

// ---- OP-018: input-usage scanner ----
function analyzeinputusage(src, declared) {
  return analyzecontainerusage(src, 'inputs', declared, { aliases: false });
}

// ---- OP-019: dep-usage scanner, with alias tracking ----
function analyzedepusage(src, declared) {
  return analyzecontainerusage(src, 'deps', declared, { aliases: true });
}

// ---- OP-020: analyzefnblock with input/dep closure checks ----
function analyzefnblock(block, depsmap, env, parser) {
  if (parser === undefined) parser = parseSource;
  var fn = block.fn;
  if (typeof fn !== 'function') {
    return { valid: false, violations: ['fn is not a function'], free: [], declared: [] };
  }
  var src = fn.toString();
  if (src.indexOf('[native code]') !== -1) {
    return { valid: false, violations: ['native function not allowed'], free: [], declared: [] };
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
    try {
      console.warn('[FN_PURITY_VIOLATION][parser-rejected] block="' +
        (block.id || 'unknown') + '" srclen=' + src.length +
        ' err="' + errstr + '" src="' + fingerprint + '"');
    } catch (_) { /* non-fatal */ }
    return {
      valid: false,
      violations: ['parser rejected source: ' + errstr],
      free: [], declared: [],
      diagnostics: {
        kind: 'parser-rejected',
        errors: errs,
        srclen: src.length,
        srcfingerprint: fingerprint
      }
    };
  }
  var declared = {};
  Object.keys(depsmap || {}).forEach(function(k) { declared[k] = true; });
  (block.inputs || []).forEach(function(k) { declared[k] = true; });
  var builtins = ['console','window','document','globalThis','Math','JSON','Object','Array','String','Number','Boolean','Promise','Date','RegExp','Error','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent'];
  builtins.forEach(function(k) { declared[k] = true; });
  var violations = parsed.identifiers.filter(function(id) { return !declared[id]; });

  // A3 / A4: input and dep closure checks (C12b, C13b, and C12a under strictinputs)
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

// ============================================================
// PART 4: compilefnblock (NEW)
// ============================================================

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
// EXPORTS (if module system used, but we rely on globals)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // freevarparser
    detectfreeidentifiers: detectfreeidentifiers,
    parseSource: parseSource,
    isidentifierstart: isidentifierstart,
    isidentifierpart: isidentifierpart,
    containsidentifier: containsidentifier,
    findmatchingparen: findmatchingparen,
    findbodybrace: findbodybrace,
    // dnaserializer
    creatednaserializerconstants: creatednaserializerconstants,
    validaterevivablefunctionblock: validaterevivablefunctionblock,
    validaterevivableobject: validaterevivableobject,
    resolvefrombriefcase: resolvefrombriefcase,
    preparefunctionforserialization: preparefunctionforserialization,
    serializeselfcontainedclosure: serializeselfcontainedclosure,
    preparednaforserialization: preparednaforserialization,
    structuralhash: structuralhash,
    serializeFunctionWithDeps: serializeFunctionWithDeps,
    serializeDepValue: serializeDepValue,
    serializedDepsStore: serializedDepsStore,
    // new fn analysis
    containsstyleaccess: containsstyleaccess,
    mapoutputs: mapoutputs,
    analyzefnblock: analyzefnblock,
    createblockanalyzer: createblockanalyzer,
    createblockanalyzers: createblockanalyzers,
    compilefnblock: compilefnblock
  };
}
