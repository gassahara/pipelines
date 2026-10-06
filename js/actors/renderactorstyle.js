function SUGETANCESTORS(EL) {
    function climb(p, acc) {
        if (!p || p.nodeType !== 1) return acc;
        return climb(p.parentNode, acc.concat([p]));
    }
    return climb(EL.parentNode, []);
}

function SUGETSIBLINGS(EL, dir) {
    function walk(s, acc) {
        if (!s) return acc;
        return walk(s[dir], s.nodeType === 1 ? acc.concat([s]) : acc);
    }
    return walk(EL[dir], []);
}

function SUGETDEPTH(ancestor, descendant) {
    if (!descendant || descendant === ancestor) return 0;
    if (descendant.nodeType !== 1) return SUGETDEPTH(ancestor, descendant.parentNode);
    return 1 + SUGETDEPTH(ancestor, descendant.parentNode);
}

function SUGETALLDESCENDANTS(EL, stylizercore) {
    var children = Array.prototype.slice.call(EL.children || []);
    return children.reduce(function(all, child) {
        return all.concat(child, SUGETALLDESCENDANTS(child, stylizercore));
    }, []);
}

function SUAPPLYSTEP(nodes, step, filterfn, stylizercore) {
    if (filterfn === undefined) filterfn = null;
    return nodes.reduce(function(next, NODE) {
        var candidates = [];
        switch (step.axis || 'child') {
            case 'self': candidates = [NODE]; break;
            case 'parent': if (NODE.parentNode) candidates = [NODE.parentNode]; break;
            case 'ancestor': candidates = SUGETANCESTORS(NODE); break;
            case 'child': candidates = Array.prototype.slice.call(NODE.children || []); break;
            case 'descendant': candidates = SUGETALLDESCENDANTS(NODE, stylizercore); break;
            case 'nextsibling': candidates = SUGETSIBLINGS(NODE, 'nextSibling'); break;
            case 'previoussibling': candidates = SUGETSIBLINGS(NODE, 'previousSibling'); break;
            default: throw new Error('Unknown axis: ' + step.axis);
        }
        if (step.tag) candidates = candidates.filter(function(EL) { return EL.tagName && EL.tagName.toLowerCase() === step.tag.toLowerCase(); });
        if (step.class) candidates = candidates.filter(function(EL) { return EL.classList && EL.classList.contains(step.class); });
        if (step.id) candidates = candidates.filter(function(EL) { return EL.id === step.id; });
        if (step.index !== undefined) candidates = candidates.length > step.index ? [candidates[step.index]] : [];
        if (step.depth !== undefined && step.axis === 'descendant') candidates = candidates.filter(function(EL) { return SUGETDEPTH(NODE, EL) === step.depth; });
        if (step.skip !== undefined && (step.axis === 'nextsibling' || step.axis === 'previoussibling')) candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
        if (step.content) {
            var text = step.content.text || '';
            var mode = step.content.mode || 'substring';
            var casesensitive = step.content.casesensitive || false;
            var search = casesensitive ? text : text.toLowerCase();
            candidates = candidates.filter(function(EL) {
                var eltext = casesensitive ? EL.textContent : EL.textContent.toLowerCase();
                if (mode === 'exact') return eltext.trim() === search.trim();
                return eltext.indexOf(search) !== -1;
            });
        }
        if (typeof filterfn === 'function') candidates = candidates.filter(filterfn);
        candidates.forEach(function(c) { if (next.indexOf(c) === -1) next.push(c); });
        return next;
    }, []);
}

