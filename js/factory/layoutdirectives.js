import { rewritestyleattrs, applyStep, getAllDescendants, buildLayoutPropertyMap, computeIntrinsicSize, kebabToCamel } from './stylizerutilities.js';
import { logdebug, logwarn } from '../verbosity.js';

// ==================== DIRECTIVE PARSING ====================

export function parseDirectives(str) {
  if (!str) return [];
  return str.split(';').map(s => s.trim()).filter(Boolean).map(part => {
    let breakpoint = null;
    if (part.startsWith('@')) {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 1) {
        breakpoint = part.substring(1, colonIdx);
        part = part.substring(colonIdx + 1).trim();
      }
    }
    const colonIdx2 = part.indexOf(':');
    const type = colonIdx2 > -1 ? part.substring(0, colonIdx2).trim() : part.trim();
    const rest = colonIdx2 > -1 ? part.substring(colonIdx2 + 1).trim() : '';
    const params = rest ? rest.split(',').map(p => p.trim()) : [];

    const directive = { type };
    if (breakpoint) directive.breakpoint = breakpoint;

    switch (type) {
      case 'left-of':
      case 'right-of':
      case 'above':
      case 'below':
        directive.target = params[0];
        if (params[1]) directive.offset = parseFloat(params[1]);
        if (params[2]) directive.unit = params[2];
        break;
      case 'between': {
        const targets = params[0].split('and').map(s => s.trim());
        directive.target1 = targets[0];
        directive.target2 = targets[1];
        if (params[1]) directive.offset = parseFloat(params[1]);
        if (params[2]) directive.unit = params[2];
        break;
      }
      case 'align':
      case 'justify':
      case 'immerse':
        directive.value = params[0];
        if (params[1]) directive.container = params[1];
        break;
      case 'position':
        directive.value = params[0];
        break;
      case 'anchor':
        directive.targetId = params[0];
        directive.myCorner = params[1] || 'top-left';
        directive.targetCorner = params[2] || 'top-left';
        break;
      case 'z-stack':
        directive.mode = params[0];
        if (params.length > 1) directive.targetId = params[1];
        break;
      case 'overlap':
      case 'overflow':
        directive.mode = params[0];
        break;
      case 'respect-margins':
        directive.value = params[0] === 'true';
        break;
      case 'overflow-margins':
        directive.mode = params[0] || 'include';
        break;
      case 'screen-corner':
        directive.corner = params[0];
        break;
      default:
        directive.raw = { property: type, value: rest };
        break;
    }
    return directive;
  });
}

// ==================== STATIC POSITION & CORNER LOOKUP TABLES ====================
// POSITION_MAP and CORNER_MAP are now local to generateCSSFromDirectives.

