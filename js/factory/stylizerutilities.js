import { logdebug, getverbosity, VERBOSITY } from '../verbosity.js';
import {
    contrastRatio, computeForeground, emphasize,
    complementary, analogous, monochromatic, pick,
    getContrastingPalette, getHarmoniousPalette, colorHarmonyScore,
    getOptimalForeground,
    hexToRgb, rgbToHsl, hslToRgb, rgbToHex,
    extractInlineStyle
} from './colorutils.js';

// ==================== RECURSIVE PATH ENGINE (unchanged) ====================

function getAncestors(el, acc) {
    if (!acc) acc = [];
    var p = el.parentNode;
    if (!p) return acc;
    var newAcc = p.nodeType === 1 ? acc.concat(p) : acc;
    return getAncestors(p, newAcc);
}

function getAllDescendants(el) {
    var children = Array.from(el.children || []);
    if (children.length === 0) return [];
    return children.reduce(function(all, child) {
        return all.concat(child, getAllDescendants(child));
    }, []);
}

function getNextSiblings(el, acc) {
    if (!acc) acc = [];
    var sib = el.nextSibling;
    if (!sib) return acc;
    var newAcc = sib.nodeType === 1 ? acc.concat(sib) : acc;
    return getNextSiblings(sib, newAcc);
}

function getPreviousSiblings(el, acc) {
    if (!acc) acc = [];
    var sib = el.previousSibling;
    if (!sib) return acc;
    var newAcc = sib.nodeType === 1 ? acc.concat(sib) : acc;
    return getPreviousSiblings(sib, newAcc);
}

function getDepth(ancestor, descendant) {
    if (!descendant || descendant === ancestor) return 0;
    if (descendant.nodeType !== 1) return getDepth(ancestor, descendant.parentNode);
    return 1 + getDepth(ancestor, descendant.parentNode);
}

function applyStep(nodes, step) {
    return nodes.reduce(function(next, node) {
        var candidates = [];
        switch (step.axis || 'child') {
            case 'self': candidates = [node]; break;
            case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
            case 'ancestor': candidates = getAncestors(node); break;
            case 'child': candidates = Array.from(node.children || []); break;
            case 'descendant': candidates = getAllDescendants(node); break;
            case 'nextSibling': candidates = getNextSiblings(node); break;
            case 'previousSibling': candidates = getPreviousSiblings(node); break;
            default: throw new Error('Unknown axis: ' + step.axis);
        }

        if (step.tag) {
            candidates = candidates.filter(function(el) {
                return el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase();
            });
        }
        if (step.class) {
            candidates = candidates.filter(function(el) {
                return el.classList && el.classList.contains(step.class);
            });
        }
        if (step.id) {
            candidates = candidates.filter(function(el) { return el.id === step.id; });
        }
        if (step.index !== undefined) {
            candidates = candidates.length > step.index ? [candidates[step.index]] : [];
        }
        if (step.depth !== undefined && step.axis === 'descendant') {
            candidates = candidates.filter(function(el) { return getDepth(node, el) === step.depth; });
        }
        if (step.skip !== undefined && (step.axis === 'nextSibling' || step.axis === 'previousSibling')) {
            candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
        }
        if (step.content) {
            var content = step.content;
            var text = content.text || '';
            var mode = content.mode || 'substring';
            var caseSensitive = content.caseSensitive === true;
            var search = caseSensitive ? text : text.toLowerCase();
            candidates = candidates.filter(function(el) {
                var elText = caseSensitive ? el.textContent : el.textContent.toLowerCase();
                if (mode === 'substring') return elText.indexOf(search) !== -1;
                if (mode === 'exact') return elText.trim() === search.trim();
                return false;
            });
        }

        candidates.forEach(function(c) { if (next.indexOf(c) === -1) next.push(c); });
        return next;
    }, []);
}

function resolvePath(root, steps) {
    return steps.reduce(function(currentNodes, step) { return applyStep(currentNodes, step); }, [root]);
}

// ==================== STYLIZER FUNCTION (unchanged) ====================

