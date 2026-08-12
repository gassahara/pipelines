import { rewritestyleattrs } from './stylizerutilities.js';
import {
    applyStep,
    getAllDescendants,
    buildLayoutPropertyMap,
    computeIntrinsicSize
} from './stylizerutilities.js';

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
                directive.mode = params[0];
                break;
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

export function generateCSSFromDirectives(elementId, directives, breakpointMap = {}) {
    const inlineStyles = {};

    const applyDirective = (d) => {
        switch (d.type) {
            case 'left-of':
                inlineStyles.order = -1;
                inlineStyles.marginRight = (d.offset || 0) + (d.unit || 'px');
                break;
            case 'right-of':
                inlineStyles.order = 1;
                inlineStyles.marginLeft = (d.offset || 0) + (d.unit || 'px');
                break;
            case 'above':
                inlineStyles.marginBottom = (d.offset || 0) + (d.unit || 'px');
                break;
            case 'below':
                inlineStyles.marginTop = (d.offset || 0) + (d.unit || 'px');
                break;
            case 'between':
                // Handled at flex/grid level elsewhere
                break;
            case 'align':
                inlineStyles.display = 'flex';
                inlineStyles.justifyContent = d.value;
                break;
            case 'justify':
                inlineStyles.textAlign = d.value.replace('text-', '');
                break;
            case 'immerse':
                inlineStyles.display = 'flex';
                inlineStyles.alignItems = 'center';
                inlineStyles.justifyContent = 'center';
                break;
            case 'position':
                switch (d.value) {
                    case 'top':
                        inlineStyles.position = 'relative';
                        inlineStyles.top = '0';
                        break;
                    case 'bottom':
                        inlineStyles.position = 'relative';
                        inlineStyles.bottom = '0';
                        break;
                    case 'left':
                        inlineStyles.position = 'relative';
                        inlineStyles.left = '0';
                        break;
                    case 'right':
                        inlineStyles.position = 'relative';
                        inlineStyles.right = '0';
                        break;
                    case 'middle':
                        inlineStyles.position = 'relative';
                        inlineStyles.top = '50%';
                        inlineStyles.transform = 'translateY(-50%)';
                        break;
                    case 'center':
                        inlineStyles.maxWidth = '960px';
                        break;
                    case 'top-left':
                        inlineStyles.position = 'relative';
                        inlineStyles.top = '0';
                        inlineStyles.left = '0';
                        break;
                    case 'top-right':
                        inlineStyles.position = 'relative';
                        inlineStyles.top = '0';
                        inlineStyles.right = '0';
                        break;
                    case 'bottom-left':
                        inlineStyles.position = 'relative';
                        inlineStyles.bottom = '0';
                        inlineStyles.left = '0';
                        break;
                    case 'bottom-right':
                        inlineStyles.position = 'relative';
                        inlineStyles.bottom = '0';
                        inlineStyles.right = '0';
                        break;
                    case 'screen-top-left':
                        inlineStyles.position = 'fixed';
                        inlineStyles.top = '0';
                        inlineStyles.left = '0';
                        break;
                    case 'screen-top-right':
                        inlineStyles.position = 'fixed';
                        inlineStyles.top = '0';
                        inlineStyles.right = '0';
                        break;
                    case 'screen-bottom-left':
                        inlineStyles.position = 'fixed';
                        inlineStyles.bottom = '0';
                        inlineStyles.left = '0';
                        break;
                    case 'screen-bottom-right':
                        inlineStyles.position = 'fixed';
                        inlineStyles.bottom = '0';
                        inlineStyles.right = '0';
                        break;
                    case 'screen-center':
                        inlineStyles.position = 'fixed';
                        inlineStyles.top = '50%';
                        inlineStyles.left = '50%';
                        inlineStyles.transform = 'translate(-50%, -50%)';
                        break;
                }
                break;
            case 'anchor':
                inlineStyles.position = 'absolute';
                inlineStyles._anchor = { targetId: d.targetId, myCorner: d.myCorner, targetCorner: d.targetCorner };
                break;
            case 'z-stack':
                if (d.mode === 'topmost') {
                    inlineStyles.zIndex = 'auto';
                    inlineStyles._zStackTopmost = true;
                } else if (d.mode === 'bottommost') {
                    inlineStyles.zIndex = 'auto';
                    inlineStyles._zStackBottommost = true;
                } else if (d.mode === 'above' && d.targetId) {
                    inlineStyles.zIndex = 'auto';
                    inlineStyles._zStackAbove = d.targetId;
                } else if (d.mode === 'below' && d.targetId) {
                    inlineStyles.zIndex = 'auto';
                    inlineStyles._zStackBelow = d.targetId;
                }
                break;
            case 'overlap':
                if (d.mode === 'prevent') {
                    inlineStyles.position = 'static';
                    inlineStyles.clear = 'both';
                }
                break;
            case 'overflow':
                inlineStyles.overflow = d.mode;
                if (d.mode === 'auto' || d.mode === 'scroll') {
                    inlineStyles.overflowWrap = 'break-word';
                    inlineStyles.wordWrap = 'break-word';
                }
                break;
            case 'respect-margins':
                if (d.value && !inlineStyles.margin) inlineStyles.margin = '0.5rem';
                break;
            case 'overflow-margins':
                if (d.mode === 'include') {
                    inlineStyles.overflow = 'visible';
                }
                break;
            case 'screen-corner':
                switch (d.corner) {
                    case 'top-left': inlineStyles.position = 'fixed'; inlineStyles.top = '0'; inlineStyles.left = '0'; break;
                    case 'top-right': inlineStyles.position = 'fixed'; inlineStyles.top = '0'; inlineStyles.right = '0'; break;
                    case 'bottom-left': inlineStyles.position = 'fixed'; inlineStyles.bottom = '0'; inlineStyles.left = '0'; break;
                    case 'bottom-right': inlineStyles.position = 'fixed'; inlineStyles.bottom = '0'; inlineStyles.right = '0'; break;
                }
                break;
            default:
                if (d.raw) {
                    const prop = d.raw.property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                    inlineStyles[prop] = d.raw.value;
                }
                break;
        }
    };

    const normal = directives.filter(d => !d.breakpoint);
    normal.forEach(applyDirective);

    return { inline: inlineStyles };
}

