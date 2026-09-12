// tokenscanner.js — tokenization concern
// Bottom of the DAG: defines the shared primitives and every scan/token function.
// References only ECMAScript globals.

// ============================================================
// §1 — Shared primitives (bottom of the DAG; defined here and only here)
// ============================================================

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

// ============================================================
// §2 — Character predicates
// ============================================================

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

// ============================================================
// §3 — Keyword and builtin tables
// ============================================================

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

// ============================================================
// §4 — Punctuator table and matcher
// ============================================================

var punctuators = [
  ['===','binary'], ['!==','binary'], ['>>>','binary'], ['**=','assignment'],
  ['==','binary'], ['!=','binary'], ['<=','binary'], ['>=','binary'],
  ['&&','binary'], ['||','binary'], ['??','binary'],
  ['++','prefixorpostfix'], ['--','prefixorpostfix'],
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

// ============================================================
// §5 — Comment skippers (TS-2; shared with fnblock.js via global scope)
// ============================================================

function skiplinecomment(source, i) {
  if (i < source.length && source.charAt(i) !== '\n') return skiplinecomment(i + 1);
  return i;
}

function skipblockcomment(source, i) {
  if (i >= source.length) return i;
  if (source.charAt(i) === '*' && source.charAt(i + 1) === '/') return i + 2;
  return skipblockcomment(i + 1);
}

// ============================================================
// §6 — The four scanners
// ============================================================

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

// ============================================================
// §7 — Token constructor
// ============================================================

function maketoken(type, value, kind, extra) {
  var token = { type: type, value: value };
  if (kind !== undefined) token.kind = kind;
  if (extra !== undefined) token.extra = extra;
  return token;
}

// ============================================================
// §8 — Tokenization pipeline
// ============================================================

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
      return function() { return loop(skiplinecomment(source, i + 2), exprallowed); };
    }
    if (ch === '/' && source.charAt(i + 1) === '*') {
      return function() { return loop(skipblockcomment(source, i + 2), exprallowed); };
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

// ============================================================
// §9 — Initial parser state
// ============================================================

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

// ============================================================
// §10 — Exports
// ============================================================
