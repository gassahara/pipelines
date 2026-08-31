# ANALYSIS: ITER1 — Three-Tier Framework Taxonomy + Bottom-Up Rewrite Map (rev 2)
Generated: 2026-08-31
Derived From: user directive (ANALYSIS mode), ANALYSIS_ITER0.md (13 WIs, P-1..P-9), live import/async scans
Status: READ-ONLY — no source writes this iteration
Corrections applied (rev 2): output.txt excluded (not code); circular-pair resolution via ESM purge (no cross-actor module imports, no dynamic import), NOT lazy require.

## 1. DIRECTIVE (verbatim requirements extracted)
1. ESM-only syntax MUST be purged: all programs are simple JS programs with simple JS exported functions.
2. Refactor MUST be performed BOTTOM-UP.
3. Rewrite is favored over fixes to achieve the goal of simplicity.
4. Three types of programs in the FRAMEWORK:
   - ACTORS — persistent constant-pull programs (timeout interval), always running via the polling mechanism; receive instructions from the mail system; put results using the same messaging system.
   - PROGRAMS — exported functions used once and exit; example: blockcompiler performs stage compilation and puts results in the mail system.
   - INTERFACES — control the typesystem; utils has a special requirement: friendly to portable functions (stylizerutilities, layoutdirectives) achieved by injecting object functions, replacing closures by object injection.
5. Correction: ESM syntax is purged → require() of actor modules from other actors/programs is purged; dynamic import() is purged. Cross-program coupling is resolved by the rewrite structure (mail-based messaging for actors; leaf interface modules for shared constants; object injection for portable utilities), NOT by lazy require at call time.

## 2. SCOPE & FILE ROSTER — three-tier classification (all 28 files)

### TIER A — ACTORS (8): persistent constant-pull programs, mailboxType 'mail' (except dbactor/mailactor which are memory by design)
| File | Mailbox | Role | ESM state |
|------|---------|------|-----------|
| js/actors/mailactor.js | memory | Message broker (SEND/POLL/ACK), DB-persisted queues | REWRITTEN Wave1 ✓ (ES5) |
| js/actors/dbactor.js | memory | Storage-only actor | REWRITTEN Wave1 ✓ (ES5) |
| js/actors/worldmapactor.js | mail | Worldmap state + observers | ESM — REWRITE |
| js/actors/apiactor.js | mail | API/fetch calls | ESM — REWRITE |
| js/actors/debugactor.js | mail | Debug overlay/trace | ESM — REWRITE |
| js/actors/executionactor.js | mail | Task execution (19 enqueueExecution*) | ESM — REWRITE |
| js/actors/hypervisoractor.js | mail | Pipeline orchestration | ESM — REWRITE |
| js/actors/renderactor.js | mail | DOM rendering + triggers | CORRUPTED — REWRITE (spec from live consumers §3.1) |

### TIER B — PROGRAMS (8): exported functions used once, then exit; results via mail
| File | Role | ESM state |
|------|------|-----------|
| js/factory/blockcompiler.js | Stage compilation → mail | ESM (41 async) — REWRITE (CPS; compile → mail → exit) |
| js/factory/callwithstack.js | Stack-tracked call wrapper | REWRITTEN Wave1 ✓ (ES5, Promise kept) |
| js/evalstack.js | Continuation stack | REWRITTEN Wave1 ✓ (ES5) |
| js/debugformatter.js | Trace → HTML formatter | ESM — REWRITE |
| js/factory/freevarparser.js | Free-variable parser (58 loops) | ESM — REWRITE (trampoline, P-5) |
| js/factory/dnaserializer.js | DNA serialize/deserialize | ESM — REWRITE |
| js/factory/closureconsolidator.js | Closure consolidation | ESM — REWRITE |
| js/factory/colorutils.js | Color utilities (pure) | ESM — REWRITE |