// ==================== LAYOUT OPTIMIZATION ENGINE ====================

export function optimizeLayoutHTML(html, goals, maxIterations = 5, options = {}) {
    const parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');
    const allRules = [];
    const { viewportWidth = 1024, containerWidths = {} } = options;

    for (let iter = 0; iter < maxIterations; iter++) {
        let anyCorrection = false;
        for (const goal of goals) {
            switch (goal.type) {
                case 'minVerticalGap': {
                    const minGap = goal.options?.minGap ?? 12;
                    const violations = checkSpacingDoc(doc, minGap);
                    if (violations.length) {
                        const newRules = correctSpacingDoc(doc, minGap);
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'preventOverlap': {
                    const violations = checkOverlapDoc(doc);
                    if (violations.length) {
                        const newRules = correctOverlapDoc(doc);
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'overflow': {
                    const violations = checkOverflowDoc(doc, viewportWidth, containerWidths);
                    if (violations.length) {
                        const newRules = correctOverflowDoc(doc);
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'scrollability': {
                    const violations = checkScrollabilityDoc(doc);
                    if (violations.length) {
                        const newRules = correctScrollabilityDoc(doc);
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'controlledOverlay': {
                    const violations = checkControlledOverlayDoc(doc);
                    if (violations.length) {
                        const newRules = correctControlledOverlayDoc(doc);
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
            }
        }
        if (!anyCorrection) break;
    }

    return { html: doc.body.innerHTML, rules: allRules };
}

function checkSpacingDoc(doc, minGap) {
    const violations = [];
    const walk = (parent) => {
        const children = getAllDescendants(parent).filter(el => {
            const display = el.style.display || 'inline';
            return display === 'block' || display === 'flex' || display === 'grid' ||
                   ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].includes(el.tagName.toLowerCase());
        });
        for (let i = 0; i < children.length - 1; i++) {
            const a = children[i], b = children[i + 1];
            const mb = parseFloat(a.style.marginBottom) || 0;
            const mt = parseFloat(b.style.marginTop) || 0;
            if (mb + mt < minGap) violations.push({ a, b, gap: mb + mt });
            walk(b);
        }
    };
    walk(doc.body);
    return violations;
}

function correctSpacingDoc(doc, minGap) {
    const rules = [];
    const walk = (parent) => {
        const children = getAllDescendants(parent).filter(el => {
            const display = el.style.display || 'inline';
            return display === 'block' || display === 'flex' || display === 'grid' ||
                   ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].includes(el.tagName.toLowerCase());
        });
        for (let i = 0; i < children.length - 1; i++) {
            const a = children[i], b = children[i + 1];
            const mb = parseFloat(a.style.marginBottom) || 0;
            const mt = parseFloat(b.style.marginTop) || 0;
            if (mb + mt < minGap) {
                const newMt = minGap - mb;
                const selector = b.id ? { id: b.id } : { tag: b.tagName.toLowerCase() };
                rules.push({ selector, styles: { marginTop: newMt + 'px' } });
                b.style.marginTop = newMt + 'px';
            }
        }
        for (const child of children) {
            walk(child);
        }
    };
    walk(doc.body);
    return rules;
}

function checkOverlapDoc(doc) {
    const violations = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const positioned = allDescendants.filter(el => el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'));
    for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
            const a = positioned[i], b = positioned[j];
            const aTop = parseFloat(a.style.top) || 0;
            const aLeft = parseFloat(a.style.left) || 0;
            const aWidth = parseFloat(a.style.width) || 0;
            const aHeight = parseFloat(a.style.height) || 0;
            const bTop = parseFloat(b.style.top) || 0;
            const bLeft = parseFloat(b.style.left) || 0;
            const bWidth = parseFloat(b.style.width) || 0;
            const bHeight = parseFloat(b.style.height) || 0;
            if (aWidth && aHeight && bWidth && bHeight) {
                if (aLeft < bLeft + bWidth && aLeft + aWidth > bLeft &&
                    aTop < bTop + bHeight && aTop + aHeight > bTop) {
                    violations.push({ elA: a, elB: b });
                }
            }
        }
    }
    return violations;
}

function correctOverlapDoc(doc) {
    const rules = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const positioned = allDescendants.filter(el => el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'));
    for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
            const a = positioned[i], b = positioned[j];
            const aTop = parseFloat(a.style.top) || 0;
            const aLeft = parseFloat(a.style.left) || 0;
            const aWidth = parseFloat(a.style.width) || 0;
            const aHeight = parseFloat(a.style.height) || 0;
            const bTop = parseFloat(b.style.top) || 0;
            const bLeft = parseFloat(b.style.left) || 0;
            const bWidth = parseFloat(b.style.width) || 0;
            const bHeight = parseFloat(b.style.height) || 0;
            if (aWidth && aHeight && bWidth && bHeight) {
                if (aLeft < bLeft + bWidth && aLeft + aWidth > bLeft &&
                    aTop < bTop + bHeight && aTop + aHeight > bTop) {
                    const overlapY = (aTop + aHeight) - bTop;
                    if (overlapY > 0) {
                        const newTop = bTop + overlapY + 2;
                        const selector = b.id ? { id: b.id } : { tag: b.tagName.toLowerCase() };
                        rules.push({ selector, styles: { top: newTop + 'px' } });
                        b.style.top = newTop + 'px';
                    }
                }
            }
        }
    }
    return rules;
}

function checkOverflowDoc(doc, viewportWidth, containerWidths) {
    const violations = [];
    const propertyMap = buildLayoutPropertyMap(doc.body, viewportWidth);
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    for (const el of allDescendants) {
        if (el.parentElement && el.parentElement.getAttribute('data-overflow-wrapper') === 'true') continue;
        const props = propertyMap.get(el);
        if (!props) continue;
        try {
            const size = computeIntrinsicSize(el, propertyMap, props);
            if (size.width > props.availableWidth) {
                violations.push(el);
            }
        } catch (e) {
            // If a required property cannot be resolved, we conservatively flag for wrapping.
            violations.push(el);
        }
    }
    return violations;
}

function correctOverflowDoc(doc) {
    const rules = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    for (const el of allDescendants) {
        if (el.parentElement && el.parentElement.getAttribute('data-overflow-wrapper') === 'true') continue;
        const style = el.style;
        const overflow = style.overflow || '';
        if (!overflow || overflow === 'visible') {
            const wrapper = doc.createElement('div');
            wrapper.setAttribute('data-overflow-wrapper', 'true');
            wrapper.style.overflow = 'auto';
            wrapper.style.maxWidth = '100%';
            el.parentNode.insertBefore(wrapper, el);
            wrapper.appendChild(el);
            const selector = el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() };
            rules.push({ selector, styles: { wrapped: 'true' } });
        }
    }
    return rules;
}

function checkScrollabilityDoc(doc) {
    const violations = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const scrollable = allDescendants.filter(el => el.style && (el.style.overflow === 'auto' || el.style.overflow === 'scroll'));
    scrollable.forEach(el => {
        if (!el.style.touchAction) violations.push(el);
    });
    return violations;
}

function correctScrollabilityDoc(doc) {
    const rules = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const scrollable = allDescendants.filter(el => el.style && (el.style.overflow === 'auto' || el.style.overflow === 'scroll'));
    scrollable.forEach(el => {
        if (!el.style.touchAction) {
            const selector = el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() };
            rules.push({ selector, styles: { touchAction: 'pan-y' } });
            el.style.touchAction = 'pan-y';
        }
    });
    return rules;
}

function checkControlledOverlayDoc(doc) {
    const violations = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const overlays = allDescendants.filter(el => el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'));
    overlays.forEach(el => {
        if (!el.style.zIndex) violations.push(el);
    });
    return violations;
}

function correctControlledOverlayDoc(doc) {
    const rules = [];
    const allDescendants = applyStep([doc.body], { axis: 'descendant' });
    const overlays = allDescendants.filter(el => el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'));
    overlays.forEach(el => {
        if (!el.style.zIndex) {
            const selector = el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() };
            rules.push({ selector, styles: { zIndex: 'auto' } });
            el.style.zIndex = 'auto';
        }
    });
    return rules;
}

// ==================== NEW: Selector-based Directive Application (P21) ====================

export function applyDirectiveToSelector(html, selector, directiveString) {
    const directives = parseDirectives(directiveString);
    const { inline } = generateCSSFromDirectives(null, directives, {});
    const rule = { ...selector, style: inline };
    return rewritestyleattrs(html, [rule]);
}