function SUBUILDLAYOUTPROPERTYMAP(rootel, viewportwidth, inheritedfontsize, stylizercore) {
    if (inheritedfontsize === undefined) inheritedfontsize = SUDETECTFONTSIZE(rootel);
    var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
    function walk(EL, parentavailablewidth, parentfontsize, acc) {
        var style = EL.style || {};
        var props = { fontsize: parentfontsize, width: null, maxwidth: null, minwidth: null, height: null, margintop: 0, marginbottom: 0, marginleft: 0, marginright: 0, paddingtop: 0, paddingbottom: 0, paddingleft: 0, paddingright: 0, bordertopwidth: 0, borderbottomwidth: 0, borderleftwidth: 0, borderrightwidth: 0, availablewidth: parentavailablewidth };
        var propnames = ['fontsize','width','maxwidth','minwidth','height','margintop','marginbottom','marginleft','marginright','paddingtop','paddingbottom','paddingleft','paddingright','bordertopwidth','borderbottomwidth','borderleftwidth','borderrightwidth'];
        propnames.forEach(function(prop) {
            if (style[prop] && sc && sc.parselength) props[prop] = sc.parselength(style[prop], prop === 'fontsize' ? parentfontsize : parentavailablewidth);
        });
        if (style.margin && sc && sc.parseshorthandlengths) {
            var sh = sc.parseshorthandlengths(style.margin, parentavailablewidth, sc);
            if (sh) { props.margintop = sh.top; props.marginright = sh.right; props.marginbottom = sh.bottom; props.marginleft = sh.left; }
        }
        if (style.padding && sc && sc.parseshorthandlengths) {
            var sh2 = sc.parseshorthandlengths(style.padding, parentavailablewidth, sc);
            if (sh2) { props.paddingtop = sh2.top; props.paddingright = sh2.right; props.paddingbottom = sh2.bottom; props.paddingleft = sh2.left; }
        }
        var contentwidth = Math.max(0, parentavailablewidth - props.paddingleft - props.paddingright - props.borderleftwidth - props.borderrightwidth);
        var selfavailable = contentwidth;
        if (props.maxwidth !== null) selfavailable = Math.min(selfavailable, props.maxwidth);
        if (props.width !== null) selfavailable = Math.min(selfavailable, props.width);
        if (props.minwidth !== null) selfavailable = Math.max(selfavailable, props.minwidth);
        props.availablewidth = selfavailable;
        var nextacc = acc.concat([{ element: EL, props: props }]);
        var children = SUAPPLYSTEP([EL], { axis: 'child' }, null, sc);
        return children.reduce(function(inneracc, child) { return walk(child, selfavailable, props.fontsize, inneracc); }, nextacc);
    }
    return walk(rootel, viewportwidth, inheritedfontsize, []);
}

function SUGETPROPSFROMMAP(propsmap, EL, stylizercore) {
    var entry = propsmap.filter(function(item) { return item.element === EL; })[0];
    return entry ? entry.props : null;
}

function SUCOMPUTEINTRINSICSIZE(NODE, propertymap, inheritedprops, stylizercore) {
    if (inheritedprops === undefined) inheritedprops = {};
    var defaultlineheightfactor = 1.2;
    var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
    if (!NODE) return { width: 0, height: 0 };
    if (NODE.nodeType === 3) {
        var txt = NODE.nodeValue.trim();
        if (!txt) return { width: 0, height: 0 };
        var fontsize = inheritedprops.fontsize || SUDETECTFONTSIZE(NODE.parentElement);
        var lines = txt.split('\n');
        var isnowrap = inheritedprops.whitespace === 'nowrap' || inheritedprops.whitespace === 'pre';
        var maxlinelen = Math.max.apply(null, lines.map(function(line) {
            var words = isnowrap ? [line] : (sc && sc.tokenizewhitespace ? sc.tokenizewhitespace(line) : line.split(/\s+/).filter(Boolean));
            return words.reduce(function(len, w, i) { return len + w.length * fontsize + (i > 0 ? fontsize : 0); }, 0);
        }));
        var lineheight = inheritedprops.lineheight || fontsize * defaultlineheightfactor;
        return { width: maxlinelen, height: lines.length * lineheight };
    }
    if (NODE.nodeType !== 1) return { width: 0, height: 0 };
    var props = SUGETPROPSFROMMAP(propertymap, NODE, sc);
    if (!props) throw new Error('[computeintrinsicsize] Missing property map entry: ' + NODE.tagName);
    var tag = NODE.tagName.toLowerCase();
    var padh = (props.paddingleft || 0) + (props.paddingright || 0) + (props.borderleftwidth || 0) + (props.borderrightwidth || 0);
    var padv = (props.paddingtop || 0) + (props.paddingbottom || 0);
    if (tag === 'img' || tag === 'svg') {
        if (props.width !== null) return { width: props.width, height: props.height || (props.width * 0.75) };
        throw new Error('[computeintrinsicsize] Image without explicit width');
    }
    if (tag === 'table') {
        if (props.width !== null) return { width: props.width, height: props.height || 0 };
        var rows = SUAPPLYSTEP([NODE], { axis: 'descendant', tag: 'tr' }, null, sc);
        var colmax = {};
        var totalh = 0;
        rows.forEach(function(row) {
            var rowh = 0;
            SUAPPLYSTEP([row], { axis: 'child' }, null, sc).forEach(function(cell, idx) {
                var s = SUCOMPUTEINTRINSICSIZE(cell, propertymap, props, sc);
                colmax[idx] = Math.max(colmax[idx] || 0, s.width);
                rowh = Math.max(rowh, s.height);
            });
            totalh += rowh;
        });
        var colvals = Object.keys(colmax).map(function(k) { return colmax[k]; });
        var totalw = colvals.reduce(function(sum, w) { return sum + w; }, 0) + padh;
        return { width: totalw, height: totalh + padv };
    }
    var children = Array.prototype.slice.call(NODE.childNodes);
    if (!children.length) return { width: padh, height: padv };
    var isflexrow = NODE.style && NODE.style.display === 'flex' && (NODE.style.flexDirection === 'row' || !NODE.style.flexDirection);
    var totalw = 0, maxw = 0, totalh = 0;
    children.forEach(function(child) {
        var s = SUCOMPUTEINTRINSICSIZE(child, propertymap, props, sc);
        if (isflexrow) { totalw += s.width; totalh = Math.max(totalh, s.height); }
        else { maxw = Math.max(maxw, s.width); totalh += s.height; }
    });
    return { width: (isflexrow ? totalw : maxw) + padh, height: totalh + padv };
}

