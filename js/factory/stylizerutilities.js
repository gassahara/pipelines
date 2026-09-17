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

  // ---- P7 (frozen RUN 37): C1..C7 DOM helpers moved into ./js/actors/renderactor.js ----

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
  injectresponsivestyles: function(html, breakpointrules, stylizercore) {
    if (!breakpointrules || !breakpointrules.length) return html;

    var css = '<style data-responsive="true">';

    breakpointrules.forEach(function(bp) {
      var min = bp.minwidth !== undefined ? '(min-width: ' + bp.minwidth + 'px)' : '';
      var max = bp.maxwidth !== undefined ? '(max-width: ' + bp.maxwidth + 'px)' : '';
      css += '@media ' + [min, max].filter(Boolean).join(' and ') + ' {\n';

      bp.rules.forEach(function(rule) {
        var sel = rule.id ? '#' + rule.id : rule.tag || '*';
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
      bordercolor: 'hsl(' + huecont + ', ' + satcont + '%, ' + Math.round((bglight + fglight) / 2) + '%)'
    };
  }
};

