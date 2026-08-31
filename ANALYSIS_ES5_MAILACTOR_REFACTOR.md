# ANALYSIS: ES5 Remediation + Mail-Actor Messaging Refactor
Generated: 2026-08-31
Source SHA256: not computed (repo git object DB has 11 corrupt loose objects; see §State-Notes)

## 0. SCOPE & FILE ROSTER
- Repo root: /mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines
- 28 JS files under js/ (12 actors, 8 factory, 6 root, functorial/maybe, fundamental/domref)
- Workstream A: ES5 conversion (import/export → require/module.exports; const/let → var; arrows → function; async/await → CPS; loops → functional-recursive; stylizer injection; static-import audit)
- Workstream B: Mail-Actor messaging architecture (dedicated broker; tag-based request/response; no resolve/reject embedded in messages)

## 1. ES5 REMEDIATION PLAN (Workstream A — recorded from prior session plan)
### 1.1 Phase 1: Module System (All Files)
- Replace `import { X } from './foo.js'` with `var X = require('./foo.js').X`
- Replace `export ...` with `module.exports = { ... }` at bottom
- One dynamic import found: js/actors/renderactor.js L132 `import('./hypervisoractor.js')` inside getHypervisorModule — must be hoisted to top-level require(). NOTE: file is corrupted (see §3); the dynamic import sits inside an embedded-prose block.
- Execution order (dependency-leaf-first): maybe.js, domref.js → colorutils, closureconsolidator → stylizerutilities, layoutdirectives → freevarparser, dnaserializer, callwithstack, blockcompiler → actorregistry, trigerregistry, actorgc → worldmapactor, mailactor, apiactor → dbactor, debugactor, renderactor → actorkernel, executionactor, hypervisoractor → evalstack, verbosity, utils, typesystem → debugformatter, context

### 1.2 Phase 2: ES5 Keyword & Syntax
- 2a: const/let → var (counts per file in prior plan; verify at execution time)
- 2b: arrow functions → function expressions (heaviest: context.js, evalstack.js, maybe.js, debugformatter.js, callwithstack.js, hypervisoractor.js 228-468, renderactor.js 340-687)
- 2c: async/await + Promise → CPS (blockcompiler.js 320-575, callwithstack.js, actorkernel.js 100-330, executionactor.js 371-552, hypervisoractor.js 372-414, mailactor.js 71-230, renderactor.js 268-687, typesystem.js 88-158, dbactor.js 428)
- 2d: spreads, `?.`, default params, destructuring, template literals, shorthand props/methods, computed keys, optional catch binding, Map, Number.isInteger, Array.find, String.startsWith — all → ES5 equivalents

### 1.3 Phase 3: Functional-Recursive Paradigm (160 loops)
- freevarparser.js (51), typesystem.js (26), stylizerutilities.js (22), dnaserializer.js (15), blockcompiler.js (9), colorutils.js (8), layoutdirectives.js (6), others low
- for → reduce/map/filter/forEach; while → tail-recursive helper; sequential async → recursive CPS; trampoline for deep parsers

### 1.4 Phase 4: Function Object Injection
- layoutdirectives.js currently directly imports StylizerCore/StylizerRewrite from stylizerutilities.js → wrap in createLayoutDirectives(stylizer) factory. Audit all consumers.

### 1.5 Phase 5: Static Imports Audit
- renderactor.js dynamic import → hoist to top-level require(); circularity resolution via actor registry or third module.

## 2. MAIL-ACTOR MESSAGING ANALYSIS (Workstream B — user-provided, added verbatim)

### 2.1 Existing Messaging Patterns
- Each actor module exports bespoke enqueue* functions that directly call its own singleton send method.
- Some actors use mailboxType: 'db' and provide mailboxStore objects wrapping enqueueDb* functions, causing mailbox operations to be processed by DB actor.
- This creates a feedback loop: the owning actor's polling loop depends on DB actor, and DB actor's own mailbox (memory) interleaves.
- The kernel has two polling implementations (drainMemory, drainDb) with the DB version flawed (sets running=false on empty, killing the loop).
- Request-response is implemented by embedding resolve/reject functions in messages; this is an anti-pattern that couples message data with callbacks and breaks serialization/persistence.

