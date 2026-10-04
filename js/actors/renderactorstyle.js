function SU_getancestors(el) {
  function climb(p, acc) {
    if (!p || p.nodeType !== 1) return acc;
    return climb(p.parentNode, acc.concat([p]));
  }
  return climb(el.parentNode, []);
}

function SU_getsiblings(el, dir) {
  function walk(s, acc) {
    if (!s) return acc;
    return walk(s[dir], s.nodeType === 1 ? acc.concat([s]) : acc);
  }
  return walk(el[dir], []);
}

function SU_getdepth(ancestor, descendant) {
  if (!descendant || descendant === ancestor) return 0;
  if (descendant.nodeType !== 1) return SU_getdepth(ancestor, descendant.parentNode);
  return 1 + SU_getdepth(ancestor, descendant.parentNode);
}

function SU_getalldescendants(el, stylizercore) {
  var children = Array.prototype.slice.call(el.children || []);
  return children.reduce(function(all, child) {
    return all.concat(child, SU_getalldescendants(child, stylizercore));
  }, []);
}

function SU_applystep(nodes, step, filterfn, stylizercore) {
  if (filterfn === undefined) filterfn = null;
  return nodes.reduce(function(next, node) {
    var candidates = [];
    switch (step.axis || 'child') {
      case 'self': candidates = [node]; break;
      case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
      case 'ancestor': candidates = SU_getancestors(node); break;
      case 'child': candidates = Array.prototype.slice.call(node.children || []); break;
      case 'descendant': candidates = SU_getalldescendants(node, stylizercore); break;
      case 'nextsibling': candidates = SU_getsiblings(node, 'nextSibling'); break;
      case 'previoussibling': candidates = SU_getsiblings(node, 'previousSibling'); break;
      default: throw new Error('Unknown axis: ' + step.axis);
    }
    if (step.tag) candidates = candidates.filter(function(el) { return el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase(); });
    if (step.class) candidates = candidates.filter(function(el) { return el.classList && el.classList.contains(step.class); });
    if (step.id) candidates = candidates.filter(function(el) { return el.id === step.id; });
    if (step.index !== undefined) candidates = candidates.length > step.index ? [candidates[step.index]] : [];
    if (step.depth !== undefined && step.axis === 'descendant') candidates = candidates.filter(function(el) { return SU_getdepth(node, el) === step.depth; });
    if (step.skip !== undefined && (step.axis === 'nextsibling' || step.axis === 'previoussibling')) candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
    if (step.content) {
      var text = step.content.text || '';
      var mode = step.content.mode || 'substring';
      var casesensitive = step.content.casesensitive || false;
      var search = casesensitive ? text : text.toLowerCase();
      candidates = candidates.filter(function(el) {
        var eltext = casesensitive ? el.textContent : el.textContent.toLowerCase();
        if (mode === 'exact') return eltext.trim() === search.trim();
        return eltext.indexOf(search) !== -1;
      });
    }
    if (typeof filterfn === 'function') candidates = candidates.filter(filterfn);
    candidates.forEach(function(c) { if (next.indexOf(c) === -1) next.push(c); });
    return next;
  }, []);
}

function SU_buildlayoutpropertymap(rootel, viewportwidth, inheritedfontsize, stylizercore) {
  if (inheritedfontsize === undefined) inheritedfontsize = SU_detectfontsize(rootel);
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  function walk(el, parentavailablewidth, parentfontsize, acc) {
    var style = el.style || {};
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
    var nextacc = acc.concat([{ element: el, props: props }]);
    var children = SU_applystep([el], { axis: 'child' }, null, sc);
    return children.reduce(function(inneracc, child) { return walk(child, selfavailable, props.fontsize, inneracc); }, nextacc);
  }
  return walk(rootel, viewportwidth, inheritedfontsize, []);
}

function SU_getpropsfrommap(propsmap, el, stylizercore) {
  var entry = propsmap.filter(function(item) { return item.element === el; })[0];
  return entry ? entry.props : null;
}

