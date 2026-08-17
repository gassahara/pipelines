function createColorConstants() {
  return Object.freeze({
    CANDIDATE_HUES: [180, 150, 210, 120, 240, 60, 300, 90, 270],
    SATURATIONS: [100, 80, 60, 40],
    MAX_FOREGROUND_ADJUSTMENTS: 20
  });
}

function rgbToHsl(r, g, b) {
  var nr = r / 255, ng = g / 255, nb = b / 255;
  var max = Math.max(nr, ng, nb);
  var min = Math.min(nr, ng, nb);
  var d = max - min;
  var l = (max + min) / 2;
  var s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  var h = d === 0 ? 0 : (max === nr ? (ng - nb) / d + (ng < nb ? 6 : 0) : max === ng ? (nb - nr) / d + 2 : (nr - ng) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
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
}

function parseComponent(comp) {
  if (typeof comp === 'number') return comp === Math.floor(comp) && comp >= 0 && comp <= 255 ? comp : null;
  if (typeof comp !== 'string') return null;
  var s = comp.trim().replace(/^0x/i, '');
  if (!s || !/^[0-9a-fA-F]+$/.test(s)) return null;
  var val = parseInt(s, /[a-fA-F]/.test(s) ? 16 : 10);
  return isNaN(val) || val < 0 || val > 255 ? null : val;
}

function hexToRgb(input) {
  if (typeof input === 'string' && input.trim().indexOf('rgb(') === 0) {
    var parts = input.trim().slice(4, -1).split(',').map(function(s) { return s.trim(); }).map(parseComponent);
    return parts.length === 3 && parts.every(function(n) { return n !== null; }) ? parts : [0, 0, 0];
  }
  if (typeof input !== 'string') return [0, 0, 0];
  var hex = input.trim().replace(/^#|^0x/i, '');
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function pad2(n) {
  return n < 16 ? '0' + n.toString(16) : n.toString(16);
}

function rgbToHex(r, g, b) {
  var nums = [r, g, b].map(parseComponent);
  if (nums.some(function(n) { return n === null; })) return "#000000";
  return "#" + nums.map(function(n) { return pad2(n); }).join('');
}

function hslToHex(h, s, l) {
  var rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function relativeLuminance(rgb) {
  var r = rgb[0], g = rgb[1], b = rgb[2];
  function toLinear(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(color1, color2) {
  var rgb1 = hexToRgb(color1);
  var rgb2 = hexToRgb(color2);
  var l1 = relativeLuminance(rgb1);
  var l2 = relativeLuminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function computeForeground(desired, bg, minRatio) {
  if (minRatio === undefined) minRatio = 4.5;
  if (contrastRatio(desired, bg) >= minRatio) return desired;
  var constants = createColorConstants();
  var bgHsl = rgbToHsl.apply(null, hexToRgb(bg));
  var step = bgHsl.l > 50 ? -5 : 5;
  function adjust(attempt, current) {
    if (attempt === 0 || contrastRatio(current, bg) >= minRatio) return current;
    var hsl = rgbToHsl.apply(null, hexToRgb(current));
    var next = hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + step)));
    return adjust(attempt - 1, next);
  }
  return adjust(constants.MAX_FOREGROUND_ADJUSTMENTS, desired);
}

function emphasize(color, bg, intensity) {
  if (intensity === undefined) intensity = 1;
  var fgHsl = rgbToHsl.apply(null, hexToRgb(String(color)));
  var bgHsl = rgbToHsl.apply(null, hexToRgb(String(bg)));
  var h = Math.abs(fgHsl.h - bgHsl.h) < 30 ? (fgHsl.h + 30) % 360 : fgHsl.h;
  var s = Math.min(100, fgHsl.s + 15 * intensity);
  var l = Math.abs(fgHsl.l - bgHsl.l) < 40 ? (fgHsl.l > bgHsl.l ? Math.min(100, fgHsl.l + 20) : Math.max(0, fgHsl.l - 20)) : fgHsl.l;
  return hslToHex(h, s, l);
}

function extractInlineStyle(el, prop) {
  return el.style[prop] || '';
}

function shiftHues(hex, shifts) {
  var hsl = rgbToHsl.apply(null, hexToRgb(hex));
  return shifts.map(function(shift) {
    return hslToHex((hsl.h + shift + 360) % 360, hsl.s, hsl.l);
  });
}

function complementary(hex) {
  return shiftHues(hex, [180]);
}

function analogous(hex, count, step) {
  if (count === undefined) count = 3;
  if (step === undefined) step = 30;
  var hsl = rgbToHsl.apply(null, hexToRgb(hex));
  var startH = hsl.h - (step * (count - 1)) / 2;
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push(hslToHex(((startH + i * step) % 360 + 360) % 360, hsl.s, hsl.l));
  }
  return result;
}

function triadic(hex) {
  return [hex].concat(shiftHues(hex, [120, 240]));
}

function splitComplementary(hex) {
  return [hex].concat(shiftHues(hex, [150, 210]));
}

function tetradic(hex) {
  return [hex].concat(shiftHues(hex, [60, 180, 240]));
}

function monochromatic(hex, count, lightnessRange) {
  if (count === undefined) count = 5;
  if (lightnessRange === undefined) lightnessRange = 60;
  var hsl = rgbToHsl.apply(null, hexToRgb(hex));
  var startL = Math.max(0, hsl.l - lightnessRange / 2);
  var endL = Math.min(100, hsl.l + lightnessRange / 2);
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push(hslToHex(hsl.h, hsl.s, count === 1 ? hsl.l : startL + ((endL - startL) * i) / (count - 1)));
  }
  return result;
}

function shades(hex, count) {
  if (count === undefined) count = 5;
  var hsl = rgbToHsl.apply(null, hexToRgb(hex));
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push(hslToHex(hsl.h, hsl.s, count === 1 ? hsl.l : hsl.l - (hsl.l * i) / (count - 1)));
  }
  return result;
}

function tints(hex, count) {
  if (count === undefined) count = 5;
  var hsl = rgbToHsl.apply(null, hexToRgb(hex));
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push(hslToHex(hsl.h, hsl.s, count === 1 ? hsl.l : hsl.l + ((100 - hsl.l) * i) / (count - 1)));
  }
  return result;
}

