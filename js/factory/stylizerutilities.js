import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';
import {
  contrastRatio, hexToRgb, rgbToHex, getOptimalForeground,
  getHarmoniousPalette, colorHarmonyScore
} from './colorutils.js';

function createStylizerConstants() {
  return Object.freeze({
    SAFE_PROPS: Object.freeze(['color','font-family','font-size','font-weight','font-style','line-height','text-align','cursor','letter-spacing','word-spacing','text-transform','text-decoration','font-variant']),
    BLOCK_DISPLAY_VALUES: Object.freeze(['block','flex','grid']),
    BLOCK_TAGS: Object.freeze(['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li']),
    DEFAULT_MIN_GAP: 12,
    DEFAULT_MIN_RATIO: 4.5
  });
}

function createDebugLogger() {
  var constants = createVerbosityConstants();
  var fns = createVerbosityFunctions(constants);
  var state = Object.freeze({ level: constants.DEBUG });
  return { fns: fns, state: state };
}

function pad2(n) { return n < 16 ? '0' + n.toString(16) : n.toString(16); }

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
}

function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
}

function tokenizeWhitespace(str) {
  return String(str).trim().split(/\s+/).filter(Boolean);
}

function parseLength(value, referencePx) {
  if (referencePx === undefined) referencePx = 16;
  var KEYWORD_LENGTHS = {
    auto: 1, medium: 1.3, large: 1.5, small: 0.7, tiny: 0.5
  };

  var LENGTH_FACTORS = {
    px: 1, '': 1, '%': function(n, ref) { return (n / 100) * ref; }, em: function(n, ref) { return n * ref; },
    rem: function(n) { return n * 16; }, pt: function(n) { return n * (96 / 72); }, pc: function(n) { return n * 16; },
    in: function(n) { return n * 96; }, cm: function(n) { return n * (96 / 2.54); }, mm: function(n) { return n * (96 / 25.4); },
    q: function(n) { return n * (96 / 101.6); }
  };

  if (typeof value === 'number') return value;
  if (!value) return 0;
  if (KEYWORD_LENGTHS[value] !== undefined) value = referencePx * KEYWORD_LENGTHS[value];

  var str = String(value).trim();
  var m = str.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)$/);
  if (!m) throw new Error('[parseLength] Invalid length value: ' + value);

  var num = parseFloat(m[1]);
  var unit = m[2].toLowerCase();
  var factor = LENGTH_FACTORS[unit];
  if (factor === undefined) throw new Error('[parseLength] Unknown unit: ' + unit);
  return typeof factor === 'function' ? factor(num, referencePx) : num * factor;
}

function computeBaseSpacing(viewportWidth, baseFontSize) {
  if (baseFontSize === undefined) baseFontSize = 16;
  var scale = Math.min(1, (viewportWidth || 960) / 960);
  function round(v) { return Math.round(v); }
  return {
    pad: round(16 * scale), margin: round(8 * scale), listIndent: round(24 * scale),
    codePad: round(12 * scale), cardPad: round(12 * scale), btnPadV: round(8 * scale),
    btnPadH: round(16 * scale), gap: round(8 * scale), scale: scale
  };
}

function parseShorthandLengths(value, referencePx) {
  if (!value) return null;
  var tokens = tokenizeWhitespace(String(value));
  if (!tokens.length) return null;
  var t = parseLength(tokens[0], referencePx);
  var r = tokens[1] !== undefined ? parseLength(tokens[1], referencePx) : t;
  var b = tokens[2] !== undefined ? parseLength(tokens[2], referencePx) : t;
  var l = tokens[3] !== undefined ? parseLength(tokens[3], referencePx) : r;
  return { top: t, right: r, bottom: b, left: l };
}

