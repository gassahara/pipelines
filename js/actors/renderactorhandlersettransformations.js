// js/actors/renderactorhandlersettransformations.js
//
// SETTRANSFORMATIONS handler — the structural-transformation command
// (frozen spec RUN 33 Iter 11). Sibling of REWRITESTYLEATTRS: same rule
// vocabulary family, different application (rules select, then
// transducers transform). No shared code with REWRITESTYLEATTRS (Instr-19).
//
// Pivot (RUN 47–49) — the message carries TRANSDUCERSET: stringtype(),
// a name resolved via GETTRANSDUCERSET (registry added at Cycle 7). The
// handler applies SET.transducers in declared order; an unknown name is
// a hard error (fail-fast per U-19). Three named sets are registered by
// yjblocks-transducers.js (Cycle 6R): 'overview', 'recipe', 'ingredients'.
// No 'default' set exists.
//
// P-A-8 (Cycle A3) — the `{block: N}` locator resolves to the N-th
// Block-header. All existing locators ({header: N}, {section: N},
// 'end', sectionrange) are unchanged.
//
// P-A-18/P-A-20 (Cycle A12, RUN 89) — HTML is a closed format: tags
// carry fixed semantics and whitespace between block-level elements is
// not content at the structural layer. The parser (ytparsehtml) now
// filters whitespace-only text nodes from its depth-1 output, and
// ytnormalizesources does the same after unwrapping depth-1 <div>s.
// With the parser producing a clean depth-1 array, node-count Length
// (F-A-1) classifies sections correctly: a marker-only section has
// node-length 1 (Header), a marker-plus-content section has node-length
// ≥ 2 (Content). F-A-1R (element-count Length) and its A3R
// materialisation are withdrawn as redundant.
//
// Pipeline:
//   1. Resolve TRANSDUCERSET via GETTRANSDUCERSET
//   2. Normalise SOURCES into a flat depth-1 node array
//   3. Apply RULES to select the working scope (union)
//   4. Apply SET.transducers in declared order (each: tree → tree)
//   5. Serialise to HTML
//   6. Inject via MODE ('replace' | 'append')

var SETTRANSFORMATIONSTYPE = messagetype('SETTRANSFORMATIONS', {
  ID: stringtype(),
  SOURCES: arraytype(),
  RULES: arraytype(),
  TRANSDUCERSET: stringtype(),
  MODE: stringtype(),
  STYLE: optionaltype(objecttype()),
  PALETTE: optionaltype(objecttype()),
  LEVEL: optionaltype(numbertype())
});
REGISTERMESSAGETYPE(SETTRANSFORMATIONSTYPE);

// ============================================================
// §1 — Constants
// ============================================================

var YJROOTTAG = '__yjtransformationroot__';
var YTVOIDELEMENTS = { hr: true, img: true, br: true, input: true };

// ============================================================
// §2 — HTML parser (string → node[]). No DOM.
//
// INST-A12.1 (P-A-18) — whitespace-only text nodes between block-level
// elements are not HTML content. The parser filters them from the
// depth-1 output so that ytcomputesections operates on a clean
// structural array. Filtering is depth-1 only; inline whitespace
// inside inline-context parents (e.g. between <b> and <i> inside a
// <p>) is preserved by leaving deeper levels untouched.
// ============================================================

function ytistagspace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function ytiswhitespacechar(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' ||
         ch === '\r' || ch === '\f' || ch === '\v';
}

// A node is a whitespace-only text node iff it carries a `text` field
// whose content is empty or consists entirely of whitespace chars.
// Element nodes (nodes with `tag`) are never whitespace text.
function ytiswhitespacetext(n) {
  if (!n || n.text === undefined) return false;
  var s = n.text;
  if (s.length === 0) return true;
  function step(i) {
    if (i >= s.length) return true;
    if (!ytiswhitespacechar(s.charAt(i))) return false;
    return step(i + 1);
  }
  return step(0);
}

// Depth-1 filter. Applied by ytparsehtml at its return, and by
// ytnormalizesources after unwrapping depth-1 <div>s (which can
// re-expose whitespace text nodes that were at depth 2 to depth 1).
function ytfilterdepthone(nodes) {
  return nodes.filter(function (n) { return !ytiswhitespacetext(n); });
}

function ytfindtagend(s, i) {
  if (i >= s.length) return -1;
  var ch = s.charAt(i);
  if (ch === '>') return i;
  if (ch === '"' || ch === "'") {
    var close = s.indexOf(ch, i + 1);
    if (close === -1) return -1;
    return ytfindtagend(s, close + 1);
  }
  return ytfindtagend(s, i + 1);
}

function ytfindtagspace(body, i) {
  if (i >= body.length) return -1;
  if (ytistagspace(body.charAt(i))) return i;
  return ytfindtagspace(body, i + 1);
}

