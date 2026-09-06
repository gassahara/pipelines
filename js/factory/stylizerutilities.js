function scannumberend(str, i) {
  if (i >= str.length) return i;
  var c = str.charAt(i);
  if ((c >= '0' && c <= '9') || c === '.') return scannumberend(str, i + 1);
  return i;
}

var defaultverbositystate = Object.freeze({ level: createverbosityconstants().DEBUG });

var stylizercore = {
  has: function(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  },

  isarray: function(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  },

  createstylizerconstants: function() {
    return Object.freeze({
      safeprops: Object.freeze([
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'text-align', 'cursor', 'letter-spacing', 'word-spacing',
        'text-transform', 'text-decoration', 'font-variant'
      ]),
      blockdisplayvalues: Object.freeze(['block', 'flex', 'grid']),
      blocktags: Object.freeze([
        'div', 'section', 'article', 'header', 'footer', 'nav', 'p',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'
      ]),
      defaultmingap: 12,
      defaultminratio: 4.5
    });
  },

  cameltokebab: function(str) {
    if (typeof str !== 'string') return str;
    return str.split('').reduce(function(out, ch) {
      if (ch >= 'A' && ch <= 'Z') {
        return out + '-' + ch.toLowerCase();
      }
      return out + ch;
    }, '');
  },

  kebabcamel: function(str) {
    if (typeof str !== 'string') return str;
    function scan(i, out) {
      if (i >= str.length) return out;
      var ch = str.charAt(i);
      if (ch === '-' && i + 1 < str.length) {
        var next = str.charAt(i + 1);
        if (next >= 'a' && next <= 'z') {
          return scan(i + 2, out + next.toUpperCase());
        }
      }
      return scan(i + 1, out + ch);
    }
    return scan(0, '');
  },

  tokenizewhitespace: function(str) {
    var s = String(str);

    function scan(i, current, tokens) {
      if (i >= s.length) {
        if (current !== '') tokens.push(current);
        return tokens;
      }
      var ch = s.charAt(i);

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
          ch === '\v' || ch === '\f' || ch === '\ufeff') {
        if (current !== '') {
          tokens.push(current);
          current = '';
        }
        return scan(i + 1, current, tokens);
      }
      return scan(i + 1, current + ch, tokens);
    }

    return scan(0, '', []);
  },

  parselength: function(value, referencepx) {
    if (referencepx === undefined) referencepx = 16;

    var keywordlengths = {
      auto: 1, medium: 1.3, large: 1.5, small: 0.7, tiny: 0.5
    };

    var lengthfactors = {
      px: 1, '': 1,
      '%': function(n, ref) { return (n / 100) * ref; },
      em: function(n, ref) { return n * ref; },
      rem: function(n) { return n * 16; },
      pt: function(n) { return n * (96 / 72); },
      pc: function(n) { return n * 16; },
      in: function(n) { return n * 96; },
      cm: function(n) { return n * (96 / 2.54); },
      mm: function(n) { return n * (96 / 25.4); },
      q: function(n) { return n * (96 / 101.6); }
    };

    if (typeof value === 'number') return value;
    if (!value) return 0;
    if (keywordlengths[value] !== undefined) {
      value = referencepx * keywordlengths[value];
    }

    var str = String(value).trim();
    var i = 0;
    if (str.charAt(i) === '+' || str.charAt(i) === '-') i += 1;

    var start = i;
    var end = scannumberend(str, i);

    var numstr = str.slice(start, end);
    var unit = str.slice(end).toLowerCase();
    var num = parseFloat(numstr);

    var factor = lengthfactors[unit];
    if (factor === undefined) {
      throw new Error('[parselength] Unknown unit: ' + unit);
    }

    return typeof factor === 'function' ? factor(num, referencepx) : num * factor;
  },

  computebasespacing: function(viewportwidth, basefontsize) {
    if (basefontsize === undefined) basefontsize = 16;
    var scale = Math.min(1, (viewportwidth || 960) / 960);

    function round(v) { return Math.round(v); }

    return {
      pad: round(16 * scale),
      margin: round(8 * scale),
      listindent: round(24 * scale),
      codepad: round(12 * scale),
      cardpad: round(12 * scale),
      btnpadv: round(8 * scale),
      btnpadh: round(16 * scale),
      gap: round(8 * scale),
      scale: scale
    };
  },

  parseshorthandlengths: function(value, referencepx, stylizercore) {
    if (!value) return null;
    var tokens = stylizercore.tokenizewhitespace(String(value));
    if (!tokens.length) return null;

    var t = stylizercore.parselength(tokens[0], referencepx);
    var r = tokens[1] !== undefined ? stylizercore.parselength(tokens[1], referencepx) : t;
    var b = tokens[2] !== undefined ? stylizercore.parselength(tokens[2], referencepx) : t;
    var l = tokens[3] !== undefined ? stylizercore.parselength(tokens[3], referencepx) : r;

    return { top: t, right: r, bottom: b, left: l };
  },

  applystep: function(nodes, step, filterfn, stylizercore) {
    if (filterfn === undefined) filterfn = null;

    function getancestors(el) {
      function climb(p, acc) {
        if (!p || p.nodeType !== 1) return acc;
        return climb(p.parentNode, acc.concat([p]));
      }
      return climb(el.parentNode, []);
    }

    function getsiblings(el, dir) {
      function walk(s, acc) {
        if (!s) return acc;
        return walk(s[dir], s.nodeType === 1 ? acc.concat([s]) : acc);
      }
      return walk(el[dir], []);
    }

    function getdepth(ancestor, descendant) {
      if (!descendant || descendant === ancestor) return 0;
      if (descendant.nodeType !== 1) return getdepth(ancestor, descendant.parentNode);
      return 1 + getdepth(ancestor, descendant.parentNode);
    }

    return nodes.reduce(function(next, node) {
      var candidates = [];

      switch (step.axis || 'child') {
        case 'self': candidates = [node]; break;
        case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
        case 'ancestor': candidates = getancestors(node); break;
        case 'child': candidates = Array.prototype.slice.call(node.children || []); break;
        case 'descendant': candidates = stylizercore.getalldescendants(node, stylizercore); break;
        case 'nextsibling': candidates = getsiblings(node, 'nextSibling'); break;
        case 'previoussibling': candidates = getsiblings(node, 'previousSibling'); break;
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
        candidates = candidates.filter(function(el) {
          return getdepth(node, el) === step.depth;
        });
      }
      if (step.skip !== undefined && (step.axis === 'nextsibling' || step.axis === 'previoussibling')) {
        candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
      }
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

      candidates.forEach(function(c) {
        if (next.indexOf(c) === -1) next.push(c);
      });

      return next;
    }, []);
  },

  getalldescendants: function(el, stylizercore) {
    var children = Array.prototype.slice.call(el.children || []);
    return children.reduce(function(all, child) {
      return all.concat(child, stylizercore.getalldescendants(child, stylizercore));
    }, []);
  },

  buildlayoutpropertymap: function(rootel, viewportwidth, inheritedfontsize, stylizercore) {
    if (inheritedfontsize === undefined) inheritedfontsize = 16;

    function walk(el, parentavailablewidth, parentfontsize, acc) {
      var style = el.style || {};
      var props = {
        fontsize: parentfontsize,
        width: null,
        maxwidth: null,
        minwidth: null,
        height: null,
        margintop: 0,
        marginbottom: 0,
        marginleft: 0,
        marginright: 0,
        paddingtop: 0,
        paddingbottom: 0,
        paddingleft: 0,
        paddingright: 0,
        bordertopwidth: 0,
        borderbottomwidth: 0,
        borderleftwidth: 0,
        borderrightwidth: 0,
        availablewidth: parentavailablewidth
      };

      var propnames = [
        'fontsize', 'width', 'maxwidth', 'minwidth', 'height',
        'margintop', 'marginbottom', 'marginleft', 'marginright',
        'paddingtop', 'paddingbottom', 'paddingleft', 'paddingright',
        'bordertopwidth', 'borderbottomwidth', 'borderleftwidth', 'borderrightwidth'
      ];

      propnames.forEach(function(prop) {
        if (style[prop]) {
          props[prop] = stylizercore.parselength(
            style[prop],
            prop === 'fontsize' ? parentfontsize : parentavailablewidth
          );
        }
      });

      if (style.margin) {
        var sh = stylizercore.parseshorthandlengths(style.margin, parentavailablewidth, stylizercore);
        if (sh) {
          props.margintop = sh.top;
          props.marginright = sh.right;
          props.marginbottom = sh.bottom;
          props.marginleft = sh.left;
        }
      }
      if (style.padding) {
        var sh2 = stylizercore.parseshorthandlengths(style.padding, parentavailablewidth, stylizercore);
        if (sh2) {
          props.paddingtop = sh2.top;
          props.paddingright = sh2.right;
          props.paddingbottom = sh2.bottom;
          props.paddingleft = sh2.left;
        }
      }

      var contentwidth = Math.max(
        0,
        parentavailablewidth -
          props.paddingleft - props.paddingright -
          props.borderleftwidth - props.borderrightwidth
      );

      var selfavailable = contentwidth;
      if (props.maxwidth !== null) selfavailable = Math.min(selfavailable, props.maxwidth);
      if (props.width !== null) selfavailable = Math.min(selfavailable, props.width);
      if (props.minwidth !== null) selfavailable = Math.max(selfavailable, props.minwidth);
      props.availablewidth = selfavailable;

      var nextacc = acc.concat([{ element: el, props: props }]);
      var children = stylizercore.applystep([el], { axis: 'child' }, null, stylizercore);

      return children.reduce(function(inneracc, child) {
        return walk(child, selfavailable, props.fontsize, inneracc);
      }, nextacc);
    }

    return walk(rootel, viewportwidth, inheritedfontsize, []);
  },

  getpropsfrommap: function(propsmap, el, stylizercore) {
    var entry = propsmap.filter(function(item) { return item.element === el; })[0];
    return entry ? entry.props : null;
  },

  computeintrinsicsize: function(node, propertymap, inheritedprops, stylizercore) {
    if (inheritedprops === undefined) inheritedprops = {};
    var defaultlineheightfactor = 1.2;

    if (!node) return { width: 0, height: 0 };

    if (node.nodeType === 3) {
      var txt = node.nodeValue.trim();
      if (!txt) return { width: 0, height: 0 };

      var fontsize = inheritedprops.fontsize || 16;
      var lines = txt.split('\n');
      var isnowrap = inheritedprops.whitespace === 'nowrap' || inheritedprops.whitespace === 'pre';
      var maxlinelen = Math.max.apply(null, lines.map(function(line) {
        var words = isnowrap ? [line] : stylizercore.tokenizewhitespace(line);
        return words.reduce(function(len, w, i) {
          return len + w.length * fontsize + (i > 0 ? fontsize : 0);
        }, 0);
      }));
      var lineheight = inheritedprops.lineheight || fontsize * defaultlineheightfactor;
      return { width: maxlinelen, height: lines.length * lineheight };
    }

    if (node.nodeType !== 1) return { width: 0, height: 0 };

    var props = stylizercore.getpropsfrommap(propertymap, node, stylizercore);
    if (!props) {
      logerror(defaultverbositystate, '[stylizercore]', '[computeintrinsicsize] Missing property map entry:', node.tagName);
      throw new Error('[computeintrinsicsize] Missing property map entry: ' + node.tagName);
    }

    var tag = node.tagName.toLowerCase();
    var padh = (props.paddingleft || 0) + (props.paddingright || 0) +
      (props.borderleftwidth || 0) + (props.borderrightwidth || 0);
    var padv = (props.paddingtop || 0) + (props.paddingbottom || 0);

    if (tag === 'img' || tag === 'svg') {
      if (props.width !== null) {
        return { width: props.width, height: props.height || (props.width * 0.75) };
      }
      logerror(defaultverbositystate, '[stylizercore]', '[computeintrinsicsize] Image without explicit width:', tag);
      throw new Error('[computeintrinsicsize] Image without explicit width');
    }

    if (tag === 'table') {
      if (props.width !== null) return { width: props.width, height: props.height || 0 };
      var rows = stylizercore.applystep([node], { axis: 'descendant', tag: 'tr' }, null, stylizercore);
      var colmax = {};
      var totalh = 0;

      rows.forEach(function(row) {
        var rowh = 0;
        stylizercore.applystep([row], { axis: 'child' }, null, stylizercore).forEach(function(cell, idx) {
          var s = stylizercore.computeintrinsicsize(cell, propertymap, props, stylizercore);
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

    var isflexrow = node.style && node.style.display === 'flex' &&
      (node.style.flexDirection === 'row' || !node.style.flexDirection);

    var totalw = 0, maxw = 0, totalh = 0;

    children.forEach(function(child) {
      var s = stylizercore.computeintrinsicsize(child, propertymap, props, stylizercore);
      if (isflexrow) {
        totalw += s.width;
        totalh = Math.max(totalh, s.height);
      } else {
        maxw = Math.max(maxw, s.width);
        totalh += s.height;
      }
    });

    return { width: (isflexrow ? totalw : maxw) + padh, height: totalh + padv };
  },

  estimaterecursivebounds: function(node, stylizercore) {
    if (node.nodeType === 3) {
      var txt = node.nodeValue.trim();
      if (!txt) return 0;

      var fsize = 16;
      var isnowrap = false;

      function climb(p, size, nowrap) {
        if (!p || !p.style) return { size: size, nowrap: nowrap };
        if (p.style.fontSize) {
          var raw = p.style.fontSize;
          return {
            size: (raw.indexOf('rem') !== -1 || raw.indexOf('em') !== -1)
              ? parseFloat(raw) * 16
              : parseFloat(raw),
            nowrap: nowrap
          };
        }
        return climb(p.parentElement, size, nowrap || p.style.whiteSpace === 'nowrap');
      }

      var resolved = climb(node.parentElement, fsize, isnowrap);
      fsize = resolved.size;
      isnowrap = resolved.nowrap;

      var charpx = fsize * 0.6;
      if (isnowrap) return txt.length * charpx;

      var words = stylizercore.tokenizewhitespace(txt);
      var maxwordlen = Math.max.apply(null, words.map(function(w) { return w.length; }));
      return maxwordlen * charpx;
    }

    if (node.nodeType === 1) {
      if (node.tagName && (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg')) {
        return parseFloat(node.style.width || node.getAttribute('width') || 24);
      }

      var isflexrow = node.style.display === 'flex' &&
        (node.style.flexDirection === 'row' || !node.style.flexDirection);
      var totalw = 0;

      Array.prototype.slice.call(node.childNodes).forEach(function(child) {
        var w = stylizercore.estimaterecursivebounds(child, stylizercore);
        totalw = isflexrow ? totalw + w : Math.max(totalw, w);
      });

      return totalw;
    }

    return 0;
  },

  geteffectivebackground: function(el, stylizercore) {
    function ishexdigit(ch) {
      return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }

    function findhexcolor(str) {
      function scanhex(j, count) {
        if (j < str.length && ishexdigit(str.charAt(j))) return scanhex(j + 1, count + 1);
        return { j: j, count: count };
      }
      function scan(i) {
        if (i >= str.length) return null;
        if (str.charAt(i) === '#') {
          var res = scanhex(i + 1, 0);
          if (res.count === 3 || res.count === 6) {
            return str.slice(i, res.j);
          }
        }
        return scan(i + 1);
      }
      return scan(0);
    }

    function findrgbcolor(str) {
      var idx = str.indexOf('rgb(');
      if (idx === -1) return null;

      var end = str.indexOf(')', idx);
      if (end === -1) return null;

      return str.slice(idx, end + 1);
    }

    function extractbgfromshorthand(node) {
      if (node.style.backgroundColor) return node.style.backgroundColor;

      var bg = node.style.background;
      if (!bg) return null;

      return findhexcolor(bg) || findrgbcolor(bg) || null;
    }

    function climbbg(curr) {
      if (!curr || curr.nodeType !== 1) return '';
      var bg = extractbgfromshorthand(curr);
      if (bg) return bg;
      return climbbg(curr.parentNode);
    }

    return climbbg(el);
  },

  debug: function() {
    var args = Array.prototype.slice.call(arguments);
    logdebug.apply(null, [defaultverbositystate, '[stylizercore]'].concat(args));
  },
  warn: function() {
    var args = Array.prototype.slice.call(arguments);
    logwarn.apply(null, [defaultverbositystate, '[stylizercore]'].concat(args));
  },
  error: function() {
    var args = Array.prototype.slice.call(arguments);
    logerror.apply(null, [defaultverbositystate, '[stylizercore]'].concat(args));
  },
  info: function() {
    var args = Array.prototype.slice.call(arguments);
    loginfo.apply(null, [defaultverbositystate, '[stylizercore]'].concat(args));
  }
};

// Attach color utilities to stylizercore
stylizercore.color = {
  core: colorcore,
  harmony: colorharmony,
  contrast: colorcontrast
};

var stylizerrewrite = {
  rewritestyleattrs: function(html, rules, stylizercore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function applyrules(el) {
      rules.forEach(function(rule) {
        if (rule.id && el.id === rule.id) {
          Object.keys(rule.style || {}).forEach(function(prop) {
            el.style[prop] = rule.style[prop];
          });
        } else if (rule.tag && el.tagName && el.tagName.toLowerCase() === rule.tag.toLowerCase()) {
          Object.keys(rule.style || {}).forEach(function(prop) {
            el.style[prop] = rule.style[prop];
          });
        } else if (rule.class && el.classList && el.classList.contains(rule.class)) {
          Object.keys(rule.style || {}).forEach(function(prop) {
            el.style[prop] = rule.style[prop];
          });
        } else if (rule.path && Array.isArray(rule.path)) {
          function walkpath(stepindex, currentnodes) {
            if (stepindex >= rule.path.length) return currentnodes;
            var step = rule.path[stepindex];
            var nextnodes = [];

            currentnodes.forEach(function(node) {
              var matches = stylizercore.applystep([node], step, null, stylizercore);
              matches.forEach(function(m) { if (nextnodes.indexOf(m) === -1) nextnodes.push(m); });
            });

            if (!nextnodes.length) return [];
            return walkpath(stepindex + 1, nextnodes);
          }

          var pathresult = walkpath(0, [el]);
          if (pathresult.indexOf(el) !== -1) {
            Object.keys(rule.style || {}).forEach(function(prop) {
              el.style[prop] = rule.style[prop];
            });
          }
        }
      });

      Array.prototype.slice.call(el.children).forEach(applyrules);
    }

    applyrules(doc.body);
    return doc.body.innerHTML;
  },

  injectresponsivestyles: function(html, breakpointrules, stylizercore) {
    if (!breakpointrules || !breakpointrules.length) return html;

    var css = '<style data-responsive="true">';

    breakpointrules.forEach(function(bp) {
      var min = bp.minwidth !== undefined ? '(min-width: ' + bp.minwidth + 'px)' : '';
      var max = bp.maxwidth !== undefined ? '(max-width: ' + bp.maxwidth + 'px)' : '';
      css += '@media ' + [min, max].filter(Boolean).join(' and ') + ' {\n';

      bp.rules.forEach(function(rule) {
        var sel = rule.id ? '#' + rule.id : rule.class ? '.' + rule.class : rule.tag || '*';
        css += '  ' + sel + ' {\n';
        Object.keys(rule.style).forEach(function(prop) {
          css += '    ' + stylizercore.cameltokebab(prop) + ': ' + rule.style[prop] + ';\n';
        });
        css += '  }\n';
      });

      css += '}\n';
    });

    css += '</style>';
    var lastdiv = html.lastIndexOf('</div>');
    return lastdiv !== -1 ? html.slice(0, lastdiv) + css + html.slice(lastdiv) : html + css;
  },

  extractalltagstyles: function(referencehtml, stylizercore) {
    var doc = new DOMParser().parseFromString(referencehtml, 'text/html');
    var refroot = doc.getElementById('theme-reference');
    if (!refroot) return {};

    var map = {};

    if (refroot.style.length) {
      map['root'] = Array.prototype.slice.call(refroot.style).reduce(function(acc, prop) {
        acc[prop] = refroot.style[prop];
        return acc;
      }, {});
    }

    Array.prototype.slice.call(refroot.children).forEach(function(el) {
      var tag = el.tagName.toLowerCase();
      var s = Array.prototype.slice.call(el.style).reduce(function(acc, prop) {
        acc[prop] = el.style[prop];
        return acc;
      }, {});

      if (!map[tag]) map[tag] = {};
      Object.keys(s).forEach(function(prop) {
        map[tag][prop] = s[prop];
      });
    });

    return map;
  },

  consolidatestyles: function(html, stylizercore) {
    var constants = stylizercore.createstylizerconstants();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var safeprops = constants.safeprops;

    function walk(el) {
      Array.prototype.slice.call(el.children).forEach(function(child) {
        if (child.style) {
          var styleprops = Array.prototype.slice.call(child.style);
          styleprops.reduceRight(function(_, prop) {
            if (safeprops.indexOf(prop) !== -1 && el.style[prop] === child.style[prop]) {
              child.style.removeProperty(prop);
            }
            return null;
          }, null);
        }
        walk(child);
      });
    }

    walk(doc.body);
    return doc.body.innerHTML;
  },

  computecolorscheme: function(pos, tilecols, cellw, cellh, gridcols, stylizercore) {
    var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
    var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
    var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
    var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));

    function rowsrange(r, acc) {
      if (r >= rowend) return acc;
      function colsrange(c, inner) {
        if (c >= colend) return inner;
        var idx = r * gridcols + c;
        if (idx < tilecols.length) {
          inner.sumh += tilecols[idx].h;
          inner.sums += tilecols[idx].s;
          inner.suml += tilecols[idx].l;
          inner.count++;
        }
        return colsrange(c + 1, inner);
      }
      return rowsrange(r + 1, colsrange(colstart, acc));
    }

    var totals = rowsrange(rowstart, { sumh: 0, sums: 0, suml: 0, count: 0 });
    var sumh = totals.sumh, sums = totals.sums, suml = totals.suml, count = totals.count;

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
  },

  optimizestylehtml: function(html, goals, themestyles, maxiterations, stylizercore) {
    if (themestyles === undefined) themestyles = {};
    if (maxiterations === undefined) maxiterations = 5;

    var doc = new DOMParser().parseFromString(html, 'text/html');
    var allrules = [];

    function getrgbhex(input) {
      var core = stylizercore.color.core;
      var rgb = core.hextorgb(input, core);
      return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
    }

    function harmonyscore(fg, bg) {
      var fghsl = stylizercore.color.core.rgbtohsl.apply(null, stylizercore.color.core.hextorgb(fg, stylizercore.color.core));
      var bghsl = stylizercore.color.core.rgbtohsl.apply(null, stylizercore.color.core.hextorgb(bg, stylizercore.color.core));
      var huedist = Math.abs(fghsl.h - bghsl.h);
      var normalizeddist = huedist > 180 ? 360 - huedist : huedist;

      if (normalizeddist < 30) return 1;
      if (normalizeddist < 60) return 0.9;
      if (normalizeddist > 150 && normalizeddist < 180) return 0.95;
      if (normalizeddist > 90 && normalizeddist < 120) return 0.4;
      return 0.7;
    }

    function runiteration(iter) {
      if (iter >= maxiterations) return;
      var anycorrection = false;

      goals.forEach(function(goal) {
        var els = Array.prototype.slice.call(doc.getElementsByTagName('*'));

        if (goal.type === 'contrast') {
          var minratio = goal.options && goal.options.minratio != null ? goal.options.minratio : 4.5;

          els.forEach(function(el) {
            if (el.textContent.trim() && el.style.color) {
              var bg = stylizercore.geteffectivebackground(el, stylizercore);
              if (!bg) return;

              var fghex = getrgbhex(el.style.color);
              var bghex = getrgbhex(bg);

              if (stylizercore.color.contrast.contrastratio(fghex, bghex, stylizercore.color.core) < minratio) {
                var newfg = stylizercore.color.contrast.getoptimalforeground(
                  bghex,
                  minratio,
                  { scheme: 'complementary' },
                  stylizercore.color.harmony,
                  stylizercore.color.contrast,
                  stylizercore.color.core
                );
                el.style.color = newfg;
                allrules.push({
                  selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
                  styles: { color: newfg }
                });
                anycorrection = true;
              }
            }
          });
        } else if (goal.type === 'harmony') {
          els.forEach(function(el) {
            if (el.textContent.trim() && el.style.color) {
              var bg = stylizercore.geteffectivebackground(el, stylizercore);
              if (!bg) return;

              var fg = getrgbhex(el.style.color);
              var bghex = getrgbhex(bg);

              if (harmonyscore(fg, bghex) < 0.5) {
                var pal = stylizercore.color.harmony.getharmoniouspalette(
                  bghex,
                  3,
                  { scheme: 'analogous' },
                  stylizercore.color.harmony,
                  stylizercore.color.core
                );
                if (pal.length) {
                  el.style.color = pal[0];
                  allrules.push({
                    selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
                    styles: { color: pal[0] }
                  });
                  anycorrection = true;
                }
              }
            }
          });
        } else if (goal.type === 'textvisibility') {
          var minlh = goal.options && goal.options.minlineheight != null ? goal.options.minlineheight : 1.2;

          els.forEach(function(el) {
            if (el.textContent.trim()) {
              var tag = el.tagName.toLowerCase();
              var minsize = stylizercore.parselength(
                themestyles[tag] && themestyles[tag].fontsize ||
                themestyles['p'] && themestyles['p'].fontsize ||
                '12px',
                16
              );
              var cursize = stylizercore.parselength(el.style.fontSize, 16) || 0;
              var curlh = parseFloat(el.style.lineHeight) || 0;
              var styles = {};

              if (cursize > 0 && cursize < minsize) styles.fontSize = minsize + 'px';
              if (curlh && curlh < minlh) styles.lineHeight = String(minlh);

              if (Object.keys(styles).length) {
                Object.keys(styles).forEach(function(prop) {
                  el.style[prop] = styles[prop];
                });
                allrules.push({
                  selector: el.id ? { id: el.id } : { tag: tag },
                  styles: styles
                });
                anycorrection = true;
              }
            }
          });
        } else if (goal.type === 'buttonvisibility') {
          els.filter(function(el) {
            var tag = el.tagName.toLowerCase();
            return tag === 'button' ||
              el.getAttribute('role') === 'button' ||
              (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
          }).forEach(function(btn) {
            var w = parseFloat(btn.style.width) || 0;
            var h = parseFloat(btn.style.height) || 0;
            var styles = {};
            var minw = Math.max(44, stylizercore.estimaterecursivebounds(btn, stylizercore) + 24);

            if (w < minw) styles.minWidth = minw + 'px';
            if (h < 44) styles.minHeight = '44px';
            if (!btn.style.cursor) styles.cursor = 'pointer';

            if (Object.keys(styles).length) {
              Object.keys(styles).forEach(function(prop) {
                btn.style[prop] = styles[prop];
              });
              allrules.push({
                selector: btn.id ? { id: btn.id } : { tag: btn.tagName.toLowerCase() },
                styles: styles
              });
              anycorrection = true;
            }
          });
        }
      });

      if (anycorrection) runiteration(iter + 1);
    }

    runiteration(0);

    return { html: doc.body.innerHTML, rules: allrules };
  }
};

var stylizerverify = {
  verifycontrast: function(html, minratio, stylizercore) {
    if (minratio === undefined) minratio = 4.5;
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function getrgbhex(input) {
      var core = stylizercore.color.core;
      var rgb = core.hextorgb(input, core);
      return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
    }

    function walk(el) {
      if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
        var bg = stylizercore.geteffectivebackground(el, stylizercore);
        if (!bg) return;

        var fghex = getrgbhex(el.style.color);
        var bghex = getrgbhex(bg);

        if (stylizercore.color.contrast.contrastratio(fghex, bghex, stylizercore.color.core) < minratio) {
          el.style.color = stylizercore.color.contrast.getoptimalforeground(
            bghex,
            minratio,
            { scheme: 'complementary' },
            stylizercore.color.harmony,
            stylizercore.color.contrast,
            stylizercore.color.core
          );
        }
      }

      Array.prototype.slice.call(el.children).forEach(walk);
    }

    walk(doc.body);
    return doc.body.innerHTML;
  },

  verifytextvisibility: function(html, stylizercore) {
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function walk(el) {
      if (el.nodeType === 1 && el.textContent.trim()) {
        var fsize = stylizercore.parselength(el.style.fontSize, 16) || 0;
        var lh = parseFloat(el.style.lineHeight) || 0;
        var col = el.style.color;
        var id = el.tagName + (el.id ? '#' + el.id : '');

        if (fsize && fsize < 12) violations.push({ element: id, issue: 'font-size too small', value: fsize });
        if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
        if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
      }

      Array.prototype.slice.call(el.children).forEach(walk);
    }

    walk(doc.body);
    return violations;
  },

  verifybuttonvisibility: function(html, stylizercore) {
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
      var tag = el.tagName.toLowerCase();
      return tag === 'button' ||
        el.getAttribute('role') === 'button' ||
        (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
    }).forEach(function(btn) {
      var w = parseFloat(btn.style.width) || 0;
      var h = parseFloat(btn.style.height) || 0;
      var id = btn.tagName + (btn.id ? '#' + btn.id : '');

      if (w < 44 || h < 44) violations.push({ element: id, issue: 'touch target too small', w: w, h: h });
      if (btn.style.cursor !== 'pointer') violations.push({ element: id, issue: 'cursor not pointer' });
    });

    return violations;
  },

  verifyharmony: function(html, options, stylizercore) {
    if (options === undefined) options = {};
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function getrgbhex(input) {
      var core = stylizercore.color.core;
      var rgb = core.hextorgb(input, core);
      return core.rgbtohex(rgb[0], rgb[1], rgb[2], core);
    }

    Array.prototype.slice.call(doc.getElementsByTagName('*')).forEach(function(el) {
      if (!el.textContent.trim() || !el.style.color) return;

      var bg = stylizercore.geteffectivebackground(el, stylizercore);
      if (!bg) return;

      var fg = getrgbhex(el.style.color);
      var bghex = getrgbhex(bg);
      var score = stylizercore.color.harmony.colorharmonyscore(fg, bghex, stylizercore.color.core);

      if (score < 0.5) {
        violations.push({
          element: el.tagName + (el.id ? '#' + el.id : ''),
          score: score,
          color: fg,
          bg: bg
        });

        if (options.autocorrect) {
          var pal = stylizercore.color.harmony.getharmoniouspalette(
            bghex,
            3,
            { scheme: 'analogous' },
            stylizercore.color.harmony,
            stylizercore.color.core
          );
          if (pal.length) el.style.color = pal[0];
        }
      }
    });

    return {
      html: options.autocorrect ? doc.body.innerHTML : html,
      violations: violations
    };
  },

  checkspacing: function(html, mingap, stylizercore) {
    if (mingap === undefined) mingap = 12;
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function walk(parent) {
      var children = Array.prototype.slice.call(parent.children);

      function checkadjacent(i) {
        if (i >= children.length - 1) return;
        var a = children[i];
        var b = children[i + 1];
        var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);

        if (gap < mingap) {
          violations.push({
            elementa: a.tagName + (a.id ? '#' + a.id : ''),
            elementb: b.tagName + (b.id ? '#' + b.id : ''),
            gap: gap
          });
        }
        checkadjacent(i + 1);
      }
      checkadjacent(0);

      children.forEach(function(child) {
        walk(child);
      });
    }

    walk(doc.body);
    return violations;
  },

  checkoverlap: function(html, stylizercore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var pos = Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
      return el.style && ['absolute', 'fixed'].indexOf(el.style.position) !== -1;
    });

    var violations = pos.reduce(function(acc, a, i) {
      return pos.slice(i + 1).reduce(function(inneracc, b) {
        var at = parseFloat(a.style.top) || 0, al = parseFloat(a.style.left) || 0,
            aw = parseFloat(a.style.width) || 0, ah = parseFloat(a.style.height) || 0;
        var bt = parseFloat(b.style.top) || 0, bl = parseFloat(b.style.left) || 0,
            bw = parseFloat(b.style.width) || 0, bh = parseFloat(b.style.height) || 0;

        if (aw && ah && bw && bh &&
            al < bl + bw && al + aw > bl &&
            at < bt + bh && at + ah > bt) {
          return inneracc.concat([{
            elementa: a.tagName + (a.id ? '#' + a.id : ''),
            elementb: b.tagName + (b.id ? '#' + b.id : '')
          }]);
        }
        return inneracc;
      }, acc);
    }, []);

    return violations;
  },

  checkoverflow: function(html, stylizercore) {
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function walk(el) {
      var s = el.style;
      var over = s.overflow || s.overflowX || s.overflowY;

      if ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
          (!over || over === 'visible')) {
        violations.push({
          element: el.tagName + (el.id ? '#' + el.id : ''),
          issue: 'content overflows but overflow not set'
        });
      }

      Array.prototype.slice.call(el.children).forEach(walk);
    }

    walk(doc.body);
    return violations;
  },

  checkscrollability: function(html, stylizercore) {
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
      return el.style && ['auto', 'scroll'].indexOf(el.style.overflow) !== -1;
    }).forEach(function(el) {
      var id = el.tagName + (el.id ? '#' + el.id : '');

      if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) {
        violations.push({ element: id, issue: 'scrollable container has no overflowing content' });
      }
      if (!el.style.touchAction) {
        violations.push({ element: id, issue: 'touch-action not set for scrollable element' });
      }
    });

    return violations;
  },

  checkcontrolledoverlay: function(html, stylizercore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.prototype.slice.call(doc.getElementsByTagName('*'))
      .filter(function(el) {
        return el.style && ['absolute', 'fixed'].indexOf(el.style.position) !== -1 && !el.style.zIndex;
      })
      .map(function(el) {
        return {
          element: el.tagName + (el.id ? '#' + el.id : ''),
          issue: 'positioned element lacks z-index'
        };
      });
  },

  checkfocusvisibility: function(html, stylizercore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
      var tag = el.tagName.toLowerCase();
      return (tag === 'a' && el.getAttribute('href')) ||
        ['button', 'input', 'select', 'textarea'].indexOf(tag) !== -1 ||
        el.getAttribute('tabindex') !== null;
    }).filter(function(el) {
      return !el.hasAttribute('onfocus') &&
        (!el.style.outline || ['none', '0px'].indexOf(el.style.outline) !== -1);
    }).map(function(el) {
      return {
        element: el.tagName + (el.id ? '#' + el.id : ''),
        issue: 'no focus indicator'
      };
    });
  },

  runverification: function(html, goals, stylizercore) {
    if (goals === undefined) goals = [];
    var result = { passed: true, violations: [], correctedhtml: html };

    goals.forEach(function(goal) {
      switch (goal) {
        case 'contrast':
          result.correctedhtml = stylizerverify.verifycontrast(result.correctedhtml, undefined, stylizercore);
          break;
        case 'spacing': {
          var v = stylizerverify.checkspacing(result.correctedhtml, undefined, stylizercore);
          if (v.length) {
            result.passed = false;
            result.violations = result.violations.concat(v);
          }
          break;
        }
        case 'overlap': {
          var v2 = stylizerverify.checkoverlap(result.correctedhtml, stylizercore);
          if (v2.length) {
            result.passed = false;
            result.violations = result.violations.concat(v2);
          }
          break;
        }
        case 'overflow': {
          var v3 = stylizerverify.checkoverflow(result.correctedhtml, stylizercore);
          if (v3.length) {
            result.passed = false;
            result.violations = result.violations.concat(v3);
          }
          break;
        }
        case 'scrollability': {
          var v4 = stylizerverify.checkscrollability(result.correctedhtml, stylizercore);
          if (v4.length) {
            result.passed = false;
            result.violations = result.violations.concat(v4);
          }
          break;
        }
        case 'overlay': {
          var v5 = stylizerverify.checkcontrolledoverlay(result.correctedhtml, stylizercore);
          if (v5.length) {
            result.passed = false;
            result.violations = result.violations.concat(v5);
          }
          break;
        }
        case 'textvisibility': {
          var v6 = stylizerverify.verifytextvisibility(result.correctedhtml, stylizercore);
          if (v6.length) {
            result.passed = false;
            result.violations = result.violations.concat(v6);
          }
          break;
        }
        case 'buttonvisibility': {
          var v7 = stylizerverify.verifybuttonvisibility(result.correctedhtml, stylizercore);
          if (v7.length) {
            result.passed = false;
            result.violations = result.violations.concat(v7);
          }
          break;
        }
        case 'harmony': {
          var res = stylizerverify.verifyharmony(result.correctedhtml, { autocorrect: true }, stylizercore);
          result.correctedhtml = res.html;
          if (res.violations.length) {
            result.passed = false;
            result.violations = result.violations.concat(res.violations);
          }
          break;
        }
      }
    });

    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    stylizercore: stylizercore,
    stylizerrewrite: stylizerrewrite,
    stylizerverify: stylizerverify
  };
}
