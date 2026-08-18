var ColorCore = {
  createColorConstants: function() {
    return Object.freeze({
      CANDIDATE_HUES: [180, 150, 210, 120, 240, 60, 300, 90, 270],
      SATURATIONS: [100, 80, 60, 40],
      MAX_FOREGROUND_ADJUSTMENTS: 20
    });
  },

  rgbToHsl: function(r, g, b) {
    var nr = r / 255, ng = g / 255, nb = b / 255;
    var max = Math.max(nr, ng, nb);
    var min = Math.min(nr, ng, nb);
    var d = max - min;
    var l = (max + min) / 2;
    var s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
    var h = d === 0 ? 0 : (max === nr ? (ng - nb) / d + (ng < nb ? 6 : 0) : max === ng ? (nb - nr) / d + 2 : (nr - ng) / d + 4) / 6;

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },

  hslToRgb: function(h, s, l) {
    h /= 360; s /= 100; l /= 100;

    if (s === 0) {
      var val = Math.round(l * 255);
      return { r: val, g: val, b: val };
    }

    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;

    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  },

  parseComponent: function(comp) {
    if (typeof comp === 'number') {
      return comp === Math.floor(comp) && comp >= 0 && comp <= 255 ? comp : null;
    }

    if (typeof comp !== 'string') return null;

    var s = comp.trim();

    if (s === '') return null;

    var isHex = false;
    var start = 0;

    if (s.charAt(0) === '0' && (s.charAt(1) === 'x' || s.charAt(1) === 'X')) {
      isHex = true;
      start = 2;
    }

    if (isHex) {
      for (var i = start; i < s.length; i++) {
        var ch = s.charAt(i);
        if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'))) {
          return null;
        }
      }

      var val = parseInt(s.slice(start), 16);
      return isNaN(val) || val < 0 || val > 255 ? null : val;
    }

    for (var j = 0; j < s.length; j++) {
      var c = s.charAt(j);
      if (c < '0' || c > '9') return null;
    }

    var dec = parseInt(s, 10);
    return isNaN(dec) || dec < 0 || dec > 255 ? null : dec;
  },

  pad2: function(n) {
    return n < 16 ? '0' + n.toString(16) : n.toString(16);
  },

  hexToRgb: function(input) {
    if (typeof input === 'string') {
      var trimmed = input.trim();

      if (trimmed.indexOf('rgb(') === 0) {
        var close = trimmed.indexOf(')');
        if (close === -1) return [0, 0, 0];

        var body = trimmed.slice(4, close);
        var parts = body.split(',').map(function(s) { return s.trim(); }).map(ColorCore.parseComponent);

        return parts.length === 3 && parts.every(function(n) { return n !== null; }) ? parts : [0, 0, 0];
      }

      var hex = trimmed;

      if (hex.charAt(0) === '#') {
        hex = hex.slice(1);
      } else if (hex.charAt(0) === '0' && (hex.charAt(1) === 'x' || hex.charAt(1) === 'X')) {
        hex = hex.slice(2);
      }

      if (hex.length !== 6) return [0, 0, 0];

      for (var i = 0; i < hex.length; i++) {
        var c = hex.charAt(i);
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
          return [0, 0, 0];
        }
      }

      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }

    return [0, 0, 0];
  },

  rgbToHex: function(r, g, b) {
    var nums = [r, g, b].map(ColorCore.parseComponent);

    if (nums.some(function(n) { return n === null; })) return '#000000';

    return '#' + nums.map(function(n) { return ColorCore.pad2(n); }).join('');
  },

  hslToHex: function(h, s, l) {
    var rgb = ColorCore.hslToRgb(h, s, l);
    return ColorCore.rgbToHex(rgb.r, rgb.g, rgb.b);
  },

  relativeLuminance: function(rgb) {
    var r = rgb[0], g = rgb[1], b = rgb[2];

    function toLinear(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  },

  extractInlineStyle: function(el, prop) {
    return el.style[prop] || '';
  }
};

