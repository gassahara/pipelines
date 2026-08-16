import { logdebug, getverbosity, VERBOSITY } from '../verbosity.js';
import {
  contrastRatio, hexToRgb, rgbToHex, getOptimalForeground,
  getHarmoniousPalette, colorHarmonyScore
} from './colorutils.js';

// ==================== CHARACTER AND STRING HELPERS ====================

const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

export const camelToKebab = (str) => str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
export const kebabToCamel = (str) => str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const tokenizeWhitespace = (str) => String(str).trim().split(/\s+/).filter(Boolean);

const findHexColor = (str) => {
  const m = String(str).match(/#[0-9a-fA-F]{3,6}/);
  return m ? m[0] : null;
};

const findRgbColor = (str) => {
  const m = String(str).match(/rgb\([^)]+\)/);
  return m ? m[0] : null;
};

const anyColorToHex = (color) => {
  const rgb = hexToRgb(color);
  return Array.isArray(rgb) ? rgbToHex(...rgb) : '#000000';
};

// ==================== UNIT CONVERSION & PARSING ====================

const LENGTH_FACTORS = {
  px: 1, '': 1, '%': (n, ref) => (n / 100) * ref, em: (n, ref) => n * ref,
  rem: (n) => n * 16, pt: (n) => n * (96 / 72), pc: (n) => n * 16,
  in: (n) => n * 96, cm: (n) => n * (96 / 2.54), mm: (n) => n * (96 / 25.4),
  q: (n) => n * (96 / 101.6)
};

const KEYWORD_LENGTHS = {
  auto: 1, medium: 1.3, large: 1.5, small: 0.7, tiny: 0.5
};

export function parseLength(value, referencePx = 16) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  if (KEYWORD_LENGTHS[value] !== undefined) value = referencePx * KEYWORD_LENGTHS[value];

  const str = String(value).trim();
  const m = str.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)$/);
  if (!m) throw new Error('[parseLength] Invalid length value: ' + value);

  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const factor = LENGTH_FACTORS[unit];
  if (factor === undefined) throw new Error('[parseLength] Unknown unit: ' + unit);
  return typeof factor === 'function' ? factor(num, referencePx) : num * factor;
}

export function computeBaseSpacing(viewportWidth, baseFontSize = 16) {
  const scale = Math.min(1, (viewportWidth || 960) / 960);
  const round = (v) => Math.round(v);
  return {
    pad: round(16 * scale), margin: round(8 * scale), listIndent: round(24 * scale),
    codePad: round(12 * scale), cardPad: round(12 * scale), btnPadV: round(8 * scale),
    btnPadH: round(16 * scale), gap: round(8 * scale), scale
  };
}

export function parseShorthandLengths(value, referencePx) {
  if (!value) return null;
  const tokens = tokenizeWhitespace(String(value));
  if (!tokens.length) return null;
  const [t, r = t, b = t, l = r] = tokens.map(tok => parseLength(tok, referencePx));
  return { top: t, right: r, bottom: b, left: l };
}

// ==================== RECURSIVE PATH ENGINE ====================

const getAncestors = (el) => {
  const acc = [];
  let p = el.parentNode;
  while (p && p.nodeType === 1) { acc.push(p); p = p.parentNode; }
  return acc;
};

export function getAllDescendants(el) {
  const children = Array.from(el.children || []);
  return children.reduce((all, child) => all.concat(child, getAllDescendants(child)), []);
}

const getSiblings = (el, dir) => {
  const acc = [];
  let s = el[dir];
  while (s) { if (s.nodeType === 1) acc.push(s); s = s[dir]; }
  return acc;
};

const getDepth = (ancestor, descendant) => {
  if (!descendant || descendant === ancestor) return 0;
  return descendant.nodeType !== 1 ? getDepth(ancestor, descendant.parentNode) : 1 + getDepth(ancestor, descendant.parentNode);
};

