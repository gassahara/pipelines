# PLAN_ITER0.md — GLOBAL-VARS BROWSER PROGRAMS (BLUEPRINT)
Mode: BLUEPRINTS-EXECUTION-CYCLE AGENTIC | Date: 2026-08-31
Inputs: ANALYSIS_ITER4.md (decisions A/B/C locked), REASONED_ITER4.md (5 proofs, owner-scoped registry)
Target: 29 existing programs + 2 new = 31 directly-runnable browser scripts.
Flat globals, ZERO module syntax (no require/module.exports/import/export). Bootloader loads
all programs in dependency order with existence tests before each next program.

## 1. ARCHITECTURE
- Flat global namespace (user: "namespace MUST be global — embrace the issue").
- Sharing-first collision resolution (REASONED_ITER4): 4 groups share/consolidate, 2 rename.
- MESSAGE registry (user proposal + decision A/B): js/messageregistry.js (L0 leaf) owns
  window.MESSAGETYPES (union of all type constants) + window.MESSAGEREGISTRY
  (owner-scoped: register(owner,type,iface,handler), getInterfaces(owner),
  getHandler(owner,type), validate(owner,message)). Owner-scoping mandatory: wire strings
  'recover'/'ping'/'register_pipeline' collide across actors (proof 5).
- actorkernel: ZERO changes — createMessageValidator still receives an interface map;
  actors pass MESSAGEREGISTRY.getInterfaces(owner) at createactor.
- js/bootloader.js (new): PIPELINES_MANIFEST (31 entries, topological) + existence tests
  (typeof per provided global) + per-type registration assertions for actors (decision C)
  + DOM script injection; runPipelineBoot(loadProgram, report) injectable for Node test.

## 2. COLLISION RESOLUTIONS (final)
| Name | Files | Resolution |
|---|---|---|
| MESSAGETYPES | apiactor, renderactor | CONSOLIDATE → union global in messageregistry |
| <X>MESSAGETYPES (5 per-actor constants) | mail/db/debug/execution/hypervisor | FOLD into union; refs become MESSAGETYPES.X |
| worldmap plain types | worldmapactor | FOLD into union; bare UPDATE→MESSAGETYPES.UPDATE etc. |
| MESSAGEINTERFACES | 8 actors | CONSOLIDATE → register per type; local map renamed <owner>INTERFACES (registration vehicle); createactor gets getInterfaces(owner) |
| initialState | executionactor, renderactor | RENAME → executionInitialState / renderInitialState |
| deepmerge | worldmapactor, context | SHARE → single global in utils.js (context-variant semantics, proven 22/22) |
| DOMQUERY* | renderactor L646-648 | SHARE → deleted; domqueryconstants single source |
| updateworldmap | worldmapactor (patch-sender), context (function/patch dispatcher) | CANNOT share (different semantics) → worldmapactor sender RENAMED sendworldmappatch; context dispatcher keeps updateworldmap (app-facing) |
| observeworldmap | worldmapactor, context | SHARE → context wrapper deleted (pure forwarding), refs resolve to worldmapactor global |

## 3. TRANSFORMATION
A. Mechanical strip (all 29, via /tmp/globalstrip.js): delete require lines; delete
   member-alias lines (var X = Y.Z; where Y is a module alias or foreign); rewrite
   mismatched-alias body refs (context: actorUpdateWorldmap→sendworldmappatch,
   actorObserveWorldmap→observeworldmap); replace remaining moduleAlias. → bare name;
   delete module.exports tail. (Proven name-complete: proof 1; tails bare: proof 4.)
B. Actor semantics (8, via /tmp/actortransform.js): delete local type-constant blocks;
   refs → MESSAGETYPES.X; MESSAGEINTERFACES → <owner>INTERFACES; insert registration
   forEach (register per type with behavior) before createactor (top-level, load-time);
   createactor 3rd arg → MESSAGEREGISTRY.getInterfaces(owner).
C. Renames: executionInitialState (executionactor def+arg), renderInitialState
   (renderactor 6 refs incl. lazy expectelement/setRenderActor/ensureTriggerObserver),
   sendworldmappatch (worldmapactor sender), renderactor DOMQUERY* deletion.
D. utils.js: add deepmerge global.
E. New: messageregistry.js, bootloader.js.

## 4. MANIFEST (topological; 3 verified constraints: actorregistry<domref, worldmapactor<context, renderactor<blockcompiler; messageregistry before actorkernel)
L0 messageregistry → verbosity → maybe → evalstack → callwithstack → colorutils →
closureconsolidator → freevarparser → domqueryconstants → actorgc → actorregistry →
trigerregistry → layoutdirectives
L1 domref → typesystem → stylizerutilities → dnaserializer → debugformatter → actorkernel
L2 utils → dbactor
L3 mailactor
L4 worldmapactor → apiactor → debugactor → executionactor
L5 context → renderactor
L6 blockcompiler
L7 hypervisoractor

## 5. VERIFICATION
- node --check 31/31; grep: zero require/module.exports/import/export in js/.
- Node boot simulation (/tmp/bootsim.js): vm.runInThisContext(bootloader.js) then
  runPipelineBoot with Node loader → all 31 load in order, existence tests pass,
  per-type registration asserts pass.
- bootActors 7/7 through mail; pipeline compile (blockcompiler) end-to-end.
- Behavior suites from prior waves re-run against global forms (wave verify scripts
  updated to load via vm in manifest order).
