# ANALYSIS: ITER2 — Proposal Appendix (full detail for FORMALIZATION)
Generated: 2026-08-31
Derived From: ANALYSIS_ITER1.md rev 2 (taxonomy, 18 WIs), ANALYSIS_ITER0.md (P-1..P-9)
Status: READ-ONLY — no source writes this iteration
Purpose: supply the mandatory §9.1 Proposal Appendix (transformation steps, invariants, edge cases) so FORMALIZATION can derive full BNF per proposal.

## 1. PROPOSAL SET
| Proposal | Type | Work Items | Files | Summary |
|----------|------|------------|-------|---------|
| P-1 | PRIMARY | WI-T4 | js/actors/renderactor.js | Full rewrite: corruption removed, ES5, tag-based mail wrappers, NO hypervisoractor import |
| P-2 | PRIMARY | WI-T16, WI-T17, WI-T1, WI-T5 | js/typesystem.js, js/actors/worldmapactor.js, js/utils.js, js/context.js | Restore loadability bottom-up (typesystem + worldmapactor first) |
| P-3 | PRIMARY | all WI-T* | all remaining ESM files | ESM purge: import/export→module.exports; const/let→var; arrows→function; ES6 syntax→ES5 |
| P-4 | PRIMARY | WI-T1, T7, T9, T10 | typesystem, executionactor, hypervisoractor, blockcompiler | async/await→CPS (promise chains/callbacks), no async syntax |
| P-5 | PRIMARY | WI-T12, T13 | freevarparser, dnaserializer | loops→functional-recursive + trampoline |
| P-6 | PRIMARY | WI-T3, T2 | layoutdirectives, stylizerutilities | object-injection portable surface; createLayoutDirectives(stylizer) factory |
| P-7 | PRIMARY | WI-T5..T9 | all mail actors | tag-based wrappers (sendInstruction+awaitResponse), no resolve/reject embedded; apiactor tag bug fix (WI-T6) |
| P-8 | PRIMARY | WI-T0 + cycle fixes | js/factory/domqueryconstants.js (CREATE), renderactor, blockcompiler, hypervisoractor | shared-leaf extraction + cross-actor import purge (breaks both circular pairs) |
| P-9 | DEFERRED | — | (consumer app) | appinit.js scope — outside repo, BLUEPRINTS decision |
| P-10 | DEFERRED | — | .git/objects | git corruption — git tools forbidden this cycle |

## 2. PROPOSAL APPENDIX (DETAILED)

### Proposal P-1: renderactor.js full rewrite
- Type: PRIMARY | Work item: WI-T4
- Root cause: committed corruption (assistant prose L129-140 + markdown fence), four dropped function definitions (ensureTriggerObserver, scheduleGcCycle, triggerGcCycle, isTriggerRecipientLive), hypervisor coupling by dynamic import.
- Change signature: `renderactorES6Corrupt → renderactorES5(mail)` — module.exports surface per §3.1 of ITER1 rev 2 (grep-verified: blockcompiler L28-33, hypervisoractor L33-37, typesystem L1).
- Pre-condition: none (file is broken).
- Post-condition: CJS parse OK; zero ESM syntax; zero dynamic import; no hypervisoractor module import; all enqueue* are tag-based wrappers (sendInstruction('renderactor', type, payload, tag, 'system') → awaitResponse('system', tag)).
- Invariants: export names unchanged (27 render + 3 hypervisor-consumed + DOMQUERY consts); DOMQUERY consts sourced from domqueryconstants.js but still re-exported; trigger GC lifecycle defined internally; hypervisor interaction via sendInstruction to 'hypervisoractor' only.
- Transformation steps: (1) create full ES5 file via write_file; (2) define trigger-GC functions (ensureTriggerObserver, scheduleGcCycle, triggerGcCycle) as internal functions; (3) isTriggerRecipientLive → sendInstruction-based mail query; (4) DOMQUERY arrays imported from leaf + re-exported; (5) delete getHypervisorModule entirely.
- Side-effect/I-O: none added (same DOM + mail + DB persistence behaviour); purity unchanged.
- Edge cases: document undefined → skip DOM functions; MutationObserver absent → setInterval fallback; element-not-found → rejectMsg path preserved.

