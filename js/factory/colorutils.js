// Pure color computation utilities

/*
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
}
export function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}
*/
export function rgbToHsl(r,g,b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0,s=0,l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r: h=((g-b)/d+(g<b?6:0))/6; break;
      case g: h=((b-r)/d+2)/6; break;
      case b: h=((r-g)/d+4)/6; break;
    }
  }
  return {h:Math.round(h*360), s:Math.round(s*100), l:Math.round(l*100)};
}



/**
 * Converts a hex colour string to an RGB array.
 * - Accepts: "#RRGGBB", "RRGGBB", "0xRRGGBB" (case-insensitive)
 * - If the input is already an array of three numbers, it is returned unchanged.
 * - Returns null for any other input.
 */
export function hexToRgb(input) {
    console.log({input});
    // Already in output format?
    if (Array.isArray(input) && input.length === 3 &&
        input.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
        return [...input];                 // return a copy
    }

    if (typeof input !== 'string') return null;

    // Remove optional '#' or '0x' / '0X' prefix
    let hex = input;
    if (hex.startsWith('#')) {
        hex = hex.slice(1);
    } else if (hex.startsWith('0x') || hex.startsWith('0X')) {
        hex = hex.slice(2);
    }

    // Must now be exactly 6 characters
    if (hex.length !== 6) return null;

    // Validate that every character is a hex digit (0-9, a-f, A-F)
    for (let i = 0; i < 6; i++) {
        const ch = hex.charCodeAt(i);
        const isDigit = ch >= 48 && ch <= 57;      // '0'..'9'
        const isUpper = ch >= 65 && ch <= 70;      // 'A'..'F'
        const isLower = ch >= 97 && ch <= 102;     // 'a'..'f'
        if (!isDigit && !isUpper && !isLower) {
            return null;
        }
    }

    // Parse the three components
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return [r, g, b];
}

/**
 * Converts an RGB colour to a hex string "#RRGGBB".
 * - Accepts:
 *     * an array of three numbers (0-255)       → [26,43,60]
 *     * an array of three hex strings            → ["1a","2b","3c"]
 *     * a CSS string "rgb(R,G,B)" or "rgb(hexR,hexG,hexB)"
 * - If the input is already a valid hex string "#RRGGBB", it is returned unchanged.
 * - Returns null for any other input.
 */
export function rgbToHex(input) {
    // Already in output format?
    if (typeof input === 'string' && input.startsWith('#') && input.length === 7) {
        // Quick sanity check: the remaining 6 chars must be hex digits
        const hexPart = input.slice(1);
        if (hexPart.length === 6) {
            let valid = true;
            for (let i = 0; i < 6; i++) {
                const ch = hexPart.charCodeAt(i);
                const isDigit = ch >= 48 && ch <= 57;
                const isUpper = ch >= 65 && ch <= 70;
                const isLower = ch >= 97 && ch <= 102;
                if (!isDigit && !isUpper && !isLower) { valid = false; break; }
            }
            if (valid) return input.toLowerCase();  // ensure lowercase
        }
    }

    // Determine what we actually received
    let r, g, b;

    if (Array.isArray(input) && input.length === 3) {
        // Array of numbers or hex strings
        const nums = input.map(parseComponent);
        if (nums.includes(null)) return null;
        [r, g, b] = nums;
    } else if (typeof input === 'string') {
        // Try to parse "rgb(...)" string
        if (!input.startsWith('rgb(') || !input.endsWith(')')) return null;
        const inner = input.slice(4, -1); // remove rgb( and )
        const parts = inner.split(',').map(s => s.trim());
        if (parts.length !== 3) return null;
        const nums = parts.map(parseComponent);
        if (nums.includes(null)) return null;
        [r, g, b] = nums;
    } else {
        return null;
    }

    // Convert each channel to 2-digit hex and assemble
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Helper: parse a single colour component from a string or number.
 * - Numbers must be integers 0-255.
 * - Strings are interpreted as hex if they contain any a-f/A-F,
 *   otherwise as decimal.
 * Returns the integer value or null on failure.
 */
function parseComponent(comp) {
    if (typeof comp === 'number') {
        return Number.isInteger(comp) && comp >= 0 && comp <= 255 ? comp : null;
    }

    if (typeof comp === 'string') {
        // Trim and remove optional "0x" prefix
        let s = comp.trim();
        if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);

        // Empty string is invalid
        if (s.length === 0) return null;

        // Determine base: if any letter a-f/A-F is present, treat as hex
        const isHex = /[a-fA-F]/.test(s); // <-- Small regex only for base detection;
                                           //     can be rewritten without regex if strictly required.
        const base = isHex ? 16 : 10;

        // All characters must be valid for that base
        for (let i = 0; i < s.length; i++) {
            const ch = s.charCodeAt(i);
            const isDigit = ch >= 48 && ch <= 57;
            const isUpper = ch >= 65 && ch <= 70;
            const isLower = ch >= 97 && ch <= 102;
            if (base === 10 && !isDigit) return null;
            if (base === 16 && !(isDigit || isUpper || isLower)) return null;
        }

        const val = parseInt(s, base);
        if (isNaN(val) || val < 0 || val > 255) return null;
        return val;
    }

    return null;
}