export function rewritestyleattrs(html, rules) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.body;
    for (var ri = 0; ri < rules.length; ri++) {
        var rule = rules[ri];
        var els = [];
        if (rule.path) {
            els = resolvePath(body, rule.path);
        } else {
            if (rule.id)      els = [doc.getElementById(rule.id)];
            if (rule.tag)     els = doc.getElementsByTagName(rule.tag);
            if (rule.class)   els = doc.getElementsByClassName(rule.class);
            if (rule.name)    els = [doc.getElementByName(rule.name)];
        }

        for (var eli = 0; eli < els.length; eli++) {
            var el = els[eli];
            if (!el) continue;
            var newstyle = rule.style;
            if (newstyle) {
                var newkeys = Object.keys(newstyle);
                for (var ni = 0; ni < newkeys.length; ni++) {
                    try { el.style[newkeys[ni]] = newstyle[newkeys[ni]]; } catch(e) { console.log({e}); }
                }
            }
        }
    }
    return body.innerHTML;
}

// ==================== COLOR SCHEME UTILITY (unchanged) ====================

export function computecolorscheme(pos, tilecols, cellw, cellh, gridcols) {
    var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
    var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
    var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
    var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));
    var sumh = 0, sums = 0, suml = 0, count = 0;
    for (var r = rowstart; r < rowend; r++) {
        for (var c = colstart; c < colend; c++) {
            var idx = r * gridcols + c;
            if (idx < tilecols.length) {
                sumh += tilecols[idx].h;
                sums += tilecols[idx].s;
                suml += tilecols[idx].l;
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
    var borderlight = Math.round((bglight + fglight) / 2);
    return {
        background: 'hsl(' + huecont + ', ' + satcont + '%, ' + bglight + '%)',
        color: 'hsl(' + huecont + ', ' + Math.max(satcont - 10, 10) + '%, ' + fglight + '%)',
        borderColor: 'hsl(' + huecont + ', ' + satcont + '%, ' + borderlight + '%)'
    };
}

// ==================== RESPONSIVE STYLES INJECTION ====================

export function injectResponsiveStyles(html, breakpointRules) {
    if (!breakpointRules || breakpointRules.length === 0) return html;
    let css = '<style data-responsive="true">';
    for (const bp of breakpointRules) {
        const min = bp.minWidth !== undefined ? `(min-width: ${bp.minWidth}px)` : '';
        const max = bp.maxWidth !== undefined ? `(max-width: ${bp.maxWidth}px)` : '';
        const cond = [min, max].filter(Boolean).join(' and ');
        css += `@media ${cond} {\n`;
        for (const rule of bp.rules) {
            let selector;
            if (rule.id) {
                selector = `#${rule.id}`;
            } else if (rule.class) {
                selector = `.${rule.class}`;
            } else if (rule.tag) {
                selector = rule.tag;
            } else {
                selector = '*';
            }
            css += `  ${selector} {\n`;
            for (const [prop, val] of Object.entries(rule.style)) {
                const kebabProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
                css += `    ${kebabProp}: ${val};\n`;
            }
            css += `  }\n`;
        }
        css += `}\n`;
    }
    css += '</style>';

    const lastDivIdx = html.lastIndexOf('</div>');
    if (lastDivIdx !== -1) {
        return html.slice(0, lastDivIdx) + css + html.slice(lastDivIdx);
    }
    return html + css;
}

// ==================== TAG STYLE EXTRACTION (P12) ====================

export function extractAllTagStyles(referenceHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(referenceHTML, 'text/html');
    const refRoot = doc.getElementById('theme-reference');
    if (!refRoot) return {};
    const map = {};

    // 1. Extract base styles from the root element itself (P12)
    const rootStyle = {};
    for (let i = 0; i < refRoot.style.length; i++) {
        const prop = refRoot.style[i];
        rootStyle[prop] = refRoot.style[prop];
    }
    if (Object.keys(rootStyle).length > 0) {
        map['root'] = rootStyle;
    }

    // 2. Extract child styles by tag name
    for (const el of refRoot.children) {
        const tag = el.tagName.toLowerCase();
        const styleObj = {};
        for (let i = 0; i < el.style.length; i++) {
            const prop = el.style[i];
            styleObj[prop] = el.style[prop];
        }
        if (Object.keys(styleObj).length > 0) {
            if (map[tag]) {
                map[tag] = { ...map[tag], ...styleObj };
            } else {
                map[tag] = styleObj;
            }
        }
    }

    return map;
}

// ==================== STYLE CONSOLIDATION ====================

export function consolidateStyles(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const safeProps = new Set([
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'text-align', 'cursor', 'letter-spacing', 'word-spacing'
    ]);
    function walk(el) {
        for (const child of el.children) {
            if (!child.style) continue;
            const toRemove = [];
            for (let i = 0; i < child.style.length; i++) {
                const prop = child.style[i];
                if (safeProps.has(prop) && el.style[prop] === child.style[prop]) {
                    toRemove.push(prop);
                }
            }
            for (const prop of toRemove) child.style.removeProperty(prop);
            walk(child);
        }
    }
    walk(doc.body);
    return doc.body.innerHTML;
}

// ==================== COLOR UTILITIES (internal) ====================

function toHex(color) {
    if (!color) return '#000000';
    if (color.startsWith('rgb')) {
        const match = color.match(/\d+/g);
        if (match && match.length >= 3) {
            return rgbToHex(parseInt(match[0]), parseInt(match[1]), parseInt(match[2]));
        }
        return '#000000';
    }
    return color;
}

// ==================== IMPROVED BACKGROUND EXTRACTION (P5) ====================

function extractBgFromShorthand(el) {
    if (el.style.backgroundColor) return el.style.backgroundColor;
    const bg = el.style.background;
    if (!bg) return null;
    // P5: handle gradients by extracting first hex fallback
    if (bg.includes('gradient')) {
        const gradHex = bg.match(/#[0-9a-fA-F]{3,6}/);
        if (gradHex) return gradHex[0];
        return null;
    }
    const hexMatch = bg.match(/#[0-9a-fA-F]{3,6}/);
    if (hexMatch) return hexMatch[0];
    const rgbMatch = bg.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/);
    if (rgbMatch) return rgbMatch[0];
    return null;
}

// ==================== SAFE STYLE MERGE HELPER (P3) ====================

function mergeAndApplyStyles(el, newStyles) {
    // 1. Get current style attribute string
    const currentStyleAttr = el.getAttribute('style') || '';
    // 2. Parse current styles into an object (kebab-case keys)
    const currentStyles = {};
    if (currentStyleAttr.trim()) {
        currentStyleAttr.split(';').forEach(decl => {
            const trimmed = decl.trim();
            if (!trimmed) return;
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx > -1) {
                const prop = trimmed.slice(0, colonIdx).trim();
                const val = trimmed.slice(colonIdx + 1).trim();
                if (prop) currentStyles[prop] = val;
            }
        });
    }
    // 3. Merge new styles (override existing)
    // Convert camelCase keys to kebab-case for CSS attribute
    const merged = { ...currentStyles };
    Object.keys(newStyles).forEach(camelProp => {
        const kebabProp = camelProp.replace(/([A-Z])/g, '-$1').toLowerCase();
        merged[kebabProp] = newStyles[camelProp];
    });
    // 4. Build CSS string
    const cssString = Object.entries(merged)
        .map(([prop, val]) => `${prop}: ${val}`)
        .join('; ');
    // 5. Set attribute
    el.setAttribute('style', cssString);
}

// ==================== DYNAMIC BOUNDING ESTIMATOR (P1‑V3) ====================

function estimateRecursiveBounds(node) {
    if (node.nodeType === 3) {
        // Text node
        let txt = node.nodeValue.trim();
        if (!txt) return 0;
        let parent = node.parentElement;
        let fSize = 16;
        let isNowrap = false;
        while(parent && parent.style) {
            if(parent.style.fontSize) {
                let rawFs = parent.style.fontSize;
                if (rawFs.includes('rem') || rawFs.includes('em')) {
                    fSize = parseFloat(rawFs) * 16;
                } else if (rawFs.includes('%')) {
                    fSize = (parseFloat(rawFs) / 100) * 16;
                } else {
                    fSize = parseFloat(rawFs);
                }
                break;
            }
            if(parent.style.whiteSpace === 'nowrap') isNowrap = true;
            parent = parent.parentElement;
        }
        let charPx = (fSize || 16) * 0.6;
        if (isNowrap) return txt.length * charPx;
        
        let words = txt.split(/\s+/);
        return Math.max(0, ...words.map(w => w.length)) * charPx;
    }
    if (node.nodeType === 1) {
        if (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg') {
            return parseFloat(node.style.width || node.getAttribute('width') || 24);
        }
        let totalWidth = 0;
        let isFlexRow = node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
        
        for (let child of node.childNodes) {
            let childWidth = estimateRecursiveBounds(child);
            if (isFlexRow) {
                totalWidth += childWidth;
            } else {
                totalWidth = Math.max(totalWidth, childWidth);
            }
        }
        return totalWidth;
    }
    return 0;
}

// ==================== STYLE VERIFICATION (with P26 contrast) ====================

export function verifyContrast(html, minRatio = 4.5) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const corrections = [];

    function getEffectiveBackground(el) {
        let bg = extractBgFromShorthand(el);
        if (bg) return bg;
        let parent = el.parentNode;
        while (parent && parent !== doc) {
            if (parent.style) {
                bg = extractBgFromShorthand(parent);
                if (bg) return bg;
            }
            parent = parent.parentNode;
        }
        return '#ffffff';
    }

    function walk(el) {
        if (el.nodeType === 1 && el.textContent.trim()) {
            const fg = el.style.color;
            const bg = getEffectiveBackground(el);
            if (fg && bg) {
                const fgHex = toHex(fg);
                const bgHex = toHex(bg);
                const ratio = contrastRatio(fgHex, bgHex);
                if (ratio < minRatio) {
                    const newFg = getOptimalForeground(bgHex, minRatio, { scheme: 'complementary' });
                    // Use safe style merge (P3) to apply the new color
                    mergeAndApplyStyles(el, { color: newFg });
                    corrections.push({
                        element: el.tagName + (el.id ? '#' + el.id : ''),
                        originalColor: fgHex,
                        correctedColor: newFg
                    });
                }
            }
        }
        for (const child of el.children) {
            walk(child);
        }
    }

    walk(doc.body);

    if (corrections.length) {
        console.warn('[verifyContrast] Contrast corrections applied:', corrections);
    }

    return doc.body.innerHTML;
}

export function verifyTextVisibility(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    function walk(el) {
        if (el.nodeType === 1 && el.textContent.trim()) {
            const fontSize = parseFloat(el.style.fontSize) || 0;
            const lineHeight = parseFloat(el.style.lineHeight) || 0;
            const color = el.style.color;
            if (fontSize && fontSize < 12) {
                violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'font-size too small', value: fontSize });
            }
            if (lineHeight && lineHeight < 1.2) {
                violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'line-height too tight', value: lineHeight });
            }
            if (!color || color === 'transparent') {
                violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'text color not set or transparent' });
            }
        }
        for (const child of el.children) walk(child);
    }
    walk(doc.body);
    return violations;
}

