// js/factory/writertransformers.js — automatic writer HTML transformer set.
//
// @proposal=P-WT-1, @proposal=P-WT-2, @proposal=P-WT-3 (Frozen)
// @amendment=A-WT-1, @amendment=A-WT-2, @amendment=A-WT-3
//
// Provides:
//   - Lossless ES5 HTML fragment parser & serializer (wtparsehtml, wtserializenode)
//     independent of SETTRANSFORMATIONS (Instr-19).
//   - Immutable WriterTransformerSet model & pure functional combinators.
//   - Ref-swap WRITERTRANSFORMERSETREF seeded with the honest transparent default
//     ruleset: ['enclosingdiv', 'nestedlist', 'innerdivs'].
//   - Pure context-aware execution runner (applywritertransformers).
//
// ES5 only. No regex. No `this`. No `for`/`while`. Lowercase identifiers.

function wttrampoline(fn) {
  if (typeof trampoline === 'function') return trampoline(fn);
  return function () {
    var result = fn.apply(null, arguments);
    return typeof result === 'function' ? wttrampolinestep(result) : result;
  };
}

function wttrampolinestep(step) {
  if (typeof step !== 'function') return step;
  return wttrampolinestep(step());
}

function wtisarray(v) {
  return Array.isArray(v);
}

