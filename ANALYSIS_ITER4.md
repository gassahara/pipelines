# ANALYSIS ITER4 — GLOBAL-VARS FULL REFACTOR: DIRECTLY-RUNNABLE BROWSER PROGRAMS
Mode: ANALYSIS (read-only; zero source writes; git tools FORBIDDEN per standing directive)
Date: 2026-08-31
Subject: user directive — "create the programs as directly runnable JS programs in the browser
(not even as modules) <-- full refactor is warranted to use global vars (load all programs at
boot via appinit; programs use global vars and declared functions presuming existence; run
tests to prove existence before importing the next program in the HTML)"

## 1. SCOPE (user-mandated)
- ONLY the files in this directory (shared-functions/pipelines). Frontends (kitchen/,
  m-orac/) are referenced for integration facts but NOT modified.
- Target: every program is a directly-runnable browser script — NO import/export,
  NO require/module.exports, NO module syntax of any kind. Loaded via plain <script> tags
  in dependency order. Programs reference each other's functions/vars as globals,
  presuming existence. A bootloader proves existence before loading the next program.
- git tools: FORBIDDEN (user corrected the earlier "MUST use git tools" typo → MUST NOT).

## 2. COLLISION AUDIT (read-only, 2026-08-31) — 759 top-level names, ~110 duplicated

### 2.0 SHARING-FIRST PRINCIPLE (user directive)
Before renaming ANY colliding name, analyze whether the programs can SHARE the same object
(identical semantics) or the same structure (compatible semantics). Renaming is the LAST
resort, applied only where sharing is impossible. Result of the analysis:

| Collision | Same object? | Same structure? | Resolution |
|:---|:---|:---|:---|
| MESSAGETYPES (apiactor vs renderactor) | NO (disjoint members) | YES (frozen string map) | CONSOLIDATE into MESSAGE registry program (user proposal) — one global owning all types |
| MESSAGEINTERFACES (8 actors) | NO (per-actor content) | YES (type→spec map) | CONSOLIDATE into MESSAGE registry — register(type, iface, handler) |
| DOMQUERYGETTERS/SETTERS/MESSAGES (domqueryconstants vs renderactor) | YES (value-identical) | YES | SHARE — renderactor deletes its L646-648 duplicates (only referenced at the module.exports tail L710-712, dead after refactor); domqueryconstants is the single source |
| deepmerge (worldmapactor vs context) | NO (2 copies) | YES — functionally equivalent | SHARE — one global `deepmerge` in utils.js; both callers use it |
| initialState (executionactor vs renderactor) | NO | NO (execution state vs render state, disjoint domains) | RENAME — executionInitialState / renderInitialState (sharing impossible) |

### 2.1 Fatal-collision verification (same name, DIFFERENT definitions)
- `MESSAGETYPES`: apiactor {API:'api', FETCH:'fetch'} vs renderactor {RENDER:'render',
  CLEAR:'clear', HTML:'html', ...32 keys}. Disjoint keys → cannot share one object; the
  registry consolidates both into one global MESSAGETYPES (union) owned by the registry
  program. Blast radius: apiactor 8 refs, renderactor 103 refs — all keep working against
  the union global (each program's keys are present).
- `MESSAGEINTERFACES`: 8 distinct per-actor maps (119 refs total). Registry owns them:
  each actor REGISTERS its map at load: MESSAGEREGISTRY.register(owner, type, iface, handler).
  The kernel's validator and dispatch consult the registry instead of a passed-in map.
- `initialState`: executionactor (createInitialExecutionState: pipelines/tasks/taskCounter/
  worldmap/debugState) vs renderactor ({actorRegistry, worldmap, _gc, _triggerGcScheduled,
  _gcCycleRunning, _gcCycleQueued, _triggerObserverInstalled, verbosity}). Disjoint domains →
  share impossible → rename. renderactor's lazy refs (expectelement L654/659,
  setRenderActor L547, ensureTriggerObserver L548) must follow the rename.
- `deepmerge`: worldmapactor L45 (recursive; explicit bothobjects guard) vs context L19
  (recursive; base-case guard). Verified equivalent on: null/undefined/0/''/false sources,
  array targets, nested plain-object merge, second-arg-wins conflicts. One shared global in
  utils.js (loads L2, before worldmapactor L4 and context L5) replaces both.

### 2.2 BENIGN duplicates (same name, SAME value — require-alias pattern)
The vast majority: `var createactor = actorkernel.createactor`, `logdebug`,
`enqueueDbStore`, `sendInstruction`, `generateTag`, `createVerbosityConstants`, `EVALSTACK`,
`frames`, `createGarbageCollector`, `JUST`, `NOTHING`, `validate` (typesystem defines;
utils aliases), all enqueue* wrappers, etc. Under flat globals these are idempotent
re-assignments of the identical function/object — harmless. All are require-header aliases
that vanish when the require blocks are deleted (the defining program provides the global).