export function verifyButtonVisibility(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const buttons = doc.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
    buttons.forEach(btn => {
        const width = parseFloat(btn.style.width) || 0;
        const height = parseFloat(btn.style.height) || 0;
        const fontSize = parseFloat(btn.style.fontSize) || 0;
        const cursor = btn.style.cursor;
        if (width < 44 || height < 44) {
            violations.push({ element: btn.tagName + (btn.id ? '#'+btn.id : ''), issue: 'touch target too small', w: width, h: height });
        }
        if (cursor !== 'pointer') {
            violations.push({ element: btn.tagName + (btn.id ? '#'+btn.id : ''), issue: 'cursor not pointer' });
        }
    });
    return violations;
}

export function verifyHarmony(html, options = {}) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        if (!el.textContent.trim()) return;
        const bg = extractBgFromShorthand(el) || '#ffffff';
        const color = el.style.color;
        if (color) {
            const score = colorHarmonyScore(toHex(color), toHex(bg));
            if (score < 0.5) {
                violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), score, color: toHex(color), bg: toHex(bg) });
                if (options.autoCorrect) {
                    const palette = getHarmoniousPalette(toHex(bg), 3, { scheme: 'analogous' });
                    if (palette.length > 0) {
                        const newColor = palette[0];
                        mergeAndApplyStyles(el, { color: newColor });
                    }
                }
            }
        }
    });
    return { html: options.autoCorrect ? doc.body.innerHTML : html, violations };
}