### 2.2 Consequences
- Hypervisor stops after first stage; pipeline execution halts.
- Enqueue functions return true instead of actual results (e.g., taskid), causing blockcompiler to fail.
- Actors are not properly isolated; they are coupled to storage.
- Maintenance is difficult due to scattered enqueue functions.

## 3. TARGET ARCHITECTURE: MAIL ACTOR + TAG-BASED REQUEST/RESPONSE
### 3.1 High-Level Components
- Mail Actor (mailactor.js) – dedicated message broker.
  - Persists message queues via DB Actor (enqueueDbStore/enqueueDbRestore).
  - Exposes two public operations:
    - sendInstruction(recipient, type, payload, tag?) – store an instruction.
    - requestUnreadMessages(recipient) – retrieve unread messages for a recipient, mark them read.
  - Internal envelope format: { id, recipient, sender, tag, unread, timestamp, payload }.
- Actor Kernel (actorkernel.js) – supports mailboxType: 'mail'.
  - For mail actors, send delegates to sendInstruction; no local mailbox.
  - Polling loop drainMail repeatedly calls requestUnreadMessages(actorName) and processes each envelope's payload.
  - No direct awaiting of actor messages; processing is fire-and-forget from the actor's perspective.
- Actors – all (except DB and Mail) use mailboxType: 'mail'.
  - They poll Mail Actor for instructions, process them, and send response messages with correlation tags.
  - They no longer export direct enqueue* functions that embed resolve/reject; instead they export thin wrappers that call sendInstruction and optionally return a promise backed by awaitResponse.
- DB Actor (dbactor.js) – remains storage-only.
  - Used by Mail Actor for persistence.
  - Not used for message transport by any other actor.
- Support/Frontend – blockcompiler, appinit, context consume the wrapper functions, which internally use Mail Actor and preserve original API where possible.

### 3.2 Correct Request/Response Pattern (No Actor Await)
Sending an Instruction:
- Caller generates a unique tag (correlation ID).
- Caller calls sendInstruction(recipient, type, payload, tag).
  - This sends a SEND message to Mail Actor with the envelope.
  - Mail Actor stores it in its state and persists.
  - The call returns immediately (or with a storage ack), not waiting for actor result.
- If the caller needs the result, it uses awaitResponse(recipient, tag, timeout) which polls Mail Actor until a response with matching tag arrives.

Actor Processing:
- Actor's drainMail loop pulls unread envelopes via requestUnreadMessages(actorName).
- For each envelope, it extracts payload, processes it.
- After completion, it sends a response: sendResponse(originalSender, originalTag, result)
  - Creates a new envelope with recipient = originalSender, tag = originalTag, payload = result.
  - The response is stored by Mail Actor and later retrieved by the caller's awaitResponse polling.

Important: No resolve/reject embedded in messages. Messages are pure data; no function references. Callers use awaitResponse as an external polling wrapper, not an actor await.

## 4. FULL MESSAGE FLOW DIAGRAM

```
+----------------+       sendInstruction(recipient, tag, payload)
|   Caller       | -------------------------------------------+
| (blockcompiler |                                            |
|  appinit, etc.)|                                            v
+----------------+                                  +---------+       +---------+
                                                    | Mail    | ----> | DB      |
                                                    | Actor   |       | Actor   |
                                                    +---------+       +---------+
                                                          ^                |
                                                          |                |
                              requestUnreadMessages(actorName)           |
                                                          |                |
+----------------+                                       |                |
|   Actor        | <-------------------------------------+                |
| (execution,    |                                                       |
|  hypervisor,   |                                                       |
|  render, etc.) |                                                       |
+----------------+                                                       |
       | process instruction, then sendResponse(sender, tag, result)    |
       +---------------------------------------------------------------+
                                                          |
                                                          v
                                                 +---------+
                                                 | Mail    |
                                                 | Actor   |
                                                 +---------+
                                                          |
                                                          v
                                                 +---------+
                                                 | Caller  |
                                                 | polls   |
                                                 | for tag |
                                                 +---------+
```