## 3. ARCHITECTURE — GLOBAL-VARS WITH SHARED OBJECTS + MESSAGE REGISTRY

The user's directive ("namespace MUST be global — embrace the issue") + sharing-first rule
produces:

1. **MESSAGE registry program (NEW, js/messageregistry.js, leaf)** — one global
   `window.MESSAGEREGISTRY` that owns the message system (OWNER-SCOPED — REASONED_ITER4
   proof 5: wire strings 'recover'/'ping'/'register_pipeline' collide across actors, so
   bare-type keys would silently overwrite):
   - `MESSAGEREGISTRY.TYPES` (alias window.MESSAGETYPES) — frozen union of ALL message
     type constants (~94 names; duplicate keys RECOVER/PING/REGISTER_PIPELINE map to the
     same string everywhere → collapse benignly).
   - `MESSAGEREGISTRY.register(owner, type, iface, handler)` — pairs each message type
     with its interface spec AND its trigger (the behavior function), per owner.
   - `MESSAGEREGISTRY.getInterfaces(owner)` — returns {type: iface} map that feeds the
     EXISTING createMessageValidator (zero actorkernel changes).
   - `MESSAGEREGISTRY.validate(owner, type, message)`, `MESSAGEREGISTRY.getHandler(owner, type)`.
   - Each actor program, at load, calls register() for its types (replacing its local
     MESSAGETYPES + MESSAGEINTERFACES definitions) and passes
     MESSAGEREGISTRY.getInterfaces(owner) to createactor. Loaded at L0, before actorkernel.
2. **actorkernel** — NO changes: createMessageValidator still receives an interface map;
   the map now comes from the registry (getInterfaces(owner)). The registry "pairs
   interfaces with functions"; kernel dispatch remains behavior(message).
3. **Every other program** — delete require header + module.exports tail; keep ES5 bodies;
   cross-program references become bare global calls (createactor, enqueue*, sendInstruction,
   log* — all single-source globals after require-alias deletion).
4. **initialState** — the ONLY rename in the whole refactor: executionInitialState /
   renderInitialState (cannot share; disjoint state domains).

## 4. BOOTLOADER — "tests to prove existence before importing the next program"

A single bootloader script (js/bootloader.js, loaded FIRST via <script> in the HTML) that:
1. Holds the ordered manifest of programs (dependency order — topological, derived from the
   require-edge audit; verified against the full graph):
   L0 (no deps): verbosity → maybe → functorial? no — order within L0 is arbitrary; use:
   verbosity, maybe, evalstack, callwithstack, closureconsolidator, colorutils,
   freevarparser, domqueryconstants, actorgc, actorregistry, trigerregistry,
   layoutdirectives
   L1: domref (needs actorregistry), dnaserializer (freevarparser), stylizerutilities
       (verbosity,colorutils), typesystem (domqueryconstants), debugformatter (evalstack),
       actorkernel (actorgc,verbosity)
   L2: utils (typesystem, maybe), dbactor (actorkernel, verbosity)
   L3: mailactor (actorkernel, dbactor, verbosity)
   L4: worldmapactor, apiactor (needs utils), debugactor, executionactor
   L5: context (needs worldmapactor), renderactor (actorkernel, actorregistry, domref,
       dbactor, callwithstack, evalstack, verbosity, actorgc, mailactor)
   L6: blockcompiler (apiactor, callwithstack, evalstack, dnaserializer, verbosity,
       renderactor, executionactor, mailactor, dbactor, domqueryconstants)
   L7: hypervisoractor (blockcompiler, executionactor, debugactor, apiactor,
       worldmapactor, callwithstack, evalstack, verbosity, dbactor, actorkernel, mailactor)
2. For each entry { path, expectedGlobals: ['MAYBE', ...] }:
   a. inject <script src="..."> (or document.write) — synchronous sequential load;
   b. after the script executes, run the existence test:
      expectedGlobals.forEach(function(g) { if (typeof window[g] === 'undefined') throw ... });
   c. only then load the next program. On failure: halt with a precise diagnostic
      ("program X did not define global Y — load order broken").
3. After the full manifest is proven, invoke the boot entry (appinit) which calls
   startDbActor → startMailActor → ... → startHypervisorActor → loadPipeline.

The existence test per program is the user's "run tests to prove existence before
importing the next program in the HTML" — implemented as a script-injection loop with
typeof guards, entirely in the pipelines directory (the frontend html just needs
<script src="pipelines/js/bootloader.js"></script> + the manifest path config).

## 5. TRANSFORMATION PER FILE (mechanical, rewrite-over-fixes)

For each of the 29 files:
1. DELETE the require header block:
   `var X = require('./y.js');` / `var name = X.name;` lines → removed entirely
   (the names are now globals presumed present, provided by their defining program).
