export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0; // achromatic/gray
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function hslToRgb(h, s, l) {
  // Normalize values: h to [0, 1], s and l to [0, 1]
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // Achromatic / shade of gray
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// Helper: character checks
function isDigit(c)  { return c >= 48 && c <= 57; }      // 0-9
function isHexUpper(c){ return c >= 65 && c <= 70; }      // A-F
function isHexLower(c){ return c >= 97 && c <= 102; }     // a-f
function isHexChar(c) { return isDigit(c) || isHexUpper(c) || isHexLower(c); }

// Parse a single colour component (string or number) to integer 0-255, or null
function parseComponent(comp) {
    if (typeof comp === 'number') {
        return Number.isInteger(comp) && comp >= 0 && comp <= 255 ? comp : null;
    }
    if (typeof comp === 'string') {
        let s = comp.trim();
        if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
        if (s.length === 0) return null;

        // Decide base: if any a-f present → hex, else decimal
        let base = 10;
        for (let i = 0; i < s.length; i++) {
            if (isHexUpper(s.charCodeAt(i)) || isHexLower(s.charCodeAt(i))) {
                base = 16;
                break;
            }
        }
        // Validate all characters
        for (let i = 0; i < s.length; i++) {
            const ch = s.charCodeAt(i);
            if (base === 10 && !isDigit(ch)) return null;
            if (base === 16 && !isHexChar(ch)) return null;
        }
        const val = parseInt(s, base);
        return (isNaN(val) || val < 0 || val > 255) ? null : val;
    }
    return null;
}

// Convert hex string (#, 0x, or bare) to RGB array [r, g, b]
// Also parses "rgb(R,G,B)" strings (already formatted input) → array
// Always returns an array of three numbers. Invalid inputs return [0,0,0].
export function hexToRgb(input) {
    // If input is a string that's already "rgb(...)", parse it as RGB
    if (typeof input === 'string' && input.trim().startsWith('rgb(')) {
        const inner = input.trim().slice(4, -1);
        const parts = inner.split(',').map(s => s.trim());
        if (parts.length === 3) {
            const rgb = parts.map(parseComponent);
            if (rgb.some(n => n === null)) return [0, 0, 0];
            return rgb;
        }
        return [0, 0, 0];
    }

    // Otherwise treat as hex
    if (typeof input !== 'string') return [0, 0, 0];
    let hex = input.trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    else if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);

    if (hex.length !== 6) return [0, 0, 0];
    for (let i = 0; i < 6; i++) {
        if (!isHexChar(hex.charCodeAt(i))) return [0, 0, 0];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

// Convert three RGB numbers to hex string "#rrggbb"
export function rgbToHex(r, g, b) {
    const nums = [r, g, b].map(parseComponent);
    if (nums.some(n => n === null)) {
        return "#000000";
    }
    const toHex = n => n.toString(16).padStart(2, '0');
    return `#${toHex(nums[0])}${toHex(nums[1])}${toHex(nums[2])}`;
}

// Convert HSL to hex string
export function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function contrastRatio(color1, color2) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!Array.isArray(rgb1) || !Array.isArray(rgb2)) {
        return 0;
    }

    const hsl1 = rgbToHsl(rgb1[0], rgb1[1], rgb1[2]);
    const hsl2 = rgbToHsl(rgb2[0], rgb2[1], rgb2[2]);

    const finalRgb1 = hslToRgb(hsl1.h, hsl1.s, hsl1.l);
    const finalRgb2 = hslToRgb(hsl2.h, hsl2.s, hsl2.l);

    function luminance(rgb) {
        const a = [rgb.r, rgb.g, rgb.b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    const l1 = luminance(finalRgb1);
    const l2 = luminance(finalRgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export function computeForeground(desired, bg, minRatio = 4.5) {
    let fgHex = desired;
    let ratio = contrastRatio(fgHex, bg);
    if (ratio >= minRatio) return fgHex;

    const fgRGB = hexToRgb(fgHex);
    const bgRGB = hexToRgb(bg);
    let fgHsl = rgbToHsl(fgRGB[0], fgRGB[1], fgRGB[2]);
    const bgHsl = rgbToHsl(bgRGB[0], bgRGB[1], bgRGB[2]);
    const step = bgHsl.l > 50 ? -5 : 5;

    for (let i = 0; i < 20; i++) {
        fgHsl.l = Math.max(0, Math.min(100, fgHsl.l + step));
        fgHex = hslToHex(fgHsl.h, fgHsl.s, fgHsl.l);
        if (contrastRatio(fgHex, bg) >= minRatio) break;
    }
    return fgHex;
}

export function emphasize(color, bg, intensity = 1) {
    const fgRGB = hexToRgb("" + color);
    const bgRGB = hexToRgb("" + bg);
    const fgHsl = rgbToHsl(fgRGB[0], fgRGB[1], fgRGB[2]);
    const bgHsl = rgbToHsl(bgRGB[0], bgRGB[1], bgRGB[2]);

    if (Math.abs(fgHsl.h - bgHsl.h) < 30) fgHsl.h = (fgHsl.h + 30) % 360;
    fgHsl.s = Math.min(100, fgHsl.s + 15 * intensity);
    const lDiff = Math.abs(fgHsl.l - bgHsl.l);
    if (lDiff < 40) {
        fgHsl.l = fgHsl.l > bgHsl.l
            ? Math.min(100, fgHsl.l + 20)
            : Math.max(0, fgHsl.l - 20);
    }
    return hslToHex(fgHsl.h, fgHsl.s, fgHsl.l);
}

export function extractInlineStyle(el, prop) {
  return el.style[prop] || '';
}

// ==================== COLOR WHEEL & HARMONY ====================

export function complementary(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const newH = (hsl.h + 180) % 360;
  return [hslToHex(newH, hsl.s, hsl.l)];
}

export function analogous(hex, count = 3, step = 30) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const startH = hsl.h - (step * (count - 1)) / 2;
  const result = [];
  for (let i = 0; i < count; i++) {
    const hue = ((startH + i * step) % 360 + 360) % 360;
    result.push(hslToHex(hue, hsl.s, hsl.l));
  }
  return result;
}

export function triadic(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const h1 = (hsl.h + 120) % 360;
  const h2 = (hsl.h + 240) % 360;
  return [
    hex,
    hslToHex(h1, hsl.s, hsl.l),
    hslToHex(h2, hsl.s, hsl.l)
  ];
}

export function splitComplementary(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const h1 = (hsl.h + 150) % 360;
  const h2 = (hsl.h + 210) % 360;
  return [
    hex,
    hslToHex(h1, hsl.s, hsl.l),
    hslToHex(h2, hsl.s, hsl.l)
  ];
}

export function tetradic(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const h1 = (hsl.h + 60) % 360;
  const h2 = (hsl.h + 180) % 360;
  const h3 = (hsl.h + 240) % 360;
  return [
    hex,
    hslToHex(h1, hsl.s, hsl.l),
    hslToHex(h2, hsl.s, hsl.l),
    hslToHex(h3, hsl.s, hsl.l)
  ];
}

export function monochromatic(hex, count = 5, lightnessRange = 60) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const startL = Math.max(0, hsl.l - lightnessRange / 2);
  const endL = Math.min(100, hsl.l + lightnessRange / 2);
  const result = [];
  for (let i = 0; i < count; i++) {
    const newL = startL + ((endL - startL) * i) / (count - 1);
    result.push(hslToHex(hsl.h, hsl.s, newL));
  }
  return result;
}

export function shades(hex, count = 5) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const result = [];
  for (let i = 0; i < count; i++) {
    const newL = hsl.l - (hsl.l * i) / (count - 1);
    result.push(hslToHex(hsl.h, hsl.s, newL));
  }
  return result;
}

export function tints(hex, count = 5) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const result = [];
  for (let i = 0; i < count; i++) {
    const newL = hsl.l + ((100 - hsl.l) * i) / (count - 1);
    result.push(hslToHex(hsl.h, hsl.s, newL));
  }
  return result;
}