function SU_computeintrinsicsize(node, propertymap, inheritedprops, stylizercore) {
  if (inheritedprops === undefined) inheritedprops = {};
  var defaultlineheightfactor = 1.2;
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  if (!node) return { width: 0, height: 0 };
  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return { width: 0, height: 0 };
    var fontsize = inheritedprops.fontsize || SU_detectfontsize(node.parentElement);
    var lines = txt.split('\n');
    var isnowrap = inheritedprops.whitespace === 'nowrap' || inheritedprops.whitespace === 'pre';
    var maxlinelen = Math.max.apply(null, lines.map(function(line) {
      var words = isnowrap ? [line] : (sc && sc.tokenizewhitespace ? sc.tokenizewhitespace(line) : line.split(/\s+/).filter(Boolean));
      return words.reduce(function(len, w, i) { return len + w.length * fontsize + (i > 0 ? fontsize : 0); }, 0);
    }));
    var lineheight = inheritedprops.lineheight || fontsize * defaultlineheightfactor;
    return { width: maxlinelen, height: lines.length * lineheight };
  }
  if (node.nodeType !== 1) return { width: 0, height: 0 };
  var props = SU_getpropsfrommap(propertymap, node, sc);
  if (!props) throw new Error('[computeintrinsicsize] Missing property map entry: ' + node.tagName);
  var tag = node.tagName.toLowerCase();
  var padh = (props.paddingleft || 0) + (props.paddingright || 0) + (props.borderleftwidth || 0) + (props.borderrightwidth || 0);
  var padv = (props.paddingtop || 0) + (props.paddingbottom || 0);
  if (tag === 'img' || tag === 'svg') {
    if (props.width !== null) return { width: props.width, height: props.height || (props.width * 0.75) };
    throw new Error('[computeintrinsicsize] Image without explicit width');
  }
  if (tag === 'table') {
    if (props.width !== null) return { width: props.width, height: props.height || 0 };
    var rows = SU_applystep([node], { axis: 'descendant', tag: 'tr' }, null, sc);
    var colmax = {};
    var totalh = 0;
    rows.forEach(function(row) {
      var rowh = 0;
      SU_applystep([row], { axis: 'child' }, null, sc).forEach(function(cell, idx) {
        var s = SU_computeintrinsicsize(cell, propertymap, props, sc);
        colmax[idx] = Math.max(colmax[idx] || 0, s.width);
        rowh = Math.max(rowh, s.height);
      });
      totalh += rowh;
    });
    var colvals = Object.keys(colmax).map(function(k) { return colmax[k]; });
    var totalw = colvals.reduce(function(sum, w) { return sum + w; }, 0) + padh;
    return { width: totalw, height: totalh + padv };
  }
  var children = Array.prototype.slice.call(node.childNodes);
  if (!children.length) return { width: padh, height: padv };
  var isflexrow = node.style && node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
  var totalw = 0, maxw = 0, totalh = 0;
  children.forEach(function(child) {
    var s = SU_computeintrinsicsize(child, propertymap, props, sc);
    if (isflexrow) { totalw += s.width; totalh = Math.max(totalh, s.height); }
    else { maxw = Math.max(maxw, s.width); totalh += s.height; }
  });
  return { width: (isflexrow ? totalw : maxw) + padh, height: totalh + padv };
}