function pick(colors, index) {
  return colors[Math.max(0, Math.min(index, colors.length - 1))];
}

function contrastingLevel(colors, bg, level) {
  if (level === undefined) level = 50;
  var sorted = colors.slice().sort(function(a, b) { return contrastRatio(a, bg) - contrastRatio(b, bg); });
  return sorted[Math.round((level / 100) * (sorted.length - 1))];
}

function emphaticLevel(color, bg, level) {
  if (level === undefined) level = 50;
  return emphasize(color, bg, (level / 100) * 2);
}

function getContrastingPalette(baseHex, minContrast, options) {
  if (minContrast === undefined) minContrast = 4.5;
  if (options === undefined) options = {};
  var constants = createColorConstants();
  var bgRgb = hexToRgb(baseHex);
  var bgHsl = rgbToHsl.apply(null, bgRgb);
  var bgLum = relativeLuminance(bgRgb);
  var candidateHues = constants.CANDIDATE_HUES.map(function(s) { return (bgHsl.h + s) % 360; });
  var saturations = constants.SATURATIONS;
  var direction = bgLum > 0.4 ? 'lighter' : 'darker';

  function findBestLight(hue, sat) {
    var low = direction === 'lighter' ? 25 : 0;
    var high = direction === 'lighter' ? 50 : 25;
    for (var i = 0; i < 30; i++) {
      var mid = Math.round((low + high) / 2);
      var hex = hslToHex(hue, sat, mid);
      if (contrastRatio(hex, baseHex) >= minContrast) return mid;
      if (direction === 'lighter') low = Math.min(100, low + 5);
      else high = Math.max(0, high - 5);
    }
    return null;
  }

  var results = candidateHues.reduce(function(acc, hue) {
    return saturations.reduce(function(innerAcc, sat) {
      var bestLight = findBestLight(hue, sat);
      if (bestLight !== null) {
        var fgHex = hslToHex(hue, sat, bestLight);
        innerAcc.push({ hex: fgHex, ratio: contrastRatio(fgHex, baseHex) });
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
}

function getHarmoniousPalette(baseHex, count, options) {
  if (count === undefined) count = 3;
  if (options === undefined) options = {};
  var scheme = options.scheme || 'analogous';
  switch (scheme) {
    case 'complementary': return complementary(baseHex).slice(0, count);
    case 'triadic': return triadic(baseHex).slice(0, count);
    case 'split': return splitComplementary(baseHex).slice(0, count);
    case 'tetradic': return tetradic(baseHex).slice(0, count);
    case 'analogous':
    default: return analogous(baseHex, count, options.step);
  }
}

function colorHarmonyScore(fgHex, bgHex) {
  var fgHsl = rgbToHsl.apply(null, hexToRgb(fgHex));
  var bgHsl = rgbToHsl.apply(null, hexToRgb(bgHex));
  var hueDist = Math.abs(fgHsl.h - bgHsl.h);
  var normalizedDist = hueDist > 180 ? 360 - hueDist : hueDist;
  if (normalizedDist < 30) return 1;
  if (normalizedDist < 60) return 0.9;
  if (normalizedDist > 150 && normalizedDist < 180) return 0.95;
  if (normalizedDist > 90 && normalizedDist < 120) return 0.4;
  return 0.7;
}

function getOptimalForeground(bgHex, minRatio, options) {
  if (minRatio === undefined) minRatio = 4.5;
  if (options === undefined) options = {};
  var scheme = options.scheme || 'complementary';
  var preference = options.preference || 'balanced';

  var palette = getHarmoniousPalette(bgHex, 5, { scheme: scheme });
  if (palette.length < 5) palette = getHarmoniousPalette(bgHex, 5, { scheme: 'analogous' });

  var candidates = palette
    .map(function(c) { return { hex: c, ratio: contrastRatio(c, bgHex), harmony: colorHarmonyScore(c, bgHex) }; })
    .filter(function(c) { return c.ratio >= minRatio; });

  if (candidates.length === 0) {
    var lightPalette = getContrastingPalette(bgHex, minRatio);
    return lightPalette.length ? lightPalette[0] : computeForeground('#ffffff', bgHex, minRatio);
  }

  if (preference === 'contrast') candidates.sort(function(a, b) { return b.ratio - a.ratio; });
  else if (preference === 'harmony') candidates.sort(function(a, b) { return b.harmony - a.harmony; });
  else candidates.sort(function(a, b) { return (b.ratio * 0.5 + b.harmony * 0.5) - (a.ratio * 0.5 + a.harmony * 0.5); });

  return candidates[0].hex;
}

export {
  createColorConstants,
  rgbToHsl,
  hslToRgb,
  hexToRgb,
  rgbToHex,
  hslToHex,
  relativeLuminance,
  contrastRatio,
  computeForeground,
  emphasize,
  extractInlineStyle,
  complementary,
  analogous,
  triadic,
  splitComplementary,
  tetradic,
  monochromatic,
  shades,
  tints,
  pick,
  contrastingLevel,
  emphaticLevel,
  getContrastingPalette,
  getHarmoniousPalette,
  colorHarmonyScore,
  getOptimalForeground
};