function wthasown(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function wtcloneattrs(attrs) {
  var out = {};
  if (!attrs || typeof attrs !== 'object') return out;
  Object.keys(attrs).forEach(function (k) { out[k] = attrs[k]; });
  return out;
}

function wtsplitclasses(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  return str.split(' ').filter(function (s) { return s.length > 0; });
}

function wtaddclasstoken(attrs, token) {
  if (typeof token !== 'string' || token.length === 0) return wtcloneattrs(attrs);
  var base = wtcloneattrs(attrs);
  var tokens = wtsplitclasses(base['class']);
  if (tokens.indexOf(token) !== -1) return base;
  base['class'] = tokens.length > 0 ? tokens.join(' ') + ' ' + token : token;
  return base;
}

function wtmakenode(tag, rawtag, attrs, children, selfclose) {
  var node = {
    tag: tag,
    attrs: attrs || {},
    children: children || []
  };
  if (rawtag && rawtag !== tag) node.rawtag = rawtag;
  if (selfclose === true) node.selfclose = true;
  return node;
}

// ============================================================
// §1 — HTML fragment parser & serializer (P-WT-3, A-WT-3)
// ============================================================

var WTVOIDTAGS = Object.freeze({
  area: true, base: true, br: true, col: true, embed: true,
  hr: true, img: true, input: true, link: true, meta: true,
  param: true, source: true, track: true, wbr: true
});

var WTRAWTEXTTAGS = Object.freeze({
  style: true,
  script: true
});

var WTNONVISUALTAGS = Object.freeze({
  style: true,
  script: true,
  link: true,
  meta: true
});

function wtisws(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' ||
         ch === '\r' || ch === '\f' || ch === '\v';
}

function wttrim(s) {
  if (typeof s !== 'string') return '';
  var len = s.length;
  function findstart(i) {
    if (i >= len) return len;
    if (wtisws(s.charAt(i))) return function () { return findstart(i + 1); };
    return i;
  }
  function findend(i) {
    if (i <= 0) return 0;
    if (wtisws(s.charAt(i - 1))) return function () { return findend(i - 1); };
    return i;
  }
  var start = wttrampoline(findstart)(0);
  var end = wttrampoline(findend)(len);
  if (start >= end) return '';
  return s.substring(start, end);
}

function wtfindtagend(s, i) {
  function step(pos, quote) {
    if (pos >= s.length) return -1;
    var ch = s.charAt(pos);
    if (quote !== null) {
      if (ch === quote) return function () { return step(pos + 1, null); };
      return function () { return step(pos + 1, quote); };
    }
    if (ch === '>') return pos;
    if (ch === '"' || ch === "'") return function () { return step(pos + 1, ch); };
    return function () { return step(pos + 1, null); };
  }
  return wttrampoline(step)(i, null);
}

function wtfindspace(body, i) {
  function step(pos) {
    if (pos >= body.length) return -1;
    if (wtisws(body.charAt(pos))) return pos;
    return function () { return step(pos + 1); };
  }
  return wttrampoline(step)(i);
}

function wtskipws(s, i) {
  function step(pos) {
    if (pos >= s.length) return pos;
    if (wtisws(s.charAt(pos))) return function () { return step(pos + 1); };
    return pos;
  }
  return wttrampoline(step)(i);
}

function wtreadattrkey(s, i) {
  function step(pos) {
    if (pos >= s.length) return pos;
    var c = s.charAt(pos);
    if (wtisws(c) || c === '=') return pos;
    return function () { return step(pos + 1); };
  }
  return wttrampoline(step)(i);
}

function wtreadunquotedval(s, i) {
  function step(pos) {
    if (pos >= s.length) return pos;
    if (wtisws(s.charAt(pos))) return pos;
    return function () { return step(pos + 1); };
  }
  return wttrampoline(step)(i);
}

function wtparseattrs(str) {
  var attrs = {};
  if (typeof str !== 'string' || str.length === 0) return attrs;
  function step(i) {
    var start = wtskipws(str, i);
    if (start >= str.length) return attrs;
    var keyend = wtreadattrkey(str, start);
    var key = str.substring(start, keyend);
    if (key.length === 0) return function () { return step(start + 1); };
    var afterkey = wtskipws(str, keyend);
    if (afterkey >= str.length || str.charAt(afterkey) !== '=') {
      attrs[key] = null;
      return function () { return step(afterkey); };
    }
    var vstart = wtskipws(str, afterkey + 1);
    if (vstart >= str.length) {
      attrs[key] = '';
      return attrs;
    }
    var q = str.charAt(vstart);
    if (q === '"' || q === "'") {
      var close = str.indexOf(q, vstart + 1);
      if (close === -1) {
        attrs[key] = str.substring(vstart + 1);
        return attrs;
      }
      attrs[key] = str.substring(vstart + 1, close);
      return function () { return step(close + 1); };
    }
    var vend = wtreadunquotedval(str, vstart);
    attrs[key] = str.substring(vstart, vend);
    return function () { return step(vend); };
  }
  return wttrampoline(step)(0);
}

function wtfindrawtextclose(lowerhtml, tagname, from) {
  var needle = '</' + tagname;
  function step(pos) {
    var idx = lowerhtml.indexOf(needle, pos);
    if (idx === -1) return null;
    var after = idx + needle.length;
    if (after < lowerhtml.length) {
      var ch = lowerhtml.charAt(after);
      if (ch !== '>' && !wtisws(ch)) {
        return function () { return step(after); };
      }
    }
    var gt = lowerhtml.indexOf('>', after);
    if (gt === -1) return null;
    return { contentend: idx, tagend: gt + 1 };
  }
  return wttrampoline(step)(from);
}

function wtparsetag(html, i) {
  if (html.charAt(i) !== '<') return null;
  if (html.substring(i, i + 4) === '<!--') {
    var cend = html.indexOf('-->', i + 4);
    var endpos = cend === -1 ? html.length : cend + 3;
    return { kind: 'raw', raw: html.substring(i, endpos), endpos: endpos };
  }
  var firstAfter = html.charAt(i + 1);
  if (firstAfter === '!' || firstAfter === '?') {
    var declend = wtfindtagend(html, i + 2);
    var dendpos = declend === -1 ? html.length : declend + 1;
    return { kind: 'raw', raw: html.substring(i, dendpos), endpos: dendpos };
  }
  var end = wtfindtagend(html, i + 1);
  if (end === -1) return null;
  var inner = html.substring(i + 1, end);
  if (inner.length === 0) return null;
  var isclose = inner.charAt(0) === '/';
  var isselfclose = !isclose && inner.charAt(inner.length - 1) === '/';
  var body = inner;
  if (isclose) body = body.substring(1);
  if (isselfclose) body = body.substring(0, body.length - 1);
  body = wttrim(body);
  if (body.length === 0) return { kind: 'skip', endpos: end + 1 };
  var spaceidx = wtfindspace(body, 0);
  var rawtag = spaceidx === -1 ? body : body.substring(0, spaceidx);
  var tag = rawtag.toLowerCase();
  if (isclose) {
    return { kind: 'close', tag: tag, endpos: end + 1 };
  }
  var attrstr = spaceidx === -1 ? '' : body.substring(spaceidx + 1);
  var attrs = wtparseattrs(attrstr);
  if (WTRAWTEXTTAGS[tag] === true) {
    return { kind: 'rawtext', tag: tag, rawtag: rawtag, attrs: attrs, endpos: end + 1 };
  }
  if (isselfclose || WTVOIDTAGS[tag] === true) {
    return { kind: 'void', tag: tag, rawtag: rawtag, attrs: attrs, selfclose: isselfclose, endpos: end + 1 };
  }
  return { kind: 'open', tag: tag, rawtag: rawtag, attrs: attrs, endpos: end + 1 };
}

function wtparsehtml(html) {
  if (typeof html !== 'string' || html.length === 0) return [];
  var lowerhtml = html.toLowerCase();
  var root = { tag: '__wtroot__', children: [] };
  var stack = [root];

  function popmatching(tag) {
    function findidx(idx) {
      if (idx <= 0) return -1;
      if (stack[idx].tag === tag) return idx;
      return function () { return findidx(idx - 1); };
    }
    var matchidx = wttrampoline(findidx)(stack.length - 1);
    if (matchidx > 0) {
      stack.length = matchidx;
    }
  }

  function scan(i) {
    if (i >= html.length) return null;
    var parent = stack[stack.length - 1];
    if (html.charAt(i) === '<') {
      var info = wtparsetag(html, i);
      if (!info) {
        var nextlt = html.indexOf('<', i + 1);
        var textend = nextlt === -1 ? html.length : nextlt;
        parent.children.push({ text: html.substring(i, textend) });
        return function () { return scan(textend); };
      }
      if (info.kind === 'skip') {
        return function () { return scan(info.endpos); };
      }
      if (info.kind === 'raw') {
        parent.children.push({ raw: info.raw });
        return function () { return scan(info.endpos); };
      }
      if (info.kind === 'rawtext') {
        var closed = wtfindrawtextclose(lowerhtml, info.tag, info.endpos);
        if (!closed) {
          var resttext = html.substring(info.endpos);
          parent.children.push(wtmakenode(info.tag, info.rawtag, info.attrs, resttext ? [{ text: resttext }] : [], false));
          return null;
        }
        var rawcontent = html.substring(info.endpos, closed.contentend);
        parent.children.push(wtmakenode(info.tag, info.rawtag, info.attrs, rawcontent ? [{ text: rawcontent }] : [], false));
        return function () { return scan(closed.tagend); };
      }
      if (info.kind === 'void') {
        parent.children.push(wtmakenode(info.tag, info.rawtag, info.attrs, [], info.selfclose));
        return function () { return scan(info.endpos); };
      }
      if (info.kind === 'open') {
        var elem = wtmakenode(info.tag, info.rawtag, info.attrs, [], false);
        parent.children.push(elem);
        stack.push(elem);
        return function () { return scan(info.endpos); };
      }
      if (info.kind === 'close') {
        popmatching(info.tag);
        return function () { return scan(info.endpos); };
      }
    }
    var nexttag = html.indexOf('<', i);
    var endpos = nexttag === -1 ? html.length : nexttag;
    parent.children.push({ text: html.substring(i, endpos) });
    return function () { return scan(endpos); };
  }

  wttrampoline(scan)(0);
  return root.children;
}

function wtserializeattr(k, v) {
  if (v === null || v === undefined) return ' ' + k;
  var sv = String(v);
  if (sv.indexOf('"') !== -1 && sv.indexOf("'") === -1) {
    return ' ' + k + "='" + sv + "'";
  }
  return ' ' + k + '="' + sv + '"';
}

function wtserializesingle(node) {
  if (!node) return '';
  if (typeof node.raw === 'string') return node.raw;
  if (typeof node.text === 'string') return node.text;
  if (typeof node.tag !== 'string') return '';
  var tagname = node.rawtag || node.tag;
  var attrs = node.attrs || {};
  var attrstr = Object.keys(attrs).map(function (k) {
    return wtserializeattr(k, attrs[k]);
  }).join('');
  var kids = wtisarray(node.children) ? node.children : [];
  if (WTVOIDTAGS[node.tag] === true || (node.selfclose === true && kids.length === 0)) {
    return '<' + tagname + attrstr + ' />';
  }
  var inner = kids.map(wtserializesingle).join('');
  return '<' + tagname + attrstr + '>' + inner + '</' + tagname + '>';
}

function wtserializenode(nodeOrNodes) {
  if (wtisarray(nodeOrNodes)) {
    return nodeOrNodes.map(wtserializesingle).join('');
  }
  return wtserializesingle(nodeOrNodes);
}

// ============================================================
// §2 — WriterTransformerSet model & combinators (P-WT-1, A-WT-1)
// ============================================================

function wtvalidaterule(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('[writertransformers] rule entry must be an object');
  }
  if (typeof entry.name !== 'string' || entry.name.length === 0) {
    throw new Error('[writertransformers] rule.name must be a non-empty string');
  }
  var scope = entry.scope === undefined ? 'tree' : entry.scope;
  if (scope !== 'root' && scope !== 'tree') {
    throw new Error('[writertransformers] rule "' + entry.name + '" scope must be "root" or "tree"');
  }
  if (typeof entry.match !== 'function') {
    throw new Error('[writertransformers] rule "' + entry.name + '" must supply a match function');
  }
  if (typeof entry.transform !== 'function') {
    throw new Error('[writertransformers] rule "' + entry.name + '" must supply a transform function');
  }
  return Object.freeze({
    name: entry.name,
    scope: scope,
    match: entry.match,
    transform: entry.transform
  });
}