export function pick(colors, index) {
  const i = Math.max(0, Math.min(index, colors.length - 1));
  return colors[i];
}

export function contrastingLevel(colors, bg, level = 50) {
  const sorted = colors.slice().sort((a, b) => contrastRatio(a, bg) - contrastRatio(b, bg));
  const idx = Math.round((level / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function emphaticLevel(color, bg, level = 50) {
  const intensity = (level / 100) * 2;
  return emphasize(color, bg, intensity);
}

export function getContrastingPalette(baseHex, minContrast = 4.5, options = {}) {
    const { maxColors } = options;
    const bgRgb = hexToRgb(baseHex);
    const bgHsl = rgbToHsl(bgRgb[0], bgRgb[1], bgRgb[2]);
    const bgLum = relativeLuminance(bgRgb);

    const candidateHues = gatherHarmonyHues(bgHsl.h);

    const results = [];
    const saturations = [100, 80, 60, 40];
    const direction = bgLum > 0.4 ? 'lighter' : 'darker';

    for (const hue of candidateHues) {
        for (const sat of saturations) {
            const bestLight = optimizeLightness(hue, sat, direction, baseHex, minContrast);
            if (bestLight === null) continue;

            const tuned = fineTuneSaturation(hue, bestLight, sat, baseHex, minContrast);
            const rgb = hslToRgb(hue, tuned.s, tuned.l);
            const fgHex = rgbToHex(rgb.r, rgb.g, rgb.b);
            const ratio = contrastRatio(fgHex, baseHex);

            if (ratio >= minContrast) {
                results.push({ hex: fgHex, ratio, h: hue, s: tuned.s, l: tuned.l });
            }
        }
    }

    const unique = [];
    const seen = new Set();
    for (const r of results) {
        const key = r.hex.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
        }
    }
    unique.sort((a, b) => a.ratio - b.ratio);

    const output = maxColors != null ? unique.slice(0, maxColors) : unique;
    return output.map(c => c.hex);
}

function gatherHarmonyHues(baseHue) {
    const shifts = [
        180,
        150, 210,
        120, 240,
        60, 300,
        90, 270
    ];
    const hues = shifts.map(s => (baseHue + s) % 360);
    return [...new Set(hues)];
}

function optimizeLightness(hue, sat, direction, bgHex, minContrast) {
    let low = 0, high = 50;
    if (direction === 'lighter') {
        low = 25;
    } else {
        high = 25;
    }
    let bestLight = 0;
    let bestRatio = 0;
    for (let i = 0; i < 60; i++) {
        const mid = parseInt((low + high) / 2) % 100;
        const rgb = hslToRgb(hue, sat, mid);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const ratio = contrastRatio(hex, bgHex);
        if (ratio >= minContrast) {
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestLight = mid;
                break;
            }
        } else {
            if (direction === 'lighter') {
                low = (low + mid) % 100;
            } else {
                high = (high + mid) % 100;
            }
        }
    }
    return bestLight;
}

function fineTuneSaturation(hue, light, baseSat, bgHex, minContrast) {
    let best = { s: baseSat, l: light };
    const torgb = hslToRgb(hue, baseSat, light);
    const hex = rgbToHex(torgb.r, torgb.g, torgb.b);
    let bestRatio = contrastRatio(hex, bgHex);

    for (const ds of [-20, -10, 0, 10, 20]) {
        const s = Math.max(0, Math.min(100, baseSat + ds));
        const rgb = hslToRgb(hue, s, light);
        const hexCandidate = rgbToHex(rgb.r, rgb.g, rgb.b);
        const ratio = contrastRatio(hexCandidate, bgHex);
        if (ratio >= minContrast && ratio < bestRatio) {
            bestRatio = ratio;
            best = { s, l: light };
        }
    }
    return best;
}

function relativeLuminance(rgb) {
    const [r, g, b] = rgb;
    const toLinear = c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getHarmoniousPalette(baseHex, count = 3, options = {}) {
  const scheme = options.scheme || 'analogous';
  switch (scheme) {
    case 'complementary': return complementary(baseHex).slice(0, count);
    case 'triadic': return triadic(baseHex).slice(0, count);
    case 'split': return splitComplementary(baseHex).slice(0, count);
    case 'tetradic': return tetradic(baseHex).slice(0, count);
    case 'analogous':
    default: return analogous(baseHex, count, options.step);
  }
}

export function colorHarmonyScore(fgHex, bgHex) {
  const fgHsl = rgbToHsl(...hexToRgb(fgHex));
  const bgHsl = rgbToHsl(...hexToRgb(bgHex));
  const hueDist = Math.abs(fgHsl.h - bgHsl.h);
  const normalizedDist = hueDist > 180 ? 360 - hueDist : hueDist;
  if (normalizedDist < 30) return 1;
  if (normalizedDist < 60) return 0.9;
  if (normalizedDist > 150 && normalizedDist < 180) return 0.95;
  if (normalizedDist > 90 && normalizedDist < 120) return 0.4;
  return 0.7;
}

export function getOptimalForeground(bgHex, minRatio = 4.5, options = {}) {
    const scheme = options.scheme || 'complementary';
    const preference = options.preference || 'balanced';

    let palette = getHarmoniousPalette(bgHex, 5, { scheme });
    while (palette.length < 5) {
        palette = getHarmoniousPalette(bgHex, 5, { scheme: 'analogous' });
    }

    const candidates = palette.map(c => ({
        hex: c,
        ratio: contrastRatio(c, bgHex),
        harmony: colorHarmonyScore(c, bgHex)
    })).filter(c => c.ratio >= minRatio);

    if (candidates.length === 0) {
        const lightPalette = getContrastingPalette(bgHex, minRatio);
        if (lightPalette.length) return lightPalette[0];
        return computeForeground('#ffffff', bgHex, minRatio);
    }

    if (preference === 'contrast') {
        candidates.sort((a, b) => b.ratio - a.ratio);
    } else if (preference === 'harmony') {
        candidates.sort((a, b) => b.harmony - a.harmony);
    } else {
        candidates.sort((a, b) => (b.ratio * 0.5 + b.harmony * 0.5) - (a.ratio * 0.5 + a.harmony * 0.5));
    }
    return candidates[0].hex;
}