### TIER C — INTERFACES (12): typesystem control, utilities, portable-function-friendly via OBJECT INJECTION
| File | Role | ESM state |
|------|------|-----------|
| js/typesystem.js | Schema validation (Map, Number.isInteger, async) | ESM — REWRITE (object-based registry, no Map) |
| js/utils.js | API constants + helpers | CONVERTED (uncommitted) — load-broken until typesystem rewrites |
| js/context.js | Worldmap interaction facade | CONVERTED (uncommitted) — load-broken until worldmapactor rewrites |
| js/verbosity.js | Logging constants + fns | CONVERTED ✓ (Wave1-verified) |
| js/functorial/maybe.js | Maybe monad | CONVERTED ✓ |
| js/fundamental/domref.js | DOMRef factory | CONVERTED ✓ |
| js/actors/actorregistry.js | Actor registry | CONVERTED ✓ |
| js/actors/trigerregistry.js | Trigger registry | CONVERTED ✓ |
| js/actors/actorgc.js | Garbage collector | CONVERTED ✓ |
| js/factory/stylizerutilities.js | rewritestyleattrs/applystylerules — PORTABLE | ESM — REWRITE with OBJECT INJECTION (no closures) |
| js/factory/layoutdirectives.js | Layout directives — PORTABLE | ESM — REWRITE as createLayoutDirectives(stylizer) factory (P-6) |
| js/actors/actorkernel.js | createactor kernel | REWRITTEN Wave1 ✓ (ES5) |

### TIER C-ADD — shared leaf modules (new, from ESM-purge restructuring)
| File | Role |
|------|------|
| js/factory/domqueryconstants.js | DOMQUERYGETTERS/SETTERS/MESSAGES frozen arrays — leaf, imported by typesystem, blockcompiler, renderactor. Breaks interface→actor edge. |

## 3. RENDERACTOR REWRITE SPEC (WI-T4) — from live consumers only
### 3.1 Required export surface (verified by grep of current consumers; output.txt NOT used)
- From js/factory/blockcompiler.js (L28-33): enqueuesetstyle, enqueuesetvalue, enqueueproperty, enqueuegetlayout, enqueuetlayout, enqueuetoggleclass, DOMQUERYGETTERS, DOMQUERYSETTERS, DOMQUERYMESSAGES, RENDERACTOR, MESSAGETYPES, enqueuegetviewport, enqueuegetscreen, enqueuematchmedia, enqueueRenderRegisterTriggerExpectation, enqueueRenderRevalidateTriggers, enqueueRenderRestoreBodyHtml
- From js/actors/hypervisoractor.js (L33-37): startRenderActor, ensureRenderActorReady, enqueueRenderPing
- From js/typesystem.js (L1): DOMQUERYMESSAGES, DOMQUERYSETTERS — via domqueryconstants.js after rewrite (no actor import)
### 3.2 Rewrite rules
- ES5 syntax only; module.exports = { surface per §3.1 }; all enqueue* are thin wrappers: generateTag() → sendInstruction('renderactor', type, payload, tag, 'system') → awaitResponse('system', tag) (tag-based, no resolve/reject embedded).
- NO import of hypervisoractor (static or dynamic). Trigger forwarding (REGISTER_TRIGGER expectation lifecycle) sends mail instructions to 'hypervisoractor' (sendInstruction), and hypervisor's own enqueue* wrappers are reached via the wrapper/interface module — never a module-level import.
- DOMQUERY constants imported from domqueryconstants.js (leaf), not defined/exported only here — renderactor still exports them for backward compatibility of the surface.
- Corrupted region (L129-140: prose + markdown fence) eliminated by construction (full rewrite).
- Missing-function discovery (ensureTriggerObserver/scheduleGcCycle/triggerGcCycle/isTriggerRecipientLive referenced but undefined in current file) → the rewrite defines the trigger-GC lifecycle as simple functions within renderactor, with hypervisor interaction via mail only.

