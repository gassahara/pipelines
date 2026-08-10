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
                directive.params = params;
                break;
        }

        return directive;
    });
}

export function generateCSSFromDirectives(elementId, directives, breakpointMap = {}) {
    let css = '';
    const inlineStyles = {};

    const normal = directives.filter(d => !d.breakpoint);
    const responsive = directives.filter(d => d.breakpoint);

    const applyDirective = (d) => {
        switch (d.type) {
            case 'left-of':
                css += `#${elementId} { order: -1; margin-right: ${d.offset||0}${d.unit||'px'}; }\n`;
                break;
            case 'right-of':
                css += `#${elementId} { order: 1; margin-left: ${d.offset||0}${d.unit||'px'}; }\n`;
                break;
            case 'above':
                css += `#${elementId} { margin-bottom: ${d.offset||0}${d.unit||'px'}; }\n`;
                break;
            case 'below':
                css += `#${elementId} { margin-top: ${d.offset||0}${d.unit||'px'}; }\n`;
                break;
            case 'between':
                css += `#${elementId} { order: 0; }\n`;
                css += `#${d.target1} { order: -1; }\n`;
                css += `#${d.target2} { order: 1; }\n`;
                break;
            case 'align':
                css += `#${elementId} { display:flex; justify-content:${d.value}; }\n`;
                break;
            case 'justify':
                css += `#${elementId} { text-align:${d.value.replace('text-','')}; }\n`;
                break;
            case 'immerse':
                css += `#${elementId} { display:flex; align-items:center; justify-content:center; }\n`;
                css += `#${elementId} > * { width:fit-content; margin:auto; }\n`;
                break;
            case 'position':
                switch (d.value) {
                    case 'top': Object.assign(inlineStyles, { position: 'relative', top: '0' }); break;
                    case 'bottom': Object.assign(inlineStyles, { position: 'relative', bottom: '0' }); break;
                    case 'left': Object.assign(inlineStyles, { position: 'relative', left: '0' }); break;
                    case 'right': Object.assign(inlineStyles, { position: 'relative', right: '0' }); break;
                    case 'middle': Object.assign(inlineStyles, { position: 'relative', top: '50%', transform: 'translateY(-50%)' }); break;
                    case 'center': Object.assign(inlineStyles, { position: 'relative', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }); break;
                    case 'top-left': Object.assign(inlineStyles, { position: 'relative', top: '0', left: '0' }); break;
                    case 'top-right': Object.assign(inlineStyles, { position: 'relative', top: '0', right: '0' }); break;
                    case 'bottom-left': Object.assign(inlineStyles, { position: 'relative', bottom: '0', left: '0' }); break;
                    case 'bottom-right': Object.assign(inlineStyles, { position: 'relative', bottom: '0', right: '0' }); break;
                    case 'screen-top-left': Object.assign(inlineStyles, { position: 'fixed', top: '0', left: '0' }); break;
                    case 'screen-top-right': Object.assign(inlineStyles, { position: 'fixed', top: '0', right: '0' }); break;
                    case 'screen-bottom-left': Object.assign(inlineStyles, { position: 'fixed', bottom: '0', left: '0' }); break;
                    case 'screen-bottom-right': Object.assign(inlineStyles, { position: 'fixed', bottom: '0', right: '0' }); break;
                    case 'screen-center': Object.assign(inlineStyles, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }); break;
                }
                break;
            case 'anchor':
                Object.assign(inlineStyles, { position: 'absolute' });
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
                    Object.assign(inlineStyles, { position: 'static', clear: 'both' });
                }
                break;
            case 'overflow':
                inlineStyles.overflow = d.mode;
                break;
            case 'respect-margins':
                if (d.value && !inlineStyles.margin) inlineStyles.margin = '0.5rem';
                break;
            case 'overflow-margins':
                if (d.mode === 'include') {
                    Object.assign(inlineStyles, { overflow: 'visible' });
                }
                break;
            case 'screen-corner':
                switch (d.corner) {
                    case 'top-left': Object.assign(inlineStyles, { position: 'fixed', top: '0', left: '0' }); break;
                    case 'top-right': Object.assign(inlineStyles, { position: 'fixed', top: '0', right: '0' }); break;
                    case 'bottom-left': Object.assign(inlineStyles, { position: 'fixed', bottom: '0', left: '0' }); break;
                    case 'bottom-right': Object.assign(inlineStyles, { position: 'fixed', bottom: '0', right: '0' }); break;
                }
                break;
        }
    };

    normal.forEach(applyDirective);

    const bpGroups = {};
    responsive.forEach(d => {
        const bp = d.breakpoint;
        if (!bpGroups[bp]) bpGroups[bp] = [];
        bpGroups[bp].push(d);
    });

    for (const [bp, dirs] of Object.entries(bpGroups)) {
        const px = breakpointMap[bp];
        if (px) {
            css += `@media (max-width: ${px}px) {\n`;
            dirs.forEach(applyDirective);
            css += `}\n`;
        }
    }

    return { inline: inlineStyles, css };
}