export function applyStep(nodes, step, filterFn = null) {
  return nodes.reduce((next, node) => {
    let candidates = [];
    switch (step.axis || 'child') {
      case 'self': candidates = [node]; break;
      case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
      case 'ancestor': candidates = getAncestors(node); break;
      case 'child': candidates = Array.from(node.children || []); break;
      case 'descendant': candidates = getAllDescendants(node); break;
      case 'nextSibling': candidates = getSiblings(node, 'nextSibling'); break;
      case 'previousSibling': candidates = getSiblings(node, 'previousSibling'); break;
      default: throw new Error('Unknown axis: ' + step.axis);
    }

    if (step.tag) candidates = candidates.filter(el => el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase());
    if (step.class) candidates = candidates.filter(el => el.classList && el.classList.contains(step.class));
    if (step.id) candidates = candidates.filter(el => el.id === step.id);
    if (step.index !== undefined) candidates = candidates.length > step.index ? [candidates[step.index]] : [];
    if (step.depth !== undefined && step.axis === 'descendant') candidates = candidates.filter(el => getDepth(node, el) === step.depth);
    if (step.skip !== undefined && (step.axis === 'nextSibling' || step.axis === 'previousSibling')) {
      candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
    }
    if (step.content) {
      const { text = '', mode = 'substring', caseSensitive = false } = step.content;
      const search = caseSensitive ? text : text.toLowerCase();
      candidates = candidates.filter(el => {
        const elText = caseSensitive ? el.textContent : el.textContent.toLowerCase();
        return mode === 'exact' ? elText.trim() === search.trim() : elText.includes(search);
      });
    }

    if (typeof filterFn === 'function') candidates = candidates.filter(filterFn);
    candidates.forEach(c => { if (!next.includes(c)) next.push(c); });
    return next;
  }, []);
}

const resolvePath = (root, steps) => steps.reduce((nodes, step) => applyStep(nodes, step), [root]);

// ==================== PROPERTY MAP ====================

export function buildLayoutPropertyMap(rootEl, viewportWidth, inheritedFontSize = 16) {
  const map = new Map();

  const walk = (el, parentAvailableWidth, parentFontSize) => {
    const style = el.style || {};
    const props = {
      fontSize: parentFontSize, width: null, maxWidth: null, minWidth: null, height: null,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
      borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
      availableWidth: parentAvailableWidth
    };

    ['fontSize', 'width', 'maxWidth', 'minWidth', 'height', 'marginTop', 'marginBottom',
     'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
     'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'].forEach(prop => {
      if (style[prop]) props[prop] = parseLength(style[prop], prop === 'fontSize' ? parentFontSize : parentAvailableWidth);
    });

    if (style.margin) {
      const sh = parseShorthandLengths(style.margin, parentAvailableWidth);
      if (sh) { props.marginTop = sh.top; props.marginRight = sh.right; props.marginBottom = sh.bottom; props.marginLeft = sh.left; }
    }
    if (style.padding) {
      const sh = parseShorthandLengths(style.padding, parentAvailableWidth);
      if (sh) { props.paddingTop = sh.top; props.paddingRight = sh.right; props.paddingBottom = sh.bottom; props.paddingLeft = sh.left; }
    }

    const contentWidth = Math.max(0, parentAvailableWidth - props.paddingLeft - props.paddingRight - props.borderLeftWidth - props.borderRightWidth);
    let selfAvailable = contentWidth;
    if (props.maxWidth !== null) selfAvailable = Math.min(selfAvailable, props.maxWidth);
    if (props.width !== null) selfAvailable = Math.min(selfAvailable, props.width);
    if (props.minWidth !== null) selfAvailable = Math.max(selfAvailable, props.minWidth);
    props.availableWidth = selfAvailable;

    map.set(el, props);
    applyStep([el], { axis: 'child' }).forEach(child => walk(child, selfAvailable, props.fontSize));
  };

  walk(rootEl, viewportWidth, inheritedFontSize);
  return map;
}

// ==================== INTRINSIC SIZE CALCULATOR ====================