function wtbuildset(order, rulesMap) {
  var frozenOrder = Object.freeze(order.slice());
  var frozenRules = {};
  frozenOrder.forEach(function (name) {
    frozenRules[name] = rulesMap[name];
  });
  return Object.freeze({
    element: 'WRITER_TRANSFORMER_SET',
    order: frozenOrder,
    rules: Object.freeze(frozenRules)
  });
}

function iswritertransformerset(val) {
  return !!(val && typeof val === 'object' &&
    val.element === 'WRITER_TRANSFORMER_SET' &&
    wtisarray(val.order) &&
    val.rules && typeof val.rules === 'object');
}

function makewritertransformerset(ruleEntries) {
  if (!wtisarray(ruleEntries)) {
    throw new Error('[makewritertransformerset] ruleEntries must be an array');
  }
  var order = [];
  var rulesMap = {};
  ruleEntries.forEach(function (raw) {
    var rule = wtvalidaterule(raw);
    if (wthasown(rulesMap, rule.name)) {
      throw new Error('[makewritertransformerset] duplicate rule name: ' + rule.name);
    }
    order.push(rule.name);
    rulesMap[rule.name] = rule;
  });
  return wtbuildset(order, rulesMap);
}

function replacewritertransformer(set, name, patch) {
  if (!iswritertransformerset(set)) {
    throw new Error('[replacewritertransformer] first argument must be a WriterTransformerSet');
  }
  if (typeof name !== 'string' || !wthasown(set.rules, name)) {
    throw new Error('[replacewritertransformer] unknown rule: ' + String(name));
  }
  var prev = set.rules[name];
  var nextSpec;
  if (typeof patch === 'function') {
    nextSpec = { name: name, scope: prev.scope, match: prev.match, transform: patch };
  } else if (patch && typeof patch === 'object') {
    nextSpec = {
      name: name,
      scope: patch.scope !== undefined ? patch.scope : prev.scope,
      match: patch.match !== undefined ? patch.match : prev.match,
      transform: patch.transform !== undefined ? patch.transform : prev.transform
    };
  } else {
    throw new Error('[replacewritertransformer] patch must be a transform function or patch object');
  }
  var nextRules = {};
  Object.keys(set.rules).forEach(function (k) { nextRules[k] = set.rules[k]; });
  nextRules[name] = wtvalidaterule(nextSpec);
  return wtbuildset(set.order, nextRules);
}