// ==================== LAYOUT VERIFICATION (unchanged) ====================

export function checkSpacing(html, minGap = 12) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    function walk(parent) {
        const children = Array.from(parent.children).filter(el => {
            const display = el.style.display || 'inline';
            return display === 'block' || display === 'flex' || display === 'grid' ||
                   ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'].includes(el.tagName.toLowerCase());
        });
        for (let i = 0; i < children.length - 1; i++) {
            const a = children[i], b = children[i+1];
            const mb = parseFloat(a.style.marginBottom) || 0;
            const mt = parseFloat(b.style.marginTop) || 0;
            if (mb + mt < minGap) {
                violations.push({
                    elementA: a.tagName + (a.id ? '#'+a.id : ''),
                    elementB: b.tagName + (b.id ? '#'+b.id : ''),
                    gap: mb + mt
                });
            }
            walk(b);
        }
    }
    walk(doc.body);
    return violations;
}

export function checkOverlap(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
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
                    violations.push({
                        elementA: a.tagName + (a.id ? '#'+a.id : ''),
                        elementB: b.tagName + (b.id ? '#'+b.id : ''),
                        zone: { top: Math.max(aTop, bTop), left: Math.max(aLeft, bLeft),
                                bottom: Math.min(aTop+aHeight, bTop+bHeight), right: Math.min(aLeft+aWidth, bLeft+bWidth) }
                    });
                }
            }
        }
    }
    return violations;
}

