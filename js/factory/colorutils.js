
// ---- OP-094: rangemap helper (extracted from 4 call sites) ----
function rangemap(count, fn) {
  return Array.apply(null, new Array(count)).map(function(unused, i) { return fn(i); });
}

var colorcore = {
  createcolorconstants: function() {
    return Object.freeze({
      candidatehues: [180, 150, 210, 120, 240, 60, 300, 90, 270],
      saturations: [100, 80, 60, 40],
      maxforegroundadjustments: 20
    });
  },

  rgbtohsl: function(r, g, b) {
    var nr = r / 255, ng = g / 255, nb = b / 255;
    var max = Math.max(nr, ng, nb);
    var min = Math.min(nr, ng, nb);
    var d = max - min;
    var l = (max + min) / 2;
    var s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
    var h = d === 0 ? 0 : (max === nr ? (ng - nb) / d + (ng < nb ? 6 : 0) : max === ng ? (nb - nr) / d + 2 : (nr - ng) / d + 4) / 6;

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },

  hsltorgb: function(h, s, l) {
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

  parsecomponent: function(comp) {
    if (typeof comp === 'number') {
      return comp === Math.floor(comp) && comp >= 0 && comp <= 255 ? comp : null;
    }

    if (typeof comp !== 'string') return null;

    var s = comp.trim();

    if (s === '') return null;

    var ishex = false;
    var start = 0;

    if (s.charAt(0) === '0' && (s.charAt(1) === 'x' || s.charAt(1) === 'X')) {
      ishex = true;
      start = 2;
    }

    function ishexdigit(ch) {
      return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }

    if (ishex) {
      var hexpart = s.slice(start);
      if (!hexpart.split('').every(ishexdigit)) return null;
      var val = parseInt(hexpart, 16);
      return isNaN(val) || val < 0 || val > 255 ? null : val;
    }

    var decpart = s;
    if (!decpart.split('').every(function(c) { return c >= '0' && c <= '9'; })) return null;

    var dec = parseInt(s, 10);
    return isNaN(dec) || dec < 0 || dec > 255 ? null : dec;
  },

  pad2: function(n) {
    return n < 16 ? '0' + n.toString(16) : n.toString(16);
  },

  hextorgb: function(input, colorcore) {
    if (typeof input === 'string') {
      var trimmed = input.trim();

      if (trimmed.indexOf('rgb(') === 0) {
        var close = trimmed.indexOf(')');
        if (close === -1) return [0, 0, 0];

        var body = trimmed.slice(4, close);
        var parts = body.split(',').map(function(s) { return s.trim(); }).map(colorcore.parsecomponent);

        return parts.length === 3 && parts.every(function(n) { return n !== null; }) ? parts : [0, 0, 0];
      }

      var hex = trimmed;

      if (hex.charAt(0) === '#') {
        hex = hex.slice(1);
      } else if (hex.charAt(0) === '0' && (hex.charAt(1) === 'x' || hex.charAt(1) === 'X')) {
        hex = hex.slice(2);
      }

      if (hex.length !== 6) return [0, 0, 0];

      function ishexdigit(c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
      }
      if (!hex.split('').every(ishexdigit)) return [0, 0, 0];

      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }

    return [0, 0, 0];
  },

  rgbtohex: function(r, g, b, colorcore) {
    var nums = [r, g, b].map(colorcore.parsecomponent);

    if (nums.some(function(n) { return n === null; })) return '#000000';

    return '#' + nums.map(function(n) { return colorcore.pad2(n); }).join('');
  },

  hsltohex: function(h, s, l, colorcore) {
    var rgb = colorcore.hsltorgb(h, s, l);
    return colorcore.rgbtohex(rgb.r, rgb.g, rgb.b, colorcore);
  },

  relativeluminance: function(rgb) {
    var r = rgb[0], g = rgb[1], b = rgb[2];

    function tolinear(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    return 0.2126 * tolinear(r) + 0.7152 * tolinear(g) + 0.0722 * tolinear(b);
  },

  extractinlinestyle: function(el, prop) {
    return el.style[prop] || '';
  }
};

var colorharmony = {
  shifthues: function(hex, shifts, colorcore) {
    var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(hex, colorcore));

    return shifts.map(function(shift) {
      return colorcore.hsltohex((hsl.h + shift + 360) % 360, hsl.s, hsl.l, colorcore);
    });
  },

  complementary: function(hex, colorharmony, colorcore) {
    return colorharmony.shifthues(hex, [180], colorcore);
  },

  // ---- OP-095: rangemap in analogous ----
  analogous: function(hex, count, step, colorcore) {
    if (count === undefined) count = 3;
    if (step === undefined) step = 30;

    var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(hex, colorcore));
    var starth = hsl.h - (step * (count - 1)) / 2;

    return rangemap(count, function(i) {
      return colorcore.hsltohex(((starth + i * step) % 360 + 360) % 360, hsl.s, hsl.l, colorcore);
    });
  },

  triadic: function(hex, colorharmony, colorcore) {
    return [hex].concat(colorharmony.shifthues(hex, [120, 240], colorcore));
  },

  splitcomplementary: function(hex, colorharmony, colorcore) {
    return [hex].concat(colorharmony.shifthues(hex, [150, 210], colorcore));
  },

  tetradic: function(hex, colorharmony, colorcore) {
    return [hex].concat(colorharmony.shifthues(hex, [60, 180, 240], colorcore));
  },

  // ---- OP-095: rangemap in monochromatic ----
  monochromatic: function(hex, count, lightnessrange, colorcore) {
    if (count === undefined) count = 5;
    if (lightnessrange === undefined) lightnessrange = 60;

    var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(hex, colorcore));
    var startl = Math.max(0, hsl.l - lightnessrange / 2);
    var endl = Math.min(100, hsl.l + lightnessrange / 2);

    return rangemap(count, function(i) {
      return colorcore.hsltohex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : startl + ((endl - startl) * i) / (count - 1),
        colorcore
      );
    });
  },

  // ---- OP-095: rangemap in shades ----
  shades: function(hex, count, colorcore) {
    if (count === undefined) count = 5;
    var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(hex, colorcore));

    return rangemap(count, function(i) {
      return colorcore.hsltohex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : hsl.l - (hsl.l * i) / (count - 1),
        colorcore
      );
    });
  },

  // ---- OP-095: rangemap in tints ----
  tints: function(hex, count, colorcore) {
    if (count === undefined) count = 5;
    var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(hex, colorcore));

    return rangemap(count, function(i) {
      return colorcore.hsltohex(
        hsl.h,
        hsl.s,
        count === 1 ? hsl.l : hsl.l + ((100 - hsl.l) * i) / (count - 1),
        colorcore
      );
    });
  },

  pick: function(colors, index) {
    return colors[Math.max(0, Math.min(index, colors.length - 1))];
  },

  colorharmonyscore: function(fghex, bghex, colorcore) {
    var fghsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(fghex, colorcore));
    var bghsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(bghex, colorcore));
    var huedist = Math.abs(fghsl.h - bghsl.h);
    var normalizeddist = huedist > 180 ? 360 - huedist : huedist;

    if (normalizeddist < 30) return 1;
    if (normalizeddist < 60) return 0.9;
    if (normalizeddist > 150 && normalizeddist < 180) return 0.95;
    if (normalizeddist > 90 && normalizeddist < 120) return 0.4;
    return 0.7;
  },

  getharmoniouspalette: function(basehex, count, options, colorharmony, colorcore) {
    if (count === undefined) count = 3;
    if (options === undefined) options = {};

    var scheme = options.scheme || 'analogous';

    switch (scheme) {
      case 'complementary': return colorharmony.complementary(basehex, colorharmony, colorcore).slice(0, count);
      case 'triadic': return colorharmony.triadic(basehex, colorharmony, colorcore).slice(0, count);
      case 'split': return colorharmony.splitcomplementary(basehex, colorharmony, colorcore).slice(0, count);
      case 'tetradic': return colorharmony.tetradic(basehex, colorharmony, colorcore).slice(0, count);
      case 'analogous':
      default: return colorharmony.analogous(basehex, count, options.step, colorcore);
    }
  },

  emphasize: function(color, bg, intensity, colorcore) {
    if (intensity === undefined) intensity = 1;

    var fghsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(String(color), colorcore));
    var bghsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(String(bg), colorcore));
    var h = Math.abs(fghsl.h - bghsl.h) < 30 ? (fghsl.h + 30) % 360 : fghsl.h;
    var s = Math.min(100, fghsl.s + 15 * intensity);
    var l = Math.abs(fghsl.l - bghsl.l) < 40
      ? (fghsl.l > bghsl.l ? Math.min(100, fghsl.l + 20) : Math.max(0, fghsl.l - 20))
      : fghsl.l;

    return colorcore.hsltohex(h, s, l, colorcore);
  }
};

