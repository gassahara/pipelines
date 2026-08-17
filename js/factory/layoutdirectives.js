import {
  rewritestyleattrs,
  applyStep,
  getAllDescendants,
  buildLayoutPropertyMap,
  computeIntrinsicSize,
  kebabToCamel,
  getPropsFromMap
} from './stylizerutilities.js';
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';

function createLayoutConstants() {
  return Object.freeze({
    POSITION_MAP: Object.freeze({
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
    }),
    CORNER_MAP: Object.freeze({
      'top-left': { position: 'fixed', top: '0', left: '0' },
      'top-right': { position: 'fixed', top: '0', right: '0' },
      'bottom-left': { position: 'fixed', bottom: '0', left: '0' },
      'bottom-right': { position: 'fixed', bottom: '0', right: '0' }
    })
  });
}

function createLogger() {
  var constants = createVerbosityConstants();
  var fns = createVerbosityFunctions(constants);
  var state = Object.freeze({ level: constants.DEBUG });
  return { fns: fns, state: state };
}

function parseDirectives(str) {
  if (!str) return [];
  return str.split(';').map(function(s) { return s.trim(); }).filter(Boolean).map(function(part) {
    var breakpoint = null;
    if (part.indexOf('@') === 0) {
      var colonIdx = part.indexOf(':');
      if (colonIdx > 1) {
        breakpoint = part.substring(1, colonIdx);
        part = part.substring(colonIdx + 1).trim();
      }
    }
    var colonIdx2 = part.indexOf(':');
    var type = colonIdx2 > -1 ? part.substring(0, colonIdx2).trim() : part.trim();
    var rest = colonIdx2 > -1 ? part.substring(colonIdx2 + 1).trim() : '';
    var params = rest ? rest.split(',').map(function(p) { return p.trim(); }) : [];

    var directive = { type: type };
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
        var targets = params[0].split('and').map(function(s) { return s.trim(); });
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

function generateCSSFromDirectives(elementId, directives, breakpointMap) {
  if (breakpointMap === undefined) breakpointMap = {};
  var constants = createLayoutConstants();
  var POSITION_MAP = constants.POSITION_MAP;
  var CORNER_MAP = constants.CORNER_MAP;

  var inlineStyles = directives
    .filter(function(d) { return !d.breakpoint; })
    .reduce(function(acc, d) {
      var offsetStr = (d.offset || 0) + (d.unit || 'px');
      switch (d.type) {
        case 'left-of':
          acc.order = -1;
          acc.marginRight = offsetStr;
          break;
        case 'right-of':
          acc.order = 1;
          acc.marginLeft = offsetStr;
          break;
        case 'above':
          acc.marginBottom = offsetStr;
          break;
        case 'below':
          acc.marginTop = offsetStr;
          break;
        case 'align':
          acc.display = 'flex';
          acc.justifyContent = d.value;
          break;
        case 'justify':
          acc.textAlign = d.value.replace('text-', '');
          break;
        case 'immerse':
          acc.display = 'flex';
          acc.alignItems = 'center';
          acc.justifyContent = 'center';
          break;
        case 'position':
          if (POSITION_MAP[d.value]) {
            for (var k in POSITION_MAP[d.value]) {
              if (Object.prototype.hasOwnProperty.call(POSITION_MAP[d.value], k)) acc[k] = POSITION_MAP[d.value][k];
            }
          }
          break;
        case 'anchor':
          acc.position = 'absolute';
          acc._anchor = { targetId: d.targetId, myCorner: d.myCorner, targetCorner: d.targetCorner };
          break;
        case 'z-stack':
          acc.zIndex = 'auto';
          if (d.mode === 'topmost') acc._zStackTopmost = true;
          else if (d.mode === 'bottommost') acc._zStackBottommost = true;
          else if (d.mode === 'above' && d.targetId) acc._zStackAbove = d.targetId;
          else if (d.mode === 'below' && d.targetId) acc._zStackBelow = d.targetId;
          break;
        case 'overlap':
          if (d.mode === 'prevent') {
            acc.position = 'static';
            acc.clear = 'both';
          }
          break;
        case 'overflow':
          acc.overflow = d.mode;
          if (d.mode === 'auto' || d.mode === 'scroll') {
            acc.overflowWrap = 'break-word';
            acc.wordWrap = 'break-word';
          }
          break;
        case 'respect-margins':
          if (d.value && !acc.margin) acc.margin = '0.5rem';
          break;
        case 'overflow-margins':
          if (d.mode === 'include') acc.overflow = 'visible';
          break;
        case 'screen-corner':
          if (CORNER_MAP[d.corner]) {
            for (var k2 in CORNER_MAP[d.corner]) {
              if (Object.prototype.hasOwnProperty.call(CORNER_MAP[d.corner], k2)) acc[k2] = CORNER_MAP[d.corner][k2];
            }
          }
          break;
        default:
          if (d.raw) acc[kebabToCamel(d.raw.property)] = d.raw.value;
          break;
      }
      return acc;
    }, {});

  return { inline: inlineStyles };
}

function getCandidateElements(doc) {
  return applyStep([doc.body], { axis: 'descendant' }).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
    if (tag === 'div' && el.style && (el.style.width || el.style.maxWidth)) return true;
    return false;
  });
}

function checkOverflowDoc(doc, viewportWidth, containerWidths) {
  var logger = createLogger();
  var fns = logger.fns;
  var state = logger.state;

  function isInsideScrollWrapper(el) {
    var parent = el.parentElement;
    while (parent) {
      var s = parent.style || {};
      if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true;
      parent = parent.parentElement;
    }
    return false;
  }

  var propertyMap = buildLayoutPropertyMap(doc.body, viewportWidth);
  return getCandidateElements(doc)
    .filter(function(el) { return !isInsideScrollWrapper(el); })
    .filter(function(el) {
      var props = getPropsFromMap(propertyMap, el);
      if (!props) return false;
      try {
        var size = computeIntrinsicSize(el, propertyMap, props);
        return size.width > props.availableWidth;
      } catch (err) {
        fns.logwarn(state, '[checkOverflowDoc] Failed to compute intrinsic size:', el.tagName, err);
        return false;
      }
    });
}

function correctOverflowDoc(doc, overflowElements) {
  function isInsideScrollWrapper(el) {
    var parent = el.parentElement;
    while (parent) {
      var s = parent.style || {};
      if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true;
      parent = parent.parentElement;
    }
    return false;
  }

  return overflowElements.filter(function(el) { return !isInsideScrollWrapper(el); }).map(function(el) {
    var wrapper = doc.createElement('div');
    wrapper.style.width = '80%';
    wrapper.style.overflow = 'scroll';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    return { selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { wrapped: 'true' } };
  });
}

function checkSpacingDoc(doc, minGap) {
  if (minGap === undefined) minGap = 12;
  var children = getAllDescendants(doc.body).filter(function(el) {
    var d = el.style.display || 'inline';
    return d === 'block' || d === 'flex' || d === 'grid' ||
      ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].indexOf(el.tagName.toLowerCase()) !== -1;
  });

  return children.slice(0, -1).reduce(function(violations, a, i) {
    var b = children[i + 1];
    var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
    if (gap < minGap) {
      violations.push({ elementA: a.tagName + (a.id ? '#' + a.id : ''), elementB: b.tagName + (b.id ? '#' + b.id : ''), gap: gap });
    }
    return violations;
  }, []);
}

