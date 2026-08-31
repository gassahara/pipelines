# ANALYSIS_ITER5.md — KITCHEN FRONTEND ADAPTATION TO GLOBAL-VARS FRAMEWORK
Mode: ANALYSIS (read-only + ANALYSIS_*.md only) | Date: 2026-08-31 | Scope: kitchen/frontend
STATUS: BLUEPRINT ACCEPTED (user: "proceed", 2026-08-31) — ready for BLUEPRINTS/EXECUTION.
Inputs: TRACE_EXECUTION.md (31 shared programs, flat globals, bootloader architecture),
       ANALYSIS_ITER4.md / REASONED_ITER4.md (registry + owner-scoping)
Target: blueprint the adaptation of kitchen/frontend (appinit.js, index.html, local
       pipelines/ programs) to the new directly-runnable global-vars framework.
NO source writes performed. Execution on user directive.

## 1. CURRENT STATE (evidence, read-only)
- index.html: `<script type="module" src="appinit.js"></script>` — the ONLY pipeline entry;
  module semantics required (appinit has top-level await).
- appinit.js (143 lines, ESM): 15 named imports from https://gassahara.github.io/pipelines/js/...
  (hypervisoractor, renderactor, executionactor, debugactor, mailactor, blockcompiler,
  context, verbosity x5, dbactor, apiactor, worldmapactor) + `import shelldna from './pipelines/shell.js'`.
  Boot: await DOM ready → createstatusbar → startMailActor → startHypervisorActor →
  enqueueHypervisorPing → startRenderActor → enqueueRenderPing → startExecutionActor →
  enqueueExecutionPing → startDebugActor → enqueueDebugPing → startDbActor/startApiActor/
  startWorldmapActor (fire-and-forget) → loadPipeline(shelldna.pipeline, ...).
- Local pipelines/ (kitchen/frontend/pipelines, 18 files, ESM): shell.js (31KB, default
  export shellpipeline), yj.js (38KB, export var recipe + default), ast.js (export
  {ASTRender, ASTExtract}), themes.js (generateThemeReference), responsivelayout.js,
  scaffoldwriter.js, homemenustylizer.js, monitorwidgetstylizer.js, and 11 layout/stylizer
  pairs (description/ingredients/names/scaffold/shell × stylizer+layout).
- Import graph: shell.js imports shared (StylizerCore/Rewrite/Verify, LayoutDirectiveCore/
  LayoutCorrection, ColorCore/Harmony/Contrast) + local (ast, shellscaffoldstylizer,
  shelllayout, yj recipe, themes). yj.js imports shared (same trio) + local (themes,
  scaffold/names/description/ingredients stylizer+layout, ast). ALL 16 leaf programs are
  IMPORT-FREE (they receive stylizerRewrite/stylizerCore via importedFunctionsObject
  injection — the P-6 pattern).

## 2. FINDINGS (the adaptation problems)
F1. index.html loads appinit as a MODULE; the new framework is plain scripts (globals,
    zero module syntax). The shared programs CANNOT be module-imported anymore.
F2. appinit has top-level await (L105-106, L114-131) — module-only syntax; must become
    promise chains. Its 16 imports must become bare globals (all 15 shared names ARE
    globals now; shelldna = shellpipeline global).