export function computeIntrinsicSize(node, propertyMap, inheritedProps = {}) {
  if (!node) return { width: 0, height: 0 };

  if (node.nodeType === 3) {
    const txt = node.nodeValue.trim();
    if (!txt) return { width: 0, height: 0 };
    const fontSize = inheritedProps.fontSize || 16;
    const lines = txt.split('\n');
    const isNowrap = inheritedProps.whiteSpace === 'nowrap' || inheritedProps.whiteSpace === 'pre';
    const maxLineLen = Math.max(...lines.map(line => {
      const words = isNowrap ? [line] : tokenizeWhitespace(line);
      return words.reduce((len, w, i) => len + w.length * fontSize + (i > 0 ? fontSize : 0), 0);
    }));
    const lineHeight = inheritedProps.lineHeight || fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
    return { width: maxLineLen, height: lines.length * lineHeight };
  }

  if (node.nodeType !== 1) return { width: 0, height: 0 };
  const props = propertyMap.get(node);
  if (!props) throw new Error('[computeIntrinsicSize] Missing property map entry: ' + node.tagName);

  const tag = node.tagName.toLowerCase();
  const padH = (props.paddingLeft || 0) + (props.paddingRight || 0) + (props.borderLeftWidth || 0) + (props.borderRightWidth || 0);
  const padV = (props.paddingTop || 0) + (props.paddingBottom || 0);

  if (tag === 'img' || tag === 'svg') {
    if (props.width !== null) return { width: props.width, height: props.height || (props.width * 0.75) };
    throw new Error('[computeIntrinsicSize] Image without explicit width');
  }

  if (tag === 'table') {
    if (props.width !== null) return { width: props.width, height: props.height || 0 };
    const rows = applyStep([node], { axis: 'descendant', tag: 'tr' });
    const colMax = {};
    let totalH = 0;
    rows.forEach(row => {
      let rowH = 0;
      applyStep([row], { axis: 'child' }).forEach((cell, idx) => {
        const s = computeIntrinsicSize(cell, propertyMap, props);
        colMax[idx] = Math.max(colMax[idx] || 0, s.width);
        rowH = Math.max(rowH, s.height);
      });
      totalH += rowH;
    });
    return { width: Object.values(colMax).reduce((sum, w) => sum + w, 0) + padH, height: totalH + padV };
  }

  const children = Array.from(node.childNodes);
  if (!children.length) return { width: padH, height: padV };

  const isFlexRow = node.style?.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
  let totalW = 0, maxW = 0, totalH = 0;

  children.forEach(child => {
    const s = computeIntrinsicSize(child, propertyMap, props);
    if (isFlexRow) { totalW += s.width; totalH = Math.max(totalH, s.height); }
    else { maxW = Math.max(maxW, s.width); totalH += s.height; }
  });

  return { width: (isFlexRow ? totalW : maxW) + padH, height: totalH + padV };
}

// ==================== STYLIZER FUNCTION ====================

export function rewritestyleattrs(html, rules) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  rules.forEach(rule => {
    let els = [];
    if (rule.path) els = resolvePath(doc.body, rule.path);
    else if (rule.id) els = [doc.getElementById(rule.id)];
    else if (rule.tag) els = Array.from(doc.getElementsByTagName(rule.tag));
    else if (rule.class) els = Array.from(doc.getElementsByClassName(rule.class));
    else if (rule.name) els = Array.from(doc.getElementsByName(rule.name));

    els.filter(Boolean).forEach(el => {
      if (rule.style) Object.assign(el.style, rule.style);
    });
  });
  return doc.body.innerHTML;
}

export function computecolorscheme(pos, tilecols, cellw, cellh, gridcols) {
  const colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
  const rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
  const colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
  const rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));

  let sumh = 0, sums = 0, suml = 0, count = 0;
  for (let r = rowstart; r < rowend; r++) {
    for (let c = colstart; c < colend; c++) {
      const idx = r * gridcols + c;
      if (idx < tilecols.length) {
        sumh += tilecols[idx].h; sums += tilecols[idx].s; suml += tilecols[idx].l;
        count++;
      }
    }
  }
  const avgh = count ? (sumh / count) % 360 : 0;
  const avgs = count ? sums / count : 50;
  const avgl = count ? suml / count : 50;
  const offset = (Math.floor((pos.clientx || 0) / 50) * 7 + Math.floor((pos.clienty || 0) / 50) * 13) % 60;
  const huecont = (avgh + 180 + offset) % 360;
  const satcont = avgs < 30 ? 75 : (avgs >= 50 ? 50 : 60);
  const bglight = avgl < 50 ? 75 : 25;
  const fglight = avgl < 50 ? 15 : 90;

  return {
    background: `hsl(${huecont}, ${satcont}%, ${bglight}%)`,
    color: `hsl(${huecont}, ${Math.max(satcont - 10, 10)}%, ${fglight}%)`,
    borderColor: `hsl(${huecont}, ${satcont}%, ${Math.round((bglight + fglight) / 2)}%)`
  };
}