function correctSpacingDoc(doc, minGap) {
  if (minGap === undefined) minGap = 12;
  return checkSpacingDoc(doc, minGap).map(function(violation) {
    var el = doc.getElementById(violation.elementA.replace(/^[^#]*#/, '')) || doc.querySelector(violation.elementA);
    if (el) {
      el.style.marginBottom = minGap + 'px';
      return { selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { marginBottom: minGap + 'px' } };
    }
    return null;
  }).filter(Boolean);
}

function checkOverlapDoc(doc) {
  var positioned = Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
    return el.style && (el.style.position === 'absolute' || el.style.position === 'fixed');
  });

  var violations = [];
  for (var i = 0; i < positioned.length; i++) {
    for (var j = i + 1; j < positioned.length; j++) {
      var a = positioned[i], b = positioned[j];
      var aTop = parseFloat(a.style.top) || 0, aLeft = parseFloat(a.style.left) || 0, aW = parseFloat(a.style.width) || 0, aH = parseFloat(a.style.height) || 0;
      var bTop = parseFloat(b.style.top) || 0, bLeft = parseFloat(b.style.left) || 0, bW = parseFloat(b.style.width) || 0, bH = parseFloat(b.style.height) || 0;
      if (aW && aH && bW && bH && aLeft < bLeft + bW && aLeft + aW > bLeft && aTop < bTop + bH && aTop + aH > bTop) {
        violations.push({ elementA: a.tagName + (a.id ? '#' + a.id : ''), elementB: b.tagName + (b.id ? '#' + b.id : '') });
      }
    }
  }
  return violations;
}

function correctOverlapDoc(doc) {
  return checkOverlapDoc(doc).map(function(violation) {
    var el = doc.getElementById(violation.elementB.replace(/^[^#]*#/, '')) || doc.querySelector(violation.elementB);
    if (el) {
      el.style.position = 'relative';
      return { selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { position: 'relative' } };
    }
    return null;
  }).filter(Boolean);
}

function checkScrollabilityDoc(doc) {
  return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : '') }; });
}