export function hslToRgb(h,s,l) {
  s/=100; l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];
}
export function contrastRatio(color1, color2) {
  function luminance(r,g,b){
    const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }
  const parse=c=>c.startsWith('#')?hexToRgb(c):[0,0,0];
  const [r1,g1,b1]=parse(color1),[r2,g2,b2]=parse(color2);
  const l1=luminance(r1,g1,b1),l2=luminance(r2,g2,b2);
  const lighter=Math.max(l1,l2),darker=Math.min(l1,l2);
  return (lighter+0.05)/(darker+0.05);
}
export function computeForeground(desired, bg, minRatio=4.5) {
  let fgHex=desired;
  let ratio=contrastRatio(fgHex,bg);
  if(ratio>=minRatio) return fgHex;
  let fgHsl=rgbToHsl(...hexToRgb(fgHex));
  let bgHsl=rgbToHsl(...hexToRgb(bg));
  const step=bgHsl.l>50?-5:5;
  for(let i=0;i<20;i++){
    fgHsl.l=Math.max(0,Math.min(100,fgHsl.l+step));
    const newRgb=hslToRgb(fgHsl.h,fgHsl.s,fgHsl.l);
    fgHex=rgbToHex(...newRgb);
    if(contrastRatio(fgHex,bg)>=minRatio) break;
  }
  return fgHex;
}
export function emphasize(color, bg, intensity=1) {
  const fgHsl=rgbToHsl(...hexToRgb(color));
  const bgHsl=rgbToHsl(...hexToRgb(bg));
  if(Math.abs(fgHsl.h-bgHsl.h)<30) fgHsl.h=(fgHsl.h+30)%360;
  fgHsl.s=Math.min(100,fgHsl.s+15*intensity);
  const lDiff=Math.abs(fgHsl.l-bgHsl.l);
  if(lDiff<40) fgHsl.l=fgHsl.l>bgHsl.l?Math.min(100,fgHsl.l+20):Math.max(0,fgHsl.l-20);
  return rgbToHex(...hslToRgb(fgHsl.h,fgHsl.s,fgHsl.l));
}
export function extractInlineStyle(el, prop) {
  return el.style[prop] || '';
}

// ==================== COLOR WHEEL & HARMONY ====================

export function complementary(hex) {
  var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    console.log({rgb, hsl});
  var newH = (hsl.h + 180) % 360;
  var newRgb = hslToRgb(newH, hsl.s, hsl.l);
  return [rgbToHex(newRgb[0], newRgb[1], newRgb[2])];
}

export function analogous(hex, count, step) {
  if (count === undefined) count = 3;
  if (step === undefined) step = 30;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var startH = hsl.h - (step * (count - 1)) / 2;
  var result = [];
  for (var i = 0; i < count; i++) {
    var hue = ((startH + i * step) % 360 + 360) % 360;
    var newRgb = hslToRgb(hue, hsl.s, hsl.l);
    result.push(rgbToHex(newRgb[0], newRgb[1], newRgb[2]));
  }
  return result;
}

