// parser.js — parsing concern
// Middle of the DAG: reads tokenscanner.js globals; provides the parser surface.
// Consolidations applied: iteratestates (PS-1), withscope (PS-2),
// declareifidentifier (PS-3), bufferparser (PS-4).

// ============================================================
// §1 — State guards (OP-128)
// ============================================================

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
  // OP-025 (R-31): end-of-input is EXPLICIT. The accessor validates the state object above; it must not also
  // return `undefined` past the last token, because every caller dereferences the result (`t.type`) and would
  // die with an anonymous TypeError instead of reaching the parser's own diagnostics. An 'eof' token type
  // already exists in this parser (done() tests `t.type === 'eof'`), so consuming it requires no new concept.
  if (state.index >= state.tokens.length) return { type: 'eof', value: null, kind: 'eof' };
  return state.tokens[state.index];
}

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

// ============================================================
// §2 — Token predicate (OP-129)
// ============================================================

function nextis(state, kind, value) {
  var t = peek(state);
  return t.type === kind && (value === undefined || t.value === value);
}

// ============================================================
// §3 — Loop generaliser (OP-130; PS-1)
// ============================================================

function iteratestates(start, done, step, label, hintindex) {
  function loop(s) {
    if (done(s)) return s;
    return function() { return loop(step(s)); };
  }
  return assertparserstate(trampoline(loop)(start), label, hintindex);
}

// ============================================================
// §4 — State primitives (OP-131)
// ============================================================

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

// ============================================================
// §5 — Scope-pair generaliser (OP-132; PS-2)
// ============================================================

function withscope(state, body) {
  return popscope(body(pushscope(state)));
}

// ============================================================
// §6 — Declare-if-identifier helper (OP-133; PS-3)
// ============================================================

function declareifidentifier(state) {
  var t = peek(state);
  if (t.type !== 'identifier') return state;
  return advance(declare(state, t.value));
}

// ============================================================
// §7 — Expression-context helpers (OP-134)
// ============================================================

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

// ============================================================
// §8 — Tentative-stack helpers (OP-135)
// ============================================================

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

// ============================================================
// §9 — Free-var accumulators (OP-136)
// ============================================================

function findkind(kindkey) {
  var found = null;
  kinds.some(function(kind) {
    if (kind.name === kindkey) { found = kind; return true; }
    return false;
  });
  return found;
}

function addfreevarsfromtokens(state, tokens) {
  var next = state;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === 'identifier') next = addfreevar(next, t.value);
  }
  return next;
}

function addfreevarsfrombuffer(state, tokens, from, to) {
  var next = state;
  var end = (to === undefined) ? tokens.length : to;
  for (var i = from; i < end; i++) {
    var t = tokens[i];
    if (t.type === 'identifier') next = addfreevar(next, t.value);
  }
  return next;
}

// ============================================================
// §10 — Buffer-parser factory (OP-137; PS-4)
// ============================================================

function bufferparser(cfg) {
  var scoped = cfg.scoped === true;
  var inneronly = cfg.inneronly === true;
  var from = inneronly ? 1 : 0;
  return function(state, tokens) {
    var to = inneronly ? tokens.length - 1 : tokens.length;
    if (scoped) {
      var inner = addfreevarsfrombuffer(pushscope(state), tokens, from, to);
      return advance(popscope(inner));
    }
    return advance(addfreevarsfrombuffer(state, tokens, from, to));
  };
}

// ============================================================
// §11 — Twelve buffer parsers (OP-138)
// ============================================================

// --- Seven factory-produced (OP-137) ---
var parseprimaryfrombuffer      = bufferparser({ scoped: false, inneronly: false });
var parseconditionalfrombuffer  = bufferparser({ scoped: false, inneronly: false });
var parsemapconstructfrombuffer = bufferparser({ scoped: false, inneronly: false });
var parseblockfrombuffer        = bufferparser({ scoped: true,  inneronly: true  });
var parsearrayliteralfrombuffer = bufferparser({ scoped: false, inneronly: true  });
var parsejsonfrombuffer         = bufferparser({ scoped: false, inneronly: true  });
var parseargumentsfrombuffer    = bufferparser({ scoped: false, inneronly: true  });

// --- Five bespoke ---