function correctScrollabilityDoc(doc) {
  return checkScrollabilityDoc(doc).map(function(violation) {
    var el = doc.getElementById(violation.element.replace(/^[^#]*#/, '')) || doc.querySelector(violation.element);
    if (el) {
      el.style.touchAction = 'pan-y';
      return { selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { touchAction: 'pan-y' } };
    }
    return null;
  }).filter(Boolean);
}

function checkControlledOverlayDoc(doc) {
  return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : '') }; });
}

function correctControlledOverlayDoc(doc) {
  return checkControlledOverlayDoc(doc).map(function(violation) {
    var el = doc.getElementById(violation.element.replace(/^[^#]*#/, '')) || doc.querySelector(violation.element);
    if (el) {
      el.style.zIndex = '10';
      return { selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() }, styles: { zIndex: '10' } };
    }
    return null;
  }).filter(Boolean);
}

function applyDirectiveToSelector(html, selector, directiveString) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var directives = parseDirectives(directiveString);
  var elements = Array.prototype.slice.call(doc.querySelectorAll(selector));

  elements.forEach(function(el, idx) {
    var id = el.id || '_gen_id_' + idx;
    var result = generateCSSFromDirectives(id, directives);
    for (var prop in result.inline) {
      if (Object.prototype.hasOwnProperty.call(result.inline, prop)) el.style[prop] = result.inline[prop];
    }
  });

  return doc.body.innerHTML;
}

function optimizeLayoutHTML(html, goals, maxIterations, options) {
  if (maxIterations === undefined) maxIterations = 5;
  if (options === undefined) options = {};
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var allRules = [];
  var viewportWidth = options.viewportWidth !== undefined ? options.viewportWidth : 1024;
  var containerWidths = options.containerWidths !== undefined ? options.containerWidths : {};

  for (var iter = 0; iter < maxIterations; iter++) {
    var anyCorrection = false;
    goals.forEach(function(goal) {
      if (goal.type === 'overflow') return;
      var violations = [];
      var correctFn = null;

      if (goal.type === 'minVerticalGap') {
        var minGap = goal.options && goal.options.minGap != null ? goal.options.minGap : 12;
        violations = checkSpacingDoc(doc, minGap);
        if (violations.length) correctFn = function() { return correctSpacingDoc(doc, minGap); };
      } else if (goal.type === 'preventOverlap') {
        violations = checkOverlapDoc(doc);
        if (violations.length) correctFn = function() { return correctOverlapDoc(doc); };
      } else if (goal.type === 'scrollability') {
        violations = checkScrollabilityDoc(doc);
        if (violations.length) correctFn = function() { return correctScrollabilityDoc(doc); };
      } else if (goal.type === 'controlledOverlay') {
        violations = checkControlledOverlayDoc(doc);
        if (violations.length) correctFn = function() { return correctControlledOverlayDoc(doc); };
      }

      if (correctFn && violations.length) {
        allRules = allRules.concat(correctFn());
        anyCorrection = true;
      }
    });
    if (!anyCorrection) break;
  }

  var overflowViolations = checkOverflowDoc(doc, viewportWidth, containerWidths);
  if (overflowViolations.length) {
    allRules = allRules.concat(correctOverflowDoc(doc, overflowViolations));
  }

  return { html: doc.body.innerHTML, rules: allRules };
}

export {
  createLayoutConstants,
  parseDirectives,
  generateCSSFromDirectives,
  getCandidateElements,
  checkOverflowDoc,
  correctOverflowDoc,
  checkSpacingDoc,
  correctSpacingDoc,
  checkOverlapDoc,
  correctOverlapDoc,
  checkScrollabilityDoc,
  correctScrollabilityDoc,
  checkControlledOverlayDoc,
  correctControlledOverlayDoc,
  applyDirectiveToSelector,
    optimizeLayoutHTML,
        createLogger,
};