### Proposal P-2: loadability restoration (bottom-up)
- Type: PRIMARY | Work items: WI-T16, WI-T17, WI-T1, WI-T5
- Root cause: utils.js requires typesystem.js (ESM); context.js requires worldmapactor.js (ESM) → converted set unloadable.
- Change signature: `ESMdeps → CJS` for typesystem.js and worldmapactor.js (in that order).
- Pre: typesystem.js, worldmapactor.js are ESM.
- Post: `require('./js/utils.js')` and `require('./js/context.js')` succeed; whole converted set loads.
- Invariants: exported symbol names unchanged; no import/export remaining in the two files; typesystem imports domqueryconstants (leaf), never renderactor.
- Transformation steps: (1) WI-T0 creates domqueryconstants.js; (2) rewrite typesystem.js (P-3+P-4+P-8 combined); (3) rewrite worldmapactor.js (P-3+P-7); (4) load-test utils+context.
- Edge cases: typesystem Map/Number.isInteger → plain object / Math.floor(v)===v in same pass.

### Proposal P-3: ESM purge (syntax conversion, all remaining files)
- Type: PRIMARY | Work items: all WI-T*
- Signature: `ES6Source → ES5Source` — import/export → require/module.exports; const/let → var; arrows → function expressions; ?. → && chains; spread → slice/assign loops; template literals → concat; default params → undefined-guards; destructuring → explicit vars; shorthand → explicit; Map → object; Number.isInteger → Math.floor(v)===v; .find → .filter()[0]; .startsWith → .indexOf()===0; catch{} → catch(e).
- Pre: file is valid ESM.
- Post: CJS parse OK; grep gate zero hits.
- Invariants: exported surface unchanged; behaviour identical.
- Transformation steps: per-file full rewrite via write_file (never patch), in bottom-up wave order (§8 of ITER1 rev 2).
- Edge cases: comments containing keywords must not trip the gate (gate greps code, banners reworded or removed).

### Proposal P-4: async/await → CPS
- Type: PRIMARY | Work items: WI-T1, T7, T9, T10
- Signature: `asyncFn → fn returning promise chain` (kernel/actor surface keeps Promise per blueprint §2; async SYNTAX removed).
- Pre: file contains async/await.
- Post: zero `async`/`await` tokens; control flow preserved via .then/.catch chains and setTimeout recursion.
- Invariants: error propagation via rejection chains; sequential awaits → sequential .then; parallel awaits → manual join counters.
- Transformation steps: rewrite each async function body into promise-chain form (pattern: blockcompiler awaits → .then(function(){...}) nesting or recursive CPS for loops).
- Edge cases: top-level await (mailactor L144 — already fixed in Wave 1) is a CJS blocker; any remaining top-level await must be restructured to sync-init + async-merge.

### Proposal P-5: loops → functional-recursive
- Type: PRIMARY | Work items: WI-T12, T13
- Signature: `imperativeLoop → map/reduce/filter/forEach|tailRec(trampoline)`.
- Pre: file contains for/while/do loops.
- Post: zero `for (`, `while (`, `do {` constructs per file.
- Invariants: same result; iteration order preserved where observable.
- Transformation steps: freevarparser/dnaserializer: convert index loops to reduce/recursive helpers; deep recursion wrapped in trampoline (function loop(){ return cond ? loop(next) : result; } with trampoline executor).
- Edge cases: early-exit loops (break) → some/recursive-with-flag; accumulator-dependent loops → reduce with compound accumulator.

### Proposal P-6: object-injection portable surface
- Type: PRIMARY | Work items: WI-T3, T2
- Signature: `stylizerutilities(closureState) → stylizerutilities(injectedHelpers)`; `layoutdirectives(imports) → createLayoutDirectives(stylizer)`.
- Pre: layoutdirectives.js imports StylizerCore/StylizerRewrite directly; both files close over module state.
- Post: portable functions receive dependencies as injected object functions; layoutdirectives has no import of stylizerutilities; consumers call createLayoutDirectives(stylizerObject).
- Invariants: rewritestyleattrs/applystylerules exported; cameltohyphen conversion preserved; DOMParser impurity stays isolated in stylizerutilities (Kleisli verdict).
- Transformation steps: (1) stylizerutilities: export pure functions taking (html, rules, helpers); (2) layoutdirectives: wrap body in factory function.
- Edge cases: consumers that imported StylizerCore directly must switch to factory call (audit at execution: only layoutdirectives imports it per earlier scan).

