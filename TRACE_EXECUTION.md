# TRACE EXECUTION — GLOBAL-VARS BROWSER PROGRAMS (shared-functions/pipelines)
Derived From: ANALYSIS_ITER4.md (decisions A/B/C locked), REASONED_ITER4.md (5 proofs),
PLAN_ITER0.md (blueprint) | Completed: 2026-08-31
Prohibitions honoured: no diff tools, no git tools, no internal tools (write_file/patch/terminal only).

## 1. ARCHITECTURE DELIVERED (31 programs)
- 29 existing programs + js/messageregistry.js + js/bootloader.js = 31 directly-runnable
  browser scripts. Flat globals, ZERO module syntax (no require/module.exports/import/export).
- window.MESSAGETYPES — frozen union of all message type constants (~94 names; duplicate
  keys RECOVER/PING/REGISTER_PIPELINE map to identical strings across actors → benign).
- window.MESSAGEREGISTRY — OWNER-SCOPED (REASONED_ITER4 proof 5: 'recover' x4, 'ping' x4,
  'register_pipeline' x2 collide across actors): register(owner, type, iface, handler),
  getInterfaces(owner) (feeds the EXISTING createMessageValidator — actorkernel ZERO changes),
  getHandler(owner, type), validate(owner, message).
- js/bootloader.js — PIPELINES_MANIFEST (30 entries, topological) + existence tests
  (typeof per provided global) + per-type registration asserts for actors (decision C) +
  DOM script injection; runPipelineBoot(loadProgram, report) is injectable (Node-tested).

## 2. COLLISION RESOLUTIONS (sharing-first)
| Collision | Resolution |
|---|---|
| MESSAGETYPES (apiactor/renderactor) + 5 per-actor <X>MESSAGETYPES + worldmap plain vars | CONSOLIDATED → union global in messageregistry; refs → MESSAGETYPES.X |
| MESSAGEINTERFACES (8 actors) | CONSOLIDATED → <owner>INTERFACES local map + per-type register() at load + getInterfaces(owner) at createactor |
| initialState (executionactor/renderactor) | RENAMED → executionInitialState / renderInitialState (disjoint domains, sharing impossible) |
| deepmerge (worldmapactor/context) | SHARED → single global in utils.js (context-variant, proven equivalent 22/22) |
| DOMQUERY* (renderactor) | SHARED → deleted from renderactor; domqueryconstants single source |
| updateworldmap (worldmapactor sender vs context dispatcher) | CANNOT share (dispatcher adds fn/patch dispatch) → worldmapactor sender RENAMED sendworldmappatch; context dispatcher keeps updateworldmap (app-facing) |
| observeworldmap (context wrapper) | SHARED → wrapper deleted; refs resolve to worldmapactor global |

## 3. MECHANICAL TRANSFORMATION (all 29 files)
1. Deleted require headers + member-alias lines + module.exports tails (script-proven
   name-complete: every cross-program name defined exactly once as a global).
2. Actors: folded local constants into the union; per-type registration forEach before
   createactor; createactor 3rd arg → MESSAGEREGISTRY.getInterfaces(owner).
3. INITIAL BUG (deleteBlock close regex /^\};$/ missed '});'): ate actor middles
   (interfaces + behaviors) in 7 files — DETECTED by bootsim, root-caused by synthetic
   reproduction, FIXED to /^}[\);]+$/, and all 8 actors REBUILT from session-history
   originals (recovered via session_search of the Wave 1/6/7/8 write_file calls) +
   re-applied P3a (dbactor persistAttempt) + executeStage re-spec (hypervisoractor).
   Also fixed: UPDATE_FN/UNOBSERVE token mangling in the worldmap constant fold.

## 4. VERIFICATION (all green)
1. node --check 31/31; ZERO require/module.exports/import/export in code.
2. Zero ES6 syntax (const/let/arrows/async/await/?.); residual hits are parser/serializer
   STRING DATA (token tables) — exempt; single loop = freevarparser trampoline driver.