## 5. KEY FUNCTIONS SPECIFICATION
### 5.1 Mail Actor (mailactor.js)
- sendInstruction(recipient, type, payload, tag): creates envelope { id, recipient, sender: 'system' (or caller context), tag, unread:true, timestamp, payload: { type, ...payload } }; sends SEND to Mail Actor.
- requestUnreadMessages(recipient): sends POLL to Mail Actor; Mail Actor returns unread messages for recipient, marks them read.
- sendResponse(recipient, tag, result): creates response envelope { recipient, sender: actorName, tag, unread:true, payload: result }; sends SEND to Mail Actor.
- awaitResponse(recipient, tag, timeout): polls Mail Actor until response with matching tag arrives; returns Promise resolving with result.

### 5.2 Actor Kernel (actorkernel.js)
- mailboxType: 'mail' support.
- send for mail actors calls sendInstruction.
- drainMail loop (no local mailbox for mail type):
```javascript
while (running) {
  const envelopes = await requestUnreadMessages(actorName);
  for (const env of envelopes) {
    await processMessage(env.payload);
    // if behavior returns result and envelope.sender/tag exists, actor behavior should sendResponse
  }
  await delay(25);
}
```

### 5.3 Enqueue Function Wrappers (all actors)
Each existing enqueue function becomes:
```javascript
function enqueueExecutionSubmit(descriptor) {
  const tag = generateTag();
  sendInstruction('executionactor', 'execute_element', descriptor, tag);
  return awaitResponse('blockcompiler', tag);
}
```
This preserves the original Promise interface for callers while internally using the tag pattern.

## 6. FULL WORK ITEM LIST
| WI-ID      | File(s)                       | Description |
|------------|-------------------------------|-------------|
| WI-MAIL-1  | mailactor.js (CREATE)         | Implement Mail Actor with SEND/POLL/ACK and DB persistence; export sendInstruction, requestUnreadMessages, sendResponse, awaitResponse. |
| WI-MAIL-2  | actorkernel.js (UPDATE)       | Add mailboxType: 'mail'; implement drainMail polling loop; send routes through Mail Actor. |
| WI-MAIL-3  | apiactor.js (UPDATE)          | Migrate to mail mailbox; rewrite enqueueapi/enqueuefetch to use sendInstruction/awaitResponse; behavior sends responses with tags. |
| WI-MAIL-4  | debugactor.js (UPDATE)        | Migrate to mail mailbox; rewrite enqueue functions; behavior sends responses. |
| WI-MAIL-5  | executionactor.js (UPDATE)    | Migrate to mail mailbox; rewrite all enqueueExecution*; behavior sends responses; remove self-sending via direct message resolve. |
| WI-MAIL-6  | hypervisoractor.js (UPDATE)   | Migrate to mail mailbox; rewrite all enqueueHypervisor*; behavior sends responses. |
| WI-MAIL-7  | renderactor.js (UPDATE)       | Migrate to mail mailbox; rewrite all enqueue*/enqueueRender*; behavior sends responses. |
| WI-MAIL-8  | worldmapactor.js (UPDATE)     | Migrate to mail mailbox; rewrite updateworldmap/observeworldmap/unobserveworldmap; add getworldmap response. |
| WI-MAIL-9  | appinit.js (UPDATE)           | Start Mail Actor first; update actor startup pings to use new wrappers. |
| WI-MAIL-10 | blockcompiler.js (VERIFY)      | No changes needed if wrappers preserve API; verify return values. |
| WI-MAIL-11 | context.js (UPDATE)            | Update worldmap interaction to use new getworldmap wrapper if necessary. |
| WI-MAIL-12 | dbactor.js (UPDATE)            | Ensure no mailbox transport responsibilities; only storage. |
| WI-MAIL-13 | All other files (VERIFY)       | Ensure no direct calls to old ACTOR.send remain; all messaging through Mail Actor. |