function applyStep(nodes, step, filterFn) {
  if (filterFn === undefined) filterFn = null;
  var getAncestors = function(el) {
    var acc = [];
    var p = el.parentNode;
    while (p && p.nodeType === 1) { acc.push(p); p = p.parentNode; }
    return acc;
  };

  var getSiblings = function(el, dir) {
    var acc = [];
    var s = el[dir];
    while (s) { if (s.nodeType === 1) acc.push(s); s = s[dir]; }
    return acc;
  };

  var getDepth = function(ancestor, descendant) {
    if (!descendant || descendant === ancestor) return 0;
    return descendant.nodeType !== 1 ? getDepth(ancestor, descendant.parentNode) : 1 + getDepth(ancestor, descendant.parentNode);
  };

  return nodes.reduce(function(next, node) {
    var candidates = [];
    switch (step.axis || 'child') {
      case 'self': candidates = [node]; break;
      case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
      case 'ancestor': candidates = getAncestors(node); break;
      case 'child': candidates = Array.prototype.slice.call(node.children || []); break;
      case 'descendant': candidates = getAllDescendants(node); break;
      case 'nextSibling': candidates = getSiblings(node, 'nextSibling'); break;
      case 'previousSibling': candidates = getSiblings(node, 'previousSibling'); break;
      default: throw new Error('Unknown axis: ' + step.axis);
    }

    if (step.tag) candidates = candidates.filter(function(el) { return el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase(); });
    if (step.class) candidates = candidates.filter(function(el) { return el.classList && el.classList.contains(step.class); });
    if (step.id) candidates = candidates.filter(function(el) { return el.id === step.id; });
    if (step.index !== undefined) candidates = candidates.length > step.index ? [candidates[step.index]] : [];
    if (step.depth !== undefined && step.axis === 'descendant') candidates = candidates.filter(function(el) { return getDepth(node, el) === step.depth; });
    if (step.skip !== undefined && (step.axis === 'nextSibling' || step.axis === 'previousSibling')) {
      candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
    }
    if (step.content) {
      var text = step.content.text || '';
      var mode = step.content.mode || 'substring';
      var caseSensitive = step.content.caseSensitive || false;
      var search = caseSensitive ? text : text.toLowerCase();
      candidates = candidates.filter(function(el) {
        var elText = caseSensitive ? el.textContent : el.textContent.toLowerCase();
        return mode === 'exact' ? elText.trim() === search.trim() : elText.indexOf(search) !== -1;
      });
    }

    if (typeof filterFn === 'function') candidates = candidates.filter(filterFn);
    candidates.forEach(function(c) { if (next.indexOf(c) === -1) next.push(c); });
    return next;
  }, []);
}

function getAllDescendants(el) {
  var children = Array.prototype.slice.call(el.children || []);
  return children.reduce(function(all, child) { return all.concat(child, getAllDescendants(child)); }, []);
}

function buildLayoutPropertyMap(rootEl, viewportWidth, inheritedFontSize) {
  if (inheritedFontSize === undefined) inheritedFontSize = 16;

  function walk(el, parentAvailableWidth, parentFontSize, acc) {
    var style = el.style || {};
    var props = {
      fontSize: parentFontSize, width: null, maxWidth: null, minWidth: null, height: null,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
      borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
      availableWidth: parentAvailableWidth
    };

    var propNames = ['fontSize', 'width', 'maxWidth', 'minWidth', 'height', 'marginTop', 'marginBottom',
     'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
     'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'];
    propNames.forEach(function(prop) {
      if (style[prop]) props[prop] = parseLength(style[prop], prop === 'fontSize' ? parentFontSize : parentAvailableWidth);
    });

    if (style.margin) {
      var sh = parseShorthandLengths(style.margin, parentAvailableWidth);
      if (sh) { props.marginTop = sh.top; props.marginRight = sh.right; props.marginBottom = sh.bottom; props.marginLeft = sh.left; }
    }
    if (style.padding) {
      var sh2 = parseShorthandLengths(style.padding, parentAvailableWidth);
      if (sh2) { props.paddingTop = sh2.top; props.paddingRight = sh2.right; props.paddingBottom = sh2.bottom; props.paddingLeft = sh2.left; }
    }

    var contentWidth = Math.max(0, parentAvailableWidth - props.paddingLeft - props.paddingRight - props.borderLeftWidth - props.borderRightWidth);
    var selfAvailable = contentWidth;
    if (props.maxWidth !== null) selfAvailable = Math.min(selfAvailable, props.maxWidth);
    if (props.width !== null) selfAvailable = Math.min(selfAvailable, props.width);
    if (props.minWidth !== null) selfAvailable = Math.max(selfAvailable, props.minWidth);
    props.availableWidth = selfAvailable;

    var nextAcc = acc.concat([{ element: el, props: props }]);
    var children = applyStep([el], { axis: 'child' });
    return children.reduce(function(innerAcc, child) {
      return walk(child, selfAvailable, props.fontSize, innerAcc);
    }, nextAcc);
  }

  return walk(rootEl, viewportWidth, inheritedFontSize, []);
}