// @amendment=A-WT-1 — unary higher-order combinator:
// wrapperFn(prevTransform) -> function(node, ctx) -> node | node[] | null.
function wrapwritertransformer(set, name, wrapperFn) {
  if (!iswritertransformerset(set)) {
    throw new Error('[wrapwritertransformer] first argument must be a WriterTransformerSet');
  }
  if (typeof name !== 'string' || !wthasown(set.rules, name)) {
    throw new Error('[wrapwritertransformer] unknown rule: ' + String(name));
  }
  if (typeof wrapperFn !== 'function') {
    throw new Error('[wrapwritertransformer] wrapperFn must be a function(prevTransform)');
  }
  var prev = set.rules[name];
  var nextTransform = wrapperFn(prev.transform);
  if (typeof nextTransform !== 'function') {
    throw new Error('[wrapwritertransformer] wrapperFn must return a transform function');
  }
  return replacewritertransformer(set, name, { transform: nextTransform });
}

function addwritertransformer(set, ruleEntry, position) {
  if (!iswritertransformerset(set)) {
    throw new Error('[addwritertransformer] first argument must be a WriterTransformerSet');
  }
  var rule = wtvalidaterule(ruleEntry);
  if (wthasown(set.rules, rule.name)) {
    throw new Error('[addwritertransformer] rule already exists: ' + rule.name);
  }
  var nextOrder = set.order.slice();
  if (position && typeof position === 'object') {
    if (typeof position.before === 'string') {
      var bidx = nextOrder.indexOf(position.before);
      if (bidx === -1) throw new Error('[addwritertransformer] position.before not found: ' + position.before);
      nextOrder.splice(bidx, 0, rule.name);
    } else if (typeof position.after === 'string') {
      var aidx = nextOrder.indexOf(position.after);
      if (aidx === -1) throw new Error('[addwritertransformer] position.after not found: ' + position.after);
      nextOrder.splice(aidx + 1, 0, rule.name);
    } else {
      nextOrder.push(rule.name);
    }
  } else {
    nextOrder.push(rule.name);
  }
  var nextRules = {};
  Object.keys(set.rules).forEach(function (k) { nextRules[k] = set.rules[k]; });
  nextRules[rule.name] = rule;
  return wtbuildset(nextOrder, nextRules);
}

