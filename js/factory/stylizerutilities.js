// stylizerutilities.js — style-string utility concern.
//
// @proposal=P-U — the pre-P6/P7 vestiges are removed:
//   stylizercore.has / isarray                (no caller)
//   stylizercore.debug / warn / error / info  (no caller)
//   defaultverbositystate                     (only the loggers used it)
//   stylizerrewrite                           (the whole object: the two
//                                              string-HTML methods it
//                                              carried had no caller,
//                                              and the DOM helpers it
//                                              once carried moved to
//                                              renderactor.js under
//                                              P7, frozen RUN 37)
//
// What remains is pure string / length / spacing computation. No DOM
// operations, no string→string HTML transforms, no verbosity state.

function scannumberend(str, i) {
  if (i >= str.length) return i;
  var c = str.charAt(i);
  if ((c >= '0' && c <= '9') || c === '.') return scannumberend(str, i + 1);
  return i;
}

var stylizercore = {
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
  }
};

// Attach color utilities to stylizercore
stylizercore.color = {
  core: colorcore,
  harmony: colorharmony,
  contrast: colorcontrast
};