function getPropsFromMap(propsMap, el) {
  for (var i = 0; i < propsMap.length; i++) {
    if (propsMap[i].element === el) return propsMap[i].props;
  }
  return null;
}

function computeIntrinsicSize(node, propertyMap, inheritedProps) {
  if (inheritedProps === undefined) inheritedProps = {};
  var DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

  if (!node) return { width: 0, height: 0 };

  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return { width: 0, height: 0 };
    var fontSize = inheritedProps.fontSize || 16;
    var lines = txt.split('\n');
    var isNowrap = inheritedProps.whiteSpace === 'nowrap' || inheritedProps.whiteSpace === 'pre';
    var maxLineLen = Math.max.apply(null, lines.map(function(line) {
      var words = isNowrap ? [line] : tokenizeWhitespace(line);
      return words.reduce(function(len, w, i) { return len + w.length * fontSize + (i > 0 ? fontSize : 0); }, 0);
    }));
    var lineHeight = inheritedProps.lineHeight || fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
    return { width: maxLineLen, height: lines.length * lineHeight };
  }

  if (node.nodeType !== 1) return { width: 0, height: 0 };
  var props = getPropsFromMap(propertyMap, node);
  if (!props) throw new Error('[computeIntrinsicSize] Missing property map entry: ' + node.tagName);

  var tag = node.tagName.toLowerCase();
  var padH = (props.paddingLeft || 0) + (props.paddingRight || 0) + (props.borderLeftWidth || 0) + (props.borderRightWidth || 0);
  var padV = (props.paddingTop || 0) + (props.paddingBottom || 0);

  if (tag === 'img' || tag === 'svg') {
    if (props.width !== null) return { width: props.width, height: props.height || (props.width * 0.75) };
    throw new Error('[computeIntrinsicSize] Image without explicit width');
  }

  if (tag === 'table') {
    if (props.width !== null) return { width: props.width, height: props.height || 0 };
    var rows = applyStep([node], { axis: 'descendant', tag: 'tr' });
    var colMax = {};
    var totalH = 0;
    rows.forEach(function(row) {
      var rowH = 0;
      applyStep([row], { axis: 'child' }).forEach(function(cell, idx) {
        var s = computeIntrinsicSize(cell, propertyMap, props);
        colMax[idx] = Math.max(colMax[idx] || 0, s.width);
        rowH = Math.max(rowH, s.height);
      });
      totalH += rowH;
    });
    var colVals = Object.keys(colMax).map(function(k) { return colMax[k]; });
    var totalW = colVals.reduce(function(sum, w) { return sum + w; }, 0) + padH;
    return { width: totalW, height: totalH + padV };
  }

  var children = Array.prototype.slice.call(node.childNodes);
  if (!children.length) return { width: padH, height: padV };

  var isFlexRow = node.style && node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
  var totalW = 0, maxW = 0, totalH = 0;

  children.forEach(function(child) {
    var s = computeIntrinsicSize(child, propertyMap, props);
    if (isFlexRow) { totalW += s.width; totalH = Math.max(totalH, s.height); }
    else { maxW = Math.max(maxW, s.width); totalH += s.height; }
  });

  return { width: (isFlexRow ? totalW : maxW) + padH, height: totalH + padV };
}

function rewritestyleattrs(html, rules) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  rules.forEach(function(rule) {
    var els = [];
    if (rule.path) {
      els = rule.path.reduce(function(nodes, step) { return applyStep(nodes, step); }, [doc.body]);
    } else if (rule.id) els = [doc.getElementById(rule.id)];
    else if (rule.tag) els = Array.prototype.slice.call(doc.getElementsByTagName(rule.tag));
    else if (rule.class) els = Array.prototype.slice.call(doc.getElementsByClassName(rule.class));
    else if (rule.name) els = Array.prototype.slice.call(doc.getElementsByName(rule.name));

    els.filter(Boolean).forEach(function(el) {
      if (rule.style) {
        Object.keys(rule.style).forEach(function(prop) { el.style[prop] = rule.style[prop]; });
      }
    });
  });
  return doc.body.innerHTML;
}