## 4. DEPENDENCY GRAPH (verified live; post-rewrite edges shown as →)
- Leaf interfaces: verbosity, maybe, colorutils, closureconsolidator, freevarparser, actorgc, actorregistry, trigerregistry, domqueryconstants (new)
- stylizerutilities → verbosity, colorutils | layoutdirectives → (injected stylizer, no import — P-6)
- evalstack → (none) | callwithstack → (none) | debugformatter → evalstack
- typesystem → domqueryconstants (was renderactor — VIOLATION FIXED)
- utils → typesystem, maybe | context → worldmapactor wrappers, domref
- dbactor → actorkernel, verbosity | mailactor → actorkernel, dbactor, verbosity
- worldmapactor → actorkernel, dbactor, mailactor, verbosity
- apiactor → actorkernel, utils, dbactor, mailactor, verbosity
- debugactor → actorkernel, evalstack, debugformatter, verbosity, dbactor, mailactor
- executionactor → actorkernel, dbactor, mailactor, verbosity
- hypervisoractor → actorkernel, dbactor, blockcompiler, callwithstack, evalstack, verbosity, executionactor, mailactor (NO module import of renderactor; render ping/start via mail wrappers)
- renderactor → actorkernel, actorregistry, domref, dbactor, callwithstack, evalstack, verbosity, actorgc, mailactor, domqueryconstants (NO module import of hypervisoractor)
- blockcompiler → apiactor wrappers, callwithstack, evalstack, dnaserializer, verbosity, renderactor wrappers, executionactor wrappers, dbactor, domqueryconstants (NO module import of hypervisoractor; hypervisor enqueuers via wrapper/interface module)

### Circular pairs — RESOLVED BY STRUCTURE (rev 2, not lazy require):
- renderactor ↔ hypervisoractor: renderactor has NO hypervisoractor import (mail-based trigger forwarding); hypervisoractor has NO renderactor import (startRenderActor/ensureRenderActorReady/enqueueRenderPing via mail wrappers or injected at bootstrap). No cycle exists post-rewrite.
- blockcompiler ↔ hypervisoractor: blockcompiler has NO hypervisoractor import (hypervisor enqueuers accessed through the wrapper interface module, which only depends on mailactor); hypervisoractor keeps its blockcompiler import (actor→program one-way, legal). No cycle exists post-rewrite.
- typesystem → renderactor: broken by domqueryconstants.js extraction (interface→interface only).

## 5. WORK ITEM CATALOG (ITER1 — taxonomy-based)
| WI-ID | Tier | File | Treatment | Notes |
|-------|------|------|-----------|-------|
| WI-T0 | C | js/factory/domqueryconstants.js | CREATE | Leaf frozen arrays; used by typesystem, blockcompiler, renderactor |
| WI-T1 | C | js/typesystem.js | REWRITE | object registry replaces Map; Number.isInteger→Math.floor(v)===v; async validateschema→CPS/recursive; import domqueryconstants |
| WI-T2 | C | js/factory/stylizerutilities.js | REWRITE | ES5 + object-injection surface (portable): functions take injected helper object, no closure capture |
| WI-T3 | C | js/factory/layoutdirectives.js | REWRITE | createLayoutDirectives(stylizer) factory (P-6); no direct stylizerutilities import |
| WI-T4 | A | js/actors/renderactor.js | REWRITE | per §3 (live-consumer surface; no hypervisor import; trigger GC lifecycle defined internally) |
| WI-T5 | A | js/actors/worldmapactor.js | REWRITE | ES5; updateworldmap etc. → sendInstruction/awaitResponse; const→var |
| WI-T6 | A | js/actors/apiactor.js | REWRITE | ES5; fix enqueueapi/enqueuefetch tag bug (L156-176: sendInstruction recipient must be 'apiactor', awaitResponse recipient 'system') |
| WI-T7 | A | js/actors/executionactor.js | REWRITE | ES5 + async removal (8 sites) + 19 enqueue* wrappers |
| WI-T8 | A | js/actors/debugactor.js | REWRITE | ES5; requires debugformatter (Tier B) first |
| WI-T9 | A | js/actors/hypervisoractor.js | REWRITE | ES5 + async removal (15 sites) + render interaction via mail only |
| WI-T10 | B | js/factory/blockcompiler.js | REWRITE | ES5 + 41 async→CPS + hypervisor enqueuers via wrapper module + "compile→mail→exit" per directive |
| WI-T11 | B | js/debugformatter.js | REWRITE | ES5; frames from evalstack; no async |
| WI-T12 | B | js/factory/freevarparser.js | REWRITE | ES5 + 58 loops→functional/recursive + trampoline |
| WI-T13 | B | js/factory/dnaserializer.js | REWRITE | ES5 + freevarparser dep |
| WI-T14 | B | js/factory/colorutils.js | REWRITE | ES5 (pure, likely trivial) |
| WI-T15 | B | js/factory/closureconsolidator.js | REWRITE | ES5 |
| WI-T16 | C | js/utils.js | FIX (load) | already converted; blocked by typesystem — no change needed beyond WI-T1 completing |
| WI-T17 | C | js/context.js | FIX (load) | already converted; blocked by worldmapactor — no change needed beyond WI-T5 |