function ytskipws(s, i) {
  if (i >= s.length) return i;
  if (ytistagspace(s.charAt(i))) return ytskipws(s, i + 1);
  return i;
}

function ytreadkey(s, i) {
  if (i >= s.length) return i;
  var c = s.charAt(i);
  if (ytistagspace(c) || c === '=') return i;
  return ytreadkey(s, i + 1);
}

function ytreadval(s, i) {
  if (i >= s.length) return i;
  if (ytistagspace(s.charAt(i))) return i;
  return ytreadval(s, i + 1);
}

function ytattrsadd(attrs, k, v) {
  var next = {};
  Object.keys(attrs).forEach(function (ak) { next[ak] = attrs[ak]; });
  next[k] = v;
  return next;
}

function ytparseattrs(str, i, attrs) {
  if (i >= str.length) return attrs;
  var start = ytskipws(str, i);
  if (start >= str.length) return attrs;
  var keyend = ytreadkey(str, start);
  var key = str.substring(start, keyend);
  if (keyend >= str.length) return ytattrsadd(attrs, key, '');
  if (str.charAt(keyend) !== '=') {
    return ytparseattrs(str, keyend, ytattrsadd(attrs, key, ''));
  }
  var vstart = ytskipws(str, keyend + 1);
  if (vstart >= str.length) return ytattrsadd(attrs, key, '');
  var q = str.charAt(vstart);
  if (q === '"' || q === "'") {
    var close = str.indexOf(q, vstart + 1);
    if (close === -1) return ytattrsadd(attrs, key, str.substring(vstart + 1));
    return ytparseattrs(str, close + 1, ytattrsadd(attrs, key, str.substring(vstart + 1, close)));
  }
  var vend = ytreadval(str, vstart);
  return ytparseattrs(str, vend, ytattrsadd(attrs, key, str.substring(vstart, vend)));
}

function ytparsetag(html, i) {
  if (html.charAt(i) !== '<') return null;
  var end = ytfindtagend(html, i + 1);
  if (end === -1) return null;
  var inner = html.substring(i + 1, end);
  if (inner.length === 0) return null;
  var isclose = inner.charAt(0) === '/';
  var isselfclose = inner.charAt(inner.length - 1) === '/';
  var body = inner;
  if (isclose) body = body.substring(1);
  if (isselfclose) body = body.substring(0, body.length - 1);
  body = body.trim();
  var spaceidx = ytfindtagspace(body, 0);
  var tagname = (spaceidx === -1 ? body : body.substring(0, spaceidx)).toLowerCase();
  var attrstr = (spaceidx === -1 ? '' : body.substring(spaceidx + 1));
  return {
    tag: tagname,
    attrs: ytparseattrs(attrstr, 0, {}),
    isclose: isclose,
    isselfclose: isselfclose,
    endpos: end + 1
  };
}

function ytfindtextend(html, i) {
  if (i >= html.length) return i;
  if (html.charAt(i) === '<') return i;
  return ytfindtextend(html, i + 1);
}

function ytparsenodes(html, i, stopper, acc) {
  if (i >= html.length) return { nodes: acc, endpos: i };
  if (stopper !== null && html.charAt(i) === '<') {
    var peek = ytparsetag(html, i);
    if (peek && peek.isclose && peek.tag === stopper) {
      return { nodes: acc, endpos: peek.endpos };
    }
  }
  if (html.charAt(i) === '<') {
    var taginfo = ytparsetag(html, i);
    if (!taginfo) return { nodes: acc, endpos: i };
    if (taginfo.isclose) return { nodes: acc, endpos: taginfo.endpos };
    if (taginfo.isselfclose) {
      return ytparsenodes(html, taginfo.endpos, stopper,
        acc.concat([{ tag: taginfo.tag, attrs: taginfo.attrs, children: [] }]));
    }
    var child = ytparsenodes(html, taginfo.endpos, taginfo.tag, []);
    return ytparsenodes(html, child.endpos, stopper,
      acc.concat([{ tag: taginfo.tag, attrs: taginfo.attrs, children: child.nodes }]));
  }
  var endtext = ytfindtextend(html, i);
  return ytparsenodes(html, endtext, stopper,
    acc.concat([{ text: html.substring(i, endtext) }]));
}

// INST-A12.2 (P-A-18) — filter at the parser's return.
function ytparsehtml(html) {
  if (typeof html !== 'string' || html.length === 0) return [];
  return ytfilterdepthone(ytparsenodes(html, 0, null, []).nodes);
}

// ============================================================
// §3 — HTML serialiser (node[] → string)
// ============================================================