function computecolorscheme(pos, tilecols, cellw, cellh, gridcols) {
  var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
  var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
  var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
  var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));

  var sumh = 0, sums = 0, suml = 0, count = 0;
  for (var r = rowstart; r < rowend; r++) {
    for (var c = colstart; c < colend; c++) {
      var idx = r * gridcols + c;
      if (idx < tilecols.length) {
        sumh += tilecols[idx].h; sums += tilecols[idx].s; suml += tilecols[idx].l;
        count++;
      }
    }
  }
  var avgh = count ? (sumh / count) % 360 : 0;
  var avgs = count ? sums / count : 50;
  var avgl = count ? suml / count : 50;
  var offset = (Math.floor((pos.clientx || 0) / 50) * 7 + Math.floor((pos.clienty || 0) / 50) * 13) % 60;
  var huecont = (avgh + 180 + offset) % 360;
  var satcont = avgs < 30 ? 75 : (avgs >= 50 ? 50 : 60);
  var bglight = avgl < 50 ? 75 : 25;
  var fglight = avgl < 50 ? 15 : 90;

  return {
    background: 'hsl(' + huecont + ', ' + satcont + '%, ' + bglight + '%)',
    color: 'hsl(' + huecont + ', ' + Math.max(satcont - 10, 10) + '%, ' + fglight + '%)',
    borderColor: 'hsl(' + huecont + ', ' + satcont + '%, ' + Math.round((bglight + fglight) / 2) + '%)'
  };
}

function injectResponsiveStyles(html, breakpointRules) {
  if (!breakpointRules || !breakpointRules.length) return html;
  var css = '<style data-responsive="true">';
  breakpointRules.forEach(function(bp) {
    var min = bp.minWidth !== undefined ? '(min-width: ' + bp.minWidth + 'px)' : '';
    var max = bp.maxWidth !== undefined ? '(max-width: ' + bp.maxWidth + 'px)' : '';
    css += '@media ' + [min, max].filter(Boolean).join(' and ') + ' {\n';
    bp.rules.forEach(function(rule) {
      var sel = rule.id ? '#' + rule.id : rule.class ? '.' + rule.class : rule.tag || '*';
      css += '  ' + sel + ' {\n';
      Object.keys(rule.style).forEach(function(prop) {
        css += '    ' + camelToKebab(prop) + ': ' + rule.style[prop] + ';\n';
      });
      css += '  }\n';
    });
    css += '}\n';
  });
  css += '</style>';
  var lastDiv = html.lastIndexOf('</div>');
  return lastDiv !== -1 ? html.slice(0, lastDiv) + css + html.slice(lastDiv) : html + css;
}

function extractAllTagStyles(referenceHTML) {
  var doc = new DOMParser().parseFromString(referenceHTML, 'text/html');
  var refRoot = doc.getElementById('theme-reference');
  if (!refRoot) return {};
  var map = {};
  if (refRoot.style.length) map['root'] = {};
  for (var i = 0; i < refRoot.style.length; i++) map['root'][refRoot.style[i]] = refRoot.style[refRoot.style[i]];
  Array.prototype.slice.call(refRoot.children).forEach(function(el) {
    var tag = el.tagName.toLowerCase();
    var s = {};
    for (var j = 0; j < el.style.length; j++) s[el.style[j]] = el.style[el.style[j]];
    if (!map[tag]) map[tag] = {};
    Object.keys(s).forEach(function(prop) { map[tag][prop] = s[prop]; });
  });
  return map;
}

function consolidateStyles(html) {
  var constants = createStylizerConstants();
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var safeProps = constants.SAFE_PROPS;
  function walk(el) {
    Array.prototype.slice.call(el.children).forEach(function(child) {
      if (child.style) {
        for (var i = child.style.length - 1; i >= 0; i--) {
          var prop = child.style[i];
          if (safeProps.indexOf(prop) !== -1 && el.style[prop] === child.style[prop]) child.style.removeProperty(prop);
        }
      }
      walk(child);
    });
  }
  walk(doc.body);
  return doc.body.innerHTML;
}

function getEffectiveBackground(el) {
  function findHexColor(str) {
    var m = String(str).match(/#[0-9a-fA-F]{3,6}/);
    return m ? m[0] : null;
  }
  function findRgbColor(str) {
    var m = String(str).match(/rgb\([^)]+\)/);
    return m ? m[0] : null;
  }
  function extractBgFromShorthand(node) {
    if (node.style.backgroundColor) return node.style.backgroundColor;
    var bg = node.style.background;
    if (!bg) return null;
    return findHexColor(bg) || findRgbColor(bg) || null;
  }
  var curr = el;
  while (curr && curr.nodeType === 1) {
    var bg = extractBgFromShorthand(curr);
    if (bg) return bg;
    curr = curr.parentNode;
  }
  return '#ffffff';
}