2. KEEP the entire ES5 body unchanged (var/function, CPS, functional-recursive — all
   already browser-legal).
3. REPLACE the module.exports tail with nothing (flat globals — the top-level declarations
   ARE the globals).
4. Per-collision resolution (from §2.0):
   - MESSAGETYPES/MESSAGEINTERFACES (8 actor files): DELETE local definitions; replace with
     `MESSAGEREGISTRY.register('owner', TYPE, iface, handler)` calls at load. References to
     MESSAGETYPES.X keep working — the registry's TYPES union global supplies them.
   - DOMQUERY* (renderactor): DELETE L646-648 duplicates (dead after module.exports removal).
   - deepmerge (worldmapactor, context): DELETE local definitions; use the shared global
     from utils.js.
   - initialState (executionactor, renderactor): RENAME to executionInitialState /
     renderInitialState, including lazy refs (renderactor expectelement/setRenderActor/
     ensureTriggerObserver).
5. Add per-file existence comment header: `// PROGRAM: requires <list>; provides <list>`.
6. NEW files: js/messageregistry.js (registry + TYPES union, L0 leaf) and
   js/bootloader.js (manifest + script injector + existence tests).

## 6. CROSS-PROGRAM REFERENCE REWRITE (the actual work)

Every `var createactor = actorkernel.createactor;` becomes: nothing — `createactor` is
already a global function declared by actorkernel.js, and the bootloader guarantees it
exists (existence test) before any program that uses it loads. This is the one semantic
change beyond header/tail surgery: references flip from require-destructure to bare global
calls, ordered and proven by the bootloader.

## 7. DECISION REQUIRED FROM USER (before BLUEPRINTS/EXECUTION)
RESOLVED by user directives: global namespace (flat globals), sharing-first collision
resolution, MESSAGE registry program.
A) RESOLVED (user: "A"): MESSAGEREGISTRY API shape is per-type registration:
   `MESSAGEREGISTRY.register(owner, type, iface, handler)` (one call per message type,
   at actor load). Registry also exposes `TYPES` (union global), `getInterface(type)`,
   `getHandler(type)`, `validate(type, message)`.
B) RESOLVED (user: "proceed" — recommendation accepted): the registry program defines
   the TYPES union global (window.MESSAGETYPES) as single source of truth; actor programs
   reference it (their references to MESSAGETYPES.X keep working). Per-actor type constants
   (MAILMESSAGETYPES, DBMESSAGETYPES, EXECUTIONMESSAGETYPES, HYPERVISORMESSAGETYPES,
   DEBUG_MESSAGETYPES, worldmap's UPDATE/OBSERVE/...) are folded into the union.
C) RESOLVED (user: "proceed" — recommendation accepted): bootloader performs per-program
   typeof checks PLUS per-type registration assertions (after each actor loads, assert
   MESSAGEREGISTRY.getInterface('<type>') exists for each of that actor's registered types).

ALL DECISIONS LOCKED. ANALYSIS ITER4 is the complete blueprint for BLUEPRINTS:
flat globals, sharing-first collision resolution (4 share/consolidate + 1 rename),
MESSAGE registry program (register-per-type API), bootloader with existence + registration
tests, topological manifest (messageregistry at L0 before actorkernel L1).

## 8. VERIFICATION PLAN (post-refactor)
- Browser: open index.html (or a test page in this dir) → bootloader logs each program
  load + existence test PASS; appinit boots all actors (dbactor memory loop, mail actor,
  7 actors poll).
- Node (as a proxy, since this dir has no browser): a harness that stubs `window`/`global`
  and loads each program in manifest order with the same existence tests — the bootloader
  logic is environment-agnostic if it reads its global host from `typeof window !==
  'undefined' ? window : global`.
- Failure injection: temporarily remove one program from the manifest → bootloader must
  halt with the precise diagnostic (proves the existence-test requirement).

## 9. OPEN ITEMS CARRIED FORWARD
- Frontend integration (out of scope): kitchen/m-orac index.html must switch from
  <script type="module" src="appinit.js"> to plain <script src="pipelines/js/bootloader.js">
  + manifest; appinit.js's ESM URL imports replaced by bootloader-driven globals.
- m-orac oracles: rewritestyleattrs import bug (pre-existing) — must be fixed in the same
  integration pass.
- git corruption (6a02eeba etc.): recorded; NOT actionable this cycle (git forbidden).
- NOTE on §4 manifest: the topological order below is derived from the CURRENT require
  edges. Once the refactor flips references to bare globals, the load order is still
  dependency-first, but the manifest must be re-verified against the final global-reference
  graph (the bootloader's existence tests are the runtime proof). messageregistry.js joins
  the manifest at L0 (before actorkernel L1, since the kernel consults it).
  The 3 key ordering constraints (verified): actorregistry BEFORE domref;
  worldmapactor BEFORE context; renderactor BEFORE blockcompiler.
