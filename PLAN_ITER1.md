# PLAN_ITER1.md — KITCHEN FRONTEND ADAPTATION (BLUEPRINT)
Mode: BLUEPRINTS-EXECUTION-CYCLE AGENTIC | Date: 2026-08-31
Inputs: ANALYSIS_ITER5.md (accepted), REASONED_ITER5.md (7 proofs + shelldna refinement)
Target: kitchen/frontend adapts to the global-vars framework.

## 1. CHANGES
A. index.html: `<script type="module" src="appinit.js">` → two plain scripts:
   `../../shared-functions/pipelines/js/bootloader.js` then `appinit.js` (bootloader first).
B. bootloader.js (shared pipelines, 2 changes):
   1. PIPELINES_BASE captured at LOAD time (document.currentScript valid synchronously;
      Node guard `typeof document !== 'undefined'` keeps /tmp/bootsim.js green).
   2. bootPipeline(onDone): uses PIPELINES_BASE; passes the report to onDone.
C. appinit.js (full plain-script rewrite):
   - All 16 imports deleted. Top-level: APPINIT_BASE capture, LOCAL_PIPELINES_MANIFEST
     (18 entries + provides), loadLocalProgram (DOM loader), waitForBootReady/
     waitForStylesReady, boot().
   - NO shared-global references at top level (REASONED refinement): verbosityConstants,
     appState, shelldna, shellPipelineId, sinks, baseEnv, createstatusbar all move INSIDE
     startApp() — resolved after the local manifest completes.
   - Boot: waitForBootReady → waitForStylesReady → bootPipeline(shared 30) →
     runPipelineBoot(local 18) → startApp() (actor chain: startMailActor →
     startHypervisorActor → enqueueHypervisorPing → startRenderActor → enqueueRenderPing →
     startExecutionActor → enqueueExecutionPing → startDebugActor → enqueueDebugPing →
     startDbActor/startApiActor/startWorldmapActor → loadPipeline(shellpipeline.pipeline)).
   - Top-level await → promise chains throughout.
D. Local pipelines/ (18 files → plain scripts):
   - 16 leaves: `export function X` → `function X`; ast.js export block removed.
   - yj.js: 13 import blocks removed; `export var recipe` → `var recipe`;
     `export default recipe;` removed; F4 injection (createLayoutDirectives) before commonFx.
   - shell.js: 8 import lines removed; `export default shellpipeline;` removed;
     F4 injection before commonFx.
   - No other changes (const/let/arrows legal in plain scripts; no top-level await/dynamic
     import — PROVEN).

## 2. LOCAL MANIFEST (topological: 16 leaves → yj.js → shell.js)
Provides: ast.js [ASTRender, ASTExtract]; themes.js [generateThemeReference];
responsivelayout.js [generateResponsiveLayout, applyResponsiveStyles];
homemenustylizer.js [homemenustylizer]; monitorwidgetstylizer.js [monitorwidgetstylizer];
scaffoldwriter.js [createScaffoldWriter]; descriptionstylizer.js [applyDescriptionTheme];
descriptionlayout.js [applyDescriptionLayout]; ingredientstylizer.js [applyIngredientsTheme];
ingredientslayout.js [applyIngredientsLayout]; namestylizer.js [applyNamesTheme];
nameslayout.js [applyNamesLayout]; scaffoldstylizer.js [applyScaffoldTheme];
scaffoldlayout.js [applyScaffoldLayout]; shelllayout.js [applyShellLayout];
shellscaffoldstylizer.js [applyShellTheme]; yj.js [recipe]; shell.js [shellpipeline].

## 3. VERIFICATION
1. node --check all 18 locals + appinit + bootloader; grep zero import/export in kitchen/frontend.
2. /tmp/bootsim.js re-run (bootloader change must not regress the shared boot).
3. /tmp/frontendsim.js (Node vm): bootloader (30) + local manifest (18) via runPipelineBoot
   with a Node loader; assert existence tests pass; assert recipe/shellpipeline/
   ASTRender/ASTExtract globals; assert LayoutDirectiveCore/LayoutCorrection usable via
   commonFx; actor boot (mail) + shellpipeline structure (identity.id, pipeline.elements).
4. Browser (final): index.html boots 30+18, status bar, 'SHELL PIPELINE LOADED'.