var colorcontrast = {
  contrastratio: function(color1, color2, colorcore) {
    var rgb1 = colorcore.hextorgb(color1, colorcore);
    var rgb2 = colorcore.hextorgb(color2, colorcore);
    var l1 = colorcore.relativeluminance(rgb1);
    var l2 = colorcore.relativeluminance(rgb2);

    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  },

  computeforeground: function(desired, bg, minratio, colorcontrast, colorcore) {
    if (minratio === undefined) minratio = 4.5;
    if (colorcontrast.contrastratio(desired, bg, colorcore) >= minratio) return desired;

    var constants = colorcore.createcolorconstants();
    var bghsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(bg, colorcore));
    var step = bghsl.l > 50 ? -5 : 5;

    function adjust(attempt, current) {
      if (attempt === 0 || colorcontrast.contrastratio(current, bg, colorcore) >= minratio) return current;

      var hsl = colorcore.rgbtohsl.apply(null, colorcore.hextorgb(current, colorcore));
      var next = colorcore.hsltohex(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + step)), colorcore);
      return adjust(attempt - 1, next);
    }

    return adjust(constants.maxforegroundadjustments, desired);
  },

  contrastinglevel: function(colors, bg, level, colorcontrast, colorcore) {
    if (level === undefined) level = 50;

    var sorted = colors.slice().sort(function(a, b) {
      return colorcontrast.contrastratio(a, bg, colorcore) - colorcontrast.contrastratio(b, bg, colorcore);
    });

    return sorted[Math.round((level / 100) * (sorted.length - 1))];
  },

  emphaticlevel: function(color, bg, level, colorharmony, colorcore) {
    if (level === undefined) level = 50;
    return colorharmony.emphasize(color, bg, (level / 100) * 2, colorcore);
  },

  getcontrastingpalette: function(basehex, mincontrast, options, colorcore, colorcontrast) {
    if (mincontrast === undefined) mincontrast = 4.5;
    if (options === undefined) options = {};

    var constants = colorcore.createcolorconstants();
    var bgrgb = colorcore.hextorgb(basehex, colorcore);
    var bghsl = colorcore.rgbtohsl.apply(null, bgrgb);
    var bglum = colorcore.relativeluminance(bgrgb);
    var candidatehues = constants.candidatehues.map(function(s) {
      return (bghsl.h + s) % 360;
    });
    var saturations = constants.saturations;
    var direction = bglum > 0.4 ? 'lighter' : 'darker';

    function findbestlight(hue, sat, low, high, attempt) {
      if (attempt >= 30) return null;

      var mid = Math.round((low + high) / 2);
      var hex = colorcore.hsltohex(hue, sat, mid, colorcore);

      if (colorcontrast.contrastratio(hex, basehex, colorcore) >= mincontrast) return mid;

      if (direction === 'lighter') {
        return findbestlight(hue, sat, Math.min(100, low + 5), high, attempt + 1);
      }
      return findbestlight(hue, sat, low, Math.max(0, high - 5), attempt + 1);
    }

    var results = candidatehues.reduce(function(acc, hue) {
      return saturations.reduce(function(inneracc, sat) {
        var bestlight = findbestlight(hue, sat, direction === 'lighter' ? 25 : 0, direction === 'lighter' ? 50 : 25, 0);

        if (bestlight !== null) {
          var fghex = colorcore.hsltohex(hue, sat, bestlight, colorcore);
          inneracc.push({ hex: fghex, ratio: colorcontrast.contrastratio(fghex, basehex, colorcore) });
        }

        return inneracc;
      }, acc);
    }, []);

    var uniqueresult = results.reduce(function(acc, r) {
      var lower = r.hex.toLowerCase();
      if (acc.seen.indexOf(lower) === -1) {
        acc.seen.push(lower);
        acc.unique.push(r);
      }
      return acc;
    }, { seen: [], unique: [] });

    var unique = uniqueresult.unique;
    unique.sort(function(a, b) { return a.ratio - b.ratio; });

    var limited = options.maxcolors != null ? unique.slice(0, options.maxcolors) : unique;
    return limited.map(function(c) { return c.hex; });
  },

  getoptimalforeground: function(bghex, minratio, options, colorharmony, colorcontrast, colorcore) {
    if (minratio === undefined) minratio = 4.5;
    if (options === undefined) options = {};

    var scheme = options.scheme || 'complementary';
    var preference = options.preference || 'balanced';

    var palette = colorharmony.getharmoniouspalette(bghex, 5, { scheme: scheme }, colorharmony, colorcore);
    if (palette.length < 5) {
      palette = colorharmony.getharmoniouspalette(bghex, 5, { scheme: 'analogous' }, colorharmony, colorcore);
    }

    var candidates = palette
      .map(function(c) {
        return {
          hex: c,
          ratio: colorcontrast.contrastratio(c, bghex, colorcore),
          harmony: colorharmony.colorharmonyscore(c, bghex, colorcore)
        };
      })
      .filter(function(c) { return c.ratio >= minratio; });

    if (candidates.length === 0) {
      var lightpalette = colorcontrast.getcontrastingpalette(bghex, minratio, {}, colorcore, colorcontrast);
      return lightpalette.length ? lightpalette[0] : colorcontrast.computeforeground('#ffffff', bghex, minratio, colorcontrast, colorcore);
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