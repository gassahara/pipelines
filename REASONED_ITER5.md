# REASONED_ITER5.md — REASONER VALIDATION OF ANALYSIS_ITER5 (frontend adaptation)
Mode: ANALYSIS-REASONER-CYCLE | Date: 2026-08-31 | Artefact: REASONED_ITER5.md
Scope: prove or refute every load-bearing claim in ANALYSIS_ITER5.md before FORMALIZATION.
Methods: static proof scripts (/tmp/reasoner_local.js, /tmp/reasoner_local2.js), grep
inventories, read-only inspection. NO source writes, NO git, NO diff.

## 1. VERDICT SUMMARY
ANALYSIS_ITER5 is VALID with ONE refinement (shelldna resolution timing, §4). All
proved claims hold. Blueprint is ready for FORMALIZATION after the refinement is absorbed.

## 2. PROOFS

### PROOF A — Local import graph: PASS
18 files in kitchen/frontend/pipelines. 16 leaves are IMPORT-FREE (ast, themes,
responsivelayout, homemenustylizer, monitorwidgetstylizer, scaffoldwriter, and the 11
layout/stylizer modules). Importers:
- yj.js: 13 imports (9 single-line local: themes, scaffold/names/description/ingredients
  × stylizer+layout; 4 multi-line blocks: stylizerutilities, layoutdirectives, colorutils,
  ast) — PROVEN via block-aware scan (single-line regex alone missed the 4 multi-line
  blocks; corrected).
- shell.js: 8 imports (3 shared URL blocks + ast, shellscaffoldstylizer, shelllayout,
  yj recipe, themes).
CONSEQUENCE: topological order leaves → yj.js → shell.js satisfies all edges.

### PROOF B — Provides lists complete (every export is a top-level declaration): PASS
All 18 files scanned: every exported name (including export function/export var/export
default targets) resolves to a line-start `function`/`var` declaration in the SAME file
(zero issues). Specifically:
- ASTRender, ASTExtract top-level in ast.js ✓ (block export { ASTRender, ASTExtract }).
- shellpipeline top-level in shell.js ✓ (deleting `export default shellpipeline;` leaves
  the global).
- recipe top-level in yj.js ✓ (`export var recipe` + `export default recipe` → one global).
CONSEQUENCE: deleting export keywords yields exactly the 18 provides lists in §4; the
existence tests are name-complete.

### PROOF C — F4 (LayoutDirectiveCore/LayoutCorrection NOT globals): CONFIRMED
layoutdirectives.js exposes exactly ONE top-level global: `function createLayoutDirectives
(stylizer)` (L10). LayoutDirectiveCore/LayoutCorrection are internal vars returned by the
factory (L587-588: `LayoutDirectiveCore: LayoutDirectiveCore, LayoutCorrection:
LayoutCorrection`). shell.js L29-30 + yj.js L117-118 reference them directly → undefined
under globals. The blueprint's factory-injection fix is REQUIRED, not optional.

### PROOF D — F3 (bootloader call-time currentScript): CONFIRMED
bootloader.js L99 `var scriptEl = document.currentScript;` sits INSIDE bootPipeline() —
executed at CALL time. When appinit calls bootPipeline() (long after load), currentScript
is null → base '' → manifest srcs resolve against the PAGE → 404. Load-time capture
required. (Node guard needed: `typeof document !== 'undefined'` keeps /tmp/bootsim.js
working.)

### PROOF E — F2 / appinit surface: PASS
appinit.js: 16 import lines (15 shared URL + 1 local default) + top-level await at
L105-106 (DOM/fonts readiness) and L114-131 (actor boot + loadPipeline) — all module-only.
All 20 referenced shared names (startHypervisorActor, enqueueHypervisorPing,
startRenderActor, enqueueRenderPing, startExecutionActor, enqueueExecutionPing,
startDebugActor, enqueueDebugPing, startMailActor, loadPipeline, updateworldmap,
createVerbosityConstants, getverbosity, setverbosity, getverbosityname, loginfo,
startDbActor, startApiActor, startWorldmapActor) verified PRESENT in the bootloader
manifest provides lists (grep check: ALL 20 OK).

### PROOF F — No other module-only syntax in locals: PASS
No top-level await, no dynamic import() in any of the 18 local programs. Only
import/export statements need removal. (const/let/arrows/async functions are legal in
plain browser scripts — the ES5 constraint applies to the shared framework programs, not
the frontend locals.)

### PROOF G — Consumer completeness: PASS
gassahara-URL grep across kitchen/frontend: ONLY appinit.js + shell.js + yj.js consume
shared pipelines (all other files import-free). index.html loads only appinit.js as a
module; test.html is a legacy page (inline styles object) NOT loaded by index.html.

## 3. REFINEMENT (absorbed into ANALYSIS_ITER5 §C.1)
NEW FINDING: `var shelldna = shellpipeline;` at appinit TOP LEVEL would execute BEFORE
the local manifest loads shell.js → shellpipeline undefined → shelldna undefined.
FIX: resolve shelldna INSIDE the boot chain, immediately after runPipelineBoot(local)
reports ok (the same point where startApp() begins). All other shared-global references
in appinit are inside functions (call-time) — safe.

## 4. CONCLUSION
Blueprint VALID, one refinement absorbed. All 7 proofs green. Ready for FORMALIZATION
when directed.