function SUESTIMATERECURSIVEBOUNDS(NODE, stylizercore) {
    var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
    if (NODE.nodeType === 3) {
        var txt = NODE.nodeValue.trim();
        if (!txt) return 0;
        var fsize = SUDETECTFONTSIZE(NODE.parentElement || NODE);
        var isnowrap = false;
        function climb(p, size, nowrap) {
            if (!p || !p.style) return { size: size, nowrap: nowrap };
            if (p.style.fontSize) { var raw = p.style.fontSize; return { size: (raw.indexOf('rem') !== -1 || raw.indexOf('em') !== -1) ? parseFloat(raw) * 16 : parseFloat(raw), nowrap: nowrap }; }
            return climb(p.parentElement, size, nowrap || p.style.whiteSpace === 'nowrap');
        }
        var resolved = climb(NODE.parentElement, fsize, isnowrap);
        fsize = resolved.size; isnowrap = resolved.nowrap;
        var charpx = fsize * 0.6;
        if (isnowrap) return txt.length * charpx;
        var words = (sc && sc.tokenizewhitespace) ? sc.tokenizewhitespace(txt) : txt.split(/\s+/).filter(Boolean);
        var maxwordlen = Math.max.apply(null, words.map(function(w) { return w.length; }));
        return maxwordlen * charpx;
    }
    if (NODE.nodeType === 1) {
        if (NODE.tagName && (NODE.tagName.toLowerCase() === 'img' || NODE.tagName.toLowerCase() === 'svg')) return parseFloat(NODE.style.width || NODE.getAttribute('width') || 24);
        var isflexrow = NODE.style.display === 'flex' && (NODE.style.flexDirection === 'row' || !NODE.style.flexDirection);
        var totalw = 0;
        Array.prototype.slice.call(NODE.childNodes).forEach(function(child) {
            var w = SUESTIMATERECURSIVEBOUNDS(child, sc);
            totalw = isflexrow ? totalw + w : Math.max(totalw, w);
        });
        return totalw;
    }
    return 0;
}