function removewritertransformer(set, name) {
  if (!iswritertransformerset(set)) {
    throw new Error('[removewritertransformer] first argument must be a WriterTransformerSet');
  }
  if (typeof name !== 'string' || !wthasown(set.rules, name)) return set;
  var nextOrder = set.order.filter(function (k) { return k !== name; });
  var nextRules = {};
  nextOrder.forEach(function (k) { nextRules[k] = set.rules[k]; });
  return wtbuildset(nextOrder, nextRules);
}

function mergewritertransformers(baseSet, overrideArg) {
  if (!iswritertransformerset(baseSet)) {
    throw new Error('[mergewritertransformers] baseSet must be a WriterTransformerSet');
  }
  if (overrideArg === undefined || overrideArg === null) return baseSet;
  if (iswritertransformerset(overrideArg)) return overrideArg;
  if (typeof overrideArg === 'function') {
    var built = overrideArg(baseSet);
    if (!iswritertransformerset(built)) {
      throw new Error('[mergewritertransformers] override function must return a WriterTransformerSet');
    }
    return built;
  }
  if (typeof overrideArg !== 'object' || wtisarray(overrideArg)) {
    throw new Error('[mergewritertransformers] overrideArg must be a WriterTransformerSet, function, or patch map');
  }
  return Object.keys(overrideArg).reduce(function (acc, key) {
    var val = overrideArg[key];
    if (val === null) return removewritertransformer(acc, key);
    if (wthasown(acc.rules, key)) return replacewritertransformer(acc, key, val);
    if (val && typeof val === 'object') {
      var ruleSpec = {
        name: key,
        scope: val.scope,
        match: val.match,
        transform: val.transform
      };
      return addwritertransformer(acc, ruleSpec, val.position);
    }
    throw new Error('[mergewritertransformers] new rule "' + key + '" must specify { match, transform }');
  }, baseSet);
}

