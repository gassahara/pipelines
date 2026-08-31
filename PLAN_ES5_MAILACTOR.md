# BLUEPRINT: ES5 Remediation + Mail-Actor Refactor (shared-functions/pipelines)
Derived From: ANALYSIS_ITER0.md (proposals P-1..P-7; P-8/P-9 deferred)
Generated: 2026-08-31

## 1. TARGET ARCHITECTURE
- All 28 js/ files: ES5 syntax (var, function expressions, require/module.exports, no import/export, no const/let, no arrows, no async/await syntax, no optional chaining, no spread, no template literals, no destructuring, no default params, no shorthand, no computed keys, no Map, no Number.isInteger, no .find, no .startsWith).
- Messaging: Mail Actor (mailactor.js) is the sole broker. Envelope = { id, recipient, sender, tag, unread, timestamp, payload } pure data. Kernel supports mailboxType 'mail' with a dedicated polling loop. All actors except dbactor/mailactor use 'mail'. Wrappers (enqueue*) preserve caller-visible promise interface via awaitResponse; internal control flow uses callbacks/timers and promise chains (no async/await syntax).
- renderactor.js: corruption removed (full rewrite from valid copy-B), dynamic import hoisted to top-level require, circular dependency resolved via actor-registry late binding.

## 2. CONTRADICTION RESOLUTION (recorded at blueprint level)
- ES5 plan Phase 2c mandates "async/await AND Promise → CPS". Mail-actor analysis §5.3/§8 mandates "enqueue functions return awaitResponse(...) promises" and "preserves the original Promise interface for callers".
- Resolution: async/await SYNTAX is removed everywhere (the ES5 parser blocker). Promise objects are RETAINED ONLY at the wrapper/broker surface mandated by the mail-actor acceptance criteria (awaitResponse, enqueue*, kernel waitforemptymailbox, callwithstack contract). Internal loops/polling become timer/recursion-based. Rationale: the mail-actor analysis is the newer, more specific target architecture for messaging; the ES5 plan governs syntax. Documented for user review.

## 3. WAVE MAPPING (dependency-leaf-first)

### Wave 1 — Foundation (storage + kernel + broker)
- evalstack.js, callwithstack.js, actorkernel.js, dbactor.js, mailactor.js
- Proposals: P-3 (module/keyword/syntax), P-4 (async syntax removal, promise chains kept)
- Files are leaf-ish: evalstack/callwithstack import nothing; actorkernel imports actorgc+verbosity (converted); dbactor imports actorkernel+verbosity; mailactor imports actorkernel+dbactor+verbosity.
- Gate: all five pass node --check (CJS); grep gates (no import/export/const/let/=>/async/await/?./`/...); require-load test for each.

### Wave 2 — Loadability + Corruption Fix (WI-1, WI-2, WI-11)
- worldmapactor.js, renderactor.js (FULL REWRITE = P-1), typesystem.js
- After this wave: `require('./js/utils.js')` and `require('./js/context.js')` MUST load (WI-2 resolved).
- renderactor rewrite: take valid copy-B (L141-706), strip prose/fence, ES5-convert, hoist `var hypervisoractor = require('./hypervisoractor.js')`, late-bind via registry.
- Proposals: P-1, P-2, P-3, P-4.

### Wave 3 — Consumers
- debugformatter.js, apiactor.js, debugactor.js, executionactor.js, hypervisoractor.js, blockcompiler.js
- Proposals: P-3, P-4.

### Wave 4 — Factory
- colorutils.js, closureconsolidator.js, stylizerutilities.js, layoutdirectives.js (P-6 injection factory), freevarparser.js, dnaserializer.js
- Proposals: P-3, P-5 (loops → functional-recursive, trampoline for parsers), P-6.

### Wave 5 — Mail Hardening + Final Verification (P-7, WI-8, WI-9)
- Remove resolve/reject from message objects across all actors; enqueue* → sendInstruction + awaitResponse wrappers; confine enqueueDb* to mailactor/dbactor; final acceptance criteria run.
- Proposals: P-7.

### Deferred (flagged, not executed this cycle)
- P-8 (appinit.js scope — file outside this repo), P-9 (git corruption — git tools forbidden).

## 4. PROPOSAL COVERAGE
| Proposal | Plan Element | Wave | File(s) |
|----------|--------------|------|---------|
| P-1 | renderactor full rewrite (corruption + hoist + ES5) | 2 | js/actors/renderactor.js |
| P-2 | typesystem/worldmapactor first (loadability) | 2 | js/typesystem.js, js/actors/worldmapactor.js |
| P-3 | ES5 syntax pass | 1-4 | all remaining ES6 files |
| P-4 | async syntax removal (chains/callbacks retained) | 1-3 | kernel/mail/actors/blockcompiler |
| P-5 | loops → functional-recursive + trampoline | 4 | factory files |
| P-6 | stylizer injection factory | 4 | js/factory/layoutdirectives.js |
| P-7 | resolve/reject removal + wrapper migration + DB confinement | 5 | all actors + mailactor |
| P-8 | appinit scope | DEFERRED | (outside repo) |
| P-9 | git corruption decision | DEFERRED | (git forbidden) |

## 5. VERIFICATION GATES (per wave)
1. `node --check <file>` (CJS parse) — exit 0.
2. Grep gate per file: zero matches for `^\s*import|^\s*export|\bconst\s|\blet\s|=>|\basync\s|\bawait\s|\?\.` (patterns applied without regex tooling; via grep -E).
3. require-load test: `node -e "require('./js/<file>.js')"` where safe (no document/window at module scope).
4. Wave 2 extra gate: utils.js + context.js load.
5. Final wave gate: P-7 acceptance criteria (no function-valued fields in envelopes; enqueue* return promises; logs route SEND/POLL through Mail Actor).

## 6. RISKS
- actorkernel async removal is the highest-risk change (kernel runtime). Mitigation: keep promise chains and timer recursion identical to current control flow; verify with node --check + load tests per wave.
- mailactor top-level await (L144) cannot exist in CJS — restructure to synchronous initial state + async restore-merge after load.
- renderactor rewrite must preserve the full export surface (copy-B exports at L692-706).