### Proposal P-7: tag-based mail wrappers (no resolve/reject)
- Type: PRIMARY | Work items: WI-T5..T9 (incl. WI-T6 apiactor bug)
- Signature: `enqueueX(...) → { var tag = generateTag(); sendInstruction(actorName, type, payload, tag, 'system'); return awaitResponse('system', tag); }`.
- Pre: actors embed resolve/reject in messages (except Wave-1 files).
- Post: no message/envelope contains function-valued fields; behaviors send responses via sendResponse(sender, tag, result); enqueue* return promises (awaitResponse).
- Invariants: envelope = { id, recipient, sender, tag, unread, timestamp, payload } pure data; JSON-serializable; WI-T6: sendInstruction recipient 'apiactor', awaitResponse recipient 'system' (fixes tag/tag collision).
- Transformation steps: rewrite each actor's wrapper block; update behavior handlers to use sendResponse for tagged messages.
- Edge cases: fire-and-forget internal messages (no awaitResponse); awaitResponse timeout; response-tag correlation; mailactor/dbactor memory mailbox unchanged.

### Proposal P-8: shared-leaf extraction + cross-actor import purge
- Type: PRIMARY | Work items: WI-T0 + cycle fixes
- Signature: `renderactor.DOMQUERY* → domqueryconstants.js`; `renderactor→hypervisoractor import → mail instruction`; `blockcompiler→hypervisoractor import → wrapper module access`.
- Pre: three files carry the cyclic/violating edges.
- Post: typesystem imports only interfaces; renderactor imports no actor module; blockcompiler imports no hypervisoractor module; no dynamic import anywhere.
- Invariants: DOMQUERY consts value-identical (frozen arrays); trigger forwarding semantics unchanged (mail-based).
- Transformation steps: (1) create domqueryconstants.js (WI-T0); (2) renderactor: replace import with mail sendInstruction + leaf consts; (3) blockcompiler: hypervisor enqueuers via wrapper/interface module (or mail), never module import; (4) hypervisoractor: render ping/start via mail wrappers or bootstrap injection.
- Edge cases: circular require at load time must be impossible post-rewrite (verify with load test in dependency order).

### Proposal P-9 / P-10 (deferred)
- P-9 appinit.js scope: file outside this repo; resolve location at BLUEPRINTS.
- P-10 git corruption: 11 corrupt loose objects; git tools forbidden; user decision required (repair/ignore).

## 3. PROPOSAL ACCEPTANCE CHECKLIST
| Proposal | Root cause addressed | Exact code | Atomic steps | Signature | I/O listed | Edge cases | Self-contained |
|----------|----------------------|------------|--------------|-----------|-----------|------------|----------------|
| P-1 | YES | YES (full rewrite) | YES | YES | YES | YES | YES |
| P-2 | YES | YES | YES | YES | YES | YES | YES |
| P-3 | YES | YES | YES | YES | YES | YES | YES |
| P-4 | YES | YES | YES | YES | YES | YES | YES |
| P-5 | YES | YES | YES | YES | YES | YES | YES |
| P-6 | YES | YES | YES | YES | YES | YES | YES |
| P-7 | YES | YES | YES | YES | YES | YES | YES |
| P-8 | YES | YES | YES | YES | YES | YES | YES |
| P-9 | DEFERRED | N/A | N/A | YES | YES | YES | YES |
| P-10 | DEFERRED | N/A | N/A | YES | YES | YES | YES |

## 4. VERIFICATION DIGEST
- Analysis artefacts: ITER0 (13 WIs, P-1..P-9), ITER1 rev 2 (taxonomy + 18 WIs), ITER2 (proposal appendix, this file)
- Proposals: 8 PRIMARY (P-1..P-8) + 2 DEFERRED (P-9, P-10)
- Work items: 18 (WI-T0..T17), all mapped to proposals
- Ready for: FORMALIZATION (full BNF per proposal)