function estimateRecursiveBounds(node) {
  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return 0;
    var fSize = 16, isNowrap = false, p = node.parentElement;
    while (p && p.style) {
      if (p.style.fontSize) {
        var raw = p.style.fontSize;
        fSize = raw.indexOf('rem') !== -1 || raw.indexOf('em') !== -1 ? parseFloat(raw) * 16 : parseFloat(raw);
        break;
      }
      if (p.style.whiteSpace === 'nowrap') isNowrap = true;
      p = p.parentElement;
    }
    var charPx = fSize * 0.6;
    return isNowrap ? txt.length * charPx : Math.max.apply(null, tokenizeWhitespace(txt).map(function(w) { return w.length; })) * charPx;
  }
  if (node.nodeType === 1) {
    if (node.tagName && (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg')) return parseFloat(node.style.width || node.getAttribute('width') || 24);
    var isFlexRow = node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
    var totalW = 0;
    Array.prototype.slice.call(node.childNodes).forEach(function(child) {
      var w = estimateRecursiveBounds(child);
      totalW = isFlexRow ? totalW + w : Math.max(totalW, w);
    });
    return totalW;
  }
  return 0;
}

function verifyContrast(html, minRatio) {
  if (minRatio === undefined) minRatio = 4.5;
  var doc = new DOMParser().parseFromString(html, 'text/html');
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
      var fgHex = rgbToHex.apply(null, hexToRgb(el.style.color));
      var bgHex = rgbToHex.apply(null, hexToRgb(getEffectiveBackground(el)));
      if (contrastRatio(fgHex, bgHex) < minRatio) {
        el.style.color = getOptimalForeground(bgHex, minRatio, { scheme: 'complementary' });
      }
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(doc.body);
  return doc.body.innerHTML;
}

function verifyTextVisibility(html) {
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim()) {
      var fSize = parseFloat(el.style.fontSize) || 0;
      var lh = parseFloat(el.style.lineHeight) || 0;
      var col = el.style.color;
      var id = el.tagName + (el.id ? '#' + el.id : '');
      if (fSize && fSize < 12) violations.push({ element: id, issue: 'font-size too small', value: fSize });
      if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
      if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(doc.body);
  return violations;
}

function verifyButtonVisibility(html) {
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
  }).forEach(function(btn) {
    var w = parseFloat(btn.style.width) || 0, h = parseFloat(btn.style.height) || 0;
    var id = btn.tagName + (btn.id ? '#' + btn.id : '');
    if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w: w, h: h });
    if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
  });
  return violations;
}

function verifyHarmony(html, options) {
  if (options === undefined) options = {};
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  Array.prototype.slice.call(doc.getElementsByTagName('*')).forEach(function(el) {
    if (!el.textContent.trim() || !el.style.color) return;
    var fg = rgbToHex.apply(null, hexToRgb(el.style.color));
    var bg = rgbToHex.apply(null, hexToRgb(getEffectiveBackground(el)));
    var score = colorHarmonyScore(fg, bg);
    if (score < 0.5) {
      violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), score: score, color: fg, bg: bg });
      if (options.autoCorrect) {
        var pal = getHarmoniousPalette(bg, 3, { scheme: 'analogous' });
        if (pal.length) el.style.color = pal[0];
      }
    }
  });
  return { html: options.autoCorrect ? doc.body.innerHTML : html, violations: violations };
}

function checkSpacing(html, minGap) {
  if (minGap === undefined) minGap = 12;
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  function walk(parent) {
    var children = Array.prototype.slice.call(parent.children);
    for (var i = 0; i < children.length - 1; i++) {
      var a = children[i], b = children[i + 1];
      var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
      if (gap < minGap) violations.push({ elementA: a.tagName + (a.id ? '#' + a.id : ''), elementB: b.tagName + (b.id ? '#' + b.id : ''), gap: gap });
      walk(b);
    }
  }
  walk(doc.body);
  return violations;
}

