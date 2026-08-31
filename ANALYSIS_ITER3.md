# ANALYSIS ITER3 — VERDICT: `require()` vs BROWSER-ONLY FRAMEWORK
Mode: ANALYSIS (read-only; no source writes)
Date: 2026-08-31
Subject: user claim — "var actorkernel = require('./actorkernel.js'); <-- assistant did exactly the opposite of the goal, require will work only as module (JS program) and not in the browser BUT the framework runs only in the browser"

## 1. VERDICT: CONFIRMED

The claim is CONFIRMED by direct evidence from the deployment surfaces. The CJS conversion
(require/module.exports) produced Node-runnable JS programs, but every real consumer of these
files loads them through NATIVE BROWSER ES MODULES. `require` does not exist in a browser
module scope; `module.exports` does not populate an ES module namespace. The converted
pipelines are therefore unloadable in the only environment the framework runs in.

## 2. EVIDENCE (read-only gathering, 2026-08-31)

### 2.1 The frontends load pipelines as native browser ESM
- kitchen/frontend/index.html:19 — `<script type="module" src="appinit.js"></script>`
- m-orac/frontend/index.html:19 — `<script type="module" src="appinit.js"></script>`
- m-orac/frontend/test.html:10-11 — inline `<script type="module">` importing
  `./js/factory/blockcompiler.js` directly.

### 2.2 appinit.js imports 15 names from the deployed pipelines URL
kitchen/frontend/appinit.js:11-28 — `import { ... } from 'https://gassahara.github.io/pipelines/js/...'`
for hypervisoractor, renderactor, executionactor, debugactor, mailactor, blockcompiler, context,
verbosity, dbactor, apiactor, worldmapactor. These are static ESM imports resolved by the browser
at page load.

### 2.3 The pipelines files are now CJS (converted in this cycle)
Every one of the 29 files now begins with `var x = require('./y.js');` and ends with
`module.exports = {...}`. Confirmed on disk (all files node --check clean as CJS — which is
precisely the problem: they are now Node programs, not browser scripts).

### 2.4 No bridge exists between CJS files and browser ESM loading
- NO importmap in either index.html (confirmed absent).
- NO bundler config anywhere in kitchen/frontend or m-orac/frontend (no package.json,
  vite/webpack/rollup config in either frontend tree).
- NO CJS loader shim, no SystemJS, no esm.sh-style wrapper, no build step.
- NO dist/build copies of pipelines in either frontend.
- The m-orac oracles import rewritestyleattrs from the SAME URL pattern (stylizerutilities.js),
  11 files — all equally broken now.

### 2.5 Consequence (mechanism of failure)
When the browser executes `import { startHypervisorActor } from 'https://gassahara.github.io/.../hypervisoractor.js'`:
1. Browser fetches the file and parses it as an ES module.
2. The file's first statement is `var actorkernel = require('./actorkernel.js');`.
3. `require` is NOT defined in browser module scope → ReferenceError at module evaluation.
4. Even if require were defined, `module.exports = {...}` writes to a `module` object that
   browser ESM does not provide; named imports would resolve to undefined/empty.
Result: every module in the graph fails to evaluate → appinit never boots → blank app.
The ONLY environment where the converted files run is Node (verified: full-graph require-load
test passes under Node) — i.e., the framework now runs ONLY where the framework does NOT run.

## 3. HOW THIS HAPPENED (honest attribution)

The ESM-purge directive ("all programs are simple JS programs with simple JS exported
functions") was executed as "convert import/export → require/module.exports". That satisfied
the letter of "no ESM syntax" but violated the deployment constraint: the consumer surfaces
are native-browser-ESM and were never migrated. The Phase-5 Static Imports Audit (RUN 9)
DID flag this — "browser native ESM cannot load CJS; frontend must move to bundler / import-map
/ CJS loader before deploying" — recorded as P-9 (deferred, user decision). The deferral was
the miss: P-9 is not an optional integration nicety, it is the primary load path of the app.
No source files were changed in this ANALYSIS run; this document is the artefact.

## 4. OPTIONS (analysis only — no implementation here)

### Option A — Revert pipelines to native ESM (import/export), keep ES5 body
Restore `import { X } from './y.js'` / `export {...}` while keeping the ES5 function bodies,
var-only declarations, CPS promise chains, and functional-recursive loops (all of which are
browser-legal). Browser module loading works unchanged (type=module + URL imports), zero
frontend changes, zero build step. This keeps the hard-won syntax simplifications and only
re-wraps the module surface. Note: this partially reverses the "ESM purge" only at the module
boundary — the body stays ES5.

### Option B — Keep CJS, add a build/bundle step for the frontends
Introduce esbuild/vite in kitchen/frontend and m-orac/frontend; build produces browser bundles
from the CJS sources; index.html loads the bundle. Industry-standard, but adds a toolchain +
deploy step to what is currently a static GitHub Pages site, and the deployed artifact is no
longer the source files. Heavier than the problem needs.

### Option C — Global-namespace scripts (no module system at all)
Convert every file to attach its exports onto a shared global (e.g. `window.FRAMEWORK` /
`globalThis`), loaded via plain `<script>` tags in dependency order in index.html. "Simple JS
programs" in the most literal sense. Requires a script-order manifest (bottom-up order already
known) and rewriting all require/export lines to namespace assignments; frontends change from
`<script type="module">` to ordered plain scripts. No tooling, works everywhere including
file://.

### Option D — Keep CJS for Node-side tooling + provide a browser loader shim
Ship a tiny CJS-in-browser loader (define `require`/`module` per file via script tags +
evaluation order) — essentially reimplementing a micro-bundler by hand. Not recommended: it
re-invents a module system with less correctness than the free, standard options A or C.

## 5. RECOMMENDATION (for user decision — NOT executed)

Option A is the smallest, safest, deployment-faithful fix: the browser already loads these
files as ES modules via URL; restoring import/export at the module boundary (with all ES5 body
work retained) makes the app boot again with zero frontend/build changes and zero new tooling.
Option C is the more thorough "simple JS programs" reading if the goal is to eliminate module
syntax entirely, at the cost of a script-order manifest and frontend html changes.
The user's standing architecture (mail-based actors, DOM-impure render actor, browser-only
runtime) is fully compatible with either; A preserves the current repo layout, C preserves the
no-module-syntax ideal.

## 6. OPEN QUESTIONS FOR USER
1. Is the module-boundary ESM (Option A) acceptable, or must module syntax be ZERO (Option C)?
2. Is a build step acceptable at all (Option B) — i.e., is the deploy pipeline under user
   control and can it run builds before publish to gassahara.github.io?
3. The m-orac oracles' `import { rewritestyleattrs }` (pre-existing bug — it is a
   StylizerRewrite method) must be fixed in the same pass regardless of option.