function SUGETEFFECTIVEBACKGROUND(EL, stylizercore) {
    function ishexdigit(ch) { return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
    function findhexcolor(str) {
        function scanhex(j, count) { if (j < str.length && ishexdigit(str.charAt(j))) return scanhex(j + 1, count + 1); return { j: j, count: count }; }
        function scan(i) { if (i >= str.length) return null; if (str.charAt(i) === '#') { var res = scanhex(i + 1, 0); if (res.count === 3 || res.count === 6) return str.slice(i, res.j); } return scan(i + 1); }
        return scan(0);
    }
    function findrgbcolor(str) { var idx = str.indexOf('rgb('); if (idx === -1) return null; var end = str.indexOf(')', idx); if (end === -1) return null; return str.slice(idx, end + 1); }
    function extractbgfromshorthand(NODE) { if (NODE.style.backgroundColor) return NODE.style.backgroundColor; var bg = NODE.style.background; if (!bg) return null; return findhexcolor(bg) || findrgbcolor(bg) || null; }
    function climbbg(curr) { if (!curr || curr.nodeType !== 1) return ''; var bg = extractbgfromshorthand(curr); if (bg) return bg; return climbbg(curr.parentNode); }
    return climbbg(EL);
}

function SUGETRGBHEX(input, sc) {
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    if (!core) return input;
    var rgb = core.hextorgb(input, core);
    return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
}

function SUHARMONYSCORE(fg, bg, sc) {
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    if (!core) return 0.7;
    var fghsl = core.rgbtohsl.apply(null, core.hextorgb(fg, core));
    var bghsl = core.rgbtohsl.apply(null, core.hextorgb(bg, core));
    var huedist = Math.abs(fghsl.h - bghsl.h);
    var normalizeddist = huedist > 180 ? 360 - huedist : huedist;
    if (normalizeddist < 30) return 1;
    if (normalizeddist < 60) return 0.9;
    if (normalizeddist > 150 && normalizeddist < 180) return 0.95;
    if (normalizeddist > 90 && normalizeddist < 120) return 0.4;
    return 0.7;
}

// ============================================================
// @proposal=P-PANEL-CONTENT-DECORATION (RUN 152) — extended walker.
// ============================================================
function SUREWRITESTYLEATTRS(root, rules, sc) {
    var count = 0;
    function matchesStep(EL, rule) {
        var step = {};
        step.axis = (rule.axis !== undefined) ? rule.axis : 'descendant';
        if (rule.tag !== undefined) step.tag = rule.tag;
        if (rule.class !== undefined) step.class = rule.class;
        if (rule.id !== undefined) step.id = rule.id;
        if (rule.index !== undefined) step.index = rule.index;
        if (rule.skip !== undefined) step.skip = rule.skip;
        if (rule.depth !== undefined) step.depth = rule.depth;
        if (rule.content !== undefined) step.content = rule.content;
        var candidates = SUAPPLYSTEP([root], step, null, sc);
        return candidates.indexOf(EL) !== -1;
    }
    function applyrules(EL) {
        rules.forEach(function(rule) {
            var hasstep = (rule.axis !== undefined) || (rule.index !== undefined) ||
                          (rule.skip !== undefined) || (rule.depth !== undefined) ||
                          (rule.content !== undefined);
            var matched = false;
            if (hasstep) {
                matched = matchesStep(EL, rule);
            } else {
                if (rule.id && EL.id === rule.id) matched = true;
                else if (rule.tag && EL.tagName && EL.tagName.toLowerCase() === rule.tag.toLowerCase()) matched = true;
                else if (rule.class && EL.classList && EL.classList.contains(rule.class)) matched = true;
            }
            if (matched && rule.style) {
                Object.keys(rule.style).forEach(function(prop) { EL.style[prop] = rule.style[prop]; });
                count++;
            }
        });
        Array.prototype.slice.call(EL.children).forEach(applyrules);
    }
    applyrules(root);
    return count;
}

function SUCONSOLIDATESTYLES(root, safeprops, sc) {
    if (!safeprops) safeprops = ['color','font-family','font-size','font-weight','font-style','line-height','text-align','cursor','letter-spacing','word-spacing','text-transform','text-decoration','font-variant'];
    var count = 0;
    function walk(EL) {
        Array.prototype.slice.call(EL.children).forEach(function(child) {
            if (child.style) {
                var styleprops = Array.prototype.slice.call(child.style);
                styleprops.forEach(function(prop) {
                    if (safeprops.indexOf(prop) !== -1 && EL.style && EL.style[prop] === child.style[prop]) { child.style.removeProperty(prop); count++; }
                });
            }
            walk(child);
        });
    }
    walk(root);
    return count;
}

function SUOPTIMIZECONTRAST(root, themestyles, options, sc) {
    var minratio = (options && options.minratio != null) ? options.minratio : 4.5;
    var count = 0;
    var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
    var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
    if (!core || !contrast) return 0;
    els.forEach(function(EL) {
        if (EL.textContent.trim() && EL.style.color) {
            var bg = SUGETEFFECTIVEBACKGROUND(EL, sc);
            if (!bg) return;
            var fghex = SUGETRGBHEX(EL.style.color, sc);
            var bghex = SUGETRGBHEX(bg, sc);
            if (contrast.contrastratio(fghex, bghex, core) < minratio) {
                var newfg = contrast.getoptimalforeground(bghex, minratio, { scheme: 'complementary' }, harmony, contrast, core);
                EL.style.color = newfg;
                count++;
            }
        }
    });
    return count;
}

function SUOPTIMIZEHARMONY(root, themestyles, options, sc) {
    var count = 0;
    var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
    if (!core || !harmony) return 0;
    els.forEach(function(EL) {
        if (EL.textContent.trim() && EL.style.color) {
            var bg = SUGETEFFECTIVEBACKGROUND(EL, sc);
            if (!bg) return;
            var fg = SUGETRGBHEX(EL.style.color, sc);
            var bghex = SUGETRGBHEX(bg, sc);
            if (SUHARMONYSCORE(fg, bghex, sc) < 0.5) {
                var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
                if (pal.length) { EL.style.color = pal[0]; count++; }
            }
        }
    });
    return count;
}

function SUOPTIMIZETEXTVISIBILITY(root, themestyles, options, sc) {
    if (!themestyles) themestyles = {};
    var minlh = (options && options.minlineheight != null) ? options.minlineheight : 1.2;
    var count = 0;
    var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
    els.forEach(function(EL) {
        if (EL.textContent.trim()) {
            var tag = EL.tagName.toLowerCase();
            var minsize = (sc && sc.parselength) ? sc.parselength(themestyles[tag] && themestyles[tag].fontsize || themestyles['p'] && themestyles['p'].fontsize || '12px', 16) : 12;
            var cursize = (sc && sc.parselength) ? sc.parselength(EL.style.fontSize, 16) || 0 : (parseFloat(EL.style.fontSize) || 0);
            var curlh = parseFloat(EL.style.lineHeight) || 0;
            var modified = false;
            if (cursize > 0 && cursize < minsize) { EL.style.fontSize = minsize + 'px'; modified = true; }
            if (curlh && curlh < minlh) { EL.style.lineHeight = String(minlh); modified = true; }
            if (modified) count++;
        }
    });
    return count;
}

function SUOPTIMIZEBUTTONVISIBILITY(root, sc) {
    var count = 0;
    var els = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) {
        var tag = EL.tagName.toLowerCase();
        return tag === 'button' || EL.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(EL.getAttribute('type')) !== -1);
    });
    els.forEach(function(btn) {
        var w = parseFloat(btn.style.width) || 0;
        var h = parseFloat(btn.style.height) || 0;
        var minw = Math.max(44, SUESTIMATERECURSIVEBOUNDS(btn, sc) + 24);
        var modified = false;
        if (w < minw) { btn.style.minWidth = minw + 'px'; modified = true; }
        if (h < 44) { btn.style.minHeight = '44px'; modified = true; }
        if (!btn.style.cursor) { btn.style.cursor = 'pointer'; modified = true; }
        if (modified) count++;
    });
    return count;
}