export function checkOverflow(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    function walk(el) {
        const style = el.style;
        const overflow = style.overflow || style.overflowX || style.overflowY;
        if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
            if (!overflow || overflow === 'visible') {
                violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'content overflows but overflow not set' });
            }
        }
        for (const child of el.children) walk(child);
    }
    walk(doc.body);
    return violations;
}

export function checkScrollability(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scrollable = doc.querySelectorAll('[style*="overflow: auto"], [style*="overflow: scroll"]');
    scrollable.forEach(el => {
        if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) {
            violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'scrollable container has no overflowing content' });
        }
        if (!el.style.touchAction) {
            violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'touch-action not set for scrollable element' });
        }
    });
    return violations;
}

export function checkControlledOverlay(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const overlays = doc.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"]');
    overlays.forEach(el => {
        if (!el.style.zIndex) {
            violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'positioned element lacks z-index' });
        }
    });
    return violations;
}

export function checkFocusVisibility(html) {
    const violations = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const focusable = doc.querySelectorAll('a[href], button, input, select, textarea, [tabindex]');
    focusable.forEach(el => {
        const hasFocusOutline = el.hasAttribute('onfocus') ||
            (el.style.outline && el.style.outline !== 'none' && el.style.outline !== '0px');
        if (!hasFocusOutline) {
            violations.push({ element: el.tagName + (el.id ? '#'+el.id : ''), issue: 'no focus indicator' });
        }
    });
    return violations;
}