export function injectResponsiveStyles(html, breakpointRules) {
  if (!breakpointRules || !breakpointRules.length) return html;
  let css = '<style data-responsive="true">';
  breakpointRules.forEach(bp => {
    const min = bp.minWidth !== undefined ? `(min-width: ${bp.minWidth}px)` : '';
    const max = bp.maxWidth !== undefined ? `(max-width: ${bp.maxWidth}px)` : '';
    css += `@media ${[min, max].filter(Boolean).join(' and ')} {\n`;
    bp.rules.forEach(rule => {
      const sel = rule.id ? `#${rule.id}` : rule.class ? `.${rule.class}` : rule.tag || '*';
      css += `  ${sel} {\n`;
      Object.entries(rule.style).forEach(([prop, val]) => {
        css += `    ${camelToKebab(prop)}: ${val};\n`;
      });
      css += `  }\n`;
    });
    css += `}\n`;
  });
  css += '</style>';
  const lastDiv = html.lastIndexOf('</div>');
  return lastDiv !== -1 ? html.slice(0, lastDiv) + css + html.slice(lastDiv) : html + css;
}

export function extractAllTagStyles(referenceHTML) {
  const doc = new DOMParser().parseFromString(referenceHTML, 'text/html');
  const refRoot = doc.getElementById('theme-reference');
  if (!refRoot) return {};
  const map = {};
  if (refRoot.style.length) map['root'] = { ...refRoot.style };
  Array.from(refRoot.children).forEach(el => {
    const tag = el.tagName.toLowerCase();
    const s = {};
    for (let i = 0; i < el.style.length; i++) s[el.style[i]] = el.style[el.style[i]];
    map[tag] = { ...(map[tag] || {}), ...s };
  });
  return map;
}

export function consolidateStyles(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const safeProps = new Set([
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'text-align', 'cursor', 'letter-spacing', 'word-spacing',
    'text-transform', 'text-decoration', 'font-variant'
  ]);
  const walk = (el) => {
    for (const child of el.children) {
      if (child.style) {
        for (let i = child.style.length - 1; i >= 0; i--) {
          const prop = child.style[i];
          if (safeProps.has(prop) && el.style[prop] === child.style[prop]) child.style.removeProperty(prop);
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const extractBgFromShorthand = (el) => {
  if (el.style.backgroundColor) return el.style.backgroundColor;
  const bg = el.style.background;
  if (!bg) return null;
  return findHexColor(bg) || findRgbColor(bg) || null;
};

const getEffectiveBackground = (el) => {
  let curr = el;
  while (curr && curr.nodeType === 1) {
    const bg = extractBgFromShorthand(curr);
    if (bg) return bg;
    curr = curr.parentNode;
  }
  return '#ffffff';
};

const mergeAndApplyStyles = (el, newStyles) => {
  Object.entries(newStyles).forEach(([prop, val]) => { el.style[prop] = val; });
};

export function estimateRecursiveBounds(node) {
  if (node.nodeType === 3) {
    const txt = node.nodeValue.trim();
    if (!txt) return 0;
    let fSize = 16, isNowrap = false, p = node.parentElement;
    while (p && p.style) {
      if (p.style.fontSize) {
        const raw = p.style.fontSize;
        fSize = raw.includes('rem') || raw.includes('em') ? parseFloat(raw) * 16 : parseFloat(raw);
        break;
      }
      if (p.style.whiteSpace === 'nowrap') isNowrap = true;
      p = p.parentElement;
    }
    const charPx = fSize * 0.6;
    return isNowrap ? txt.length * charPx : Math.max(0, ...tokenizeWhitespace(txt).map(w => w.length)) * charPx;
  }
  if (node.nodeType === 1) {
    if (['img', 'svg'].includes(node.tagName.toLowerCase())) return parseFloat(node.style.width || node.getAttribute('width') || 24);
    const isFlexRow = node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
    let totalW = 0;
    for (const child of node.childNodes) {
      const w = estimateRecursiveBounds(child);
      totalW = isFlexRow ? totalW + w : Math.max(totalW, w);
    }
    return totalW;
  }
  return 0;
}

// ==================== VERIFIERS ====================

export function verifyContrast(html, minRatio = 4.5) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el) => {
    if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
      const fgHex = anyColorToHex(el.style.color);
      const bgHex = anyColorToHex(getEffectiveBackground(el));
      if (contrastRatio(fgHex, bgHex) < minRatio) {
        el.style.color = getOptimalForeground(bgHex, minRatio, { scheme: 'complementary' });
      }
    }
    for (const child of el.children) walk(child);
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function verifyTextVisibility(html) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el) => {
    if (el.nodeType === 1 && el.textContent.trim()) {
      const fSize = parseFloat(el.style.fontSize) || 0;
      const lh = parseFloat(el.style.lineHeight) || 0;
      const col = el.style.color;
      const id = el.tagName + (el.id ? '#' + el.id : '');
      if (fSize && fSize < 12) violations.push({ element: id, issue: 'font-size too small', value: fSize });
      if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
      if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
    }
    for (const child of el.children) walk(child);
  };
  walk(doc.body);
  return violations;
}

export function verifyButtonVisibility(html) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.getElementsByTagName('*')).filter(el => {
    const tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].includes(el.getAttribute('type')));
  }).forEach(btn => {
    const w = parseFloat(btn.style.width) || 0, h = parseFloat(btn.style.height) || 0;
    const id = btn.tagName + (btn.id ? '#' + btn.id : '');
    if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w, h });
    if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
  });
  return violations;
}

