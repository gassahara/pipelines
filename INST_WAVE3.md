# INSTRUCTIONS: Wave 3 — Interface tier (typesystem, stylizerutilities, layoutdirectives)
Derived From: PLAN_ITER0.md Wave 3 (P-3, P-4, P-6, P-8)
Generated: 2026-08-31
Consumer audit: layoutdirectives has NO in-repo consumers (app-facing export) → factory surface change is safe. Only layoutdirectives imports stylizerutilities. typesystem's only consumer is utils.js. validateschema has no in-repo callers (exported for app/blockcompiler future use).

## OPERATION_1
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/typesystem.js`
- **Action**: `REPLACE_FILE` (ES5 + P-4 CPS + P-8 leaf import)
- **Line Range**: 1 - 367
- **Original Block**: current file (ES6: import DOMQUERY from renderactor L1, export* throughout, `new Map()` L90, `registry.get()` L94-95, `Number.isInteger` L100, `async validateschema` L88 with await at 110/149/158)
- **New Block**: ES5 module. Key transforms:
  - `var domquery = require('./factory/domqueryconstants.js');` → use `domquery.DOMQUERYMESSAGES` / `domquery.DOMQUERYSETTERS`. NO renderactor import (P-8).
  - `export var TYPESCHEMA = {...}` → `var TYPESCHEMA = {...}` (same content); `export function validateFields` → `function validateFields`; same for validate/validatecall/validateformalblock/validatestageflow/validatemonadalgebra/validateblockio/validateblockfnio/validatecontainerrefs/validatespawncontracts/validateblocktype/validatedomqueryblock/validateexecutionqueryblock/validatestorequeryblock/validateblockproperties.
  - validateschema (L88): `async function` → plain function returning a promise. `if (registry === undefined) registry = {};` (plain object, no Map). `registry.get(schema)` → `registry[schema]`. `Number.isInteger(value)` → `Math.floor(value) === value`. Recursive awaits → helper `validateschemaInner(value, schema, context, registry, strict)` returning promise chains: oneof branch → sequential `.then` collection of branch errs; properties → for-loop with `.then` accumulation; items → same. Preserve exact error strings and semantics.
  - All remaining index loops (validatestageflow etc.) are ES5-legal — retained (per freevarparser precedent: ESM purge is the mandate; P-5 loop conversion deferred).
- **Gate**: node --check; grep zero real ES6 (import/export/const/let/=>/async/await/?.); require-load; validateschema smoke (valid + invalid + oneOf + nested).

## OPERATION_2
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/stylizerutilities.js`
- **Action**: `REPLACE_FILE` (ES5 module conversion)
- **Line Range**: 1 - 1268
- **Original Block**: current file (ES6: import verbosity L7-14, import colorutils L15-19, export block L1264-1268; body already ES5 var/function with injected-param method style — P-6 compliant at method level)
- **New Block**: ES5 module. Key transforms:
  - `var verbosity = require('../verbosity.js');` → destructure createVerbosityConstants/logdebug/logwarn/logerror/loginfo/logcritical.
  - `var colorutils = require('./colorutils.js');` → `var ColorCore = colorutils.ColorCore; var ColorHarmony = colorutils.ColorHarmony; var ColorContrast = colorutils.ColorContrast;`
  - Body unchanged (already ES5; injected-param methods retained — portable surface).
  - `export { StylizerCore, StylizerRewrite, StylizerVerify }` → `module.exports = { StylizerCore, StylizerRewrite, StylizerVerify }`.
- **Gate**: node --check; grep zero real ES6; require-load; StylizerCore.createStylizerConstants() returns frozen SAFE_PROPS (13 items); camelToKebab('fontSize') === 'font-size'.

## OPERATION_3
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/layoutdirectives.js`
- **Action**: `REPLACE_FILE` (P-6 factory rewrite)
- **Line Range**: 1 - 580
- **Original Block**: current file (ES6: `import { StylizerCore, StylizerRewrite } from './stylizerutilities.js'` L1 — P-6 violation, export block L577-580; body already functional-recursive)
- **New Block**: ES5 module with object-injection factory:
  - `function createLayoutDirectives(stylizer) { var StylizerCore = stylizer.StylizerCore; var StylizerRewrite = stylizer.StylizerRewrite; ... all existing LayoutDirectiveCore/LayoutCorrection definitions ... return { LayoutDirectiveCore: LayoutDirectiveCore, LayoutCorrection: LayoutCorrection }; }`
  - StylizerCore/StylerRewrite referenced ONLY via the injected object (L215 `StylizerCore.kebabToCamel`, L258/279/284/288/291 via params) — no module import of stylizerutilities (P-6).
  - Recursive helpers already present (parseParts, filterEligibleChildren, compareChildren, walkParentChildren, buildRules) — retained; index loops (checkOverlapDoc pair loop, optimizeLayoutHTML iter loop) are ES5-legal — retained.
  - `module.exports = { createLayoutDirectives: createLayoutDirectives };`
- **Gate**: node --check; grep zero real ES6 AND zero stylizerutilities import; require-load; smoke: createLayoutDirectives({ StylizerCore: fake, StylizerRewrite: {} }) returns { LayoutDirectiveCore, LayoutCorrection }; parseDirectives('left-of:other:10px;position:top') parses 2 directives.

## VERIFICATION
1. node --check all three.
2. grep gates.
3. Load test via /tmp/wave3verify.js: require typesystem, stylizerutilities, layoutdirectives + re-require all 17 prior files.
4. Behaviour: typesystem validateschema cases; stylizer camelToKebab; layoutdirectives factory smoke.