function SUVERIFYCONTRAST(root, minratio, sc) {
    if (minratio === undefined) minratio = 4.5;
    var violations = [];
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
    if (!core || !contrast) return violations;
    function walk(EL) {
        if (EL.nodeType === 1 && EL.textContent.trim() && EL.style.color) {
            var bg = SUGETEFFECTIVEBACKGROUND(EL, sc);
            if (bg) {
                var fghex = SUGETRGBHEX(EL.style.color, sc);
                var bghex = SUGETRGBHEX(bg, sc);
                var ratio = contrast.contrastratio(fghex, bghex, core);
                if (ratio < minratio) violations.push({ element: EL.tagName + (EL.id ? '#' + EL.id : ''), ratio: ratio, expected: minratio, color: fghex, bg: bghex });
            }
        }
        Array.prototype.slice.call(EL.children).forEach(walk);
    }
    walk(root);
    return violations;
}

function SUVERIFYTEXTVISIBILITY(root, sc) {
    var violations = [];
    function walk(EL) {
        if (EL.nodeType === 1 && EL.textContent.trim()) {
            var fsize = (sc && sc.parselength) ? sc.parselength(EL.style.fontSize, 16) || 0 : (parseFloat(EL.style.fontSize) || 0);
            var lh = parseFloat(EL.style.lineHeight) || 0;
            var col = EL.style.color;
            var id = EL.tagName + (EL.id ? '#' + EL.id : '');
            if (fsize && fsize < 12) violations.push({ element: id, issue: 'font-size too small', value: fsize });
            if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
            if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
        }
        Array.prototype.slice.call(EL.children).forEach(walk);
    }
    walk(root);
    return violations;
}