// ============================================================
// §3 — Honest transparent default rules (P-WT-2, A-WT-2)
// ============================================================

function wtcomputechildstats(node) {
  var children = (node && wtisarray(node.children)) ? node.children : [];
  return children.reduce(function (acc, child) {
    if (child && typeof child.tag === 'string') {
      acc.elementCount = acc.elementCount + 1;
      if (child.tag === 'div') acc.divCount = acc.divCount + 1;
      else acc.nonDivElementCount = acc.nonDivElementCount + 1;
    } else if (child && typeof child.text === 'string' && wttrim(child.text).length > 0) {
      acc.hasTextChildren = true;
    }
    return acc;
  }, { elementCount: 0, divCount: 0, nonDivElementCount: 0, hasTextChildren: false });
}

function wtcountlisttags(list) {
  return (list || []).reduce(function (acc, item) {
    var t = typeof item === 'string' ? item : (item && item.tag);
    return (t === 'ul' || t === 'ol') ? acc + 1 : acc;
  }, 0);
}

function wtdomlistancestors(ctx) {
  var domList = [];
  if (ctx && ctx.target) domList.push(ctx.target);
  if (ctx && wtisarray(ctx.ancestors)) domList = domList.concat(ctx.ancestors);
  return wtcountlisttags(domList);
}

function wthasdirectchildlist(node) {
  var children = (node && wtisarray(node.children)) ? node.children : [];
  return children.some(function (c) {
    return c && (c.tag === 'ul' || c.tag === 'ol');
  });
}

function wtislistcontext(ctx) {
  if (!ctx) return false;
  if (ctx.parentTag === 'ul' || ctx.parentTag === 'ol' || ctx.parentTag === 'li') return true;
  if (ctx.target && (ctx.target.tag === 'ul' || ctx.target.tag === 'ol' || ctx.target.tag === 'li')) return true;
  if (wtdomlistancestors(ctx) > 0) return true;
  if (wtcountlisttags(ctx.ancestorTags) > 0) return true;
  return false;
}

// Rule 1: enclosingdiv — writer called inside an enclosing <div> target.
// @amendment=A-WT-2 — skips non-visual/metadata tags (style, script, link, meta).
var WTRULE_ENCLOSINGDIV = {
  name: 'enclosingdiv',
  scope: 'root',
  match: function (node, ctx) {
    return !!(node && typeof node.tag === 'string' &&
      WTNONVISUALTAGS[node.tag] !== true &&
      ctx && ctx.target && ctx.target.tag === 'div');
  },
  transform: function (node, ctx) {
    var nextAttrs = wtaddclasstoken(node.attrs, 'wt-in-div');
    var isBareDiv = node.tag === 'div' &&
      !(node.attrs && node.attrs.id) &&
      !(node.attrs && node.attrs['class']);
    if (ctx.append === true && isBareDiv && wtisarray(ctx.existingChildren) && ctx.existingChildren.length > 0) {
      nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-segment');
    }
    return wtmakenode(node.tag, node.rawtag, nextAttrs, node.children, node.selfclose);
  }
};