export function verifyHarmony(html, options = {}) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.getElementsByTagName('*')).forEach(el => {
    if (!el.textContent.trim() || !el.style.color) return;
    const fg = anyColorToHex(el.style.color);
    const bg = anyColorToHex(getEffectiveBackground(el));
    const score = colorHarmonyScore(fg, bg);
    if (score < 0.5) {
      violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), score, color: fg, bg });
      if (options.autoCorrect) {
        const pal = getHarmoniousPalette(bg, 3, { scheme: 'analogous' });
        if (pal.length) el.style.color = pal[0];
      }
    }
  });
  return { html: options.autoCorrect ? doc.body.innerHTML : html, violations };
}

export function checkSpacing(html, minGap = 12) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (parent) => {
    const children = Array.from(parent.children);
    for (let i = 0; i < children.length - 1; i++) {
      const a = children[i], b = children[i + 1];
      const gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
      if (gap < minGap) violations.push({ elementA: a.tagName + (a.id ? '#'+a.id : ''), elementB: b.tagName + (b.id ? '#'+b.id : ''), gap });
      walk(b);
    }
  };
  walk(doc.body);
  return violations;
}

export function checkOverlap(html) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pos = Array.from(doc.getElementsByTagName('*')).filter(el => el.style && ['absolute', 'fixed'].includes(el.style.position));
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j];
      const aT = parseFloat(a.style.top) || 0, aL = parseFloat(a.style.left) || 0, aW = parseFloat(a.style.width) || 0, aH = parseFloat(a.style.height) || 0;
      const bT = parseFloat(b.style.top) || 0, bL = parseFloat(b.style.left) || 0, bW = parseFloat(b.style.width) || 0, bH = parseFloat(b.style.height) || 0;
      if (aW && aH && bW && bH && aL < bL + bW && aL + aW > bL && aT < bT + bH && aT + aH > bT) {
        violations.push({ elementA: a.tagName + (a.id ? '#'+a.id : ''), elementB: b.tagName + (b.id ? '#'+b.id : '') });
      }
    }
  }
  return violations;
}

export function checkOverflow(html) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el) => {
    const s = el.style;
    const over = s.overflow || s.overflowX || s.overflowY;
    if ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && (!over || over === 'visible')) {
      violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'content overflows but overflow not set' });
    }
    for (const child of el.children) walk(child);
  };
  walk(doc.body);
  return violations;
}

export function checkScrollability(html) {
  const violations = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.getElementsByTagName('*')).filter(el => el.style && ['auto', 'scroll'].includes(el.style.overflow)).forEach(el => {
    const id = el.tagName + (el.id ? '#'+el.id : '');
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) violations.push({ element: id, issue: 'scrollable container has no overflowing content' });
    if (!el.style.touchAction) violations.push({ element: id, issue: 'touch-action not set for scrollable element' });
  });
  return violations;
}

export function checkControlledOverlay(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.getElementsByTagName('*'))
    .filter(el => el.style && ['absolute', 'fixed'].includes(el.style.position) && !el.style.zIndex)
    .map(el => ({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'positioned element lacks z-index' }));
}

export function checkFocusVisibility(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.getElementsByTagName('*')).filter(el => {
    const tag = el.tagName.toLowerCase();
    return (tag === 'a' && el.getAttribute('href')) || ['button', 'input', 'select', 'textarea'].includes(tag) || el.getAttribute('tabindex') !== null;
  }).filter(el => !el.hasAttribute('onfocus') && (!el.style.outline || ['none', '0px'].includes(el.style.outline)))
    .map(el => ({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'no focus indicator' }));
}

