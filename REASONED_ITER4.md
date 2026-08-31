# REASONED_ITER4.md — REASONER VALIDATION OF ANALYSIS_ITER4 (global-vars refactor blueprint)
Mode: ANALYSIS-REASONER-CYCLE | Date: 2026-08-31 | Artefact: REASONED_ITER4.md
Scope: prove or refute every load-bearing claim in ANALYSIS_ITER4.md before FORMALIZATION.
Methods: static proof scripts (Node, /tmp/reasoner_proof1..5.js), read-only inspection. NO source writes, NO git, NO diff.

## 1. VERDICT SUMMARY
ANALYSIS_ITER4 is VALID with ONE structural correction: the MESSAGE registry must be
keyed by (owner, type), NOT bare type — three wire strings collide across actors
(proof 5). All other claims verified. Blueprint is ready for FORMALIZATION after the
correction below is absorbed.

## 2. PROOFS

### PROOF 1 — require-alias resolution: PASS (ALL 29 files)
Every `var X = require('src').member` and every `var M = require('src')` + `M.member`
use resolves to a top-level `function`/`var` declaration in the source program.
CONSEQUENCE: deleting all require header lines leaves every cross-program name defined
exactly once as a top-level global in its provider. The flat-globals transformation is
name-complete — no dangling references.
(False positives in the proof tool: require-line filename strings and comment text both
contain 'alias.' patterns — excluded by line filters, then clean.)

### PROOF 2 — deepmerge equivalence: PASS (22/22 cases)
worldmapactor L45 version vs context L19 version compared on 22 cases: disjoint merge,
nested merge, object-over-scalar, scalar-over-object, array target/source, null/
undefined/0/''/false target and source, deep nesting, key overwrite preserving siblings,
arrays inside objects, empty objects, deep arrays, deep null. ALL agree.
CONSEQUENCE: one shared global `deepmerge` in utils.js replaces both. Recommended single
implementation: the context variant (always returns a fresh object; worldmap's returns
the seed `target` object itself for empty patches — equal by value, copy is safer).

### PROOF 3 — DOMQUERY value identity: PASS
domqueryconstants.js and renderactor.js define DOMQUERYGETTERS (5 entries) and
DOMQUERYSETTERS (6 entries) with IDENTICAL values; DOMQUERYMESSAGES is derived identically
in both (`Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS))`). renderactor references
its local DOMQUERY* ONLY in the module.exports tail (L710-712).
CONSEQUENCE: renderactor L646-648 definitions are deleted; domqueryconstants is the single
source; zero reference updates needed.

### PROOF 4 — module.exports tails reference top-level declarations only: PASS
All 28 module.exports blocks are bare `NAME: NAME` entries mapping to top-level var/
function declarations. No anonymous exports.
CONSEQUENCE: deleting each tail leaves the exported names as real globals. (The 29th
file, domqueryconstants.js, exports the same way — counted in the 28; no file lacks a block.)

### PROOF 5 — wire-string collisions across actors: 3 COLLISIONS (the correction)
The registry cannot be keyed by bare type string:
  'recover'        — renderactor, debugactor, executionactor, hypervisoractor
  'ping'           — renderactor, debugactor, executionactor, hypervisoractor
  'register_pipeline' — executionactor, hypervisoractor
Same wire string, DIFFERENT interface specs per recipient. A bare-type-keyed registry
would silently overwrite (last registration wins) — the exact failure mode the registry
exists to prevent.
CONSEQUENCE (CORRECTION to ITER4 §3.2): the registry is OWNER-SCOPED:
  MESSAGEREGISTRY.register(owner, type, iface, handler)
  MESSAGEREGISTRY.getInterfaces(owner)  -> {type: iface} map (feeds existing validator)
  MESSAGEREGISTRY.validate(owner, type, message)
  MESSAGEREGISTRY.getHandler(owner, type)
The TYPES union global (window.MESSAGETYPES) remains a pure name→string constant map;
duplicate keys (RECOVER, PING, REGISTER_PIPELINE appear in several actors) collapse
benignly because they map to the SAME string value everywhere.

## 3. CORRECTED REGISTRY INTEGRATION (replaces ITER4 §3.2)
- NEW js/messageregistry.js (L0 leaf, depends on nothing): defines window.MESSAGEREGISTRY
  (registry, owner-scoped) and window.MESSAGETYPES (union of all type constants:
  renderactor 33 + apiactor 2 + mail 3 + db 4 + debug 5 + execution 16 + hypervisor 26 +
  worldmap 5 = 94 constant names; 3 string values shared across owners by design).
- Each actor program: DELETE local `var <X>MESSAGETYPES` + `var MESSAGEINTERFACES`;
  at load (after behavior definition), register each type:
    MESSAGEREGISTRY.register('renderactor', MESSAGETYPES.RENDER, {elementid:'string'}, renderbehavior);
    ... one call per type, then:
    createactor(renderbehavior, initialState, MESSAGEREGISTRY.getInterfaces('renderactor'));
- actorkernel: ZERO changes — createMessageValidator receives the owner's interface map
  exactly as today; the map now comes from the registry instead of a local constant.
  Kernel contract preserved byte-for-byte ({valid, error, type}).
- The registry's getHandler(owner, type) pairs the message type with its trigger (the
  behavior function) — the "global registry (and interface) for the message types and
  their triggers" as directed. Dispatch stays behavior(message) via the kernel.
- initialState: the ONLY rename (executionInitialState / renderInitialState; lazy refs
  in renderactor: expectelement, setRenderActor, ensureTriggerObserver).
- deepmerge: shared global in utils.js (context-variant semantics).
- DOMQUERY*: renderactor L646-648 deleted; domqueryconstants single source.

## 4. LOAD-ORDER CORRECTION (registry join)
messageregistry.js at L0 (before actorkernel L1 — kernel consults it at createactor
call time, which happens at actor load L4+, so L0 placement is safe even for
createMessageValidator construction).
Manifest otherwise unchanged; 3 ordering constraints re-verified:
actorregistry BEFORE domref; worldmapactor BEFORE context; renderactor BEFORE blockcompiler.

## 5. RISK REGISTER (residual, for FORMALIZATION/EXECUTION)
1. Behavior bodies may reference their local MESSAGEINTERFACES/MESSAGETYPES beyond the
   kernel call — per-file grep during EXECUTION (expected: none; behaviors switch on
   message.type strings, not maps).
2. worldmap's plain string vars (UPDATE etc., not a frozen object) fold into the union —
   its sendInstruction calls use the constants; after refactor they resolve to the union
   global. Verify per reference.
3. `frames` (evalstack L34) is captured once at load — reference semantics identical
   under the global (aliases were the same reference); no change.
4. The registry register() calls execute at actor load — the bootloader's per-type
   assertion (decision C) proves registration happened: after loading apiactor, assert
   MESSAGEREGISTRY.getInterfaces('apiactor').API exists.
5. verbosity.js functions (createVerbosityConstants, log*, getverbosity) are top-level
   decls today (proof 1) — the module.exports tail is the only deletion; consumers' alias
   lines vanish; calls become bare global calls.

## 6. CONCLUSION
Blueprint VALID, one correction absorbed (owner-scoped registry, proof 5). All 5 proofs
green. Ready for FORMALIZATION when directed.