function SUVERIFYBUTTONVISIBILITY(root, sc) {
    var violations = [];
    Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) {
        var tag = EL.tagName.toLowerCase();
        return tag === 'button' || EL.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(EL.getAttribute('type')) !== -1);
    }).forEach(function(btn) {
        var w = parseFloat(btn.style.width) || 0;
        var h = parseFloat(btn.style.height) || 0;
        var id = btn.tagName + (btn.id ? '#' + btn.id : '');
        if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w: w, h: h });
        if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
    });
    return violations;
}

function SUVERIFYHARMONY(root, options, sc) {
    if (options === undefined) options = {};
    var violations = [];
    var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
    var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
    if (!core || !harmony) return violations;
    Array.prototype.slice.call(root.getElementsByTagName('*')).forEach(function(EL) {
        if (!EL.textContent.trim() || !EL.style.color) return;
        var bg = SUGETEFFECTIVEBACKGROUND(EL, sc);
        if (!bg) return;
        var fg = SUGETRGBHEX(EL.style.color, sc);
        var bghex = SUGETRGBHEX(bg, sc);
        var score = harmony.colorharmonyscore(fg, bghex, core);
        if (score < 0.5) {
            violations.push({ element: EL.tagName + (EL.id ? '#' + EL.id : ''), score: score, color: fg, bg: bg });
            if (options.autocorrect) {
                var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
                if (pal.length) EL.style.color = pal[0];
            }
        }
    });
    return violations;
}

function SUCHECKFOCUSVISIBILITY(root, sc) {
    return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) {
        var tag = EL.tagName.toLowerCase();
        return (tag === 'a' && EL.getAttribute('href')) || ['button', 'input', 'select', 'textarea'].indexOf(tag) !== -1 || EL.getAttribute('tabindex') !== null;
    }).filter(function(EL) {
        return !EL.hasAttribute('onfocus') && (!EL.style.outline || ['none', '0px'].indexOf(EL.style.outline) !== -1);
    }).map(function(EL) {
        return { element: EL.tagName + (EL.id ? '#' + EL.id : ''), issue: 'no focus indicator' };
    });
}

var LCCORRECTIONMAXITER = 32;

function LCGETCANDIDATEELEMENTS(root, stylizercore) {
    var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
    var applyfn = (sc && sc.applystep) ? sc.applystep : SUAPPLYSTEP;
    return applyfn([root], { axis: 'descendant' }, null, sc).filter(function(EL) {
        var tag = EL.tagName.toLowerCase();
        if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
        if (tag === 'div' && EL.style && (EL.style.width || EL.style.maxWidth)) return true;
        return false;
    });
}

function LCCHECKSPACINGDOC(root, mingap, stylizercore) {
    if (mingap === undefined) mingap = 12;
    var blocktags = ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'];
    function contains(arr, item) { return arr.indexOf(item) !== -1; }
    function iseligiblecontainer(EL) { var s = EL.style || {}; var d = s.display || ''; return d !== 'flex' && d !== 'grid'; }
    function iseligiblechild(EL) {
        if (!EL || EL.nodeType !== 1) return false;
        var s = EL.style || {};
        if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') return false;
        if (contains(blocktags, EL.tagName.toLowerCase())) return true;
        var d = s.display || '';
        return d === 'block' || d === 'flex' || d === 'grid';
    }
    function filtereligiblechildren(children, index, acc) {
        if (index >= children.length) return acc;
        var child = children[index];
        if (iseligiblechild(child)) acc.push(child);
        return filtereligiblechildren(children, index + 1, acc);
    }
    function comparechildren(children, index, violations) {
        if (index >= children.length - 1) return violations;
        var a = children[index]; var b = children[index + 1];
        var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
        if (gap < mingap) violations.push({ elementa: a, elementb: b, gap: gap });
        return comparechildren(children, index + 1, violations);
    }
    function walkparentchildren(parent, childindex, violations) {
        var rawchildren = Array.prototype.slice.call(parent.children);
        if (childindex >= rawchildren.length) return violations;
        walk(rawchildren[childindex], violations);
        return walkparentchildren(parent, childindex + 1, violations);
    }
    function walk(NODE, violations) {
        if (!NODE || NODE.nodeType !== 1) return violations;
        if (!iseligiblecontainer(NODE)) return violations;
        var rawchildren = Array.prototype.slice.call(NODE.children);
        var eligible = filtereligiblechildren(rawchildren, 0, []);
        violations = comparechildren(eligible, 0, violations);
        return walkparentchildren(NODE, 0, violations);
    }
    return walk(root, []);
}