var ColorHarmony = {
  shiftHues: function(hex, shifts) {
    var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(hex));

    return shifts.map(function(shift) {
      return ColorCore.hslToHex((hsl.h + shift + 360) % 360, hsl.s, hsl.l);
    });
  },

  complementary: function(hex) {
    return ColorHarmony.shiftHues(hex, [180]);
  },

  analogous: function(hex, count, step) {
    if (count === undefined) count = 3;
    if (step === undefined) step = 30;

    var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(hex));
    var startH = hsl.h - (step * (count - 1)) / 2;
    var result = [];

    for (var i = 0; i < count; i++) {
      result.push(ColorCore.hslToHex(((startH + i * step) % 360 + 360) % 360, hsl.s, hsl.l));
    }

    return result;
  },

  triadic: function(hex) {
    return [hex].concat(ColorHarmony.shiftHues(hex, [120, 240]));
  },

  splitComplementary: function(hex) {
    return [hex].concat(ColorHarmony.shiftHues(hex, [150, 210]));
  },

  tetradic: function(hex) {
    return [hex].concat(ColorHarmony.shiftHues(hex, [60, 180, 240]));
  },

  monochromatic: function(hex, count, lightnessRange) {
    if (count === undefined) count = 5;
    if (lightnessRange === undefined) lightnessRange = 60;

    var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(hex));
    var startL = Math.max(0, hsl.l - lightnessRange / 2);
    var endL = Math.min(100, hsl.l + lightnessRange / 2);
    var result = [];

    for (var i = 0; i < count; i++) {
      result.push(ColorCore.hslToHex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : startL + ((endL - startL) * i) / (count - 1)
      ));
    }

    return result;
  },

  shades: function(hex, count) {
    if (count === undefined) count = 5;
    var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(hex));
    var result = [];

    for (var i = 0; i < count; i++) {
      result.push(ColorCore.hslToHex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : hsl.l - (hsl.l * i) / (count - 1)
      ));
    }

    return result;
  },

  tints: function(hex, count) {
    if (count === undefined) count = 5;
    var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(hex));
    var result = [];

    for (var i = 0; i < count; i++) {
      result.push(ColorCore.hslToHex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : hsl.l + ((100 - hsl.l) * i) / (count - 1)
      ));
    }

    return result;
  },

  pick: function(colors, index) {
    return colors[Math.max(0, Math.min(index, colors.length - 1))];
  },

  colorHarmonyScore: function(fgHex, bgHex) {
    var fgHsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(fgHex));
    var bgHsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(bgHex));
    var hueDist = Math.abs(fgHsl.h - bgHsl.h);
    var normalizedDist = hueDist > 180 ? 360 - hueDist : hueDist;

    if (normalizedDist < 30) return 1;
    if (normalizedDist < 60) return 0.9;
    if (normalizedDist > 150 && normalizedDist < 180) return 0.95;
    if (normalizedDist > 90 && normalizedDist < 120) return 0.4;
    return 0.7;
  },

  getHarmoniousPalette: function(baseHex, count, options) {
    if (count === undefined) count = 3;
    if (options === undefined) options = {};

    var scheme = options.scheme || 'analogous';

    switch (scheme) {
      case 'complementary': return ColorHarmony.complementary(baseHex).slice(0, count);
      case 'triadic': return ColorHarmony.triadic(baseHex).slice(0, count);
      case 'split': return ColorHarmony.splitComplementary(baseHex).slice(0, count);
      case 'tetradic': return ColorHarmony.tetradic(baseHex).slice(0, count);
      case 'analogous':
      default: return ColorHarmony.analogous(baseHex, count, options.step);
    }
  },

  emphasize: function(color, bg, intensity) {
    if (intensity === undefined) intensity = 1;

    var fgHsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(String(color)));
    var bgHsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(String(bg)));
    var h = Math.abs(fgHsl.h - bgHsl.h) < 30 ? (fgHsl.h + 30) % 360 : fgHsl.h;
    var s = Math.min(100, fgHsl.s + 15 * intensity);
    var l = Math.abs(fgHsl.l - bgHsl.l) < 40
      ? (fgHsl.l > bgHsl.l ? Math.min(100, fgHsl.l + 20) : Math.max(0, fgHsl.l - 20))
      : fgHsl.l;

    return ColorCore.hslToHex(h, s, l);
  }
};

