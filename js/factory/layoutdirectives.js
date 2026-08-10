export function parseDirectives(str) {
    if (!str) return [];
    return str.split(';').map(s => s.trim()).filter(Boolean).map(part => {
        // Check for breakpoint prefix: @<name>: directive
        let breakpoint = null;
        if (part.startsWith('@')) {
            const colonIdx = part.indexOf(':');
            if (colonIdx > 1) {
                breakpoint = part.substring(1, colonIdx);
                part = part.substring(colonIdx + 1).trim();
            }
        }

        // Extract type and rest
        const colonIdx2 = part.indexOf(':');
        const type = colonIdx2 > -1 ? part.substring(0, colonIdx2).trim() : part.trim();
        const rest = colonIdx2 > -1 ? part.substring(colonIdx2 + 1).trim() : '';
        const params = rest ? rest.split(',').map(p => p.trim()) : [];

        const directive = { type };
        if (breakpoint) directive.breakpoint = breakpoint;

        switch (type) {
            // Existing positional directives
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

            // === NEW LAYOUT DIRECTIVES ===
            case 'position':
                directive.value = params[0];           // e.g., 'top', 'bottom', 'middle', 'center', 'top-left', 'screen-top-right'
                break;
            case 'anchor':
                directive.targetId = params[0];        // id of target element
                directive.myCorner = params[1] || 'top-left';
                directive.targetCorner = params[2] || 'top-left';
                break;
            case 'z-stack':
                directive.mode = params[0];            // 'topmost', 'bottommost', 'above <id>', 'below <id>'
                if (params.length > 1) directive.targetId = params[1];
                break;
            case 'overlap':
                directive.mode = params[0];            // 'allow', 'prevent'
                break;
            case 'overflow':
                directive.mode = params[0];            // 'scroll', 'hidden', 'visible', 'auto'
                break;
            case 'respect-margins':
                directive.value = params[0] === 'true';
                break;
            case 'overflow-margins':
                directive.mode = params[0] || 'include';
                break;
            case 'screen-corner':
                directive.corner = params[0];          // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
                break;
            // Fallback for unknown directives: keep raw data
            default:
                directive.params = params;
                break;
        }

        return directive;
    });
}

export function generateCSSFromDirectives(elementId, directives) {
    let css = '';          // for media‑query / style blocks
    const inlineStyles = {}; // for direct inline application

    // Process non‑breakpoint directives first; breakpoint ones later for @media
    const normal = directives.filter(d => !d.breakpoint);
    const responsive = directives.filter(d => d.breakpoint);

    // Helper to apply a directive's style to inlineStyles
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

            // New directives – set inline styles
            case 'position':
                switch (d.value) {
                    case 'top':
                        Object.assign(inlineStyles, { position: 'relative', top: '0' });
                        break;
                    case 'bottom':
                        Object.assign(inlineStyles, { position: 'relative', bottom: '0' });
                        break;
                    case 'left':
                        Object.assign(inlineStyles, { position: 'relative', left: '0' });
                        break;
                    case 'right':
                        Object.assign(inlineStyles, { position: 'relative', right: '0' });
                        break;
                    case 'middle':
                        Object.assign(inlineStyles, { position: 'relative', top: '50%', transform: 'translateY(-50%)' });
                        break;
                    case 'center':
                        Object.assign(inlineStyles, { position: 'relative', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
                        break;
                    case 'top-left':
                        Object.assign(inlineStyles, { position: 'relative', top: '0', left: '0' });
                        break;
                    case 'top-right':
                        Object.assign(inlineStyles, { position: 'relative', top: '0', right: '0' });
                        break;
                    case 'bottom-left':
                        Object.assign(inlineStyles, { position: 'relative', bottom: '0', left: '0' });
                        break;
                    case 'bottom-right':
                        Object.assign(inlineStyles, { position: 'relative', bottom: '0', right: '0' });
                        break;
                    case 'screen-top-left':
                        Object.assign(inlineStyles, { position: 'fixed', top: '0', left: '0' });
                        break;
                    case 'screen-top-right':
                        Object.assign(inlineStyles, { position: 'fixed', top: '0', right: '0' });
                        break;
                    case 'screen-bottom-left':
                        Object.assign(inlineStyles, { position: 'fixed', bottom: '0', left: '0' });
                        break;
                    case 'screen-bottom-right':
                        Object.assign(inlineStyles, { position: 'fixed', bottom: '0', right: '0' });
                        break;
                    case 'screen-center':
                        Object.assign(inlineStyles, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
                        break;
                    default:
                        // unknown – ignore or log
                        break;
                }
                break;

            case 'anchor':
                // anchor requires knowing target dimensions at parse time; we set absolute and leave offsets
                // In a real implementation, one would compute offset from target's style.
                Object.assign(inlineStyles, { position: 'absolute' });
                // We'll mark that anchor calculation should happen later
                inlineStyles._anchor = { targetId: d.targetId, myCorner: d.myCorner, targetCorner: d.targetCorner };
                break;

            case 'z-stack':
                if (d.mode === 'topmost') {
                    inlineStyles.zIndex = 'auto'; // will be resolved to max+1 in later processing
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
                // allow: do nothing
                break;

            case 'overflow':
                inlineStyles.overflow = d.mode;
                break;

            case 'respect-margins':
                if (d.value) {
                    // Ensure default margins are set if not already
                    if (!inlineStyles.margin) inlineStyles.margin = '0.5rem';
                }
                break;

            case 'overflow-margins':
                if (d.mode === 'include') {
                    Object.assign(inlineStyles, { overflow: 'visible' });
                    // remove height/width constraints? risky, so just set overflow visible
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

            default:
                // unknown: ignore
                break;
        }
    };

    // Apply normal directives
    normal.forEach(applyDirective);

    // For responsive directives, group by breakpoint
    const bpGroups = {};
    responsive.forEach(d => {
        const bp = d.breakpoint;
        if (!bpGroups[bp]) bpGroups[bp] = [];
        bpGroups[bp].push(d);
    });

    // Generate media-query blocks for each breakpoint
    for (const [bp, dirs] of Object.entries(bpGroups)) {
        // retrieve pixel value from global breakpoints (imported later)
        css += `@media (max-width: var(--bp-${bp})) {\n`;
        dirs.forEach(applyDirective);
        css += `}\n`;
    }

    // Return both the inline style object and any CSS block (for later use)
    return { inline: inlineStyles, css };
}