// Rule 2: nestedlist — list produced inside an enclosing list or containing bare nested lists.
var WTRULE_NESTEDLIST = {
  name: 'nestedlist',
  scope: 'tree',
  match: function (node, ctx) {
    if (!node || (node.tag !== 'ul' && node.tag !== 'ol')) return false;
    return wtislistcontext(ctx) || wthasdirectchildlist(node);
  },
  transform: function (node, ctx) {
    var children = wtisarray(node.children) ? node.children : [];
    var fixedChildren = children.map(function (c) {
      if (c && (c.tag === 'ul' || c.tag === 'ol')) {
        return wtmakenode('li', 'li', { 'class': 'wt-nested-list-item' }, [c], false);
      }
      return c;
    });
    var enclosingLists = wtdomlistancestors(ctx) + wtcountlisttags(ctx.ancestorTags);
    var nextAttrs = wtcloneattrs(node.attrs);
    if (enclosingLists >= 1) {
      var listDepth = enclosingLists + 1;
      nextAttrs = wtaddclasstoken(nextAttrs, 'wt-nested-list');
      nextAttrs = wtaddclasstoken(nextAttrs, 'wt-list-depth-' + listDepth);
    }
    var rebuilt = wtmakenode(node.tag, node.rawtag, nextAttrs, fixedChildren, node.selfclose);
    if (ctx.depth === 0 && ctx.target && (ctx.target.tag === 'ul' || ctx.target.tag === 'ol')) {
      return wtmakenode('li', 'li', { 'class': 'wt-nested-list-item' }, [rebuilt], false);
    }
    return rebuilt;
  }
};

// Rule 3: innerdivs — produced <div> analyzed so inner <div>s adapt deterministically.
var WTRULE_INNERDIVS = {
  name: 'innerdivs',
  scope: 'tree',
  match: function (node, ctx) {
    if (!node || node.tag !== 'div') return false;
    var hasInnerDivs = !!(ctx && ctx.childStats && ctx.childStats.divCount > 0);
    var insideDiv = !!(ctx && ctx.parentTag === 'div');
    return hasInnerDivs || insideDiv;
  },
  transform: function (node, ctx) {
    var nextAttrs = wtcloneattrs(node.attrs);
    var stats = (ctx && ctx.childStats) ? ctx.childStats : wtcomputechildstats(node);
    if (stats.divCount > 0) {
      nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-container');
      nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-children-' + stats.divCount);
      if (stats.divCount >= 2) {
        nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-group');
      }
    }
    if (ctx && ctx.parentTag === 'div') {
      if (stats.elementCount === 0) {
        nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-leaf');
      } else {
        nextAttrs = wtaddclasstoken(nextAttrs, 'wt-div-branch');
      }
    }
    return wtmakenode(node.tag, node.rawtag, nextAttrs, node.children, node.selfclose);
  }
};

var WT_DEFAULT_TRANSFORMER_SET = makewritertransformerset([
  WTRULE_ENCLOSINGDIV,
  WTRULE_NESTEDLIST,
  WTRULE_INNERDIVS
]);

// ============================================================
// §4 — Ref-swap registry (P-WT-1, CON-4)
// ============================================================

var WRITERTRANSFORMERSETREF = { current: WT_DEFAULT_TRANSFORMER_SET };

function getwritertransformerset() {
  return WRITERTRANSFORMERSETREF.current;
}

function setwritertransformerset(setOrFn) {
  var next;
  if (typeof setOrFn === 'function') {
    next = setOrFn(WRITERTRANSFORMERSETREF.current);
  } else {
    next = setOrFn;
  }
  if (!iswritertransformerset(next)) {
    throw new Error('[setwritertransformerset] value must be a WriterTransformerSet');
  }
  WRITERTRANSFORMERSETREF.current = next;
  return next;
}