function checkOverlap(html) {
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var pos = Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) { return el.style && ['absolute', 'fixed'].indexOf(el.style.position) !== -1; });
  for (var i = 0; i < pos.length; i++) {
    for (var j = i + 1; j < pos.length; j++) {
      var a = pos[i], b = pos[j];
      var aT = parseFloat(a.style.top) || 0, aL = parseFloat(a.style.left) || 0, aW = parseFloat(a.style.width) || 0, aH = parseFloat(a.style.height) || 0;
      var bT = parseFloat(b.style.top) || 0, bL = parseFloat(b.style.left) || 0, bW = parseFloat(b.style.width) || 0, bH = parseFloat(b.style.height) || 0;
      if (aW && aH && bW && bH && aL < bL + bW && aL + aW > bL && aT < bT + bH && aT + aH > bT) {
        violations.push({ elementA: a.tagName + (a.id ? '#' + a.id : ''), elementB: b.tagName + (b.id ? '#' + b.id : '') });
      }
    }
  }
  return violations;
}

function checkOverflow(html) {
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  function walk(el) {
    var s = el.style;
    var over = s.overflow || s.overflowX || s.overflowY;
    if ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && (!over || over === 'visible')) {
      violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), issue: 'content overflows but overflow not set' });
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(doc.body);
  return violations;
}

function checkScrollability(html) {
  var violations = [];
  var doc = new DOMParser().parseFromString(html, 'text/html');
  Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) { return el.style && ['auto', 'scroll'].indexOf(el.style.overflow) !== -1; }).forEach(function(el) {
    var id = el.tagName + (el.id ? '#' + el.id : '');
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) violations.push({ element: id, issue: 'scrollable container has no overflowing content' });
    if (!el.style.touchAction) violations.push({ element: id, issue: 'touch-action not set for scrollable element' });
  });
  return violations;
}

function checkControlledOverlay(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.prototype.slice.call(doc.getElementsByTagName('*'))
    .filter(function(el) { return el.style && ['absolute', 'fixed'].indexOf(el.style.position) !== -1 && !el.style.zIndex; })
    .map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), issue: 'positioned element lacks z-index' }; });
}

function checkFocusVisibility(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return (tag === 'a' && el.getAttribute('href')) || ['button', 'input', 'select', 'textarea'].indexOf(tag) !== -1 || el.getAttribute('tabindex') !== null;
  }).filter(function(el) {
    return !el.hasAttribute('onfocus') && (!el.style.outline || ['none', '0px'].indexOf(el.style.outline) !== -1);
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), issue: 'no focus indicator' }; });
}

function runVerification(html, goals) {
  if (goals === undefined) goals = [];
  var result = { passed: true, violations: [], correctedHtml: html };
  goals.forEach(function(goal) {
    switch (goal) {
      case 'contrast': result.correctedHtml = verifyContrast(result.correctedHtml); break;
      case 'spacing': { var v = checkSpacing(result.correctedHtml); if (v.length) { result.passed = false; result.violations = result.violations.concat(v); } break; }
      case 'overlap': { var v2 = checkOverlap(result.correctedHtml); if (v2.length) { result.passed = false; result.violations = result.violations.concat(v2); } break; }
      case 'overflow': { var v3 = checkOverflow(result.correctedHtml); if (v3.length) { result.passed = false; result.violations = result.violations.concat(v3); } break; }
      case 'scrollability': { var v4 = checkScrollability(result.correctedHtml); if (v4.length) { result.passed = false; result.violations = result.violations.concat(v4); } break; }
      case 'overlay': { var v5 = checkControlledOverlay(result.correctedHtml); if (v5.length) { result.passed = false; result.violations = result.violations.concat(v5); } break; }
      case 'textvisibility': { var v6 = verifyTextVisibility(result.correctedHtml); if (v6.length) { result.passed = false; result.violations = result.violations.concat(v6); } break; }
      case 'buttonvisibility': { var v7 = verifyButtonVisibility(result.correctedHtml); if (v7.length) { result.passed = false; result.violations = result.violations.concat(v7); } break; }
      case 'harmony': {
        var res = verifyHarmony(result.correctedHtml, { autoCorrect: true });
        result.correctedHtml = res.html;
        if (res.violations.length) { result.passed = false; result.violations = result.violations.concat(res.violations); }
        break;
      }
    }
  });
  return result;
}