export function triadic(hex) {
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var h1 = (hsl.h + 120) % 360;
  var h2 = (hsl.h + 240) % 360;
  var rgb1 = hslToRgb(h1, hsl.s, hsl.l);
  var rgb2 = hslToRgb(h2, hsl.s, hsl.l);
  return [hex,
    rgbToHex(rgb1[0], rgb1[1], rgb1[2]),
    rgbToHex(rgb2[0], rgb2[1], rgb2[2])];
}

export function splitComplementary(hex) {
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var h1 = (hsl.h + 150) % 360;
  var h2 = (hsl.h + 210) % 360;
  var rgb1 = hslToRgb(h1, hsl.s, hsl.l);
  var rgb2 = hslToRgb(h2, hsl.s, hsl.l);
  return [hex,
    rgbToHex(rgb1[0], rgb1[1], rgb1[2]),
    rgbToHex(rgb2[0], rgb2[1], rgb2[2])];
}

export function tetradic(hex) {
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var h1 = (hsl.h + 60) % 360;
  var h2 = (hsl.h + 180) % 360;
  var h3 = (hsl.h + 240) % 360;
  var rgb1 = hslToRgb(h1, hsl.s, hsl.l);
  var rgb2 = hslToRgb(h2, hsl.s, hsl.l);
  var rgb3 = hslToRgb(h3, hsl.s, hsl.l);
  return [hex,
    rgbToHex(rgb1[0], rgb1[1], rgb1[2]),
    rgbToHex(rgb2[0], rgb2[1], rgb2[2]),
    rgbToHex(rgb3[0], rgb3[1], rgb3[2])];
}

export function monochromatic(hex, count, lightnessRange) {
  if (count === undefined) count = 5;
  if (lightnessRange === undefined) lightnessRange = 60;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var startL = Math.max(0, hsl.l - lightnessRange / 2);
  var endL = Math.min(100, hsl.l + lightnessRange / 2);
  var result = [];
  for (var i = 0; i < count; i++) {
    var newL = startL + ((endL - startL) * i) / (count - 1);
    var newRgb = hslToRgb(hsl.h, hsl.s, newL);
    result.push(rgbToHex(newRgb[0], newRgb[1], newRgb[2]));
  }
  return result;
}

export function shades(hex, count) {
  if (count === undefined) count = 5;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var result = [];
  for (var i = 0; i < count; i++) {
    var newL = hsl.l - (hsl.l * i) / (count - 1);
    var newRgb = hslToRgb(hsl.h, hsl.s, newL);
    result.push(rgbToHex(newRgb[0], newRgb[1], newRgb[2]));
  }
  return result;
}

export function tints(hex, count) {
  if (count === undefined) count = 5;
  var rgb = hexToRgb(hex);
  var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  var result = [];
  for (var i = 0; i < count; i++) {
    var newL = hsl.l + ((100 - hsl.l) * i) / (count - 1);
    var newRgb = hslToRgb(hsl.h, hsl.s, newL);
    result.push(rgbToHex(newRgb[0], newRgb[1], newRgb[2]));
  }
  return result;
}

export function pick(colors, index) {
  var i = Math.max(0, Math.min(index, colors.length - 1));
  return colors[i];
}