function SU_estimaterecursivebounds(node, stylizercore) {
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  if (node.nodeType === 3) {
    var txt = node.nodeValue.trim();
    if (!txt) return 0;
    var fsize = SU_detectfontsize(node.parentElement || node);
    var isnowrap = false;
    function climb(p, size, nowrap) {
      if (!p || !p.style) return { size: size, nowrap: nowrap };
      if (p.style.fontSize) { var raw = p.style.fontSize; return { size: (raw.indexOf('rem') !== -1 || raw.indexOf('em') !== -1) ? parseFloat(raw) * 16 : parseFloat(raw), nowrap: nowrap }; }
      return climb(p.parentElement, size, nowrap || p.style.whiteSpace === 'nowrap');
    }
    var resolved = climb(node.parentElement, fsize, isnowrap);
    fsize = resolved.size; isnowrap = resolved.nowrap;
    var charpx = fsize * 0.6;
    if (isnowrap) return txt.length * charpx;
    var words = (sc && sc.tokenizewhitespace) ? sc.tokenizewhitespace(txt) : txt.split(/\s+/).filter(Boolean);
    var maxwordlen = Math.max.apply(null, words.map(function(w) { return w.length; }));
    return maxwordlen * charpx;
  }
  if (node.nodeType === 1) {
    if (node.tagName && (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg')) return parseFloat(node.style.width || node.getAttribute('width') || 24);
    var isflexrow = node.style.display === 'flex' && (node.style.flexDirection === 'row' || !node.style.flexDirection);
    var totalw = 0;
    Array.prototype.slice.call(node.childNodes).forEach(function(child) {
      var w = SU_estimaterecursivebounds(child, sc);
      totalw = isflexrow ? totalw + w : Math.max(totalw, w);
    });
    return totalw;
  }
  return 0;
}

function SU_geteffectivebackground(el, stylizercore) {
  function ishexdigit(ch) { return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'); }
  function findhexcolor(str) {
    function scanhex(j, count) { if (j < str.length && ishexdigit(str.charAt(j))) return scanhex(j + 1, count + 1); return { j: j, count: count }; }
    function scan(i) { if (i >= str.length) return null; if (str.charAt(i) === '#') { var res = scanhex(i + 1, 0); if (res.count === 3 || res.count === 6) return str.slice(i, res.j); } return scan(i + 1); }
    return scan(0);
  }
  function findrgbcolor(str) { var idx = str.indexOf('rgb('); if (idx === -1) return null; var end = str.indexOf(')', idx); if (end === -1) return null; return str.slice(idx, end + 1); }
  function extractbgfromshorthand(node) { if (node.style.backgroundColor) return node.style.backgroundColor; var bg = node.style.background; if (!bg) return null; return findhexcolor(bg) || findrgbcolor(bg) || null; }
  function climbbg(curr) { if (!curr || curr.nodeType !== 1) return ''; var bg = extractbgfromshorthand(curr); if (bg) return bg; return climbbg(curr.parentNode); }
  return climbbg(el);
}

function SU_getrgbhex(input, sc) {
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  if (!core) return input;
  var rgb = core.hextorgb(input, core);
  return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
}

function SU_harmonyscore(fg, bg, sc) {
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

function SU_rewritestyleattrs(root, rules, sc) {
  var count = 0;
  function applyrules(el) {
    rules.forEach(function(rule) {
      var matched = false;
      if (rule.id && el.id === rule.id) matched = true;
      else if (rule.tag && el.tagName && el.tagName.toLowerCase() === rule.tag.toLowerCase()) matched = true;
      else if (rule.class && el.classList && el.classList.contains(rule.class)) matched = true;
      if (matched && rule.style) {
        Object.keys(rule.style).forEach(function(prop) { el.style[prop] = rule.style[prop]; });
        count++;
      }
    });
    Array.prototype.slice.call(el.children).forEach(applyrules);
  }
  applyrules(root);
  return count;
}

function SU_consolidatestyles(root, safeprops, sc) {
  if (!safeprops) safeprops = ['color','font-family','font-size','font-weight','font-style','line-height','text-align','cursor','letter-spacing','word-spacing','text-transform','text-decoration','font-variant'];
  var count = 0;
  function walk(el) {
    Array.prototype.slice.call(el.children).forEach(function(child) {
      if (child.style) {
        var styleprops = Array.prototype.slice.call(child.style);
        styleprops.forEach(function(prop) {
          if (safeprops.indexOf(prop) !== -1 && el.style && el.style[prop] === child.style[prop]) { child.style.removeProperty(prop); count++; }
        });
      }
      walk(child);
    });
  }
  walk(root);
  return count;
}

function SU_optimizecontrast(root, themestyles, options, sc) {
  var minratio = (options && options.minratio != null) ? options.minratio : 4.5;
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !contrast) return 0;
  els.forEach(function(el) {
    if (el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (!bg) return;
      var fghex = SU_getrgbhex(el.style.color, sc);
      var bghex = SU_getrgbhex(bg, sc);
      if (contrast.contrastratio(fghex, bghex, core) < minratio) {
        var newfg = contrast.getoptimalforeground(bghex, minratio, { scheme: 'complementary' }, harmony, contrast, core);
        el.style.color = newfg;
        count++;
      }
    }
  });
  return count;
}

function SU_optimizeharmony(root, themestyles, options, sc) {
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !harmony) return 0;
  els.forEach(function(el) {
    if (el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (!bg) return;
      var fg = SU_getrgbhex(el.style.color, sc);
      var bghex = SU_getrgbhex(bg, sc);
      if (SU_harmonyscore(fg, bghex, sc) < 0.5) {
        var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
        if (pal.length) { el.style.color = pal[0]; count++; }
      }
    }
  });
  return count;
}

function SU_optimizetextvisibility(root, themestyles, options, sc) {
  if (!themestyles) themestyles = {};
  var minlh = (options && options.minlineheight != null) ? options.minlineheight : 1.2;
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*'));
  els.forEach(function(el) {
    if (el.textContent.trim()) {
      var tag = el.tagName.toLowerCase();
      var minsize = (sc && sc.parselength) ? sc.parselength(themestyles[tag] && themestyles[tag].fontsize || themestyles['p'] && themestyles['p'].fontsize || '12px', 16) : 12;
      var cursize = (sc && sc.parselength) ? sc.parselength(el.style.fontSize, 16) || 0 : (parseFloat(el.style.fontSize) || 0);
      var curlh = parseFloat(el.style.lineHeight) || 0;
      var modified = false;
      if (cursize > 0 && cursize < minsize) { el.style.fontSize = minsize + 'px'; modified = true; }
      if (curlh && curlh < minlh) { el.style.lineHeight = String(minlh); modified = true; }
      if (modified) count++;
    }
  });
  return count;
}

function SU_optimizebuttonvisibility(root, sc) {
  var count = 0;
  var els = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
  });
  els.forEach(function(btn) {
    var w = parseFloat(btn.style.width) || 0;
    var h = parseFloat(btn.style.height) || 0;
    var minw = Math.max(44, SU_estimaterecursivebounds(btn, sc) + 24);
    var modified = false;
    if (w < minw) { btn.style.minWidth = minw + 'px'; modified = true; }
    if (h < 44) { btn.style.minHeight = '44px'; modified = true; }
    if (!btn.style.cursor) { btn.style.cursor = 'pointer'; modified = true; }
    if (modified) count++;
  });
  return count;
}