function optimizeStyleHTML(html, goals, themeStyles, maxIterations) {
  if (themeStyles === undefined) themeStyles = {};
  if (maxIterations === undefined) maxIterations = 5;
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var allRules = [];

  for (var iter = 0; iter < maxIterations; iter++) {
    var anyCorrection = false;
    goals.forEach(function(goal) {
      var els = Array.prototype.slice.call(doc.getElementsByTagName('*'));
      if (goal.type === 'contrast') {
        var minRatio = goal.options && goal.options.minRatio != null ? goal.options.minRatio : 4.5;
        els.forEach(function(el) {
          if (el.textContent.trim() && el.style.color) {
            var bg = getEffectiveBackground(el);
            var fgHex = rgbToHex.apply(null, hexToRgb(el.style.color));
            var bgHex = rgbToHex.apply(null, hexToRgb(bg));
            if (contrastRatio(fgHex, bgHex) < minRatio) {
              var newFg = getOptimalForeground(bgHex, minRatio, { scheme: 'complementary' });
              el.style.color = newFg;
              allRules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { color: newFg } });
              anyCorrection = true;
            }
          }
        });
      } else if (goal.type === 'harmony') {
        els.forEach(function(el) {
          if (el.textContent.trim() && el.style.color) {
            var bg = getEffectiveBackground(el);
            var fg = rgbToHex.apply(null, hexToRgb(el.style.color));
            var bgHex = rgbToHex.apply(null, hexToRgb(bg));
            if (colorHarmonyScore(fg, bgHex) < 0.5) {
              var pal = getHarmoniousPalette(bgHex, 3, { scheme: 'analogous' });
              if (pal.length) {
                el.style.color = pal[0];
                allRules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { color: pal[0] } });
                anyCorrection = true;
              }
            }
          }
        });
      } else if (goal.type === 'textVisibility') {
        var minLh = goal.options && goal.options.minLineHeight != null ? goal.options.minLineHeight : 1.2;
        els.forEach(function(el) {
          if (el.textContent.trim()) {
            var tag = el.tagName.toLowerCase();
            var minSize = parseFloat(themeStyles[tag] && themeStyles[tag].fontSize || themeStyles['p'] && themeStyles['p'].fontSize || '12px');
            var curSize = parseFloat(el.style.fontSize) || 0;
            var curLh = parseFloat(el.style.lineHeight) || 0;
            var styles = {};
            if (curSize > 0 && curSize < minSize) styles.fontSize = minSize + 'px';
            if (curLh && curLh < minLh) styles.lineHeight = String(minLh);
            if (Object.keys(styles).length) {
              Object.keys(styles).forEach(function(prop) { el.style[prop] = styles[prop]; });
              allRules.push({ selector: el.id ? { id: el.id } : { tag: tag }, styles: styles });
              anyCorrection = true;
            }
          }
        });
      } else if (goal.type === 'buttonVisibility') {
        els.filter(function(el) {
          var tag = el.tagName.toLowerCase();
          return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
        }).forEach(function(btn) {
          var w = parseFloat(btn.style.width) || 0, h = parseFloat(btn.style.height) || 0;
          var styles = {};
          var minW = Math.max(44, estimateRecursiveBounds(btn) + 24);
          if (w < minW) styles.minWidth = minW + 'px';
          if (h < 44) styles.minHeight = '44px';
          if (!btn.style.cursor) styles.cursor = 'pointer';
          if (Object.keys(styles).length) {
            Object.keys(styles).forEach(function(prop) { btn.style[prop] = styles[prop]; });
            allRules.push({ selector: btn.id ? { id: btn.id } : { tag: btn.tagName.toLowerCase() }, styles: styles });
            anyCorrection = true;
          }
        });
      }
    });
    if (!anyCorrection) break;
  }

  return { html: doc.body.innerHTML, rules: allRules };
}

export {
  createStylizerConstants,
  camelToKebab,
  kebabToCamel,
  tokenizeWhitespace,
  parseLength,
  computeBaseSpacing,
  parseShorthandLengths,
  applyStep,
  getAllDescendants,
  buildLayoutPropertyMap,
  getPropsFromMap,
  computeIntrinsicSize,
  rewritestyleattrs,
  computecolorscheme,
  injectResponsiveStyles,
  extractAllTagStyles,
  consolidateStyles,
  getEffectiveBackground,
  estimateRecursiveBounds,
  verifyContrast,
  verifyTextVisibility,
  verifyButtonVisibility,
  verifyHarmony,
  checkSpacing,
  checkOverlap,
  checkOverflow,
  checkScrollability,
  checkControlledOverlay,
  checkFocusVisibility,
  runVerification,
  optimizeStyleHTML
};