function LCCORRECTSPACINGDOC(ROOT, MINGAP, STYLIZERCORE) {
    if (MINGAP === undefined) MINGAP = 12;
    var REGISTER = new WeakSet();
    var APPLIED = 0;
    var CONVERGED = false;
    function STEP(ITER) {
        if (ITER >= LCCORRECTIONMAXITER) return null;
        var VIOLATIONS = LCCHECKSPACINGDOC(ROOT, MINGAP, STYLIZERCORE);
        var UNCORRECTED = VIOLATIONS.filter(function(V) { return !REGISTER.has(V.elementa); });
        if (UNCORRECTED.length === 0) { CONVERGED = true; return null; }
        UNCORRECTED.forEach(function(V) { REGISTER.add(V.elementa); if (!V.elementa) return; V.elementa.style.marginBottom = MINGAP + 'px'; APPLIED += 1; });
        return function () { return STEP(ITER + 1); };
    }
    trampoline(STEP)(0);
    return { applied: APPLIED, converged: CONVERGED };
}

function LCCHECKOVERLAPDOC(root) {
    var positioned = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) { return EL.style && (EL.style.position === 'absolute' || EL.style.position === 'fixed'); });
    return positioned.reduce(function(acc, a, i) {
        return positioned.slice(i + 1).reduce(function(inneracc, b) {
            var atop = parseFloat(a.style.top) || 0, aleft = parseFloat(a.style.left) || 0, aw = parseFloat(a.style.width) || 0, ah = parseFloat(a.style.height) || 0;
            var btop = parseFloat(b.style.top) || 0, bleft = parseFloat(b.style.left) || 0, bw = parseFloat(b.style.width) || 0, bh = parseFloat(b.style.height) || 0;
            if (aw && ah && bw && bh && aleft < bleft + bw && aleft + aw > bleft && atop < btop + bh && atop + ah > btop) {
                return inneracc.concat([{ elementa: a.tagName + (a.id ? '#' + a.id : ''), elementb: b.tagName + (b.id ? '#' + b.id : ''), elementaref: a, elementbref: b }]);
            }
            return inneracc;
        }, acc);
    }, []);
}

function LCCORRECTOVERLAPDOC(ROOT) {
    var REGISTER = new WeakSet();
    var APPLIED = 0;
    var CONVERGED = false;
    function STEP(ITER) {
        if (ITER >= LCCORRECTIONMAXITER) return null;
        var VIOLATIONS = LCCHECKOVERLAPDOC(ROOT);
        var UNCORRECTED = VIOLATIONS.filter(function(V) { return V.elementbref && !REGISTER.has(V.elementbref); });
        if (UNCORRECTED.length === 0) { CONVERGED = true; return null; }
        UNCORRECTED.forEach(function(V) { var EL = V.elementbref; if (!EL) return; REGISTER.add(EL); EL.style.position = 'relative'; APPLIED += 1; });
        return function () { return STEP(ITER + 1); };
    }
    trampoline(STEP)(0);
    return { applied: APPLIED, converged: CONVERGED };
}

function LCCHECKSCROLLABILITYDOC(root) {
    return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) {
        var s = EL.style;
        return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
    }).map(function(EL) { return { element: EL.tagName + (EL.id ? '#' + EL.id : ''), elementref: EL }; });
}

function LCCORRECTSCROLLABILITYDOC(ROOT) {
    var REGISTER = new WeakSet();
    var APPLIED = 0;
    var CONVERGED = false;
    function STEP(ITER) {
        if (ITER >= LCCORRECTIONMAXITER) return null;
        var VIOLATIONS = LCCHECKSCROLLABILITYDOC(ROOT);
        var UNCORRECTED = VIOLATIONS.filter(function(V) { return V.elementref && !REGISTER.has(V.elementref); });
        if (UNCORRECTED.length === 0) { CONVERGED = true; return null; }
        UNCORRECTED.forEach(function(V) { var EL = V.elementref; if (!EL) return; REGISTER.add(EL); EL.style.touchAction = 'pan-y'; APPLIED += 1; });
        return function () { return STEP(ITER + 1); };
    }
    trampoline(STEP)(0);
    return { applied: APPLIED, converged: CONVERGED };
}