export function generateCSSFromDirectives(elementId, directives, breakpointMap = {}) {
  const POSITION_MAP = {
    'top': { position: 'relative', top: '0' },
    'bottom': { position: 'relative', bottom: '0' },
    'left': { position: 'relative', left: '0' },
    'right': { position: 'relative', right: '0' },
    'middle': { position: 'relative', top: '50%', transform: 'translateY(-50%)' },
    'center': { maxWidth: '960px', margin: '0 auto' },
    'top-left': { position: 'relative', top: '0', left: '0' },
    'top-right': { position: 'relative', top: '0', right: '0' },
    'bottom-left': { position: 'relative', bottom: '0', left: '0' },
    'bottom-right': { position: 'relative', bottom: '0', right: '0' },
    'screen-top-left': { position: 'fixed', top: '0', left: '0' },
    'screen-top-right': { position: 'fixed', top: '0', right: '0' },
    'screen-bottom-left': { position: 'fixed', bottom: '0', left: '0' },
    'screen-bottom-right': { position: 'fixed', bottom: '0', right: '0' },
    'screen-center': { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  };

  const CORNER_MAP = {
    'top-left': { position: 'fixed', top: '0', left: '0' },
    'top-right': { position: 'fixed', top: '0', right: '0' },
    'bottom-left': { position: 'fixed', bottom: '0', left: '0' },
    'bottom-right': { position: 'fixed', bottom: '0', right: '0' }
  };

  const inlineStyles = {};

  const applyDirective = (d) => {
    const offsetStr = `${d.offset || 0}${d.unit || 'px'}`;
    switch (d.type) {
      case 'left-of': inlineStyles.order = -1; inlineStyles.marginRight = offsetStr; break;
      case 'right-of': inlineStyles.order = 1; inlineStyles.marginLeft = offsetStr; break;
      case 'above': inlineStyles.marginBottom = offsetStr; break;
      case 'below': inlineStyles.marginTop = offsetStr; break;
      case 'align': inlineStyles.display = 'flex'; inlineStyles.justifyContent = d.value; break;
      case 'justify': inlineStyles.textAlign = d.value.replace('text-', ''); break;
      case 'immerse': inlineStyles.display = 'flex'; inlineStyles.alignItems = 'center'; inlineStyles.justifyContent = 'center'; break;
      case 'position': if (POSITION_MAP[d.value]) Object.assign(inlineStyles, POSITION_MAP[d.value]); break;
      case 'anchor': inlineStyles.position = 'absolute'; inlineStyles._anchor = { targetId: d.targetId, myCorner: d.myCorner, targetCorner: d.targetCorner }; break;
      case 'z-stack':
        inlineStyles.zIndex = 'auto';
        if (d.mode === 'topmost') inlineStyles._zStackTopmost = true;
        else if (d.mode === 'bottommost') inlineStyles._zStackBottommost = true;
        else if (d.mode === 'above' && d.targetId) inlineStyles._zStackAbove = d.targetId;
        else if (d.mode === 'below' && d.targetId) inlineStyles._zStackBelow = d.targetId;
        break;
      case 'overlap': if (d.mode === 'prevent') { inlineStyles.position = 'static'; inlineStyles.clear = 'both'; } break;
      case 'overflow':
        inlineStyles.overflow = d.mode;
        if (d.mode === 'auto' || d.mode === 'scroll') { inlineStyles.overflowWrap = 'break-word'; inlineStyles.wordWrap = 'break-word'; }
        break;
      case 'respect-margins': if (d.value && !inlineStyles.margin) inlineStyles.margin = '0.5rem'; break;
      case 'overflow-margins': if (d.mode === 'include') inlineStyles.overflow = 'visible'; break;
      case 'screen-corner': if (CORNER_MAP[d.corner]) Object.assign(inlineStyles, CORNER_MAP[d.corner]); break;
      default:
        if (d.raw) inlineStyles[kebabToCamel(d.raw.property)] = d.raw.value;
        break;
    }
  };

  directives.filter(d => !d.breakpoint).forEach(applyDirective);
  return { inline: inlineStyles };
}

// ==================== LAYOUT OPTIMIZATION ENGINE ====================

export function getCandidateElements(doc) {
  return applyStep([doc.body], { axis: 'descendant' }).filter(el => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
    if (tag === 'div' && el.style && (el.style.width || el.style.maxWidth)) return true;
    return false;
  });
}

const isInsideScrollWrapper = (el) => {
  let parent = el.parentElement;
  while (parent) {
    const s = parent.style || {};
    if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true;
    parent = parent.parentElement;
  }
  return false;
};

export function checkOverflowDoc(doc, viewportWidth, containerWidths) {
  const violations = [];
  const propertyMap = buildLayoutPropertyMap(doc.body, viewportWidth);
  const candidates = getCandidateElements(doc);

  for (const el of candidates) {
    if (isInsideScrollWrapper(el)) continue;
    const props = propertyMap.get(el);
    if (!props) continue;
    try {
      const size = computeIntrinsicSize(el, propertyMap, props);
      if (size.width > props.availableWidth) violations.push(el);
    } catch (err) {
      logwarn('[checkOverflowDoc] Failed to compute intrinsic size:', el.tagName, err);
    }
  }
  return violations;
}

export function correctOverflowDoc(doc, overflowElements) {
  const rules = [];
  for (const el of overflowElements) {
    if (isInsideScrollWrapper(el)) continue;
    const wrapper = doc.createElement('div');
    wrapper.style.width = '80%';
    wrapper.style.overflow = 'scroll';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    rules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { wrapped: 'true' } });
  }
  return rules;
}

export function checkSpacingDoc(doc, minGap) {
  const violations = [];
  const walk = (parent) => {
    const children = getAllDescendants(parent).filter(el => {
      const d = el.style.display || 'inline';
      return d === 'block' || d === 'flex' || d === 'grid' ||
        ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].includes(el.tagName.toLowerCase());
    });
    for (let i = 0; i < children.length - 1; i++) {
      const a = children[i], b = children[i+1];
      const gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
      if (gap < minGap) {
        violations.push({ elementA: a.tagName + (a.id ? '#'+a.id : ''), elementB: b.tagName + (b.id ? '#'+b.id : ''), gap });
      }
      walk(b);
    }
  };
  walk(doc.body);
  return violations;
}