function updatewritertransformerset(updaterFn) {
  if (typeof updaterFn !== 'function') {
    throw new Error('[updatewritertransformerset] updaterFn must be a function');
  }
  return setwritertransformerset(updaterFn);
}

function resetwritertransformerset() {
  WRITERTRANSFORMERSETREF.current = WT_DEFAULT_TRANSFORMER_SET;
  return WRITERTRANSFORMERSETREF.current;
}

// ============================================================
// §5 — Transformer runner (P-WT-1)
// ============================================================

function wtflattenresults(arr) {
  return (arr || []).reduce(function (acc, item) {
    if (item === null || item === undefined) return acc;
    if (wtisarray(item)) return acc.concat(wtflattenresults(item));
    return acc.concat([item]);
  }, []);
}

function wtrunruleonnodes(nodes, rule, domCtx) {
  var targetTag = (domCtx && domCtx.target && domCtx.target.tag) ? domCtx.target.tag : null;

  function applynode(node, parentTag, ancestorTags, depth, idx, sibCount) {
    if (!node || typeof node !== 'object') return node;
    if (typeof node.tag !== 'string') return node;
    var ctx = {
      target: domCtx ? domCtx.target : null,
      ancestors: domCtx && wtisarray(domCtx.ancestors) ? domCtx.ancestors : [],
      append: !!(domCtx && domCtx.append),
      existingChildren: domCtx && wtisarray(domCtx.existingChildren) ? domCtx.existingChildren : [],
      parentTag: parentTag,
      ancestorTags: ancestorTags,
      depth: depth,
      indexInParent: idx,
      siblingCount: sibCount,
      childStats: wtcomputechildstats(node)
    };
    var transformed = rule.match(node, ctx) ? rule.transform(node, ctx) : node;
    if (transformed === null || transformed === undefined) return null;
    if (wtisarray(transformed)) {
      if (rule.scope === 'root') return transformed;
      return transformed.map(function (t, ti) {
        if (!t || typeof t.tag !== 'string' || WTRAWTEXTTAGS[t.tag] === true) return t;
        var tKids = wtisarray(t.children) ? t.children : [];
        var nextAnc = ancestorTags.concat([t.tag]);
        var mappedKids = wtflattenresults(tKids.map(function (c, ci) {
          return applynode(c, t.tag, nextAnc, depth + 1, ci, tKids.length);
        }));
        return wtmakenode(t.tag, t.rawtag, t.attrs, mappedKids, t.selfclose);
      });
    }
    if (rule.scope === 'root' || WTRAWTEXTTAGS[transformed.tag] === true) {
      return transformed;
    }
    var kids = wtisarray(transformed.children) ? transformed.children : [];
    var nextAncestors = ancestorTags.concat([transformed.tag]);
    var walkedKids = wtflattenresults(kids.map(function (child, ci) {
      return applynode(child, transformed.tag, nextAncestors, depth + 1, ci, kids.length);
    }));
    return wtmakenode(transformed.tag, transformed.rawtag, transformed.attrs, walkedKids, transformed.selfclose);
  }

  return wtflattenresults(nodes.map(function (n, i) {
    return applynode(n, targetTag, [], 0, i, nodes.length);
  }));
}

function applywritertransformers(html, domContext, transformerSet) {
  if (typeof html !== 'string') return '';
  var activeSet = iswritertransformerset(transformerSet)
    ? transformerSet
    : getwritertransformerset();
  if (!activeSet || !wtisarray(activeSet.order) || activeSet.order.length === 0) {
    return html;
  }
  var ast = wtparsehtml(html);
  var domCtx = domContext && typeof domContext === 'object' ? domContext : {};
  var finalAst = activeSet.order.reduce(function (currentNodes, ruleName) {
    var rule = activeSet.rules[ruleName];
    if (!rule) return currentNodes;
    return wtrunruleonnodes(currentNodes, rule, domCtx);
  }, ast);
  return wtserializenode(finalAst);
}