// ==================== LAYOUT OPTIMIZATION ENGINE ====================

/**
 * @param {string} html
 * @param {Array} goals
 * @param {number} [maxIterations=5]
 * @returns {string}
 */
export function optimizeLayoutHTML(html, goals, maxIterations = 5) {
    const parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');
    for (let iter = 0; iter < maxIterations; iter++) {
        let anyCorrection = false;
        for (const goal of goals) {
            switch (goal.type) {
                case 'minVerticalGap': {
                    const minGap = goal.options?.minGap ?? 12;
                    const violations = checkSpacingDoc(doc, minGap);
                    if (violations.length) {
                        correctSpacing(doc, minGap);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'preventOverlap': {
                    const violations = checkOverlapDoc(doc);
                    if (violations.length) {
                        correctOverlap(doc);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'overflow': {
                    const violations = checkOverflowDoc(doc);
                    if (violations.length) {
                        correctOverflow(doc);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'scrollability': {
                    const violations = checkScrollabilityDoc(doc);
                    if (violations.length) {
                        correctScrollability(doc);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'controlledOverlay': {
                    const violations = checkControlledOverlayDoc(doc);
                    if (violations.length) {
                        correctControlledOverlay(doc);
                        anyCorrection = true;
                    }
                    break;
                }
            }
        }
        if (!anyCorrection) break;
    }
    return doc.body.innerHTML;
}

function checkSpacingDoc(doc, minGap) {
    const violations = [];
    const walk = (parent) => {
        const children = Array.from(parent.children).filter(el => {
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

function correctSpacing(doc, minGap) {
    const walk = (parent) => {
        const children = Array.from(parent.children).filter(el => {
            const display = el.style.display || 'inline';
            return display === 'block' || display === 'flex' || display === 'grid' ||
                   ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].includes(el.tagName.toLowerCase());
        });
        for (let i = 0; i < children.length - 1; i++) {
            const a = children[i], b = children[i + 1];
            const mb = parseFloat(a.style.marginBottom) || 0;
            const mt = parseFloat(b.style.marginTop) || 0;
            if (mb + mt < minGap) {
                b.style.marginTop = (minGap - mb) + 'px';
            }
        }
        for (const child of children) {
            walk(child);
        }
    };
    walk(doc.body);
}

function checkOverlapDoc(doc) {
    const violations = [];
    const positioned = Array.from(doc.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"]'));
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

function correctOverlap(doc) {
    const positioned = Array.from(doc.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"]'));
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
                        b.style.top = (bTop + overlapY + 2) + 'px';
                    }
                }
            }
        }
    }
}

function checkOverflowDoc(doc) {
    const violations = [];
    const walk = (el) => {
        const style = el.style;
        const width = parseFloat(style.width) || 0;
        const height = parseFloat(style.height) || 0;
        if (width || height) {
            const overflow = style.overflow || style.overflowX || style.overflowY;
            if (!overflow || overflow === 'visible') {
                let contentExceeds = false;
                for (const child of el.children) {
                    const cw = parseFloat(child.style.width) || 0;
                    const ch = parseFloat(child.style.height) || 0;
                    if ((width && cw > width) || (height && ch > height)) {
                        contentExceeds = true;
                        break;
                    }
                }
                if (contentExceeds) violations.push(el);
            }
        }
        for (const child of el.children) walk(child);
    };
    walk(doc.body);
    return violations;
}

function correctOverflow(doc) {
    const walk = (el) => {
        const width = parseFloat(el.style.width) || 0;
        const height = parseFloat(el.style.height) || 0;
        if (width || height) {
            const overflow = el.style.overflow || '';
            if (!overflow || overflow === 'visible') {
                let shouldSet = false;
                for (const child of el.children) {
                    const cw = parseFloat(child.style.width) || 0;
                    const ch = parseFloat(child.style.height) || 0;
                    if ((width && cw > width) || (height && ch > height)) {
                        shouldSet = true;
                        break;
                    }
                }
                if (shouldSet) el.style.overflow = 'auto';
            }
        }
        for (const child of el.children) walk(child);
    };
    walk(doc.body);
}

function checkScrollabilityDoc(doc) {
    const violations = [];
    const scrollable = doc.querySelectorAll('[style*="overflow: auto"], [style*="overflow: scroll"]');
    scrollable.forEach(el => {
        if (!el.style.touchAction) violations.push(el);
    });
    return violations;
}

function correctScrollability(doc) {
    const scrollable = doc.querySelectorAll('[style*="overflow: auto"], [style*="overflow: scroll"]');
    scrollable.forEach(el => {
        if (!el.style.touchAction) el.style.touchAction = 'pan-y';
    });
}

function checkControlledOverlayDoc(doc) {
    const violations = [];
    const overlays = doc.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"]');
    overlays.forEach(el => {
        if (!el.style.zIndex) violations.push(el);
    });
    return violations;
}

function correctControlledOverlay(doc) {
    const overlays = doc.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"]');
    overlays.forEach(el => {
        if (!el.style.zIndex) el.style.zIndex = 'auto';
    });
}