// parseobjectliteralfrombuffer — FR-2 applied: no closure mutation
function parseobjectliteralfrombuffer(state, tokens) {
  var inner = tokens.slice(1, -1);

  function scan(i, acc) {
    if (i >= inner.length) return acc;
    var t = inner[i];
    if (t.type === 'identifier') {
      var ahead = inner[i + 1];
      if (ahead && ahead.type === 'punctuator' && ahead.value === ':') {
        return scan(i + 3, acc);
      }
      return scan(i + 1, addfreevar(acc, t.value));
    }
    return scan(i + 1, acc);
  }
  return advance(scan(0, state));
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

// ============================================================
// §12 — Tentative-kind registry (OP-139)
// ============================================================


// ============================================================
// §12 — Tentative-kind registry (OP-139)
// ============================================================

function tokenis(token, kind, value) {
  return !!token && token.type === kind && (value === undefined || token.value === value);
}

function mk_kind(cfg) {
  var append = function(t, token) {
    var n = cloneobj(t);
    n.tokens = t.tokens.concat([token]);
    return n;
  };
  var reject = cfg.reject || function(state, t) { return state; };
  var decide;
  if (cfg.decide) {
    decide = cfg.decide;
  } else if (cfg.accept !== undefined) {
    var acc = cfg.accept;
    decide = function(t, token) {
      if (tokenis(token, 'punctuator', acc)) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    };
  } else if (cfg.acceptany === true) {
    decide = function(t, token) { return 'accept'; };
  } else {
    decide = function(t, token) { return 'hold'; };
  }
  return {
    name: cfg.name,
    start: cfg.start,
    append: append,
    decide: decide,
    commit: cfg.commit,
    reject: reject
  };
}

var kinds = [
  mk_kind({
    name: 'regex',
    start: function(state, token) { return tokenis(token, 'punctuator', '/') && state.expectexpression === true; },
    decide: function(t, token) {
      if (tokenis(token, 'punctuator', '/') && t.tokens.length > 1) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    },
    commit: function(state, t) { return advance(state); },
    reject: function(state, t) {
      var n = cloneobj(state);
      n.index = t.startindex;
      return n;
    }
  }),
  mk_kind({
    name: 'objectliteral',
    start: function(state, token) { return tokenis(token, 'punctuator', '{') && state.expectexpression === true; },
    accept: '}',
    commit: function(state, t) { return parseobjectliteralfrombuffer(state, t.tokens); },
    reject: function(state, t) { return parseblockfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'block',
    start: function(state, token) { return tokenis(token, 'punctuator', '{') && state.expectexpression !== true; },
    accept: '}',
    commit: function(state, t) { return parseblockfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'arrayliteral',
    start: function(state, token) { return tokenis(token, 'punctuator', '[') && state.expectexpression === true; },
    accept: ']',
    commit: function(state, t) { return parsearrayliteralfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'json',
    start: function(state, token) { return tokenis(token, 'punctuator', '{') || tokenis(token, 'punctuator', '['); },
    decide: function(t, token) {
      if (tokenis(token, 'punctuator', '}') || tokenis(token, 'punctuator', ']')) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    },
    commit: function(state, t) { return parsejsonfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'arrowfunction',
    start: function(state, token) { return isarrowfunctionstart(state); },
    accept: '=>',
    commit: function(state, t) { return parsearrowfunctionfrombuffer(state, t.tokens); },
    reject: function(state, t) { return parseprimaryfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'memberaccess',
    start: function(state, token) { return tokenis(token, 'punctuator', '.'); },
    decide: function(t, token) {
      if (tokenis(token, 'identifier') || tokenis(token, 'keyword')) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    },
    commit: function(state, t) { return advance(state); }
  }),
  mk_kind({
    name: 'optionalaccess',
    start: function(state, token) { return tokenis(token, 'punctuator', '?.'); },
    decide: function(t, token) {
      if (tokenis(token, 'identifier') || tokenis(token, 'keyword') || tokenis(token, 'punctuator', '(')) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    },
    commit: function(state, t) { return parseoptionalaccessfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'call',
    start: function(state, token) { return tokenis(token, 'punctuator', '('); },
    accept: ')',
    commit: function(state, t) { return parseargumentsfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'forheader',
    start: function(state, token) { return tokenis(token, 'keyword', 'for'); },
    decide: function(t, token) {
      if (tokenis(token, 'keyword', 'in') || tokenis(token, 'keyword', 'of')) return 'accept';
      if (tokenis(token, 'punctuator', ';')) return 'accept';
      if (tokenis(token, 'punctuator', ')')) return 'accept';
      if (tokenis(token, 'eof')) return 'reject';
      return 'hold';
    },
    commit: function(state, t) { return parseforheaderfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'templatesubstitution',
    start: function(state, token) { return tokenis(token, 'templateliteral') && token.extra && token.extra.expressions.length > 0; },
    acceptany: true,
    commit: function(state, t) { return parsetemplatefrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'conditional',
    start: function(state, token) { return tokenis(token, 'punctuator', '?'); },
    accept: ':',
    commit: function(state, t) { return parseconditionalfrombuffer(state, t.tokens); }
  }),
  mk_kind({
    name: 'mapconstruct',
    start: function(state, token) { return tokenis(token, 'keyword', 'new') && state.expectexpression === true; },
    accept: ')',
    commit: function(state, t) { return parsemapconstructfrombuffer(state, t.tokens); }
  })
];

// ============================================================
// §13 — Lookahead helpers (OP-140)
// ============================================================

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

// ============================================================
// §14 — Thirteen trampoline productions (OP-141; PS-1)
// ============================================================

// ---- (1) parseprogram ----
function parseprogram(state) {
  function done(s) { return nextis(s, 'eof'); }
  function step(s) {
    return assertparserstate(parsestatement(s), 'parseprogram.parsestatement', s && s.index);
  }
  var finalstate = iteratestates(state, done, step, 'parseprogram', state && state.index);
  return Object.keys(finalstate.freevars).filter(function(k) {
    return has(finalstate.freevars, k);
  });
}

// ---- (1b) parsestatement (OP-004) — relocated verbatim.
//      The OP-141 trampoline generation calls this dispatcher from its parseprogram and parseblock steps but
//      never defined it, and the function was not in the manifest, so those call sites raised
//      `ReferenceError: parsestatement is not defined`. All sixteen callees exist in this file: peek,
//      assertparserstate, nextis, advance, parseblock, parsevariabledeclaration, parsefunctiondeclaration,
//      parseifstatement, parseforstatement, parsewhilestatement, parsedostatement, parsetrystatement,
//      parseswitchstatement, parseclassdeclaration, parseexpression, consumesemicolon.
function parsestatement(state) {
  var t = peek(state);

  if (t.type === 'punctuator') {
    if (nextis(state, 'punctuator', '{')) return parseblock(state);
    if (nextis(state, 'punctuator', ';')) return advance(state);
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
        if (!nextis(state, 'punctuator', ';') &&
            !nextis(state, 'punctuator', '}') &&
            !nextis(state, 'eof')) {
          state = assertparserstate(parseexpression(state, [';', '}']), 'parsestatement.return.parseexpression', state && state.index);
        }
        return consumesemicolon(state);
      case 'throw':
        state = advance(state);
        state = assertparserstate(parseexpression(state, [';']), 'parsestatement.throw.parseexpression', state && state.index);
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

  state = assertparserstate(parseexpression(state, [';']), 'parsestatement.default.parseexpression', state && state.index);
  return consumesemicolon(state);
}

// ---- (2) parseblock ----
function parseblock(state) {
  state = expectpunctuator(state, '{');
  state = pushscope(state);
  function done(s) { return nextis(s, 'punctuator', '}') || nextis(s, 'eof'); }
  function step(s) {
    return assertparserstate(parsestatement(s), 'parseblock.parsestatement', s && s.index);
  }
  state = iteratestates(state, done, step, 'parseblock', state && state.index);
  state = expectpunctuator(state, '}');
  return popscope(state);
}

// ---- (3) parsevariabledeclaration ----
function parsevariabledeclaration(state) {
  state = advance(state);
  function done(s) {
    var t = peek(s);
    if (t.type === 'identifier') return false;
    if (t.type === 'punctuator' && (t.value === '{' || t.value === '[')) return false;
    return true;
  }
  function step(s) {
    var t = peek(s);
    var nextstate;
    if (t.type === 'identifier') {
      nextstate = declare(s, t.value);
      nextstate = advance(nextstate);
    } else {
      nextstate = assertparserstate(parsebindingpattern(s), 'parsevariabledeclaration.parsebindingpattern', s && s.index);
    }
    if (nextis(nextstate, 'punctuator', '=')) {
      nextstate = advance(nextstate);
      nextstate = assertparserstate(parseexpression(nextstate, [',', ';']), 'parsevariabledeclaration.parseexpression', nextstate && nextstate.index);
    }
    if (nextis(nextstate, 'punctuator', ',')) {
      return advance(nextstate);
    }
    return nextstate;
  }
  state = iteratestates(state, done, step, 'parsevariabledeclaration', state && state.index);
  return consumesemicolon(state);
}

// ---- (4) parsebindingpattern — BESPOKE (depth-carrying loop; R-ARC-14) ----
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

// ---- (5) parsefunctiondeclaration ----
function parsefunctiondeclaration(state) {
  state = advance(state);
  state = declareifidentifier(state);
  return assertparserstate(parsefunctionbody(state), 'parsefunctiondeclaration.parsefunctionbody', state && state.index);
}

// ---- (6) parsefunctionbody ----
function parsefunctionbody(state) {
  state = pushscope(state);
  if (nextis(state, 'punctuator', '(')) {
    state = advance(state);
    function done(s) { return nextis(s, 'punctuator', ')') || nextis(s, 'eof'); }
    function step(s) {
      var p = peek(s);
      var nextstate;
      if (p.type === 'identifier') {
        nextstate = declare(s, p.value);
        nextstate = advance(nextstate);
      } else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) {
        nextstate = assertparserstate(parsebindingpattern(s), 'parsefunctionbody.loopparams.parsebindingpattern', s && s.index);
      } else {
        nextstate = advance(s);
      }
      if (nextis(nextstate, 'punctuator', ',')) nextstate = advance(nextstate);
      return nextstate;
    }
    state = iteratestates(state, done, step, 'parsefunctionbody.loopparams', state && state.index);
    state = expectpunctuator(state, ')');
  }

  if (nextis(state, 'punctuator', '{')) {
    state = assertparserstate(parseblock(state), 'parsefunctionbody.parseblock', state && state.index);
  } else {
    state = assertparserstate(parseexpression(state, [';']), 'parsefunctionbody.parseexpression', state && state.index);
  }

  return popscope(state);
}

// ---- (7) parseifstatement (no trampoline loop) ----
function parseifstatement(state) {
  state = advance(state);
  if (nextis(state, 'punctuator', '(')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parseifstatement.parseexpression', state && state.index);
    state = expectpunctuator(state, ')');
  }
  state = assertparserstate(parsestatement(state), 'parseifstatement.parsestatement', state && state.index);
  if (nextis(state, 'keyword', 'else')) {
    state = advance(state);
    state = assertparserstate(parsestatement(state), 'parseifstatement.else.parsestatement', state && state.index);
  }
  return state;
}

// ---- (8) parseforstatement (no trampoline loop) ----
function parseforstatement(state) {
  state = advance(state);
  state = pushscope(state);

  if (nextis(state, 'keyword', 'await')) state = advance(state);
  if (nextis(state, 'punctuator', '(')) state = advance(state);

  if (nextis(state, 'keyword', 'var') || nextis(state, 'keyword', 'let') || nextis(state, 'keyword', 'const')) {
    state = parsevariabledeclaration(state);
  } else {
    if (!nextis(state, 'punctuator', ';')) state = assertparserstate(parseexpression(state, [';']), 'parseforstatement.init.parseexpression', state && state.index);
    if (nextis(state, 'keyword', 'in') || nextis(state, 'keyword', 'of')) {
      state = advance(state);
      state = assertparserstate(parseexpression(state, [')']), 'parseforstatement.inof.parseexpression', state && state.index);
      state = expectpunctuator(state, ')');
      state = assertparserstate(parsestatement(state), 'parseforstatement.inof.parsestatement', state && state.index);
      return popscope(state);
    }
    state = expectpunctuator(state, ';');
  }

  if (nextis(state, 'keyword', 'in') || nextis(state, 'keyword', 'of')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parseforstatement.inof2.parseexpression', state && state.index);
    state = expectpunctuator(state, ')');
    state = assertparserstate(parsestatement(state), 'parseforstatement.inof2.parsestatement', state && state.index);
    return popscope(state);
  }

  if (!nextis(state, 'punctuator', ';')) state = assertparserstate(parseexpression(state, [';']), 'parseforstatement.test.parseexpression', state && state.index);
  state = expectpunctuator(state, ';');

  if (!nextis(state, 'punctuator', ')')) state = assertparserstate(parseexpression(state, [')']), 'parseforstatement.update.parseexpression', state && state.index);
  if (nextis(state, 'punctuator', ')')) state = advance(state);

  state = assertparserstate(parsestatement(state), 'parseforstatement.body.parsestatement', state && state.index);
  return popscope(state);
}

// ---- (9) parsewhilestatement ----
function parsewhilestatement(state) {
  state = advance(state);
  if (nextis(state, 'punctuator', '(')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parsewhilestatement.parseexpression', state && state.index);
    state = expectpunctuator(state, ')');
  }
  return assertparserstate(parsestatement(state), 'parsewhilestatement.parsestatement', state && state.index);
}

// ---- (10) parsedostatement ----
function parsedostatement(state) {
  state = advance(state);
  state = assertparserstate(parsestatement(state), 'parsedostatement.body.parsestatement', state && state.index);
  state = expectkeyword(state, 'while');
  if (nextis(state, 'punctuator', '(')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parsedostatement.test.parseexpression', state && state.index);
    state = expectpunctuator(state, ')');
  }
  return consumesemicolon(state);
}

// ---- (11) parsetrystatement ----
function parsetrystatement(state) {
  state = advance(state);
  if (nextis(state, 'punctuator', '{')) state = assertparserstate(parseblock(state), 'parsetrystatement.try.parseblock', state && state.index);

  if (nextis(state, 'keyword', 'catch')) {
    state = advance(state);
    state = pushscope(state);
    if (nextis(state, 'punctuator', '(')) {
      state = advance(state);
      var p = peek(state);
      if (p.type === 'identifier') { state = declare(state, p.value); state = advance(state); }
      else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) state = parsebindingpattern(state);
      state = expectpunctuator(state, ')');
    }
    if (nextis(state, 'punctuator', '{')) state = assertparserstate(parseblock(state), 'parsetrystatement.catch.parseblock', state && state.index);
    state = popscope(state);
  }

  if (nextis(state, 'keyword', 'finally')) {
    state = advance(state);
    if (nextis(state, 'punctuator', '{')) state = assertparserstate(parseblock(state), 'parsetrystatement.finally.parseblock', state && state.index);
  }
  return state;
}

// ---- (12) parseswitchstatement ----
function parseswitchstatement(state) {
  state = advance(state);
  if (nextis(state, 'punctuator', '(')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parseswitchstatement.disc.parseexpression', state && state.index);
    state = expectpunctuator(state, ')');
  }
  if (nextis(state, 'punctuator', '{')) {
    state = advance(state);
    function done(s) { return nextis(s, 'punctuator', '}') || nextis(s, 'eof'); }
    function step(s) {
      var t = peek(s);
      if (t.type === 'keyword' && t.value === 'case') {
        var nextstate = advance(s);
        nextstate = assertparserstate(parseexpression(nextstate, [':']), 'parseswitchstatement.case.parseexpression', nextstate && nextstate.index);
        return expectpunctuator(nextstate, ':');
      }
      if (t.type === 'keyword' && t.value === 'default') {
        return expectpunctuator(advance(s), ':');
      }
      return assertparserstate(parsestatement(s), 'parseswitchstatement.parsestatement', s && s.index);
    }
    state = iteratestates(state, done, step, 'parseswitchstatement', state && state.index);
    state = expectpunctuator(state, '}');
  }
  return state;
}

// ---- (13) parseclassdeclaration ----
function parseclassdeclaration(state) {
  state = advance(state);
  state = declareifidentifier(state);
  if (nextis(state, 'keyword', 'extends')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, ['{']), 'parseclassdeclaration.extends.parseexpression', state && state.index);
  }
  if (nextis(state, 'punctuator', '{')) {
    state = pushscope(state);
    state = advance(state);

    function done(s) { return nextis(s, 'punctuator', '}') || nextis(s, 'eof'); }
    function step(s) {
      var nextstate = s;
      if (peek(nextstate).type === 'identifier' || peek(nextstate).type === 'keyword') {
        nextstate = advance(nextstate);
      }
      if (nextis(nextstate, 'punctuator', '(')) {
        nextstate = pushscope(nextstate);
        nextstate = advance(nextstate);

        function pdone(s2) { return nextis(s2, 'punctuator', ')'); }
        function pstep(s2) {
          var p = peek(s2);
          if (p.type === 'identifier') return advance(declare(s2, p.value));
          return advance(s2);
        }
        nextstate = iteratestates(nextstate, pdone, pstep, 'parseclassdeclaration.method.loopparams', nextstate && nextstate.index);

        nextstate = expectpunctuator(nextstate, ')');
        if (nextis(nextstate, 'punctuator', '{')) {
          nextstate = assertparserstate(parseblock(nextstate), 'parseclassdeclaration.method.parseblock', nextstate && nextstate.index);
        }
        nextstate = popscope(nextstate);
      } else {
        nextstate = advance(nextstate);
      }
      return nextstate;
    }
    state = iteratestates(state, done, step, 'parseclassdeclaration', state && state.index);
    state = expectpunctuator(state, '}');
    state = popscope(state);
  }
  return state;
}

// ---- (14) parseexpression ----
function parseexpression(state, stoptokens) {
  state = pushcontext(state, 'expression');
  state = assertparserstate(parseassignmentexpression(state, stoptokens), 'parseexpression.parseassignmentexpression', state && state.index);
  return popcontext(state);
}

// ---- (15) parseassignmentexpression (no trampoline loop; recursive) ----
function parseassignmentexpression(state, stoptokens) {
  state = assertparserstate(state, 'parseassignmentexpression.entry', state && state.index);
  state = assertparserstate(parseconditionalexpression(state, stoptokens), 'parseassignmentexpression.parseconditionalexpression', state && state.index);
  var t = peek(state);
  if (t.type === 'punctuator' && contains(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^='], t.value)) {
    state = advance(state);
    state = assertparserstate(parseassignmentexpression(state, stoptokens), 'parseassignmentexpression.recursive', state && state.index);
  }
  return state;
}

// ---- (16) parseconditionalexpression (no trampoline loop) ----
function parseconditionalexpression(state, stoptokens) {
  state = assertparserstate(state, 'parseconditionalexpression.entry', state && state.index);
  state = assertparserstate(parsebinaryexpression(state, stoptokens), 'parseconditionalexpression.parsebinaryexpression', state && state.index);
  var t = peek(state);
  if (nextis(state, 'punctuator', '?')) {
    state = advance(state);
    state = assertparserstate(parseexpression(state, [':']), 'parseconditionalexpression.consequent', state && state.index);
    state = expectpunctuator(state, ':');
    state = assertparserstate(parseexpression(state, stoptokens), 'parseconditionalexpression.alternate', state && state.index);
  }
  return state;
}

// ---- (17) parsebinaryexpression ----
function parsebinaryexpression(state, stoptokens) {
  state = assertparserstate(state, 'parsebinaryexpression.entry', state && state.index);
  state = assertparserstate(parseunaryexpression(state), 'parsebinaryexpression.initial', state && state.index);
  function done(s) {
    var t = peek(s);
    if (t.type === 'eof') return true;
    if (t.type !== 'punctuator') return true;
    if (contains(stoptokens, t.value)) return true;
    if (t.kind !== 'binary' && t.kind !== 'assignment' && t.kind !== 'conditional' &&
        t.kind !== 'colon' && t.kind !== 'binaryorprefix') return true;
    return false;
  }
  function step(s) {
    var nextstate = advance(s);
    return assertparserstate(parseunaryexpression(nextstate), 'parsebinaryexpression.loop.parseunaryexpression', nextstate && nextstate.index);
  }
  return iteratestates(state, done, step, 'parsebinaryexpression', state && state.index);
}

// ---- (18) parseunaryexpression (no trampoline loop; recursive) ----
function parseunaryexpression(state) {
  state = assertparserstate(state, 'parseunaryexpression.entry', state && state.index);
  var t = peek(state);
  if (t.type === 'punctuator' && contains(['!', '~', '+', '-', '++', '--'], t.value)) {
    state = advance(state);
    return assertparserstate(parseunaryexpression(state), 'parseunaryexpression.prefix', state && state.index);
  }
  if (t.type === 'keyword' && contains(['typeof', 'void', 'delete', 'await', 'yield'], t.value)) {
    state = advance(state);
    return assertparserstate(parseunaryexpression(state), 'parseunaryexpression.keyword', state && state.index);
  }
  return assertparserstate(parsepostfixexpression(state), 'parseunaryexpression.postfix', state && state.index);
}

// ---- (19) parsepostfixexpression (no trampoline loop) ----
function parsepostfixexpression(state) {
  state = assertparserstate(parseprimaryandmemberandcall(state), 'parsepostfixexpression.initial', state && state.index);
  var t = peek(state);
  if (t.type === 'punctuator' && (t.value === '++' || t.value === '--')) state = advance(state);
  return state;
}

// ---- (20) parseprimaryandmemberandcall ----
function parseprimaryandmemberandcall(state) {
  var t = peek(state);

  if (t.type === 'keyword' && t.value === 'async') {
    if (isasyncarrowstart(state)) return assertparserstate(parsearrowfunctionfromtokens(state), 'parseprimaryandmemberandcall.async.arrow', state && state.index);
    state = advance(state);
  } else if (t.type === 'identifier') {
    if (isarrowfunctionstart(state)) return assertparserstate(parsearrowfunctionfromtokens(state), 'parseprimaryandmemberandcall.identifier.arrow', state && state.index);
    state = addfreevar(state, t.value);
    state = advance(state);
  } else if (t.type === 'stringliteral' || t.type === 'numericliteral' || t.type === 'regexpliteral') {
    state = advance(state);
  } else if (t.type === 'templateliteral') {
    state = parsetemplatetoken(state);
    return state;
  } else if (t.type === 'keyword' && t.value === 'function') {
    state = advance(state);
    state = assertparserstate(parsefunctionbody(state), 'parseprimaryandmemberandcall.function', state && state.index);
  } else if (t.type === 'keyword' && t.value === 'new') {
    state = advance(state);
    state = assertparserstate(parseprimaryandmemberandcall(state), 'parseprimaryandmemberandcall.new', state && state.index);
  } else if (t.type === 'keyword' && t.value === 'this') {
    state = advance(state);
  } else if (t.type === 'punctuator' && t.value === '(') {
    if (isarrowfunctionstart(state)) return assertparserstate(parsearrowfunctionfromtokens(state), 'parseprimaryandmemberandcall.paren.arrow', state && state.index);
    state = advance(state);
    state = assertparserstate(parseexpression(state, [')']), 'parseprimaryandmemberandcall.paren', state && state.index);
    state = expectpunctuator(state, ')');
  } else if (t.type === 'punctuator' && t.value === '[') {
    state = assertparserstate(parsearrayliteral(state), 'parseprimaryandmemberandcall.arrayliteral', state && state.index);
  } else if (t.type === 'punctuator' && t.value === '{') {
    state = assertparserstate(parseobjectliteral(state), 'parseprimaryandmemberandcall.objectliteral', state && state.index);
  } else {
    state = advance(state);
  }

  function done(s) {
    var ct = peek(s);
    if (ct.type !== 'punctuator') return true;
    return !(ct.value === '.' || ct.value === '?.' || ct.value === '[' || ct.value === '(');
  }
  function step(s) {
    var ct = peek(s);
    if (ct.value === '.' || ct.value === '?.') {
      var nextstate = advance(s);
      var prop = peek(nextstate);
      if (prop.type === 'identifier' || prop.type === 'keyword') return advance(nextstate);
      if (prop.type === 'punctuator' && prop.value === '(') {
        nextstate = advance(nextstate);
        return assertparserstate(parsearguments(nextstate), 'parseprimaryandmemberandcall.loopmember.prop', nextstate && nextstate.index);
      }
      return advance(nextstate);
    }
    if (ct.value === '[') {
      var nextstate2 = advance(s);
      nextstate2 = assertparserstate(parseexpression(nextstate2, [']']), 'parseprimaryandmemberandcall.loopmember.bracket', nextstate2 && nextstate2.index);
      return expectpunctuator(nextstate2, ']');
    }
    // ct.value === '('
    var nextstate3 = advance(s);
    return assertparserstate(parsearguments(nextstate3), 'parseprimaryandmemberandcall.loopmember.call', nextstate3 && nextstate3.index);
  }
  return iteratestates(state, done, step, 'parseprimaryandmemberandcall', state && state.index);
}

// ---- (21) parsetemplatetoken (no trampoline loop) ----
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

// ---- (22) parseobjectliteral ----
function parseobjectliteral(state) {
  state = expectpunctuator(state, '{');
  function done(s) { return nextis(s, 'punctuator', '}') || nextis(s, 'eof'); }
  function step(s) {
    var t = peek(s);
    var nextstate = s;
    if (t.type === 'identifier' || t.type === 'stringliteral' || t.type === 'numericliteral') {
      var lookahead = s.tokens[s.index + 1];
      if (lookahead && lookahead.type === 'punctuator' && lookahead.value === ':') {
        nextstate = advance(s);
        nextstate = expectpunctuator(nextstate, ':');
        nextstate = assertparserstate(parseexpression(nextstate, [',', '}']), 'parseobjectliteral.value', nextstate && nextstate.index);
      } else {
        nextstate = assertparserstate(parseprimaryandmemberandcall(s), 'parseobjectliteral.shorthand', s && s.index);
      }
    } else if (t.type === 'punctuator' && t.value === '[') {
      nextstate = advance(s);
      nextstate = assertparserstate(parseexpression(nextstate, [']']), 'parseobjectliteral.computedkey', nextstate && nextstate.index);
      nextstate = expectpunctuator(nextstate, ']');
      if (nextis(nextstate, 'punctuator', ':')) {
        nextstate = advance(nextstate);
        nextstate = assertparserstate(parseexpression(nextstate, [',', '}']), 'parseobjectliteral.computedvalue', nextstate && nextstate.index);
      }
    } else if (nextis(s, 'punctuator', ',')) {
      nextstate = advance(s);
    } else {
      nextstate = advance(s);
    }
    if (nextis(nextstate, 'punctuator', ',')) nextstate = advance(nextstate);
    return nextstate;
  }
  state = iteratestates(state, done, step, 'parseobjectliteral', state && state.index);
  return expectpunctuator(state, '}');
}

// ---- (23) parsearrayliteral ----
function parsearrayliteral(state) {
  state = expectpunctuator(state, '[');
  function done(s) { return nextis(s, 'punctuator', ']') || nextis(s, 'eof'); }
  function step(s) {
    if (nextis(s, 'punctuator', ',')) return advance(s);
    var nextstate = assertparserstate(parseexpression(s, [',', ']']), 'parsearrayliteral.element', s && s.index);
    if (nextis(nextstate, 'punctuator', ',')) return advance(nextstate);
    return nextstate;
  }
  state = iteratestates(state, done, step, 'parsearrayliteral', state && state.index);
  return expectpunctuator(state, ']');
}

// ---- (24) parsearguments ----
function parsearguments(state) {
  function done(s) { return nextis(s, 'punctuator', ')') || nextis(s, 'eof'); }
  function step(s) {
    if (nextis(s, 'punctuator', ',')) return advance(s);
    var nextstate = assertparserstate(parseexpression(s, [',', ')']), 'parsearguments.argument', s && s.index);
    if (nextis(nextstate, 'punctuator', ',')) return advance(nextstate);
    return nextstate;
  }
  state = iteratestates(state, done, step, 'parsearguments', state && state.index);
  return expectpunctuator(state, ')');
}

// ============================================================
// §15 — parsearrowfunctionfromtokens (OP-142 + OP-143)
// ============================================================

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
    function done(s) { return nextis(s, 'punctuator', ')') || nextis(s, 'eof'); }
    function step(s) {
      var p = peek(s);
      var nextstate;
      if (p.type === 'identifier') { nextstate = declare(s, p.value); nextstate = advance(nextstate); }
      else if (p.type === 'punctuator' && (p.value === '{' || p.value === '[')) {
        nextstate = assertparserstate(parsebindingpattern(s), 'parsearrowfunctionfromtokens.loopparams', s && s.index);
      }
      else nextstate = advance(s);
      if (nextis(nextstate, 'punctuator', ',')) nextstate = advance(nextstate);
      return nextstate;
    }
    state = iteratestates(state, done, step, 'parsearrowfunctionfromtokens.loopparams', state && state.index);
    state = expectpunctuator(state, ')');
  }

  state = expectpunctuator(state, '=>');

  if (nextis(state, 'punctuator', '{')) {
    state = assertparserstate(parseblock(state), 'parsearrowfunctionfromtokens.block', state && state.index);
  } else {
    state = assertparserstate(parseexpression(state, [';', ',', ')', ']', '}']), 'parsearrowfunctionfromtokens.expression', state && state.index);
  }

  return popscope(state);
}

// ============================================================
// §16 — Statement terminators (OP-145)
// ============================================================

function consumesemicolon(state) {
  if (nextis(state, 'punctuator', ';')) return advance(state);
  return state;
}

// ============================================================
// §17 — Unified expect (from B.2.5; carried from C3)
// ============================================================

function expect(state, kind, value) {
  var t = peek(state);
  if (t.type !== kind || t.value !== value) {
    throw new Error('expected ' + kind + ' ' + value + ' but got ' + t.type + ' ' + t.value);
  }
  return advance(state);
}

function expectpunctuator(state, value) { return expect(state, 'punctuator', value); }
function expectkeyword(state, value) { return expect(state, 'keyword', value); }

// ============================================================
// §18 — Entry points (OP-144)
// ============================================================

function detectfreeidentifiers(source) {
  var tokens = tokenize(source);
  var state = createstate(tokens);
  return parseprogram(state);
}

function parseSource(source) {
  try {
    var identifiers = detectfreeidentifiers(source);
    return { ok: true, identifiers: identifiers, errors: [], diagnostic: null };
  } catch (err) {
    return {
      ok: false,
      identifiers: [],
      errors: [err && err.message ? err.message : String(err)],
      diagnostic: (err && err.diagnostic) ? err.diagnostic : null
    };
  }
}

// ============================================================
// §19 — Exports (OP-145)
// ============================================================