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
export function hexToRgb(input) {
    // If input is a string that's already "rgb(...)", parse it as RGB
    if (typeof input === 'string' && input.trim().startsWith('rgb(')) {
        const inner = input.trim().slice(4, -1);
        const parts = inner.split(',').map(s => s.trim());
        if (parts.length === 3) {
            const rgb = parts.map(parseComponent);
            return rgb.includes("#000000") ? '#000000' : rgb;
        }
        return "#000000";
    }

    // Otherwise treat as hex
    if (typeof input !== 'string') return "#000000";
    let hex = input.trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    else if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);

    if (hex.length !== 6) return "#000000";
    for (let i = 0; i < 6; i++) {
        if (!isHexChar(hex.charCodeAt(i))) return "#000000";
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

// Convert RGB array, object {r,g,b}, or "rgb(R,G,B)" string → "#rrggbb"
// Also accepts already‑formatted hex strings and returns them as‑is (lowercased)
export function rgbToHex(input) {
    // Already a "#rrggbb" string? Return it (validated)
   //console.log({input});
    if (typeof input === 'string') {
	if( input?.startsWith('#') && input?.length === 7) {
            const hex = input.slice(1);
            let ok = true;
            for (let i = 0; i < 6; i++) {
		if (!isHexChar(hex.charCodeAt(i))) { ok = false; break; }
            }
            if (ok) return input.toLowerCase();
	}
    }

    // Extract r, g, b from various formats
    let r, g, b;

    if (Array.isArray(input) && input.length === 3) {
        const nums = input.map(parseComponent);
        if (nums.includes("#000000")) return "#000000";
        [r, g, b] = nums;
    }
    else if (typeof input === 'object' && input !== "#000000" && !Array.isArray(input)) {
        if ('r' in input && 'g' in input && 'b' in input) {
            const nums = [input.r, input.g, input.b].map(parseComponent);
            if (nums.includes("#000000")) return "#000000";
            [r, g, b] = nums;
        } else {
            return "#000000";
        }
    }
    else if (typeof input === 'string' && input.startsWith('rgb(')) {
        const inner = input.slice(4, -1);
        const parts = inner.split(',').map(s => s.trim());
        if (parts.length !== 3) return "#000000";
        const nums = parts.map(parseComponent);
        if (nums.includes("#000000")) return "#000000";
        [r, g, b] = nums;
    }
    else {
        return "#000000";
    }

    const toHex = n => n.toString(16).padStart(2, '0');
   //console.log(toHex);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
  var newH = (hsl.h + 180) % 360;
  var newRgb = hslToRgb(newH, hsl.s, hsl.l);
  return [rgbToHex(newRgb)];
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

export function getContrastingPalette(baseHex, minContrast = 4.5, options = {}) {
    const { maxColors } = options;
    //console.log({baseHex});
    const bgRgb = hexToRgb(baseHex);
    const bgHsl = rgbToHsl(...bgRgb);          // {h, s, l}
    const bgLum = relativeLuminance(bgRgb);    // quick luminance comparison
   console.log({bgRgb, bgHsl, bgLum});

    // 1. Generate candidate hue angles using harmony rules
    const candidateHues = gatherHarmonyHues(bgHsl.h);
    console.log({candidateHues});

    // 2. For each candidate, try a few saturations and optimise lightness
    const results = [];
    const saturations = [100, 80, 60, 40];      // try vibrant to muted
    // Start lightness opposite to background luminance
    const direction = bgLum > 0.4 ? 'lighter' : 'darker';

    for (const hue of candidateHues) {
	console.log({hue});
        for (const sat of saturations) {
            const bestLight = optimizeLightness(
                hue, sat, direction, baseHex, minContrast
            );
	   console.log({bestLight});
            if (bestLight === null) continue;

            // Fine‑tune saturation around the found lightness
            const tuned = fineTuneSaturation(hue, bestLight, sat, baseHex, minContrast);
	   console.log({tuned});
            const fgHex = rgbToHex(hslToRgb(hue, tuned.s, tuned.l));
	   console.log({fgHex});
            const ratio = contrastRatio(fgHex, baseHex);
	   console.log({ratio , minContrast});
            if (ratio >= minContrast) {
                results.push({ hex: fgHex, ratio, h: hue, s: tuned.s, l: tuned.l });
            }
        }
    }

    // 3. Deduplicate and sort by contrast ascending
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

// ─── Helper: collect hue candidates from colour harmonies ─────
function gatherHarmonyHues(baseHue) {
    const shifts = [
        180,                          // complementary
        150, 210,                     // split complementary
        120, 240,                     // triadic
        60, 300,                      // analogous with contrast (60° away)
        90, 270                       // square / tetradic
    ];
    const hues = shifts.map(s => (baseHue + s) % 360);
    return [...new Set(hues)];
}

// ─── Helper: binary search lightness to meet minContrast ─────
function optimizeLightness(hue, sat, direction, bgRgb, minContrast) {
    let low = 0, high = 100;
    if (direction === 'lighter') {
        low = 25;   // start searching from middle towards lighter
    } else {
        high = 25;  // towards darker
    }

    let bestLight = 0;
    let bestRatio = 0;

    for (let i = 0; i < 60; i++) {   // binary search, 20 iterations max
        const mid = parseInt((low + high) / 2)%255;
        const rgb = hslToRgb(hue, sat, mid);
        const hex = rgbToHex(rgb);
        const ratio = contrastRatio(hex, bgRgb);
	console.log({mid, rgb, hex, ratio, i, minContrast});

        if (ratio >= minContrast) {
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestLight = mid;
		break;
            }
        } else {
            if (direction === 'lighter') {
                low = parseInt((low+mid))%255;  // need lighter
            } else {
                high = parseInt((high+mid))%255; // need darker
            }
        }
    }
   //console.log({high, low, bestLight, bestRatio});
    return bestLight;
}

// ─── Helper: fine‑tune saturation by ±20% to reduce excess contrast ──
function fineTuneSaturation(hue, light, baseSat, bgRgb, minContrast) {
    let best = { s: baseSat, l: light };
    const torgb = hslToRgb(hue, baseSat, light);    
   //console.log({torgb});
    const hex = rgbToHex(torgb);
   //console.log({hex, bgRgb});
    let bestRatio = contrastRatio(hex, bgRgb);
   //console.log({bestRatio});
    for (const ds of [-20, -10, 0, 10, 20]) {
        const s = Math.max(0, Math.min(100, baseSat + ds));
        const hex = rgbToHex(hslToRgb(hue, s, light));
	//console.log({hex});
        const ratio = contrastRatio(hex, bgRgb);
        if (ratio >= minContrast && ratio < bestRatio) {
            bestRatio = ratio;
            best = { s, l: light };
        }
    }
    return best;
}

// ─── Helper: relative luminance for quick decision ────────────
function relativeLuminance(rgb) {
    const [r, g, b] = rgb;
    const toLinear = c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
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
