# INSTRUCTIONS: Wave 2a — domqueryconstants (CREATE), colorutils, closureconsolidator
Derived From: PLAN_ITER0.md Wave 2a (P-3, P-5, P-8)
Generated: 2026-08-31

## OPERATION_1
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/domqueryconstants.js`
- **Action**: `CREATE`
- **Line Range**: n/a (new file)
- **Original Block**: none
- **New Block**: ES5 module. `var DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);` `var DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);` `var DOMQUERYMESSAGES = Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS));` `module.exports = { DOMQUERYGETTERS: ..., DOMQUERYSETTERS: ..., DOMQUERYMESSAGES: ... };`
- **Gate**: node --check exit 0; grep zero ES6; require-load returns the three frozen arrays.

## OPERATION_2
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/colorutils.js`
- **Action**: `REPLACE_FILE`
- **Line Range**: 1 - 476
- **Original Block**: current file (ES6 export at L472-476; 8 index loops; body already var/function + injected-param style)
- **New Block**: ES5 module.exports = { ColorCore, ColorHarmony, ColorContrast }. Loop conversions (exact semantics):
  - analogous (L190): `for i<count result.push(hslToHex(...))` → `Array.apply(null, new Array(count)).map(function(unused, i) { return hslToHex(((startH + i*step)%360+360)%360, hsl.s, hsl.l, ColorCore); })`
  - monochromatic (L222), shades (L240), tints (L258): same Array.apply pattern with their formulas.
  - findBestLight (L388): `for i<30 { mid; hex; if ratio>=min return mid; adjust low/high } return null` → recursive `function findBestLight(hue, sat, low, high, attempt) { if (attempt >= 30) return null; var mid = Math.round((low+high)/2); var hex = ...; if (contrastRatio(hex, baseHex, ColorCore) >= minContrast) return mid; if (direction === 'lighter') return findBestLight(hue, sat, Math.min(100, low+5), high, attempt+1); return findBestLight(hue, sat, low, Math.max(0, high-5), attempt+1); }` called with (hue, sat, low0, high0, 0).
  - hexToRgb hex-char validation (L118-123): `for i<hex.length if invalid return [0,0,0]` → `if (!hex.split('').every(function(c){ return (c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F'); })) return [0,0,0];`
  - parseComponent hex (L69-74) and decimal (L80-83) validation: same split('').every pattern.
- **Gate**: node --check; grep zero ES6; require-load; spot-verify analogous(hex,3,30) and complementary return hex strings.

## OPERATION_3
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/closureconsolidator.js`
- **Action**: `REPLACE_FILE`
- **Line Range**: 1 - 119
- **Original Block**: current file (ES6 export L119; 2 index loops; generated-source strings contain literal 'const ' — DATA, keep unchanged)
- **New Block**: ES5 module.exports = { consolidateClosures }.
  - collectBindings (L13): early-exit scan → `lines.some(function(line) { var trimmed = line.trim(); if (trimmed.indexOf('const ') === 0) { ...push...; return false; } if (trimmed.indexOf('function') === 0 || trimmed.indexOf('return') === 0 || trimmed.indexOf('}') === 0) return true; return false; });`
  - rewriteClosureWithShared (L44): `for i<lines.length out.push(...)` → `lines.map(function(line) { ...same logic... })` then `out.join('\n')` — note: `line.replace(literal, sharedMap[literal])` replaces FIRST occurrence (same as original).
- **Gate**: node --check; grep zero ES6 (string content exempt — grep excludes quoted strings); require-load; consolidateClosures([{closureSource:'const A = 1;\nreturn A;', elementId:'x'}]) returns programSource containing 'shared_0' and elementMap {x:true}.

## VERIFICATION (after operations)
1. node --check all three.
2. grep gates.
3. Load test via /tmp/wave2verify.js (file-based, no -e): require domqueryconstants, colorutils, closureconsolidator + re-require all 13 converted files.
4. Behaviour spot-checks via /tmp/wave2verify.js: DOMQUERYMESSAGES length 11; colorutils complementary('#ff0000', ColorHarmony, ColorCore) → array of 1 hex; closureconsolidator smoke.
