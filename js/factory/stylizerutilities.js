// ============================================================
// UPDATED FILE: js/factory/stylizerutilities.js
// Change applied: ES5 module conversion (imports → require,
// export → module.exports). Body already ES5 (var/function) with
// injected-parameter method style — portable surface per P-6.
// DOMParser impurity isolated here (Kleisli verdict).
// ============================================================


// scanNumberEnd — scan digits and '.' from index i; returns end index.
// Shared by parseLength (functional-recursive).
function scanNumberEnd(str, i) {
  if (i >= str.length) return i;
  var c = str.charAt(i);
  if ((c >= '0' && c <= '9') || c === '.') return scanNumberEnd(str, i + 1);
  return i;
}

var defaultVerbosityState = Object.freeze({ level: createVerbosityConstants().DEBUG });

var StylizerCore = {
  has: function(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  },

  isArray: function(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  },

  createStylizerConstants: function() {
    return Object.freeze({
      SAFE_PROPS: Object.freeze([
        'color', 'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'text-align', 'cursor', 'letter-spacing', 'word-spacing',
        'text-transform', 'text-decoration', 'font-variant'
      ]),
      BLOCK_DISPLAY_VALUES: Object.freeze(['block', 'flex', 'grid']),
      BLOCK_TAGS: Object.freeze([
        'div', 'section', 'article', 'header', 'footer', 'nav', 'p',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'
      ]),
      DEFAULT_MIN_GAP: 12,
      DEFAULT_MIN_RATIO: 4.5
    });
  },

  camelToKebab: function(str) {
    if (typeof str !== 'string') return str;
    return str.split('').reduce(function(out, ch) {
      if (ch >= 'A' && ch <= 'Z') {
        return out + '-' + ch.toLowerCase();
      }
      return out + ch;
    }, '');
  },

  kebabToCamel: function(str) {
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

  tokenizeWhitespace: function(str) {
    var s = String(str);

    function scan(i, current, tokens) {
      if (i >= s.length) {
        if (current !== '') tokens.push(current);
        return tokens;
      }
      var ch = s.charAt(i);

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
          ch === '\v' || ch === '\f' || ch === '\uFEFF') {
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

  parseLength: function(value, referencePx) {
    if (referencePx === undefined) referencePx = 16;

    var KEYWORD_LENGTHS = {
      auto: 1, medium: 1.3, large: 1.5, small: 0.7, tiny: 0.5
    };

    var LENGTH_FACTORS = {
      px: 1, '': 1,
      '%': function(n, ref) { return (n / 100) * ref; },
      "em": function(n, ref) { return n * ref; },
      "rem": function(n) { return n * 16; },
      "pt": function(n) { return n * (96 / 72); },
      "pc": function(n) { return n * 16; },
      "in": function(n) { return n * 96; },
      "cm": function(n) { return n * (96 / 2.54); },
      "mm": function(n) { return n * (96 / 25.4); },
      "q": function(n) { return n * (96 / 101.6); }
    };

    if (typeof value === 'number') return value;
    if (!value) return 0;
    if (KEYWORD_LENGTHS[value] !== undefined) {
      value = referencePx * KEYWORD_LENGTHS[value];
    }

    var str = String(value).trim();
    var i = 0;
    if (str.charAt(i) === '+' || str.charAt(i) === '-') i += 1;

    var start = i;
    var end = scanNumberEnd(str, i);

    var numStr = str.slice(start, end);
    var unit = str.slice(end).toLowerCase();
    var num = parseFloat(numStr);

    var factor = LENGTH_FACTORS[unit];
    if (factor === undefined) {
      throw new Error('[parseLength] Unknown unit: ' + unit);
    }

    return typeof factor === 'function' ? factor(num, referencePx) : num * factor;
  },

  computeBaseSpacing: function(viewportWidth, baseFontSize) {
    if (baseFontSize === undefined) baseFontSize = 16;
    var scale = Math.min(1, (viewportWidth || 960) / 960);

    function round(v) { return Math.round(v); }

    return {
      pad: round(16 * scale),
      margin: round(8 * scale),
      listIndent: round(24 * scale),
      codePad: round(12 * scale),
      cardPad: round(12 * scale),
      btnPadV: round(8 * scale),
      btnPadH: round(16 * scale),
      gap: round(8 * scale),
      scale: scale
    };
  },

  parseShorthandLengths: function(value, referencePx, StylizerCore) {
    if (!value) return null;
    var tokens = StylizerCore.tokenizeWhitespace(String(value));
    if (!tokens.length) return null;

    var t = StylizerCore.parseLength(tokens[0], referencePx);
    var r = tokens[1] !== undefined ? StylizerCore.parseLength(tokens[1], referencePx) : t;
    var b = tokens[2] !== undefined ? StylizerCore.parseLength(tokens[2], referencePx) : t;
    var l = tokens[3] !== undefined ? StylizerCore.parseLength(tokens[3], referencePx) : r;

    return { top: t, right: r, bottom: b, left: l };
  },

  applyStep: function(nodes, step, filterFn, StylizerCore) {
    if (filterFn === undefined) filterFn = null;

    function getAncestors(el) {
      function climb(p, acc) {
        if (!p || p.nodeType !== 1) return acc;
        return climb(p.parentNode, acc.concat([p]));
      }
      return climb(el.parentNode, []);
    }

    function getSiblings(el, dir) {
      function walk(s, acc) {
        if (!s) return acc;
        return walk(s[dir], s.nodeType === 1 ? acc.concat([s]) : acc);
      }
      return walk(el[dir], []);
    }

    function getDepth(ancestor, descendant) {
      if (!descendant || descendant === ancestor) return 0;
      if (descendant.nodeType !== 1) return getDepth(ancestor, descendant.parentNode);
      return 1 + getDepth(ancestor, descendant.parentNode);
    }

    return nodes.reduce(function(next, node) {
      var candidates = [];

      switch (step.axis || 'child') {
        case 'self': candidates = [node]; break;
        case 'parent': if (node.parentNode) candidates = [node.parentNode]; break;
        case 'ancestor': candidates = getAncestors(node); break;
        case 'child': candidates = Array.prototype.slice.call(node.children || []); break;
        case 'descendant': candidates = StylizerCore.getAllDescendants(node, StylizerCore); break;
        case 'nextSibling': candidates = getSiblings(node, 'nextSibling'); break;
        case 'previousSibling': candidates = getSiblings(node, 'previousSibling'); break;
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
          return getDepth(node, el) === step.depth;
        });
      }
      if (step.skip !== undefined && (step.axis === 'nextSibling' || step.axis === 'previousSibling')) {
        candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
      }
      if (step.content) {
        var text = step.content.text || '';
        var mode = step.content.mode || 'substring';
        var caseSensitive = step.content.caseSensitive || false;
        var search = caseSensitive ? text : text.toLowerCase();
        candidates = candidates.filter(function(el) {
          var elText = caseSensitive ? el.textContent : el.textContent.toLowerCase();
          if (mode === 'exact') return elText.trim() === search.trim();
          return elText.indexOf(search) !== -1;
        });
      }

      if (typeof filterFn === 'function') candidates = candidates.filter(filterFn);

      candidates.forEach(function(c) {
        if (next.indexOf(c) === -1) next.push(c);
      });

      return next;
    }, []);
  },

  getAllDescendants: function(el, StylizerCore) {
    var children = Array.prototype.slice.call(el.children || []);
    return children.reduce(function(all, child) {
      return all.concat(child, StylizerCore.getAllDescendants(child, StylizerCore));
    }, []);
  },

  buildLayoutPropertyMap: function(rootEl, viewportWidth, inheritedFontSize, StylizerCore) {
    if (inheritedFontSize === undefined) inheritedFontSize = 16;

    function walk(el, parentAvailableWidth, parentFontSize, acc) {
      var style = el.style || {};
      var props = {
        fontSize: parentFontSize,
        width: null,
        maxWidth: null,
        minWidth: null,
        height: null,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        borderTopWidth: 0,
        borderBottomWidth: 0,
        borderLeftWidth: 0,
        borderRightWidth: 0,
        availableWidth: parentAvailableWidth
      };

      var propNames = [
        'fontSize', 'width', 'maxWidth', 'minWidth', 'height',
        'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
        'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
        'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'
      ];

      propNames.forEach(function(prop) {
        if (style[prop]) {
          props[prop] = StylizerCore.parseLength(
            style[prop],
            prop === 'fontSize' ? parentFontSize : parentAvailableWidth
          );
        }
      });

      if (style.margin) {
        var sh = StylizerCore.parseShorthandLengths(style.margin, parentAvailableWidth, StylizerCore);
        if (sh) {
          props.marginTop = sh.top;
          props.marginRight = sh.right;
          props.marginBottom = sh.bottom;
          props.marginLeft = sh.left;
        }
      }
      if (style.padding) {
        var sh2 = StylizerCore.parseShorthandLengths(style.padding, parentAvailableWidth, StylizerCore);
        if (sh2) {
          props.paddingTop = sh2.top;
          props.paddingRight = sh2.right;
          props.paddingBottom = sh2.bottom;
          props.paddingLeft = sh2.left;
        }
      }

      var contentWidth = Math.max(
        0,
        parentAvailableWidth -
          props.paddingLeft - props.paddingRight -
          props.borderLeftWidth - props.borderRightWidth
      );

      var selfAvailable = contentWidth;
      if (props.maxWidth !== null) selfAvailable = Math.min(selfAvailable, props.maxWidth);
      if (props.width !== null) selfAvailable = Math.min(selfAvailable, props.width);
      if (props.minWidth !== null) selfAvailable = Math.max(selfAvailable, props.minWidth);
      props.availableWidth = selfAvailable;

      var nextAcc = acc.concat([{ element: el, props: props }]);
      var children = StylizerCore.applyStep([el], { axis: 'child' }, null, StylizerCore);

      return children.reduce(function(innerAcc, child) {
        return walk(child, selfAvailable, props.fontSize, innerAcc);
      }, nextAcc);
    }

    return walk(rootEl, viewportWidth, inheritedFontSize, []);
  },

  getPropsFromMap: function(propsMap, el, StylizerCore) {
    var entry = propsMap.filter(function(item) { return item.element === el; })[0];
    return entry ? entry.props : null;
  },

  computeIntrinsicSize: function(node, propertyMap, inheritedProps, StylizerCore) {
    if (inheritedProps === undefined) inheritedProps = {};
    var DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

    if (!node) return { width: 0, height: 0 };

    if (node.nodeType === 3) {
      var txt = node.nodeValue.trim();
      if (!txt) return { width: 0, height: 0 };

      var fontSize = inheritedProps.fontSize || 16;
      var lines = txt.split('\n');
      var isNowrap = inheritedProps.whiteSpace === 'nowrap' || inheritedProps.whiteSpace === 'pre';
      var maxLineLen = Math.max.apply(null, lines.map(function(line) {
        var words = isNowrap ? [line] : StylizerCore.tokenizeWhitespace(line);
        return words.reduce(function(len, w, i) {
          return len + w.length * fontSize + (i > 0 ? fontSize : 0);
        }, 0);
      }));
      var lineHeight = inheritedProps.lineHeight || fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
      return { width: maxLineLen, height: lines.length * lineHeight };
    }

    if (node.nodeType !== 1) return { width: 0, height: 0 };

    var props = StylizerCore.getPropsFromMap(propertyMap, node, StylizerCore);
    if (!props) {
      logerror(defaultVerbosityState, '[STYLIZERCORE]', '[computeIntrinsicSize] Missing property map entry:', node.tagName);
      throw new Error('[computeIntrinsicSize] Missing property map entry: ' + node.tagName);
    }

    var tag = node.tagName.toLowerCase();
    var padH = (props.paddingLeft || 0) + (props.paddingRight || 0) +
      (props.borderLeftWidth || 0) + (props.borderRightWidth || 0);
    var padV = (props.paddingTop || 0) + (props.paddingBottom || 0);

    if (tag === 'img' || tag === 'svg') {
      if (props.width !== null) {
        return { width: props.width, height: props.height || (props.width * 0.75) };
      }
      logerror(defaultVerbosityState, '[STYLIZERCORE]', '[computeIntrinsicSize] Image without explicit width:', tag);
      throw new Error('[computeIntrinsicSize] Image without explicit width');
    }

    if (tag === 'table') {
      if (props.width !== null) return { width: props.width, height: props.height || 0 };
      var rows = StylizerCore.applyStep([node], { axis: 'descendant', tag: 'tr' }, null, StylizerCore);
      var colMax = {};
      var totalH = 0;

      rows.forEach(function(row) {
        var rowH = 0;
        StylizerCore.applyStep([row], { axis: 'child' }, null, StylizerCore).forEach(function(cell, idx) {
          var s = StylizerCore.computeIntrinsicSize(cell, propertyMap, props, StylizerCore);
          colMax[idx] = Math.max(colMax[idx] || 0, s.width);
          rowH = Math.max(rowH, s.height);
        });
        totalH += rowH;
      });

      var colVals = Object.keys(colMax).map(function(k) { return colMax[k]; });
      var totalW = colVals.reduce(function(sum, w) { return sum + w; }, 0) + padH;
      return { width: totalW, height: totalH + padV };
    }

    var children = Array.prototype.slice.call(node.childNodes);
    if (!children.length) return { width: padH, height: padV };

    var isFlexRow = node.style && node.style.display === 'flex' &&
      (node.style.flexDirection === 'row' || !node.style.flexDirection);

    var totalW = 0, maxW = 0, totalH = 0;

    children.forEach(function(child) {
      var s = StylizerCore.computeIntrinsicSize(child, propertyMap, props, StylizerCore);
      if (isFlexRow) {
        totalW += s.width;
        totalH = Math.max(totalH, s.height);
      } else {
        maxW = Math.max(maxW, s.width);
        totalH += s.height;
      }
    });

    return { width: (isFlexRow ? totalW : maxW) + padH, height: totalH + padV };
  },

  estimateRecursiveBounds: function(node, StylizerCore) {
    if (node.nodeType === 3) {
      var txt = node.nodeValue.trim();
      if (!txt) return 0;

      var fSize = 16;
      var isNowrap = false;

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

      var resolved = climb(node.parentElement, fSize, isNowrap);
      fSize = resolved.size;
      isNowrap = resolved.nowrap;

      var charPx = fSize * 0.6;
      if (isNowrap) return txt.length * charPx;

      var words = StylizerCore.tokenizeWhitespace(txt);
      var maxWordLen = Math.max.apply(null, words.map(function(w) { return w.length; }));
      return maxWordLen * charPx;
    }

    if (node.nodeType === 1) {
      if (node.tagName && (node.tagName.toLowerCase() === 'img' || node.tagName.toLowerCase() === 'svg')) {
        return parseFloat(node.style.width || node.getAttribute('width') || 24);
      }

      var isFlexRow = node.style.display === 'flex' &&
        (node.style.flexDirection === 'row' || !node.style.flexDirection);
      var totalW = 0;

      Array.prototype.slice.call(node.childNodes).forEach(function(child) {
        var w = StylizerCore.estimateRecursiveBounds(child, StylizerCore);
        totalW = isFlexRow ? totalW + w : Math.max(totalW, w);
      });

      return totalW;
    }

    return 0;
  },

  getEffectiveBackground: function(el, StylizerCore) {
    function isHexDigit(ch) {
      return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }

    function findHexColor(str) {
      function scanHex(j, count) {
        if (j < str.length && isHexDigit(str.charAt(j))) return scanHex(j + 1, count + 1);
        return { j: j, count: count };
      }
      function scan(i) {
        if (i >= str.length) return null;
        if (str.charAt(i) === '#') {
          var res = scanHex(i + 1, 0);
          if (res.count === 3 || res.count === 6) {
            return str.slice(i, res.j);
          }
        }
        return scan(i + 1);
      }
      return scan(0);
    }

    function findRgbColor(str) {
      var idx = str.indexOf('rgb(');
      if (idx === -1) return null;

      var end = str.indexOf(')', idx);
      if (end === -1) return null;

      return str.slice(idx, end + 1);
    }

    function extractBgFromShorthand(node) {
      if (node.style.backgroundColor) return node.style.backgroundColor;

      var bg = node.style.background;
      if (!bg) return null;

      return findHexColor(bg) || findRgbColor(bg) || null;
    }

    function climbBg(curr) {
      if (!curr || curr.nodeType !== 1) return '';
      var bg = extractBgFromShorthand(curr);
      if (bg) return bg;
      return climbBg(curr.parentNode);
    }

    return climbBg(el);
  },

  debug: function() {
    var args = Array.prototype.slice.call(arguments);
    logdebug.apply(null, [defaultVerbosityState, '[STYLIZERCORE]'].concat(args));
  },
  warn: function() {
    var args = Array.prototype.slice.call(arguments);
    logwarn.apply(null, [defaultVerbosityState, '[STYLIZERCORE]'].concat(args));
  },
  error: function() {
    var args = Array.prototype.slice.call(arguments);
    logerror.apply(null, [defaultVerbosityState, '[STYLIZERCORE]'].concat(args));
  },
  info: function() {
    var args = Array.prototype.slice.call(arguments);
    loginfo.apply(null, [defaultVerbosityState, '[STYLIZERCORE]'].concat(args));
  }
};

// ATTACH COLOR UTILITIES TO StylizerCore
StylizerCore.color = {
  core: ColorCore,
  harmony: ColorHarmony,
  contrast: ColorContrast
};

var StylizerRewrite = {
  rewritestyleattrs: function(html, rules, StylizerCore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function applyRules(el) {
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
          function walkPath(stepIndex, currentNodes) {
            if (stepIndex >= rule.path.length) return currentNodes;
            var step = rule.path[stepIndex];
            var nextNodes = [];

            currentNodes.forEach(function(node) {
              var matches = StylizerCore.applyStep([node], step, null, StylizerCore);
              matches.forEach(function(m) { if (nextNodes.indexOf(m) === -1) nextNodes.push(m); });
            });

            if (!nextNodes.length) return [];
            return walkPath(stepIndex + 1, nextNodes);
          }

          var pathResult = walkPath(0, [el]);
          if (pathResult.indexOf(el) !== -1) {
            Object.keys(rule.style || {}).forEach(function(prop) {
              el.style[prop] = rule.style[prop];
            });
          }
        }
      });

      Array.prototype.slice.call(el.children).forEach(applyRules);
    }

    applyRules(doc.body);
    return doc.body.innerHTML;
  },

  injectResponsiveStyles: function(html, breakpointRules, StylizerCore) {
    if (!breakpointRules || !breakpointRules.length) return html;

    var css = '<style data-responsive="true">';

    breakpointRules.forEach(function(bp) {
      var min = bp.minWidth !== undefined ? '(min-width: ' + bp.minWidth + 'px)' : '';
      var max = bp.maxWidth !== undefined ? '(max-width: ' + bp.maxWidth + 'px)' : '';
      css += '@media ' + [min, max].filter(Boolean).join(' and ') + ' {\n';

      bp.rules.forEach(function(rule) {
        var sel = rule.id ? '#' + rule.id : rule.class ? '.' + rule.class : rule.tag || '*';
        css += '  ' + sel + ' {\n';
        Object.keys(rule.style).forEach(function(prop) {
          css += '    ' + StylizerCore.camelToKebab(prop) + ': ' + rule.style[prop] + ';\n';
        });
        css += '  }\n';
      });

      css += '}\n';
    });

    css += '</style>';
    var lastDiv = html.lastIndexOf('</div>');
    return lastDiv !== -1 ? html.slice(0, lastDiv) + css + html.slice(lastDiv) : html + css;
  },

  extractAllTagStyles: function(referenceHTML, StylizerCore) {
    var doc = new DOMParser().parseFromString(referenceHTML, 'text/html');
    var refRoot = doc.getElementById('theme-reference');
    if (!refRoot) return {};

    var map = {};

    if (refRoot.style.length) {
      map['root'] = Array.prototype.slice.call(refRoot.style).reduce(function(acc, prop) {
        acc[prop] = refRoot.style[prop];
        return acc;
      }, {});
    }

    Array.prototype.slice.call(refRoot.children).forEach(function(el) {
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

  consolidateStyles: function(html, StylizerCore) {
    var constants = StylizerCore.createStylizerConstants();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var safeProps = constants.SAFE_PROPS;

    function walk(el) {
      Array.prototype.slice.call(el.children).forEach(function(child) {
        if (child.style) {
          var styleProps = Array.prototype.slice.call(child.style);
          styleProps.reduceRight(function(_, prop) {
            if (safeProps.indexOf(prop) !== -1 && el.style[prop] === child.style[prop]) {
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

  computecolorscheme: function(pos, tilecols, cellw, cellh, gridcols, StylizerCore) {
    var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
    var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
    var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
    var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));

    function rowsRange(r, acc) {
      if (r >= rowend) return acc;
      function colsRange(c, inner) {
        if (c >= colend) return inner;
        var idx = r * gridcols + c;
        if (idx < tilecols.length) {
          inner.sumh += tilecols[idx].h;
          inner.sums += tilecols[idx].s;
          inner.suml += tilecols[idx].l;
          inner.count++;
        }
        return colsRange(c + 1, inner);
      }
      return rowsRange(r + 1, colsRange(colstart, acc));
    }

    var totals = rowsRange(rowstart, { sumh: 0, sums: 0, suml: 0, count: 0 });
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

  optimizeStyleHTML: function(html, goals, themeStyles, maxIterations, StylizerCore) {
    if (themeStyles === undefined) themeStyles = {};
    if (maxIterations === undefined) maxIterations = 5;

    var doc = new DOMParser().parseFromString(html, 'text/html');
    var allRules = [];

    function getRgbHex(input) {
      var core = StylizerCore.color.core;
      var rgb = core.hexToRgb(input, core);
      return core.rgbToHex(rgb[0], rgb[1], rgb[2], core);
    }

    function harmonyScore(fg, bg) {
      var fgHsl = StylizerCore.color.core.rgbToHsl.apply(null, StylizerCore.color.core.hexToRgb(fg, StylizerCore.color.core));
      var bgHsl = StylizerCore.color.core.rgbToHsl.apply(null, StylizerCore.color.core.hexToRgb(bg, StylizerCore.color.core));
      var hueDist = Math.abs(fgHsl.h - bgHsl.h);
      var normalizedDist = hueDist > 180 ? 360 - hueDist : hueDist;

      if (normalizedDist < 30) return 1;
      if (normalizedDist < 60) return 0.9;
      if (normalizedDist > 150 && normalizedDist < 180) return 0.95;
      if (normalizedDist > 90 && normalizedDist < 120) return 0.4;
      return 0.7;
    }

    function runIteration(iter) {
      if (iter >= maxIterations) return;
      var anyCorrection = false;

      goals.forEach(function(goal) {
        var els = Array.prototype.slice.call(doc.getElementsByTagName('*'));

        if (goal.type === 'contrast') {
          var minRatio = goal.options && goal.options.minRatio != null ? goal.options.minRatio : 4.5;

          els.forEach(function(el) {
            if (el.textContent.trim() && el.style.color) {
              var bg = StylizerCore.getEffectiveBackground(el, StylizerCore);
              if (!bg) return;

              var fgHex = getRgbHex(el.style.color);
              var bgHex = getRgbHex(bg);

              if (StylizerCore.color.contrast.contrastRatio(fgHex, bgHex, StylizerCore.color.core) < minRatio) {
                var newFg = StylizerCore.color.contrast.getOptimalForeground(
                  bgHex,
                  minRatio,
                  { scheme: 'complementary' },
                  StylizerCore.color.harmony,
                  StylizerCore.color.contrast,
                  StylizerCore.color.core
                );
                el.style.color = newFg;
                allRules.push({
                  selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
                  styles: { color: newFg }
                });
                anyCorrection = true;
              }
            }
          });
        } else if (goal.type === 'harmony') {
          els.forEach(function(el) {
            if (el.textContent.trim() && el.style.color) {
              var bg = StylizerCore.getEffectiveBackground(el, StylizerCore);
              if (!bg) return;

              var fg = getRgbHex(el.style.color);
              var bgHex = getRgbHex(bg);

              if (harmonyScore(fg, bgHex) < 0.5) {
                var pal = StylizerCore.color.harmony.getHarmoniousPalette(
                  bgHex,
                  3,
                  { scheme: 'analogous' },
                  StylizerCore.color.harmony,
                  StylizerCore.color.core
                );
                if (pal.length) {
                  el.style.color = pal[0];
                  allRules.push({
                    selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
                    styles: { color: pal[0] }
                  });
                  anyCorrection = true;
                }
              }
            }
          });
        } else if (goal.type === 'textVisibility') {
          var minLh = goal.options && goal.options.minLineHeight != null ? goal.options.minLineHeight : 1.2;

          els.forEach(function(el) {
            if (el.textContent.trim()) {
              var tag = el.tagName.toLowerCase();
              var minSize = StylizerCore.parseLength(
                themeStyles[tag] && themeStyles[tag].fontSize ||
                themeStyles['p'] && themeStyles['p'].fontSize ||
                '12px',
                16
              );
              var curSize = StylizerCore.parseLength(el.style.fontSize, 16) || 0;
              var curLh = parseFloat(el.style.lineHeight) || 0;
              var styles = {};

              if (curSize > 0 && curSize < minSize) styles.fontSize = minSize + 'px';
              if (curLh && curLh < minLh) styles.lineHeight = String(minLh);

              if (Object.keys(styles).length) {
                Object.keys(styles).forEach(function(prop) {
                  el.style[prop] = styles[prop];
                });
                allRules.push({
                  selector: el.id ? { id: el.id } : { tag: tag },
                  styles: styles
                });
                anyCorrection = true;
              }
            }
          });
        } else if (goal.type === 'buttonVisibility') {
          els.filter(function(el) {
            var tag = el.tagName.toLowerCase();
            return tag === 'button' ||
              el.getAttribute('role') === 'button' ||
              (tag === 'input' && ['submit', 'button'].indexOf(el.getAttribute('type')) !== -1);
          }).forEach(function(btn) {
            var w = parseFloat(btn.style.width) || 0;
            var h = parseFloat(btn.style.height) || 0;
            var styles = {};
            var minW = Math.max(44, StylizerCore.estimateRecursiveBounds(btn, StylizerCore) + 24);

            if (w < minW) styles.minWidth = minW + 'px';
            if (h < 44) styles.minHeight = '44px';
            if (!btn.style.cursor) styles.cursor = 'pointer';

            if (Object.keys(styles).length) {
              Object.keys(styles).forEach(function(prop) {
                btn.style[prop] = styles[prop];
              });
              allRules.push({
                selector: btn.id ? { id: btn.id } : { tag: btn.tagName.toLowerCase() },
                styles: styles
              });
              anyCorrection = true;
            }
          });
        }
      });

      if (anyCorrection) runIteration(iter + 1);
    }

    runIteration(0);

    return { html: doc.body.innerHTML, rules: allRules };
  }
};

var StylizerVerify = {
  verifyContrast: function(html, minRatio, StylizerCore) {
    if (minRatio === undefined) minRatio = 4.5;
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function getRgbHex(input) {
      var core = StylizerCore.color.core;
      var rgb = core.hexToRgb(input, core);
      return core.rgbToHex(rgb[0], rgb[1], rgb[2], core);
    }

    function walk(el) {
      if (el.nodeType === 1 && el.textContent.trim() && el.style.color) {
        var bg = StylizerCore.getEffectiveBackground(el, StylizerCore);
        if (!bg) return;

        var fgHex = getRgbHex(el.style.color);
        var bgHex = getRgbHex(bg);

        if (StylizerCore.color.contrast.contrastRatio(fgHex, bgHex, StylizerCore.color.core) < minRatio) {
          el.style.color = StylizerCore.color.contrast.getOptimalForeground(
            bgHex,
            minRatio,
            { scheme: 'complementary' },
            StylizerCore.color.harmony,
            StylizerCore.color.contrast,
            StylizerCore.color.core
          );
        }
      }

      Array.prototype.slice.call(el.children).forEach(walk);
    }

    walk(doc.body);
    return doc.body.innerHTML;
  },

  verifyTextVisibility: function(html, StylizerCore) {
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function walk(el) {
      if (el.nodeType === 1 && el.textContent.trim()) {
        var fSize = StylizerCore.parseLength(el.style.fontSize, 16) || 0;
        var lh = parseFloat(el.style.lineHeight) || 0;
        var col = el.style.color;
        var id = el.tagName + (el.id ? '#' + el.id : '');

        if (fSize && fSize < 12) violations.push({ element: id, issue: 'font-size too small', value: fSize });
        if (lh && lh < 1.2) violations.push({ element: id, issue: 'line-height too tight', value: lh });
        if (!col || col === 'transparent') violations.push({ element: id, issue: 'text color not set or transparent' });
      }

      Array.prototype.slice.call(el.children).forEach(walk);
    }

    walk(doc.body);
    return violations;
  },

  verifyButtonVisibility: function(html, StylizerCore) {
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

  verifyHarmony: function(html, options, StylizerCore) {
    if (options === undefined) options = {};
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function getRgbHex(input) {
      var core = StylizerCore.color.core;
      var rgb = core.hexToRgb(input, core);
      return core.rgbToHex(rgb[0], rgb[1], rgb[2], core);
    }

    Array.prototype.slice.call(doc.getElementsByTagName('*')).forEach(function(el) {
      if (!el.textContent.trim() || !el.style.color) return;

      var bg = StylizerCore.getEffectiveBackground(el, StylizerCore);
      if (!bg) return;

      var fg = getRgbHex(el.style.color);
      var bgHex = getRgbHex(bg);
      var score = StylizerCore.color.harmony.colorHarmonyScore(fg, bgHex, StylizerCore.color.core);

      if (score < 0.5) {
        violations.push({
          element: el.tagName + (el.id ? '#' + el.id : ''),
          score: score,
          color: fg,
          bg: bg
        });

        if (options.autoCorrect) {
          var pal = StylizerCore.color.harmony.getHarmoniousPalette(
            bgHex,
            3,
            { scheme: 'analogous' },
            StylizerCore.color.harmony,
            StylizerCore.color.core
          );
          if (pal.length) el.style.color = pal[0];
        }
      }
    });

    return {
      html: options.autoCorrect ? doc.body.innerHTML : html,
      violations: violations
    };
  },

  // P10: fixed recursion to visit all children, not only second of each pair
  checkSpacing: function(html, minGap, StylizerCore) {
    if (minGap === undefined) minGap = 12;
    var violations = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');

    function walk(parent) {
      var children = Array.prototype.slice.call(parent.children);

      // First check gaps between adjacent children
      function checkAdjacent(i) {
        if (i >= children.length - 1) return;
        var a = children[i];
        var b = children[i + 1];
        var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);

        if (gap < minGap) {
          violations.push({
            elementA: a.tagName + (a.id ? '#' + a.id : ''),
            elementB: b.tagName + (b.id ? '#' + b.id : ''),
            gap: gap
          });
        }
        checkAdjacent(i + 1);
      }
      checkAdjacent(0);

      // Recurse into every child, not just the second of each pair
      children.forEach(function(child) {
        walk(child);
      });
    }

    walk(doc.body);
    return violations;
  },

  checkOverlap: function(html, StylizerCore) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var pos = Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
      return el.style && ['absolute', 'fixed'].indexOf(el.style.position) !== -1;
    });

    var violations = pos.reduce(function(acc, a, i) {
      return pos.slice(i + 1).reduce(function(innerAcc, b) {
        var aT = parseFloat(a.style.top) || 0, aL = parseFloat(a.style.left) || 0,
            aW = parseFloat(a.style.width) || 0, aH = parseFloat(a.style.height) || 0;
        var bT = parseFloat(b.style.top) || 0, bL = parseFloat(b.style.left) || 0,
            bW = parseFloat(b.style.width) || 0, bH = parseFloat(b.style.height) || 0;

        if (aW && aH && bW && bH &&
            aL < bL + bW && aL + aW > bL &&
            aT < bT + bH && aT + aH > bT) {
          return innerAcc.concat([{
            elementA: a.tagName + (a.id ? '#' + a.id : ''),
            elementB: b.tagName + (b.id ? '#' + b.id : '')
          }]);
        }
        return innerAcc;
      }, acc);
    }, []);

    return violations;
  },

  checkOverflow: function(html, StylizerCore) {
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

  checkScrollability: function(html, StylizerCore) {
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

  checkControlledOverlay: function(html, StylizerCore) {
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

  checkFocusVisibility: function(html, StylizerCore) {
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

  runVerification: function(html, goals, StylizerCore) {
    if (goals === undefined) goals = [];
    var result = { passed: true, violations: [], correctedHtml: html };

    goals.forEach(function(goal) {
      switch (goal) {
        case 'contrast':
          result.correctedHtml = StylizerVerify.verifyContrast(result.correctedHtml, undefined, StylizerCore);
          break;
        case 'spacing': {
          var v = StylizerVerify.checkSpacing(result.correctedHtml, undefined, StylizerCore);
          if (v.length) {
            result.passed = false;
            result.violations = result.violations.concat(v);
          }
          break;
        }
        case 'overlap': {
          var v2 = StylizerVerify.checkOverlap(result.correctedHtml, StylizerCore);
          if (v2.length) {
            result.passed = false;
            result.violations = result.violations.concat(v2);
          }
          break;
        }
        case 'overflow': {
          var v3 = StylizerVerify.checkOverflow(result.correctedHtml, StylizerCore);
          if (v3.length) {
            result.passed = false;
            result.violations = result.violations.concat(v3);
          }
          break;
        }
        case 'scrollability': {
          var v4 = StylizerVerify.checkScrollability(result.correctedHtml, StylizerCore);
          if (v4.length) {
            result.passed = false;
            result.violations = result.violations.concat(v4);
          }
          break;
        }
        case 'overlay': {
          var v5 = StylizerVerify.checkControlledOverlay(result.correctedHtml, StylizerCore);
          if (v5.length) {
            result.passed = false;
            result.violations = result.violations.concat(v5);
          }
          break;
        }
        case 'textvisibility': {
          var v6 = StylizerVerify.verifyTextVisibility(result.correctedHtml, StylizerCore);
          if (v6.length) {
            result.passed = false;
            result.violations = result.violations.concat(v6);
          }
          break;
        }
        case 'buttonvisibility': {
          var v7 = StylizerVerify.verifyButtonVisibility(result.correctedHtml, StylizerCore);
          if (v7.length) {
            result.passed = false;
            result.violations = result.violations.concat(v7);
          }
          break;
        }
        case 'harmony': {
          var res = StylizerVerify.verifyHarmony(result.correctedHtml, { autoCorrect: true }, StylizerCore);
          result.correctedHtml = res.html;
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