3. /tmp/bootsim.js (Node vm = browser-equivalent): bootloader loads all 30 programs with
   existence + registration asserts PASS; MESSAGETYPES union intact (not clobbered by actor
   loads); no MESSAGEINTERFACES/initialState globals; executionInitialState/renderInitialState
   present; deepmerge/updateworldmap/sendworldmappatch/DOMQUERY*/frames globals correct;
   all 8 actors registered handler-paired; owner-scoped 'recover' under 4 owners;
   validate works; bootActors → BOOTED (7/7 actors alive through mail); 6/6 production
   round-trips (enqueueDbList, getworldmap, enqueueDebugPing, enqueueExecutionPing,
   enqueueRenderPing, enqueueHypervisorPing); pipeline compiles; fn-block submission flows
   through mail into executionactor.
4. Mail POLL semantics: POLL marks ALL envelopes read → concurrent awaitResponse on the
   same recipient races (test used sequential awaits; production callers use unique senders).
5. /tmp/behaviorsim.js: all prior wave behavior suites (2a/2b/3/4) PORTED from CJS require
   to the global-vars vm form and re-run — 54/54 PASS (colour arithmetic, closure
   consolidation, freevarparser detection incl. arrows/templates, typesystem validate +
   validateschema CPS chains, stylizer utilities, layoutdirectives injection +
   parseDirectives, debugformatter, dnaserializer revivability).

## 6. KITCHEN FRONTEND ADAPTATION (PLAN_ITER1, verified 2026-08-31)
- index.html: `<script type="module" src="appinit.js">` → two plain scripts:
  ../../shared-functions/pipelines/js/bootloader.js + appinit.js.
- bootloader.js: PIPELINES_BASE captured at LOAD time (was call-time currentScript —
  null from appinit); bootPipeline(onDone); runPipelineBoot(loadProgram, report, manifest)
  — optional manifest (backward compatible; bootsim regression green).
- appinit.js: full plain-script rewrite — 16 imports deleted; LOCAL_PIPELINES_MANIFEST
  (18 entries + provides) + DOM loader; two-stage boot (bootPipeline shared 30 →
  runPipelineBoot local 18 → startApp); all top-level awaits → promise chains;
  shared-global resolution deferred into startApp (shelldna = shellpipeline after local
  boot); Promise.resolve wrappers on sync start* actors.
- kitchen/frontend/pipelines (18 files): ESM → plain scripts. 16 leaves export→function;
  ast.js export block removed; yj.js 13 import blocks removed + recipe global;
  shell.js 8 imports removed + shellpipeline global; F4 fix in BOTH shell.js + yj.js
  (LayoutDirectiveCore/LayoutCorrection obtained via createLayoutDirectives injection).
- VERIFICATION: node --check all (shared 31 + frontend 19); ZERO import/export across
  both trees; /tmp/bootsim.js regression ALL PASS; /tmp/frontendsim.js 19/19 PASS
  (shared 30 + local 18 boot with existence tests, recipe/shellpipeline/ASTRender/
  ASTExtract globals, F4 commonFx.layoutCore/layoutCorrection verified, actor boot chain
  through mail, loadPipeline initiated).
- OPEN (browser-only): full shell pipeline compile in a real browser (Node poll window +
  DOM dependent — loadPipeline initiates, compile times out in headless); m-orac/frontend
  sibling adaptation (same recipe — out of this directive's scope); deployed URL paths.

## 5. OPEN ITEMS (unchanged scope boundaries)
- P-9 frontend integration: DONE (kitchen/frontend, §6).
- m-orac oracles: rewritestyleattrs import bug (pre-existing, broken before refactor) —
  sibling adaptation (kitchen/frontend DONE per §6).
- git object DB corruption (6a02eeba etc.): recorded, NOT actionable (git forbidden).
- ensureTriggerObserver event coverage (click/input/change only) — verify against app
  trigger surface in the browser.