function ytserializenode(n) {
  if (!n) return '';
  if (n.text !== undefined) return n.text;
  var attrstr = Object.keys(n.attrs || {}).map(function (k) {
    return ' ' + k + '="' + n.attrs[k] + '"';
  }).join('');
  if (YTVOIDELEMENTS[n.tag] === true) {
    return '<' + n.tag + attrstr + ' />';
  }
  var inner = (n.children || []).map(ytserializenode).join('');
  return '<' + n.tag + attrstr + '>' + inner + '</' + n.tag + '>';
}

// ============================================================
// §4 — Normalisation
// ============================================================

function ytunwraplevel1divs(nodes) {
  if (nodes.length === 0) return [];
  var head = nodes[0];
  var tail = nodes.slice(1);
  if (head && head.tag === 'div' && Array.isArray(head.children)) {
    return head.children.concat(ytunwraplevel1divs(tail));
  }
  return [head].concat(ytunwraplevel1divs(tail));
}

// INST-A12.3 (P-A-18, C-28) — filter at the normaliser's return, after
// unwrapping, because ytunwraplevel1divs can re-expose whitespace text
// nodes from inside an unwrapped <div> at depth 1.
function ytnormalizesources(sources) {
  var all = sources.reduce(function (acc, src) {
    var html = (src && typeof src.html === 'string') ? src.html : '';
    return acc.concat(ytparsehtml(html));
  }, []);
  return ytfilterdepthone(ytunwraplevel1divs(all));
}

// ============================================================
// §5 — Sections (F-A-1 restored; A3R reverted by P-A-20)
//
// Length(s) is node count: s.end - s.start. With the parser producing
// a clean depth-1 array (P-A-18), a marker-only section has node
// length 1 (Header) and a marker-plus-content section has node length
// ≥ 2 (Content). No element-count workaround is needed.
// ============================================================

function ytismarker(n) {
  if (!n || !n.tag) return false;
  return n.tag === 'p' ||
         n.tag === 'h1' || n.tag === 'h2' || n.tag === 'h3' ||
         n.tag === 'h4' || n.tag === 'h5' || n.tag === 'h6';
}

// INST-A12.4 (P-A-20) — node-count isheader.
function ytclosesec(i, cs, cm, acc) {
  if (cs === null) return acc;
  return acc.concat([{ start: cs, end: i, marker: cm, isheader: (i - cs === 1) }]);
}

// INST-A12.5 (P-A-20) — node-count isblockheader.
function ytannotatesections(sections) {
  function step(i, acc) {
    if (i >= sections.length) return acc;
    var s = sections[i];
    var next = (i + 1 < sections.length) ? sections[i + 1] : null;
    var isblockheader = s.isheader === true
      && next !== null
      && next.isheader === false
      && (next.end - next.start) >= 2;
    var annotated = {
      start: s.start,
      end: s.end,
      marker: s.marker,
      isheader: s.isheader === true,
      isblockheader: isblockheader
    };
    return step(i + 1, acc.concat([annotated]));
  }
  return step(0, []);
}

// INST-A12.7 (P-A-20) — scan logic unchanged; no `nodes` threading.
function ytcomputesections(nodes) {
  function step(i, cs, cm, acc) {
    if (i >= nodes.length) return ytclosesec(i, cs, cm, acc);
    var n = nodes[i];
    if (ytismarker(n)) {
      return step(i + 1, i, n, ytclosesec(i, cs, cm, acc));
    }
    if (cs === null) {
      return step(i + 1, null, null,
        acc.concat([{ start: i, end: i + 1, marker: null, isheader: false }]));
    }
    return step(i + 1, cs, cm, acc);
  }
  return ytannotatesections(step(0, null, null, []));
}

// ============================================================
// §6 — Rule application
// ============================================================

function ytresolveindex(locator, sections, nodeslen) {
  if (locator === 'end') return nodeslen;
  if (!locator || typeof locator !== 'object') return nodeslen;
  if (locator.header !== undefined) {
    var headers = sections.filter(function (s) { return s.isheader === true; });
    if (locator.header < headers.length) return headers[locator.header].start;
    return nodeslen;
  }
  if (locator.section !== undefined) {
    if (locator.section < sections.length) return sections[locator.section].start;
    return nodeslen;
  }
  if (locator.block !== undefined) {
    var blockheaders = sections.filter(function (s) { return s.isblockheader === true; });
    if (locator.block < blockheaders.length) return blockheaders[locator.block].start;
    return nodeslen;
  }
  return nodeslen;
}

function ythasclass(n, classname) {
  if (!n || !n.attrs || typeof n.attrs['class'] !== 'string') return false;
  return n.attrs['class'].split(' ').indexOf(classname) !== -1;
}

