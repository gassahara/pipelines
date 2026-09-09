var hasown = Object.prototype.hasOwnProperty;

// trampoline — avoid stack overflow with deep recursion
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

function peek(state) {
  if (!state || !state.tokens || !Array.isArray(state.tokens)) {
    throw new Error('[freevarparser] peek called with invalid state');
  }
  return state.tokens[state.index];
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

function parseprimaryfrombuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseblockfrombuffer(state, tokens) {
  var next = pushscope(state);
  var inner = tokens.slice(1, -1);
  inner.forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = popscope(next);
  next = advance(next);
  return next;
}

function parseobjectliteralfrombuffer(state, tokens) {
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
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parsejsonfrombuffer(state, tokens) {
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parsearrowfunctionfrombuffer(state, tokens) {
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
  var next = state;
  tokens.slice(1, -1).forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parseforheaderfrombuffer(state, tokens) {
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
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
  next = advance(next);
  return next;
}

function parsemapconstructfrombuffer(state, tokens) {
  var next = state;
  tokens.forEach(function(t) {
    if (t.type === 'identifier') {
      next = addfreevar(next, t.value);
    }
  });
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

function parseprogram(state) {
  function loop(s) {
    if (peek(s).type === 'eof') return s;
    return function() { return loop(parsestatement(s)); };
  }
  var finalstate = trampoline(loop)(state);
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

function parseblock(state) {
  state = expectpunctuator(state, '{');
  state = pushscope(state);
  function loop(s) {
    if (peek(s).type === 'punctuator' && peek(s).value === '}') return s;
    if (peek(s).type === 'eof') return s;
    return function() { return loop(parsestatement(s)); };
  }
  state = trampoline(loop)(state);
  state = expectpunctuator(state, '}');
  return popscope(state);
}

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
  state = trampoline(loop)(state);
  return consumesemicolon(state);
}

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
  return trampoline(loop)(state, 0);
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
    state = trampoline(loopparams)(state);
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
    state = trampoline(loop)(state);
    state = expectpunctuator(state, '}');
  }
  return state;
}

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
    state = trampoline(loopmembers)(state);
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
  return trampoline(loop)(state);
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

  return trampoline(loopmember)(state);
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
    state = trampoline(loopparams)(state);
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
  state = trampoline(loop)(state);
  return expectpunctuator(state, '}');
}

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
  state = trampoline(loop)(state);
  return expectpunctuator(state, ']');
}

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
  state = trampoline(loop)(state);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectfreeidentifiers: detectfreeidentifiers,
    parseSource: parseSource,
    isidentifierstart: isidentifierstart,
    isidentifierpart: isidentifierpart,
    containsidentifier: containsidentifier,
    findmatchingparen: findmatchingparen,
    findbodybrace: findbodybrace
  };
}