F3. BOOTLOADER BUG (for this use): bootPipeline() reads document.currentScript at CALL
    time — null when called later from appinit. Base must be captured at LOAD time
    (document.currentScript is valid during the script's synchronous top-level run).
F4. REAL GLOBAL GAP: shell.js L29-30 and yj.js L117-118 reference LayoutDirectiveCore /
    LayoutCorrection — but layoutdirectives.js now provides ONLY the createLayoutDirectives
    FACTORY (the core/correction objects come from the injection call). Under globals these
    names would be undefined. Both files must obtain them at load via:
      var layoutInjected = createLayoutDirectives({ StylizerCore: StylizerCore, StylizerRewrite: StylizerRewrite });
      var LayoutDirectiveCore = layoutInjected.LayoutDirectiveCore;
      var LayoutCorrection = layoutInjected.LayoutCorrection;
    (Stateless pure functions — per-file instances are equivalent; yj loads before shell,
    so each creates its own.)
F5. rewritestyleattrs: kitchen local programs use stylizerRewrite.rewritestyleattrs (METHOD
    on the injected object) — NO BUG here. (The broken top-level import is m-orac's
    oracles — sibling scope, noted in §6.)
F6. Non-issues: ColorCore/Harmony/Contrast + StylizerCore/Rewrite/Verify are globals ✓;
    verbosity 5 names are globals ✓; loadPipeline + updateworldmap are globals ✓;
    start*Actor + enqueue*Ping are globals ✓ (all verified in bootsim).

## 3. ADAPTATION DESIGN
### A. index.html (kitchen/frontend)
Replace the module script with two plain scripts:
    <script src="../shared-functions/pipelines/js/bootloader.js"></script>
    <script src="appinit.js"></script>
(bootloader BEFORE appinit; appinit drives the boot. Deployed variant:
 bootloader src = the deployed pipelines URL — same base-resolution logic.)

### B. bootloader.js (shared pipelines — in scope per directive "pipelines in pipeline subdir")
Two minimal changes:
  1. Capture base at LOAD time (module-scope, synchronous):
     var PIPELINES_BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
       ? document.currentScript.src.slice(0, document.currentScript.src.lastIndexOf('/') + 1) : '';
     (Node guard keeps /tmp/bootsim.js working unchanged.)
  2. bootPipeline(onDone): pass the report callback through:
     function bootPipeline(onDone) { ...existing DOM loader using PIPELINES_BASE...
       runPipelineBoot(loadScript, function(result) { console.log/error...
         if (typeof onDone === 'function') onDone(result); }); }
  loadScript src becomes PIPELINES_BASE + entry.src.

### C. appinit.js (full rewrite, plain script)
1. DELETE all 16 import lines. NOTE (REASONER_ITER5 refinement): `var shelldna = shellpipeline;`
   must NOT run at top level — shell.js loads only after the LOCAL manifest completes.
   Resolve shelldna inside the boot chain, immediately after runPipelineBoot(local) reports ok.
2. LOCAL_PIPELINES_MANIFEST (18 entries, topological, provides lists — §4) + a DOM
   loader (base captured from document.currentScript at appinit load = kitchen/frontend/
   → local srcs are 'pipelines/ast.js' etc.).
3. Boot orchestration (promise chain, no top-level await):
   waitForBootReady().then(waitForStylesReady).then(function() {
     createstatusbar();
     bootPipeline(function(sharedResult) {            // shared 30 (bootloader manifest)
       if (!sharedResult.ok) throw new Error('shared boot failed: ' + JSON.stringify(sharedResult.failures));
       runPipelineBoot(localLoader, function(localResult) {   // local 18
         if (!localResult.ok) throw new Error('local boot failed: ' + JSON.stringify(localResult.failures));
         return startApp();
       });
     });
   });
4. startApp() = the existing actor-boot chain as .then() chain (same order):
   startMailActor → startHypervisorActor → enqueueHypervisorPing → startRenderActor →
   enqueueRenderPing → startExecutionActor → enqueueExecutionPing → startDebugActor →
   enqueueDebugPing → startDbActor/startApiActor/startWorldmapActor →
   loadPipeline(shellpipeline.pipeline, shellPipelineId, { baseEnv, updateworldmap })
   with the same try/catch diagnostics.
5. Reuse the bootloader's checkExistence global for the local manifest's tests.

### D. Local pipelines/ conversion (18 files, plain scripts)
Mechanical (same rules as the shared conversion):
1. `export function X(...)` → `function X(...)` (delete export keyword) — all 16 leaves.
2. `export var recipe = {...}` → `var recipe = {...}` (yj.js).
3. `export default shellpipeline;` → delete line (shellpipeline is already a top-level var
   in shell.js — becomes the global). Same for yj.js's `export default recipe`.
4. ast.js: `export { ASTRender, ASTExtract };` → delete (ASTRender/ASTExtract already
   top-level vars → globals).
5. shell.js / yj.js: DELETE the 3 shared-URL import blocks (StylizerCore/Rewrite/Verify,
   ColorCore/Harmony/Contrast resolve as globals) + the internal imports (ASTRender/
   ASTExtract, applyShellTheme, applyShellLayout, recipe, generateThemeReference,
   applyScaffold* etc. resolve as globals from their provider files, loaded earlier) +
   F4 fix (createLayoutDirectives factory call for LayoutDirectiveCore/LayoutCorrection).
6. NO rewritestyleattrs changes needed (F5).

### E. Local load order (topological, verified against the import graph)
L0 (16 import-free leaves): ast.js → themes.js → responsivelayout.js → homemenustylizer.js
   → monitorwidgetstylizer.js → scaffoldwriter.js → descriptionstylizer.js →
   descriptionlayout.js → ingredientstylizer.js → ingredientslayout.js → namestylizer.js →
   nameslayout.js → scaffoldstylizer.js → scaffoldlayout.js → shelllayout.js →
   shellscaffoldstylizer.js
L1: yj.js (needs themes + 6 layout/stylizer + shared globals)
L2: shell.js (needs ast + shellscaffoldstylizer + shelllayout + yj + themes + shared)

## 4. LOCAL MANIFEST provides lists (existence tests)
ast.js: [ASTRender, ASTExtract] | themes.js: [generateThemeReference] |
responsivelayout.js: [generateResponsiveLayout, applyResponsiveStyles] |
homemenustylizer.js: [homemenustylizer] | monitorwidgetstylizer.js: [monitorwidgetstylizer] |
scaffoldwriter.js: [createScaffoldWriter] | descriptionstylizer.js: [applyDescriptionTheme] |
descriptionlayout.js: [applyDescriptionLayout] | ingredientstylizer.js: [applyIngredientsTheme] |
ingredientslayout.js: [applyIngredientsLayout] | namestylizer.js: [applyNamesTheme] |
nameslayout.js: [applyNamesLayout] | scaffoldstylizer.js: [applyScaffoldTheme] |
scaffoldlayout.js: [applyScaffoldLayout] | shelllayout.js: [applyShellLayout] |
shellscaffoldstylizer.js: [applyShellTheme] | yj.js: [recipe] | shell.js: [shellpipeline]

## 5. VERIFICATION PLAN (post-adaptation)
1. node --check all converted files; grep zero import/export in kitchen/frontend code.
2. Node vm simulation (/tmp/frontendsim.js): bootloader (30) + local manifest (18) via
   runPipelineBoot with stubbed document for the DOM-touching loaders; assert all
   existence tests pass; assert LayoutDirectiveCore/LayoutCorrection defined in shell/yj
   scope; assert shellpipeline.identity.id + shellpipeline.pipeline present.
3. App boot simulation: startApp chain with DOM stubs (document.body, fonts) → actors
   start (mail path as in bootsim), loadPipeline(shellpipeline.pipeline, ...) compiles.
4. Browser (final): index.html → bootloader console logs 30 shared + 18 local →
   status bar appears → shell pipeline loads (appLogInfo 'SHELL PIPELINE LOADED').

## 6. SCOPE NOTES
- m-orac/frontend is a SIBLING with the same module+appinit+oracles pattern (incl. the
  pre-existing rewritestyleattrs top-level import bug in 11 oracles). NOT in this
  directive's scope; same adaptation recipe applies.
- test.html (kitchen/frontend) is a legacy artifact (inline styles object, no pipeline
  loader) — no changes needed.
- output.txt files (frontend + pipelines/) are txt logs — NOT code, ignored (standing rule).
- Deployment: local relative script srcs work for dev; the deployed layout must expose
  pipelines/ at the same relative position (bootloader base self-resolves).