var ColorContrast = {
  contrastRatio: function(color1, color2) {
    var rgb1 = ColorCore.hexToRgb(color1);
    var rgb2 = ColorCore.hexToRgb(color2);
    var l1 = ColorCore.relativeLuminance(rgb1);
    var l2 = ColorCore.relativeLuminance(rgb2);

    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  },

  computeForeground: function(desired, bg, minRatio) {
    if (minRatio === undefined) minRatio = 4.5;
    if (ColorContrast.contrastRatio(desired, bg) >= minRatio) return desired;

    var constants = ColorCore.createColorConstants();
    var bgHsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(bg));
    var step = bgHsl.l > 50 ? -5 : 5;

    function adjust(attempt, current) {
      if (attempt === 0 || ColorContrast.contrastRatio(current, bg) >= minRatio) return current;

      var hsl = ColorCore.rgbToHsl.apply(null, ColorCore.hexToRgb(current));
      var next = ColorCore.hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + step)));
      return adjust(attempt - 1, next);
    }

    return adjust(constants.MAX_FOREGROUND_ADJUSTMENTS, desired);
  },

  contrastingLevel: function(colors, bg, level) {
    if (level === undefined) level = 50;

    var sorted = colors.slice().sort(function(a, b) {
      return ColorContrast.contrastRatio(a, bg) - ColorContrast.contrastRatio(b, bg);
    });

    return sorted[Math.round((level / 100) * (sorted.length - 1))];
  },

  emphaticLevel: function(color, bg, level) {
    if (level === undefined) level = 50;
    return ColorHarmony.emphasize(color, bg, (level / 100) * 2);
  },

  getContrastingPalette: function(baseHex, minContrast, options) {
    if (minContrast === undefined) minContrast = 4.5;
    if (options === undefined) options = {};

    var constants = ColorCore.createColorConstants();
    var bgRgb = ColorCore.hexToRgb(baseHex);
    var bgHsl = ColorCore.rgbToHsl.apply(null, bgRgb);
    var bgLum = ColorCore.relativeLuminance(bgRgb);
    var candidateHues = constants.CANDIDATE_HUES.map(function(s) {
      return (bgHsl.h + s) % 360;
    });
    var saturations = constants.SATURATIONS;
    var direction = bgLum > 0.4 ? 'lighter' : 'darker';

    function findBestLight(hue, sat) {
      var low = direction === 'lighter' ? 25 : 0;
      var high = direction === 'lighter' ? 50 : 25;

      for (var i = 0; i < 30; i++) {
        var mid = Math.round((low + high) / 2);
        var hex = ColorCore.hslToHex(hue, sat, mid);

        if (ColorContrast.contrastRatio(hex, baseHex) >= minContrast) return mid;

        if (direction === 'lighter') low = Math.min(100, low + 5);
        else high = Math.max(0, high - 5);
      }

      return null;
    }

    var results = candidateHues.reduce(function(acc, hue) {
      return saturations.reduce(function(innerAcc, sat) {
        var bestLight = findBestLight(hue, sat);

        if (bestLight !== null) {
          var fgHex = ColorCore.hslToHex(hue, sat, bestLight);
          innerAcc.push({ hex: fgHex, ratio: ColorContrast.contrastRatio(fgHex, baseHex) });
        }

        return innerAcc;
      }, acc);
    }, []);

    var uniqueResult = results.reduce(function(acc, r) {
      var lower = r.hex.toLowerCase();
      if (acc.seen.indexOf(lower) === -1) {
        acc.seen.push(lower);
        acc.unique.push(r);
      }
      return acc;
    }, { seen: [], unique: [] });

    var unique = uniqueResult.unique;
    unique.sort(function(a, b) { return a.ratio - b.ratio; });

    var limited = options.maxColors != null ? unique.slice(0, options.maxColors) : unique;
    return limited.map(function(c) { return c.hex; });
  },

  getOptimalForeground: function(bgHex, minRatio, options) {
    if (minRatio === undefined) minRatio = 4.5;
    if (options === undefined) options = {};

    var scheme = options.scheme || 'complementary';
    var preference = options.preference || 'balanced';

    var palette = ColorHarmony.getHarmoniousPalette(bgHex, 5, { scheme: scheme });
    if (palette.length < 5) {
      palette = ColorHarmony.getHarmoniousPalette(bgHex, 5, { scheme: 'analogous' });
    }

    var candidates = palette
      .map(function(c) {
        return {
          hex: c,
          ratio: ColorContrast.contrastRatio(c, bgHex),
          harmony: ColorHarmony.colorHarmonyScore(c, bgHex)
        };
      })
      .filter(function(c) { return c.ratio >= minRatio; });

    if (candidates.length === 0) {
      var lightPalette = ColorContrast.getContrastingPalette(bgHex, minRatio);
      return lightPalette.length ? lightPalette[0] : ColorContrast.computeForeground('#ffffff', bgHex, minRatio);
    }

    if (preference === 'contrast') {
      candidates.sort(function(a, b) { return b.ratio - a.ratio; });
    } else if (preference === 'harmony') {
      candidates.sort(function(a, b) { return b.harmony - a.harmony; });
    } else {
      candidates.sort(function(a, b) {
        return (b.ratio * 0.5 + b.harmony * 0.5) - (a.ratio * 0.5 + a.harmony * 0.5);
      });
    }

    return candidates[0].hex;
  }
};

export {
  ColorCore,
  ColorHarmony,
  ColorContrast
};