function SU_verifycontrast(root, minratio, sc) {
  if (minratio === undefined) minratio = 4.5;
  var violations = [];
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var contrast = (sc && sc.color && sc.color.contrast) || (typeof colorcontrast !== 'undefined' ? colorcontrast : null);
  if (!core || !contrast) return violations;
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
      var bg = SU_geteffectivebackground(el, sc);
      if (bg) {
        var fghex = SU_getrgbhex(el.style.color, sc);
        var bghex = SU_getrgbhex(bg, sc);
        var ratio = contrast.contrastratio(fghex, bghex, core);
        if (ratio < minratio) violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), ratio: ratio, expected: minratio, color: fghex, bg: bghex });
      }
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(root);
  return violations;
}

function SU_verifytextvisibility(root, sc) {
  var violations = [];
  function walk(el) {
    if (el.nodeType === 1 && el.textContent.trim()) {
      var fsize = (sc && sc.parselength) ? sc.parselength(el.style.fontSize, 16) || 0 : (parseFloat(el.style.fontSize) || 0);
      var lh = parseFloat(el.style.lineHeight) || 0;
      var col = el.style.color;
      var id = el.tagName + (el.id ? '#' + el.id : '');
      if (fsize && fsize < 12) violations.push({ element: id, issue: 'font-size too small', value: fsize });
      if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
      if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
    }
    Array.prototype.slice.call(el.children).forEach(walk);
  }
  walk(root);
  return violations;
}