export function runVerification(html, goals = []) {
    const result = { passed: true, violations: [], correctedHtml: html };
    for (const goal of goals) {
        switch (goal) {
            case 'contrast':
                result.correctedHtml = verifyContrast(result.correctedHtml);
                break;
            case 'spacing': {
                const v = checkSpacing(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'overlap': {
                const v = checkOverlap(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'overflow': {
                const v = checkOverflow(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'scrollability': {
                const v = checkScrollability(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'overlay': {
                const v = checkControlledOverlay(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'textvisibility': {
                const v = verifyTextVisibility(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'buttonvisibility': {
                const v = verifyButtonVisibility(result.correctedHtml);
                if (v.length) { result.passed = false; result.violations.push(...v); }
                break;
            }
            case 'harmony': {
                const res = verifyHarmony(result.correctedHtml, { autoCorrect: true });
                result.correctedHtml = res.html;
                if (res.violations.length) { result.passed = false; result.violations.push(...res.violations); }
                break;
            }
        }
    }
    return result;
}

// ==================== STYLE OPTIMIZATION ENGINE (UPDATED) ====================

/**
 * Optimizes style HTML by applying contrast, harmony, text visibility, button visibility.
 * Now accepts themeStyles for semantic corrections and returns rules (P23).
 * Returns { html, rules }.
 */
export function optimizeStyleHTML(html, goals, themeStyles = {}, maxIterations = 5) {
    const parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');
    const allRules = [];

    for (let iter = 0; iter < maxIterations; iter++) {
        let anyCorrection = false;
        for (const goal of goals) {
            switch (goal.type) {
                case 'contrast': {
                    const minRatio = goal.options?.minRatio ?? 4.5;
                    const newRules = correctContrastDoc(doc, minRatio);
                    if (newRules.length) {
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'harmony': {
                    const newRules = correctHarmonyDoc(doc);
                    if (newRules.length) {
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'textVisibility': {
                    const options = goal.options || {};
                    const newRules = correctTextVisibilityDoc(doc, themeStyles, options);
                    if (newRules.length) {
                        allRules.push(...newRules);
                        anyCorrection = true;
                    }
                    break;
                }
                case 'buttonVisibility': {
                    const newRules = correctButtonVisibilityDoc(doc);
                    if (newRules.length) {
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

// ==================== CORRECTORS (Internal) ====================

function correctContrastDoc(doc, minRatio) {
    const rules = [];
    const elements = doc.querySelectorAll('*');
    elements.forEach(el => {
        if (el.textContent.trim() && el.style.color) {
            const bg = getEffectiveBackground(el);
            if (bg) {
                const fg = el.style.color;
                const ratio = contrastRatio(toHex(fg), toHex(bg));
                if (ratio < minRatio) {
                    const newFg = getOptimalForeground(toHex(bg), minRatio, { scheme: 'complementary' });
                    const selector = el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() };
                    rules.push({ selector, styles: { color: newFg } });
                    mergeAndApplyStyles(el, { color: newFg }); // P3
                }
            }
        }
    });
    return rules;
}

function correctHarmonyDoc(doc) {
    const rules = [];
    const elements = doc.querySelectorAll('*');
    elements.forEach(el => {
        if (el.textContent.trim() && el.style.color) {
            const bg = getEffectiveBackground(el);
            if (bg) {
                const fg = toHex(el.style.color);
                const bgHex = toHex(bg);
                const score = colorHarmonyScore(fg, bgHex);
                if (score < 0.5) {
                    const palette = getHarmoniousPalette(bgHex, 3, { scheme: 'analogous' });
                    if (palette.length) {
                        const newColor = palette[0];
                        const selector = el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() };
                        rules.push({ selector, styles: { color: newColor } });
                        mergeAndApplyStyles(el, { color: newColor });
                    }
                }
            }
        }
    });
    return rules;
}

// ==================== UPDATED TEXT VISIBILITY (P2, P3) ====================

function correctTextVisibilityDoc(doc, themeStyles, options) {
    const rules = [];
    const minLineHeight = options.minLineHeight ?? 1.2;
    const elements = doc.querySelectorAll('*');
    elements.forEach(el => {
        if (el.textContent.trim()) {
            const tag = el.tagName.toLowerCase();
            const themeFontSize = themeStyles[tag]?.fontSize || themeStyles['p']?.fontSize || '16px';
            const minSize = parseFloat(themeFontSize) || 12;
            const currentSize = parseFloat(el.style.fontSize) || 0;
            const lineHeight = parseFloat(el.style.lineHeight) || 0;
            let needsUpdate = false;
            const styles = {};
            // P2: only modify if explicit inline font-size exists and is below minimum
            if (el.style.fontSize && currentSize > 0 && currentSize < minSize) {
                styles.fontSize = minSize + 'px';
                needsUpdate = true;
            }
            if (lineHeight && lineHeight < minLineHeight) {
                styles.lineHeight = minLineHeight.toString();
                needsUpdate = true;
            }
            if (needsUpdate) {
                const selector = el.id ? { id: el.id } : { tag: tag };
                rules.push({ selector, styles });
                mergeAndApplyStyles(el, styles); // P3
            }
        }
    });
    return rules;
}

// ==================== UPDATED BUTTON VISIBILITY (P1‑V3, P3) ====================

function correctButtonVisibilityDoc(doc) {
    const rules = [];
    const buttons = doc.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
    buttons.forEach(btn => {
        const width = parseFloat(btn.style.width) || 0;
        const height = parseFloat(btn.style.height) || 0;
        const styles = {};
        
        // P1‑V3: dynamic min-width estimation
        const estimatedTextBoundPx = typeof estimateRecursiveBounds === 'function' ? estimateRecursiveBounds(btn) : 0;
        const requiredMinimumBounds = Math.max(44, estimatedTextBoundPx + 24);
        if (width < requiredMinimumBounds) {
            styles.minWidth = requiredMinimumBounds + 'px';
        }
        if (height < 44) {
            styles.minHeight = '44px';
        }
        if (!btn.style.cursor) {
            styles.cursor = 'pointer';
        }
        if (Object.keys(styles).length) {
            const selector = btn.id ? { id: btn.id } : { tag: btn.tagName.toLowerCase() };
            rules.push({ selector, styles });
            mergeAndApplyStyles(btn, styles); // P3
        }
    });
    return rules;
}

// ==================== BACKGROUND HELPER ====================

function getEffectiveBackground(el) {
    let bg = extractBgFromShorthand(el);
    if (bg) return bg;
    let parent = el.parentNode;
    while (parent && parent !== el.ownerDocument) {
        if (parent.style) {
            bg = extractBgFromShorthand(parent);
            if (bg) return bg;
        }
        parent = parent.parentNode;
    }
    return '#ffffff';
}
