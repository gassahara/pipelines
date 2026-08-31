# INSTRUCTIONS: Wave 4 — PROGRAMS tier (debugformatter, dnaserializer)
Derived From: PLAN_ITER0.md Wave 4
Generated: 2026-08-31

## OPERATION_1
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/debugformatter.js`
- **Action**: `REPLACE_FILE` (ES5 rewrite)
- **Line Range**: 1 - 50
- **Original Block**: current file (ES6: `import { frames }`, `export function formatdebugtrace(error, framelist = frames)` — default param, `let html`, arrows in forEach/map/JSON replacer, optional chaining `frame.meta?.label`, `catch {}` optional binding)
- **New Block**: ES5 module:
  - `var evalstack = require('./evalstack.js'); var frames = evalstack.frames;`
  - `function formatdebugtrace(error, framelist) { if (framelist === undefined) framelist = frames; ... }`
  - All arrows → function expressions; `?.'` → `(frame.meta && frame.meta.label)` chains; `catch (e) {}`; `let` → `var`.
  - Guard `value instanceof HTMLElement` with `typeof HTMLElement !== 'undefined' &&` (browser-global safety in node).
  - `module.exports = { formatdebugtrace: formatdebugtrace };`
- **Gate**: node --check; grep zero real ES6; require-load; formatdebugtrace(new Error('x'), []) returns HTML containing 'FATAL EXCEPTION'.

## OPERATION_2
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/dnaserializer.js`
- **Action**: `REPLACE_FILE` (ES5 module conversion)
- **Line Range**: 1 - 309
- **Original Block**: current file (ES6: import block L1-8 from freevarparser, export block L302-309; body already ES5 var/function with forEach/map functional style)
- **New Block**: ES5 module:
  - `var freevarparser = require('./freevarparser.js');` then destructure detectFreeIdentifiers/isIdentifierStart/isIdentifierPart/containsIdentifier/findMatchingParen/findBodyBrace.
  - Body unchanged (already ES5; whitespace-skip while loops + resolveFromBriefcase recursion are ES5-legal, retained).
  - `module.exports = { createDnaSerializerConstants, validaterevivablefunctionblock, validaterevivableobject, resolveFromBriefcase, prepareFunctionForSerialization, serializeSelfContainedClosure };` — all 6 names, blockcompiler consumes these (blockcompiler.js L17).
- **Gate**: node --check; grep zero real ES6; require-load; smoke: prepareFunctionForSerialization with a closure dep resolves from briefcase; validaterevivablefunctionblock flags native function.

## VERIFICATION
1. node --check both.
2. grep gates.
3. Load test via /tmp/wave4verify.js: require debugformatter + dnaserializer + all prior 20 modules.
4. Behaviour: formatdebugtrace HTML smoke; dnaserializer revivability checks + closure serialization.