function SU_verifybuttonvisibility(root, sc) {
  var violations = [];
  Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
  }).forEach(function(btn) {
    var w = parseFloat(btn.style.width) || 0;
    var h = parseFloat(btn.style.height) || 0;
    var id = btn.tagName + (btn.id ? '#' + btn.id : '');
    if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w: w, h: h });
    if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
  });
  return violations;
}

function SU_verifyharmony(root, options, sc) {
  if (options === undefined) options = {};
  var violations = [];
  var core = (sc && sc.color && sc.color.core) || (typeof colorcore !== 'undefined' ? colorcore : null);
  var harmony = (sc && sc.color && sc.color.harmony) || (typeof colorharmony !== 'undefined' ? colorharmony : null);
  if (!core || !harmony) return violations;
  Array.prototype.slice.call(root.getElementsByTagName('*')).forEach(function(el) {
    if (!el.textContent.trim() || !el.style.color) return;
    var bg = SU_geteffectivebackground(el, sc);
    if (!bg) return;
    var fg = SU_getrgbhex(el.style.color, sc);
    var bghex = SU_getrgbhex(bg, sc);
    var score = harmony.colorharmonyscore(fg, bghex, core);
    if (score < 0.5) {
      violations.push({ element: el.tagName + (el.id ? '#' + el.id : ''), score: score, color: fg, bg: bg });
      if (options.autocorrect) {
        var pal = harmony.getharmoniouspalette(bghex, 3, { scheme: 'analogous' }, harmony, core);
        if (pal.length) el.style.color = pal[0];
      }
    }
  });
  return violations;
}

function SU_checkfocusvisibility(root, sc) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    return (tag === 'a' && el.getAttribute('href')) || ['button', 'input', 'select', 'textarea'].indexOf(tag) !== -1 || el.getAttribute('tabindex') !== null;
  }).filter(function(el) {
    return !el.hasAttribute('onfocus') && (!el.style.outline || ['none', '0px'].indexOf(el.style.outline) !== -1);
  }).map(function(el) {
    return { element: el.tagName + (el.id ? '#' + el.id : ''), issue: 'no focus indicator' };
  });
}

var LC_CORRECTION_MAXITER = 32;

function LC_getcandidateelements(root, stylizercore) {
  var sc = stylizercore || (typeof stylizercore !== 'undefined' ? stylizercore : null);
  var applyfn = (sc && sc.applystep) ? sc.applystep : SU_applystep;
  return applyfn([root], { axis: 'descendant' }, null, sc).filter(function(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
    if (tag === 'div' && el.style && (el.style.width || el.style.maxWidth)) return true;
    return false;
  });
}

function LC_checkspacingdoc(root, mingap, stylizercore) {
  if (mingap === undefined) mingap = 12;
  var blocktags = ['div','section','article','header','footer','nav','p','h1','h2','h3','h4','h5','h6','li'];
  function contains(arr, item) { return arr.indexOf(item) !== -1; }
  function iseligiblecontainer(el) { var s = el.style || {}; var d = s.display || ''; return d !== 'flex' && d !== 'grid'; }
  function iseligiblechild(el) {
    if (!el || el.nodeType !== 1) return false;
    var s = el.style || {};
    if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') return false;
    if (contains(blocktags, el.tagName.toLowerCase())) return true;
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
  function walk(node, violations) {
    if (!node || node.nodeType !== 1) return violations;
    if (!iseligiblecontainer(node)) return violations;
    var rawchildren = Array.prototype.slice.call(node.children);
    var eligible = filtereligiblechildren(rawchildren, 0, []);
    violations = comparechildren(eligible, 0, violations);
    return walkparentchildren(node, 0, violations);
  }
  return walk(root, []);
}

function LC_correctspacingdoc(root, mingap, stylizercore) {
  if (mingap === undefined) mingap = 12;
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkspacingdoc(root, mingap, stylizercore);
    var uncorrected = violations.filter(function(v) { return !register.has(v.elementa); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { register.add(v.elementa); if (!v.elementa) return; v.elementa.style.marginBottom = mingap + 'px'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkoverlapdoc(root) {
  var positioned = Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) { return el.style && (el.style.position === 'absolute' || el.style.position === 'fixed'); });
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

function LC_correctoverlapdoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkoverlapdoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementbref && !register.has(v.elementbref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementbref; if (!el) return; register.add(el); el.style.position = 'relative'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkscrollabilitydoc(root) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), elementref: el }; });
}