function LCCHECKCONTROLLEDOVERLAYDOC(root) {
    return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(EL) {
        var s = EL.style;
        return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
    }).map(function(EL) { return { element: EL.tagName + (EL.id ? '#' + EL.id : ''), elementref: EL }; });
}

function LCCORRECTCONTROLLEDOVERLAYDOC(ROOT) {
    var REGISTER = new WeakSet();
    var APPLIED = 0;
    var CONVERGED = false;
    function STEP(ITER) {
        if (ITER >= LCCORRECTIONMAXITER) return null;
        var VIOLATIONS = LCCHECKCONTROLLEDOVERLAYDOC(ROOT);
        var UNCORRECTED = VIOLATIONS.filter(function(V) { return V.elementref && !REGISTER.has(V.elementref); });
        if (UNCORRECTED.length === 0) { CONVERGED = true; return null; }
        UNCORRECTED.forEach(function(V) { var EL = V.elementref; if (!EL) return; REGISTER.add(EL); EL.style.zIndex = '10'; APPLIED += 1; });
        return function () { return STEP(ITER + 1); };
    }
    trampoline(STEP)(0);
    return { applied: APPLIED, converged: CONVERGED };
}

function LCCHECKOVERFLOWDOC(root, viewportwidth, containerwidths, stylizercore) {
    function isinsidescrollwrapper(EL) {
        function climb(parent) { if (!parent) return false; var s = parent.style || {}; if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true; return climb(parent.parentElement); }
        return climb(EL.parentElement);
    }
    var buildmapfn = (stylizercore && stylizercore.buildlayoutpropertymap) ? stylizercore.buildlayoutpropertymap : SUBUILDLAYOUTPROPERTYMAP;
    var getpropsfn = (stylizercore && stylizercore.getpropsfrommap) ? stylizercore.getpropsfrommap : SUGETPROPSFROMMAP;
    var computefn = (stylizercore && stylizercore.computeintrinsicsize) ? stylizercore.computeintrinsicsize : SUCOMPUTEINTRINSICSIZE;
    var propertymap = buildmapfn(root, viewportwidth, undefined, stylizercore);
    return LCGETCANDIDATEELEMENTS(root, stylizercore)
        .filter(function(EL) { return !isinsidescrollwrapper(EL); })
        .filter(function(EL) {
            var props = getpropsfn(propertymap, EL, stylizercore);
            if (!props) return false;
            try { var size = computefn(EL, propertymap, props, stylizercore); return size.width > props.availablewidth; }
            catch (err) { if (stylizercore && stylizercore.warn) { stylizercore.warn('[checkoverflowdoc] Failed to compute intrinsic size:', EL.tagName, err); } return false; }
        });
}

function LCCORRECTOVERFLOWDOC(ROOT, VIEWPORTWIDTH, CONTAINERWIDTHS, STYLIZERCORE) {
    var REGISTER = new WeakSet();
    var APPLIED = 0;
    var CONVERGED = false;
    function STEP(ITER) {
        if (ITER >= LCCORRECTIONMAXITER) return null;
        var VIOLATIONS = LCCHECKOVERFLOWDOC(ROOT, VIEWPORTWIDTH, CONTAINERWIDTHS, STYLIZERCORE);
        var UNCORRECTED = VIOLATIONS.filter(function(EL) { return !REGISTER.has(EL); });
        if (UNCORRECTED.length === 0) { CONVERGED = true; return null; }
        UNCORRECTED.forEach(function(EL) {
            REGISTER.add(EL);
            if (LCISINTENTIONALCLIP(EL)) return;
            var wrapper = document.createElement('div');
            wrapper.style.width = '80%';
            wrapper.style.overflow = 'scroll';
            EL.parentNode.insertBefore(wrapper, EL);
            wrapper.appendChild(EL);
            APPLIED += 1;
        });
        return function () { return STEP(ITER + 1); };
    }
    trampoline(STEP)(0);
    return { applied: APPLIED, converged: CONVERGED };
}