## 7. DEPENDENCY GRAPH / IMPACT RADIUS
- Mail Actor depends on DB Actor for persistence.
- Actor Kernel depends on Mail Actor for mail mailbox.
- All actors depend on Actor Kernel and indirectly on Mail Actor.
- Blockcompiler, appinit, context depend on actor enqueue wrappers, which now go through Mail Actor.
- No actor directly imports enqueueDb* for mailbox; only Mail Actor does.
- No actor embeds resolve/reject in messages; all use tags and response messages.

## 8. ACCEPTANCE CRITERIA
- All actors (except DB and Mail) use mailboxType: 'mail'.
- All enqueue functions return awaitResponse(...) promises (or fire-and-forget for internal messages).
- No message contains function references; all data is serializable.
- Mail Actor persists to DB Actor only.
- Hypervisor and execution actor process messages from Mail Actor polling.
- blockcompiler can submit an element, receive taskid, and await task completion via tag correlation.
- No feedback loops; logs show Mail Actor handling SEND/POLL, not DB Actor.

---

## 9. STATE NOTES (verified 2026-08-31 — current repo vs. the two analyses)
1. Workstream B is PARTIALLY IMPLEMENTED already (uncommitted working tree + HEAD):
   - mailactor.js EXISTS (244 lines) with SEND/POLL/ACK, envelope {id, recipient, sender, tag, unread, timestamp, payload}, persistence via enqueueDbStore/Restore, exports sendInstruction/requestUnreadMessages/sendResponse/awaitResponse/generateTag. Still ES6 syntax.
   - actorkernel.js ALREADY has mailboxType 'mail': send() delegates to mailTransport.sendInstruction; a setInterval pollMailbox loop calls requestUnreadMessages(actorName) and auto-sends responses via sendResponse when envelope has sender+tag (L300-319). drainDb exists but re-polls; the "running=false kills loop" claim in §2.1 is stale relative to current file.
   - mailboxType scan: apiactor, debugactor, executionactor, hypervisoractor, renderactor, worldmapactor all already use 'mail'; dbactor='memory'; mailactor='memory' (avoids recursion).
   - enqueue* functions still embed resolve/reject and call .send() directly (e.g., executionactor exports ~19 enqueueExecution*); enqueueDb* still imported by 7 actor files (for state persistence, not mailbox).
2. Workstream A (ES5) is PARTIALLY DONE: 8 files already converted (context, utils, verbosity, actorgc, actorregistry, trigerregistry, maybe, domref) — uncommitted. utils.js and context.js currently FAIL to load (their requires target still-ESM typesystem.js / worldmapactor.js).
3. renderactor.js is CORRUPTED: lines 129-140 contain embedded assistant prose + a markdown fence ```javascript inside the file; committed at HEAD; fails ESM syntax check at line 134 ("Unexpected identifier 'brevity'"). The dynamic import at L132 (Phase 1/5 target) sits inside this corrupted block. Any edit to this file requires a full rewrite (write_file), not patch.
4. Git: 11 corrupt loose objects; one reachable (HEAD blob of js/functorial/maybe.js = 6a02eeba) — `git diff` fails while `git status` works. Other 10 unreachable. Requires a decision (fetch/repair/ignore) before reliable diff-based verification or push.
5. output.txt (354KB, gitignored) is the previous session's tool log, not a governance artefact.
6. appinit.js referenced by WI-MAIL-9 is NOT in this repo (likely lives in the consumer app; scope note for BLUEPRINTS).

## 10. VERIFICATION DIGEST
- Analysed files: 28 (all js/), plus repo-level git/output state
- Work items: Workstream A = 5 phases (per-file counts in prior plan, re-verify at execution); Workstream B = WI-MAIL-1..13
- Proposals: mail-actor architecture (user-provided, §3-§8); ES5 remediation (prior plan, §1)
- Open items for next phase: re-count ES5 violations per file (plan counts are stale vs. current tree); confirm appinit.js location; decide git corruption handling; renderactor.js full-rewrite prerequisite