function ytmatchrule(nodes, rule) {
  if (!rule || typeof rule !== 'object') return [];
  var sections = ytcomputesections(nodes);

  if (rule.sectionrange && typeof rule.sectionrange === 'object') {
    var start = ytresolveindex(rule.sectionrange.start, sections, nodes.length);
    var end = ytresolveindex(rule.sectionrange.end, sections, nodes.length);
    if (start >= end) return [];
    return nodes.slice(start, end);
  }
  if (rule.header !== undefined) {
    var hstart = ytresolveindex({ header: rule.header }, sections, nodes.length);
    return hstart < nodes.length ? [nodes[hstart]] : [];
  }
  if (rule.section !== undefined) {
    var sstart = ytresolveindex({ section: rule.section }, sections, nodes.length);
    return sstart < nodes.length ? [nodes[sstart]] : [];
  }
  if (rule.block !== undefined) {
    var bstart = ytresolveindex({ block: rule.block }, sections, nodes.length);
    return bstart < nodes.length ? [nodes[bstart]] : [];
  }
  if (rule.tag) {
    return nodes.filter(function (n) { return n && n.tag === rule.tag; });
  }
  if (rule.class) {
    return nodes.filter(function (n) { return ythasclass(n, rule.class); });
  }
  if (rule.id) {
    return nodes.filter(function (n) { return n && n.attrs && n.attrs.id === rule.id; });
  }
  return [];
}

function ytselectscope(nodes, rules) {
  var seen = [];
  var out = [];
  rules.forEach(function (rule) {
    var matched = ytmatchrule(nodes, rule);
    matched.forEach(function (n) {
      if (seen.indexOf(n) === -1) {
        seen.push(n);
        out.push(n);
      }
    });
  });
  return out;
}

// ============================================================
// §7 — Transducer application
// ============================================================

function ytapplytransducers(scopenodes, transducers, context) {
  var root = { tag: YJROOTTAG, attrs: {}, children: scopenodes };
  return transducers.reduce(function (r, t) {
    if (typeof t !== 'function') {
      throw new Error('[settransformations] transducer must be a function');
    }
    return t(r, context);
  }, root);
}

// ============================================================
// §8 — Handler
// ============================================================

function RENDERHANDLER_SETTRANSFORMATIONS(ENV, ARGS) {
  if (!ARGS || typeof ARGS.ID !== 'string' || ARGS.ID.length === 0) {
    throw new Error('[settransformations] ID must be a non-empty string');
  }
  if (!Array.isArray(ARGS.SOURCES)) {
    throw new Error('[settransformations] SOURCES must be an array');
  }
  if (!Array.isArray(ARGS.RULES)) {
    throw new Error('[settransformations] RULES must be an array');
  }
  if (typeof ARGS.TRANSDUCERSET !== 'string' || ARGS.TRANSDUCERSET.length === 0) {
    throw new Error('[settransformations] TRANSDUCERSET must be a non-empty string');
  }
  if (ARGS.MODE !== 'replace' && ARGS.MODE !== 'append') {
    throw new Error('[settransformations] MODE must be "replace" or "append"');
  }

  var SET = GETTRANSDUCERSET(ARGS.TRANSDUCERSET);
  if (!SET || !Array.isArray(SET.transducers)) {
    throw new Error('[settransformations] unknown transducer set: ' + ARGS.TRANSDUCERSET);
  }

  var TARGET = document.getElementById(ARGS.ID);
  if (!TARGET) {
    return { RESPONSE: { APPLIED: false, SKIPPED: 'element not found: ' + ARGS.ID } };
  }

  var normalized = ytnormalizesources(ARGS.SOURCES);
  var scope = ytselectscope(normalized, ARGS.RULES);

  var context = {
    level: (typeof ARGS.LEVEL === 'number') ? ARGS.LEVEL : 0,
    ancestors: [],
    parentTag: null,
    parentDescendantCount: 0,
    style: ARGS.STYLE || {},
    palette: ARGS.PALETTE || {},
    labels: (typeof FIELD_LABELS !== 'undefined' && FIELD_LABELS !== null) ? FIELD_LABELS : {},
    config: (typeof CLASSIFIERCONFIG !== 'undefined' && CLASSIFIERCONFIG !== null) ? CLASSIFIERCONFIG : {}
  };

  var transformedroot = ytapplytransducers(scope, SET.transducers, context);

  var html;
  if (transformedroot && transformedroot.tag === YJROOTTAG) {
    html = (transformedroot.children || []).map(ytserializenode).join('');
  } else {
    html = ytserializenode(transformedroot);
  }

  if (ARGS.MODE === 'replace') {
    TARGET.innerHTML = html;
  } else {
    TARGET.insertAdjacentHTML('beforeend', html);
  }

  return { RESPONSE: { APPLIED: true, BYTES: html.length } };
}

// ============================================================
// §9 — Handler registration
// ============================================================

REGISTERACTORMESSAGE('RENDERACTOR', SETTRANSFORMATIONSTYPE,
		     RENDERHANDLER_SETTRANSFORMATIONS);
