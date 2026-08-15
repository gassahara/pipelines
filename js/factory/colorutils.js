// ==================== COLOR SPACE CONVERSIONS ====================

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }
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
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  };
}

const parseComponent = (comp) => {
  if (typeof comp === 'number') return Number.isInteger(comp) && comp >= 0 && comp <= 255 ? comp : null;
  if (typeof comp !== 'string') return null;
  const s = comp.trim().replace(/^0x/i, '');
  if (!s || !/^[0-9a-fA-F]+$/.test(s)) return null;
  const val = parseInt(s, /[a-fA-F]/.test(s) ? 16 : 10);
  return isNaN(val) || val < 0 || val > 255 ? null : val;
};

export function hexToRgb(input) {
  if (typeof input === 'string' && input.trim().startsWith('rgb(')) {
    const parts = input.trim().slice(4, -1).split(',').map(s => s.trim()).map(parseComponent);
    return parts.length === 3 && parts.every(n => n !== null) ? parts : [0, 0, 0];
  }
  if (typeof input !== 'string') return [0, 0, 0];
  const hex = input.trim().replace(/^#|^0x/i, '');
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function rgbToHex(r, g, b) {
  const nums = [r, g, b].map(parseComponent);
  if (nums.some(n => n === null)) return "#000000";
  return `#${nums.map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

export function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ==================== LUMINANCE & CONTRAST ====================

const relativeLuminance = ([r, g, b]) => {
  const toLinear = c => (c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

export function contrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function computeForeground(desired, bg, minRatio = 4.5) {
  let fgHex = desired;
  if (contrastRatio(fgHex, bg) >= minRatio) return fgHex;

  const fgHsl = rgbToHsl(...hexToRgb(fgHex));
  const bgHsl = rgbToHsl(...hexToRgb(bg));
  const step = bgHsl.l > 50 ? -5 : 5;

  for (let i = 0; i < 20; i++) {
    fgHsl.l = Math.max(0, Math.min(100, fgHsl.l + step));
    fgHex = hslToHex(fgHsl.h, fgHsl.s, fgHsl.l);
    if (contrastRatio(fgHex, bg) >= minRatio) break;
  }
  return fgHex;
}

export function emphasize(color, bg, intensity = 1) {
  const fgHsl = rgbToHsl(...hexToRgb(String(color)));
  const bgHsl = rgbToHsl(...hexToRgb(String(bg)));

  if (Math.abs(fgHsl.h - bgHsl.h) < 30) fgHsl.h = (fgHsl.h + 30) % 360;
  fgHsl.s = Math.min(100, fgHsl.s + 15 * intensity);
  if (Math.abs(fgHsl.l - bgHsl.l) < 40) {
    fgHsl.l = fgHsl.l > bgHsl.l ? Math.min(100, fgHsl.l + 20) : Math.max(0, fgHsl.l - 20);
  }
  return hslToHex(fgHsl.h, fgHsl.s, fgHsl.l);
}

export const extractInlineStyle = (el, prop) => el.style[prop] || '';

// ==================== HARMONY & PALETTES ====================

const shiftHues = (hex, shifts) => {
  const { h, s, l } = rgbToHsl(...hexToRgb(hex));
  return shifts.map(shift => hslToHex((h + shift + 360) % 360, s, l));
};

export const complementary = (hex) => shiftHues(hex, [180]);

export function analogous(hex, count = 3, step = 30) {
  const { h, s, l } = rgbToHsl(...hexToRgb(hex));
  const startH = h - (step * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => hslToHex(((startH + i * step) % 360 + 360) % 360, s, l));
}

export const triadic = (hex) => [hex, ...shiftHues(hex, [120, 240])];
export const splitComplementary = (hex) => [hex, ...shiftHues(hex, [150, 210])];
export const tetradic = (hex) => [hex, ...shiftHues(hex, [60, 180, 240])];

export function monochromatic(hex, count = 5, lightnessRange = 60) {
  const { h, s, l } = rgbToHsl(...hexToRgb(hex));
  const startL = Math.max(0, l - lightnessRange / 2);
  const endL = Math.min(100, l + lightnessRange / 2);
  return Array.from({ length: count }, (_, i) =>
    hslToHex(h, s, count === 1 ? l : startL + ((endL - startL) * i) / (count - 1))
  );
}

export function shades(hex, count = 5) {
  const { h, s, l } = rgbToHsl(...hexToRgb(hex));
  return Array.from({ length: count }, (_, i) => hslToHex(h, s, count === 1 ? l : l - (l * i) / (count - 1)));
}

export function tints(hex, count = 5) {
  const { h, s, l } = rgbToHsl(...hexToRgb(hex));
  return Array.from({ length: count }, (_, i) => hslToHex(h, s, count === 1 ? l : l + ((100 - l) * i) / (count - 1)));
}

export const pick = (colors, index) => colors[Math.max(0, Math.min(index, colors.length - 1))];

export function contrastingLevel(colors, bg, level = 50) {
  const sorted = colors.slice().sort((a, b) => contrastRatio(a, bg) - contrastRatio(b, bg));
  return sorted[Math.round((level / 100) * (sorted.length - 1))];
}

export const emphaticLevel = (color, bg, level = 50) => emphasize(color, bg, (level / 100) * 2);

export function getContrastingPalette(baseHex, minContrast = 4.5, options = {}) {
  const bgRgb = hexToRgb(baseHex);
  const bgHsl = rgbToHsl(...bgRgb);
  const bgLum = relativeLuminance(bgRgb);
  const candidateHues = [180, 150, 210, 120, 240, 60, 300, 90, 270].map(s => (bgHsl.h + s) % 360);

  const results = [];
  const saturations = [100, 80, 60, 40];
  const direction = bgLum > 0.4 ? 'lighter' : 'darker';

  for (const hue of candidateHues) {
    for (const sat of saturations) {
      let low = direction === 'lighter' ? 25 : 0;
      let high = direction === 'lighter' ? 50 : 25;
      let bestLight = null;

      for (let i = 0; i < 30; i++) {
        const mid = Math.round((low + high) / 2);
        const hex = hslToHex(hue, sat, mid);
        if (contrastRatio(hex, baseHex) >= minContrast) {
          bestLight = mid;
          break;
        }
        if (direction === 'lighter') low = Math.min(100, low + 5);
        else high = Math.max(0, high - 5);
      }
      if (bestLight !== null) {
        const fgHex = hslToHex(hue, sat, bestLight);
        results.push({ hex: fgHex, ratio: contrastRatio(fgHex, baseHex) });
      }
    }
  }

  const seen = new Set();
  const unique = results.filter(r => !seen.has(r.hex.toLowerCase()) && seen.add(r.hex.toLowerCase()));
  unique.sort((a, b) => a.ratio - b.ratio);
  return (options.maxColors != null ? unique.slice(0, options.maxColors) : unique).map(c => c.hex);
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
  if (palette.length < 5) palette = getHarmoniousPalette(bgHex, 5, { scheme: 'analogous' });

  const candidates = palette
    .map(c => ({ hex: c, ratio: contrastRatio(c, bgHex), harmony: colorHarmonyScore(c, bgHex) }))
    .filter(c => c.ratio >= minRatio);

  if (candidates.length === 0) {
    const lightPalette = getContrastingPalette(bgHex, minRatio);
    return lightPalette.length ? lightPalette[0] : computeForeground('#ffffff', bgHex, minRatio);
  }

  if (preference === 'contrast') candidates.sort((a, b) => b.ratio - a.ratio);
  else if (preference === 'harmony') candidates.sort((a, b) => b.harmony - a.harmony);
  else candidates.sort((a, b) => (b.ratio * 0.5 + b.harmony * 0.5) - (a.ratio * 0.5 + a.harmony * 0.5));

  return candidates[0].hex;
}