## 6. EXPLANATIONS
### WI-T4 (renderactor): root cause — previous session wrote assistant prose into the file (L129-140) and dropped four function definitions referenced by handlers (ensureTriggerObserver, scheduleGcCycle, triggerGcCycle, isTriggerRecipientLive); committed at HEAD. Favor rewrite: file is corrupted and its hypervisor coupling must be purged anyway; patching is riskier and would preserve a bad structure. Surface defined by §3.1 (grep-verified).
### WI-T6 (apiactor tag bug): enqueueapi/enqueuefetch pass `tag, tag` — recipient==tag==sender collision; awaitResponse(tag, tag) polls wrong queue. Corrected: sendInstruction('apiactor', type, payload, tag, 'system'); awaitResponse('system', tag).
### WI-T1 (typesystem): interface must not depend on actor — domqueryconstants.js extraction is the bottom-up fix.
### WI-T2/T3 (portable injection): portable functions receive dependencies as injected object functions (no closure over module state); layoutdirectives exposes createLayoutDirectives(stylizer).

## 7. ESM PURGE SPECIFICATION (gates per rewritten file)
1. `node --check` (CJS parse) exit 0.
2. grep gate: zero `^\s*import|^\s*export|\bconst\s|\blet\s|=>|\basync\s|\bawait\s|\?\.|` backtick | spread | template literal | destructuring | default param | shorthand | Map | Number.isInteger | .find( | .startsWith(
3. NO dynamic import() anywhere; NO actor-module require from another actor/program (renderactor↔hypervisoractor, blockcompiler↔hypervisoractor edges must be absent).
4. require-load test in dependency order.
5. Final: full-set load test (all 28 + domqueryconstants) → all load.

## 8. BOTTOM-UP REWRITE ORDER (interfaces → programs → actors)
Wave 1 (done, verified): verbosity, maybe, actorgc, actorregistry, trigerregistry, evalstack, callwithstack, actorkernel, dbactor, mailactor
Wave 2 (INTERFACES, leaf): colorutils, closureconsolidator, freevarparser, domqueryconstants (create)
Wave 3 (INTERFACES, deps): typesystem, stylizerutilities, layoutdirectives
Wave 4 (PROGRAMS): debugformatter, dnaserializer
Wave 5 (PROGRAM, heavy): blockcompiler
Wave 6 (ACTORS, simple): worldmapactor, apiactor, debugactor
Wave 7 (ACTORS, complex): executionactor, hypervisoractor
Wave 8 (ACTOR, corruption + coupling purge): renderactor (last — after hypervisoractor; no import either way by design)
Wave 9: utils/context load-fix + full-set load test + acceptance gates

## 9. PROPOSAL MAPPING (ITER1 ↔ ITER0)
- P-1 (renderactor rewrite) → WI-T4 (live-consumer spec; corruption + coupling purge)
- P-2 (loadability) → WI-T16/WI-T17 + WI-T1 + WI-T5
- P-3 (ES5 syntax) → all WIs
- P-4 (async→CPS) → WI-T1, T7, T9, T10
- P-5 (loops→functional) → WI-T12, T13
- P-6 (stylizer injection) → WI-T3, T2
- P-7 (resolve/reject removal) → all rewrites already emit tag-based wrappers (target architecture); post-rewrite audit
- P-8/P-9 → DEFERRED (unchanged)

## 10. VERIFICATION DIGEST
- Files classified: 28 + 1 new leaf (domqueryconstants)
- Work items: 18 (WI-T0..T17), all REWRITE/CREATE except WI-T16/T17 (load-fixes)
- Wave 1 already applied+verified on disk: 13 converted files total (context, utils, verbosity, actorgc, actorregistry, trigerregistry, maybe, domref from prior session; evalstack, callwithstack, actorkernel, dbactor, mailactor from Wave 1 — all pass node --check + load test)
- renderactor export surface: grep-verified from blockcompiler + hypervisoractor + typesystem (§3.1)
- Open items: ensureRenderActorReady/startRenderActor bootstrap path (who calls them — verify at execution); hypervisor enqueuer wrapper module naming (blockcompiler's access path)