function LC_correctscrollabilitydoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkscrollabilitydoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementref && !register.has(v.elementref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementref; if (!el) return; register.add(el); el.style.touchAction = 'pan-y'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkcontrolledoverlaydoc(root) {
  return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(function(el) {
    var s = el.style;
    return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
  }).map(function(el) { return { element: el.tagName + (el.id ? '#' + el.id : ''), elementref: el }; });
}

function LC_correctcontrolledoverlaydoc(root) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkcontrolledoverlaydoc(root);
    var uncorrected = violations.filter(function(v) { return v.elementref && !register.has(v.elementref); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(v) { var el = v.elementref; if (!el) return; register.add(el); el.style.zIndex = '10'; applied += 1; });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}

function LC_checkoverflowdoc(root, viewportwidth, containerwidths, stylizercore) {
  function isinsidescrollwrapper(el) {
    function climb(parent) { if (!parent) return false; var s = parent.style || {}; if (parent.tagName.toLowerCase() === 'div' && (s.width || s.maxWidth) && s.overflow === 'scroll') return true; return climb(parent.parentElement); }
    return climb(el.parentElement);
  }
  var buildmapfn = (stylizercore && stylizercore.buildlayoutpropertymap) ? stylizercore.buildlayoutpropertymap : SU_buildlayoutpropertymap;
  var getpropsfn = (stylizercore && stylizercore.getpropsfrommap) ? stylizercore.getpropsfrommap : SU_getpropsfrommap;
  var computefn = (stylizercore && stylizercore.computeintrinsicsize) ? stylizercore.computeintrinsicsize : SU_computeintrinsicsize;
  var propertymap = buildmapfn(root, viewportwidth, undefined, stylizercore);
  return LC_getcandidateelements(root, stylizercore)
    .filter(function(el) { return !isinsidescrollwrapper(el); })
    .filter(function(el) {
      var props = getpropsfn(propertymap, el, stylizercore);
      if (!props) return false;
      try { var size = computefn(el, propertymap, props, stylizercore); return size.width > props.availablewidth; }
      catch (err) { if (stylizercore && stylizercore.warn) { stylizercore.warn('[checkoverflowdoc] Failed to compute intrinsic size:', el.tagName, err); } return false; }
    });
}

function LC_correctoverflowdoc(root, viewportwidth, containerwidths, stylizercore) {
  var register = new WeakSet();
  var applied = 0;
  var converged = false;
  var iter = 0;
  while (iter < LC_CORRECTION_MAXITER) {
    var violations = LC_checkoverflowdoc(root, viewportwidth, containerwidths, stylizercore);
    var uncorrected = violations.filter(function(el) { return !register.has(el); });
    if (uncorrected.length === 0) { converged = true; break; }
    uncorrected.forEach(function(el) {
      register.add(el);
      if (LC_isintentionalclip(el)) return;
      var wrapper = document.createElement('div');
      wrapper.style.width = '80%';
      wrapper.style.overflow = 'scroll';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
      applied += 1;
    });
    iter += 1;
  }
  return { applied: applied, converged: converged };
}