export function runVerification(html, goals = []) {
  const result = { passed: true, violations: [], correctedHtml: html };
  goals.forEach(goal => {
    switch (goal) {
      case 'contrast': result.correctedHtml = verifyContrast(result.correctedHtml); break;
      case 'spacing': { const v = checkSpacing(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'overlap': { const v = checkOverlap(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'overflow': { const v = checkOverflow(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'scrollability': { const v = checkScrollability(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'overlay': { const v = checkControlledOverlay(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'textvisibility': { const v = verifyTextVisibility(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'buttonvisibility': { const v = verifyButtonVisibility(result.correctedHtml); if (v.length) { result.passed = false; result.violations.push(...v); } break; }
      case 'harmony': {
        const res = verifyHarmony(result.correctedHtml, { autoCorrect: true });
        result.correctedHtml = res.html;
        if (res.violations.length) { result.passed = false; result.violations.push(...res.violations); }
        break;
      }
    }
  });
  return result;
}

export function optimizeStyleHTML(html, goals, themeStyles = {}, maxIterations = 5) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allRules = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    let anyCorrection = false;
    goals.forEach(goal => {
      const els = Array.from(doc.getElementsByTagName('*'));
      if (goal.type === 'contrast') {
        const minRatio = goal.options?.minRatio ?? 4.5;
        els.forEach(el => {
          if (el.textContent.trim() && el.style.color) {
            const bg = getEffectiveBackground(el);
            const fgHex = anyColorToHex(el.style.color);
            const bgHex = anyColorToHex(bg);
            if (contrastRatio(fgHex, bgHex) < minRatio) {
              const newFg = getOptimalForeground(bgHex, minRatio, { scheme: 'complementary' });
              el.style.color = newFg;
              allRules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { color: newFg } });
              anyCorrection = true;
            }
          }
        });
      } else if (goal.type === 'harmony') {
        els.forEach(el => {
          if (el.textContent.trim() && el.style.color) {
            const bg = getEffectiveBackground(el);
            const fg = anyColorToHex(el.style.color);
            const bgHex = anyColorToHex(bg);
            if (colorHarmonyScore(fg, bgHex) < 0.5) {
              const pal = getHarmoniousPalette(bgHex, 3, { scheme: 'analogous' });
              if (pal.length) {
                el.style.color = pal[0];
                allRules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { color: pal[0] } });
                anyCorrection = true;
              }
            }
          }
        });
      } else if (goal.type === 'textVisibility') {
        const minLh = goal.options?.minLineHeight ?? 1.2;
        els.forEach(el => {
          if (el.textContent.trim()) {
            const tag = el.tagName.toLowerCase();
            const minSize = parseFloat(themeStyles[tag]?.fontSize || themeStyles['p']?.fontSize || '12px');
            const curSize = parseFloat(el.style.fontSize) || 0;
            const curLh = parseFloat(el.style.lineHeight) || 0;
            const styles = {};
            if (curSize > 0 && curSize < minSize) styles.fontSize = `${minSize}px`;
            if (curLh && curLh < minLh) styles.lineHeight = String(minLh);
            if (Object.keys(styles).length) {
              Object.assign(el.style, styles);
              allRules.push({ selector: el.id ? { id: el.id } : { tag }, styles });
              anyCorrection = true;
            }
          }
        });
      } else if (goal.type === 'buttonVisibility') {
        els.filter(el => {
          const tag = el.tagName.toLowerCase();
          return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].includes(el.getAttribute('type')));
        }).forEach(btn => {
          const w = parseFloat(btn.style.width) || 0, h = parseFloat(btn.style.height) || 0;
          const styles = {};
          const minW = Math.max(44, estimateRecursiveBounds(btn) + 24);
          if (w < minW) styles.minWidth = `${minW}px`;
          if (h < 44) styles.minHeight = '44px';
          if (!btn.style.cursor) styles.cursor = 'pointer';
          if (Object.keys(styles).length) {
            Object.assign(btn.style, styles);
            allRules.push({ selector: btn.id ? { id: btn.id } : { tag: btn.tagName.toLowerCase() }, styles });
            anyCorrection = true;
          }
        });
      }
    });
    if (!anyCorrection) break;
  }

  return { html: doc.body.innerHTML, rules: allRules };
}