export function correctSpacingDoc(doc, minGap) {
  const rules = [];
  checkSpacingDoc(doc, minGap).forEach(({ elementA, elementB }) => {
    const el = doc.getElementById(elementA.replace(/^[^#]*#/, '')) || doc.querySelector(elementA);
    if (el) {
      el.style.marginBottom = `${minGap}px`;
      rules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { marginBottom: `${minGap}px` } });
    }
  });
  return rules;
}

export function checkOverlapDoc(doc) {
  const violations = [];
  const positioned = Array.from(doc.getElementsByTagName('*')).filter(el => el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'));
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i], b = positioned[j];
      const aTop = parseFloat(a.style.top) || 0, aLeft = parseFloat(a.style.left) || 0, aW = parseFloat(a.style.width) || 0, aH = parseFloat(a.style.height) || 0;
      const bTop = parseFloat(b.style.top) || 0, bLeft = parseFloat(b.style.left) || 0, bW = parseFloat(b.style.width) || 0, bH = parseFloat(b.style.height) || 0;
      if (aW && aH && bW && bH && aLeft < bLeft + bW && aLeft + aW > bLeft && aTop < bTop + bH && aTop + aH > bTop) {
        violations.push({ elementA: a.tagName + (a.id ? '#'+a.id : ''), elementB: b.tagName + (b.id ? '#'+b.id : '') });
      }
    }
  }
  return violations;
}

export function correctOverlapDoc(doc) {
  const rules = [];
  checkOverlapDoc(doc).forEach(({ elementB }) => {
    const el = doc.getElementById(elementB.replace(/^[^#]*#/, '')) || doc.querySelector(elementB);
    if (el) {
      el.style.position = 'relative';
      rules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { position: 'relative' } });
    }
  });
  return rules;
}

export function checkScrollabilityDoc(doc) {
  return Array.from(doc.getElementsByTagName('*')).filter(el => {
    const s = el.style;
    return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
  }).map(el => ({ element: el.tagName + (el.id ? '#'+el.id : '') }));
}

export function correctScrollabilityDoc(doc) {
  const rules = [];
  checkScrollabilityDoc(doc).forEach(({ element }) => {
    const el = doc.getElementById(element.replace(/^[^#]*#/, '')) || doc.querySelector(element);
    if (el) {
      el.style.touchAction = 'pan-y';
      rules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { touchAction: 'pan-y' } });
    }
  });
  return rules;
}

export function checkControlledOverlayDoc(doc) {
  return Array.from(doc.getElementsByTagName('*')).filter(el => {
    const s = el.style;
    return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
  }).map(el => ({ element: el.tagName + (el.id ? '#'+el.id : '') }));
}

export function correctControlledOverlayDoc(doc) {
  const rules = [];
  checkControlledOverlayDoc(doc).forEach(({ element }) => {
    const el = doc.getElementById(element.replace(/^[^#]*#/, '')) || doc.querySelector(element);
    if (el) {
      el.style.zIndex = '10';
      rules.push({ selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { zIndex: '10' } });
    }
  });
  return rules;
}

export function applyDirectiveToSelector(html, selector, directiveString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const directives = parseDirectives(directiveString);
  const elements = doc.querySelectorAll(selector);

  elements.forEach((el, idx) => {
    const id = el.id || `_gen_id_${idx}`;
    const { inline } = generateCSSFromDirectives(id, directives);
    Object.assign(el.style, inline);
  });

  return doc.body.innerHTML;
}

export function optimizeLayoutHTML(html, goals, maxIterations = 5, options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const allRules = [];
  const { viewportWidth = 1024, containerWidths = {} } = options;

  for (let iter = 0; iter < maxIterations; iter++) {
    let anyCorrection = false;
    for (const goal of goals) {
      if (goal.type === 'overflow') continue;
      let violations = [];
      let correctFn = null;

      if (goal.type === 'minVerticalGap') {
        const minGap = goal.options?.minGap ?? 12;
        violations = checkSpacingDoc(doc, minGap);
        if (violations.length) correctFn = () => correctSpacingDoc(doc, minGap);
      } else if (goal.type === 'preventOverlap') {
        violations = checkOverlapDoc(doc);
        if (violations.length) correctFn = () => correctOverlapDoc(doc);
      } else if (goal.type === 'scrollability') {
        violations = checkScrollabilityDoc(doc);
        if (violations.length) correctFn = () => correctScrollabilityDoc(doc);
      } else if (goal.type === 'controlledOverlay') {
        violations = checkControlledOverlayDoc(doc);
        if (violations.length) correctFn = () => correctControlledOverlayDoc(doc);
      }

      if (correctFn && violations.length) {
        allRules.push(...correctFn());
        anyCorrection = true;
      }
    }
    if (!anyCorrection) break;
  }

  const overflowViolations = checkOverflowDoc(doc, viewportWidth, containerWidths);
  if (overflowViolations.length) {
    allRules.push(...correctOverflowDoc(doc, overflowViolations));
  }

  return { html: doc.body.innerHTML, rules: allRules };
}