export function contrastingLevel(colors, bg, level) {
  if (level === undefined) level = 50;
  var sorted = colors.slice().sort(function(a, b) {
    return contrastRatio(a, bg) - contrastRatio(b, bg);
  });
  var idx = Math.round((level / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function emphaticLevel(color, bg, level) {
  if (level === undefined) level = 50;
  var intensity = (level / 100) * 2;
  return emphasize(color, bg, intensity);
}

// ==================== NEW: Vector Color Palettes ====================

/**
 * Returns an array of contrasting foreground colors for a given background,
 * sorted by increasing contrast ratio.
 * @param {string} baseHex - background color
 * @param {number} minContrast - minimum acceptable ratio (default 4.5)
 * @param {object} options - { hueShift, saturationShift, lightnessRange }
 * @returns {string[]} array of hex colors
 */
export function getContrastingPalette(baseHex, minContrast = 4.5, options = {}) {
  const bgHsl = rgbToHsl(...hexToRgb(baseHex));
  const step = bgHsl.l > 50 ? -5 : 5;
  const candidates = [];
  // start from base lightness and move toward extremes
  let lightness = bgHsl.l;
  for (let i = 0; i < 30; i++) {
    lightness = Math.max(5, Math.min(95, lightness + step));
    const fgRgb = hslToRgb(bgHsl.h, bgHsl.s, lightness);
    const fgHex = rgbToHex(...fgRgb);
    const ratio = contrastRatio(fgHex, baseHex);
    if (ratio >= minContrast) {
      candidates.push({ hex: fgHex, ratio, lightness });
    }
  }
  // sort by contrast ascending
  candidates.sort((a, b) => a.ratio - b.ratio);
  return candidates.map(c => c.hex);
}

/**
 * Returns a harmonious palette based on color wheel relationships.
 * @param {string} baseHex
 * @param {number} count - desired number of colors
 * @param {object} options - { scheme: 'analogous'|'complementary'|'triadic'|'split'|'tetradic', saturationShift, lightnessShift }
 * @returns {string[]}
 */
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

/**
 * Quantifies how harmonious a pair of colors is based on color wheel distance.
 * @param {string} fgHex - foreground
 * @param {string} bgHex - background
 * @returns {number} score from 0 (clash) to 1 (perfect harmony)
 */
export function colorHarmonyScore(fgHex, bgHex) {
  const fgHsl = rgbToHsl(...hexToRgb(fgHex));
  const bgHsl = rgbToHsl(...hexToRgb(bgHex));
  const hueDist = Math.abs(fgHsl.h - bgHsl.h);
  const normalizedDist = hueDist > 180 ? 360 - hueDist : hueDist;
  // complementary (~180°) scores high, analogous (30-60) high, clashing (90-120) lower
  if (normalizedDist < 30) return 1;                 // very close hue – harmonious
  if (normalizedDist < 60) return 0.9;
  if (normalizedDist > 150 && normalizedDist < 180) return 0.95; // complementary range
  if (normalizedDist > 90 && normalizedDist < 120) return 0.4;  // clashing
  return 0.7; // moderate
}

// ==================== NEW (P26): Optimal Foreground ====================

/**
 * Returns an optimal foreground color that is both sufficiently contrasting
 * and harmonious with the background, using HSV wheel theory.
 * @param {string} bgHex - background color (hex)
 * @param {number} minRatio - minimum contrast ratio (default 4.5)
 * @param {object} options - { scheme, preference }
 * @returns {string} hex color
 */
export function getOptimalForeground(bgHex, minRatio = 4.5, options = {}) {
    const scheme = options.scheme || 'complementary';
    const preference = options.preference || 'balanced';

    // Generate a harmonious palette
    let palette = getHarmoniousPalette(bgHex, 5, { scheme });
    // Ensure we have at least 5 colors; pad if needed
    while (palette.length < 5) {
        palette = getHarmoniousPalette(bgHex, 5, { scheme: 'analogous' });
    }

    const candidates = palette.map(c => ({
        hex: c,
        ratio: contrastRatio(c, bgHex),
        harmony: colorHarmonyScore(c, bgHex)
    })).filter(c => c.ratio >= minRatio);

    if (candidates.length === 0) {
        // Fallback to lightness adjustment
        const lightPalette = getContrastingPalette(bgHex, minRatio);
        if (lightPalette.length) return lightPalette[0];
        return computeForeground('#ffffff', bgHex, minRatio);
    }

    if (preference === 'contrast') {
        candidates.sort((a, b) => b.ratio - a.ratio);
    } else if (preference === 'harmony') {
        candidates.sort((a, b) => b.harmony - a.harmony);
    } else { // balanced
        candidates.sort((a, b) => (b.ratio * 0.5 + b.harmony * 0.5) - (a.ratio * 0.5 + a.harmony * 0.5));
    }
    return candidates[0].hex;
}
