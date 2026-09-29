# FRAMEWORK — DEV REFERENCE

> **Audience.** Authors of the framework itself.
> **Companion documents.** `framework-user-ref.md` (how to *use* the
> constructs), `frontend-dev-ref.md`, `frontend-user-ref.md`.
> **Scope.** How each construct is built, in which file, at which
> function, and (where visible in the loaded artefacts or in runtime
> tracebacks) at which line.

This document describes the internal construction of the FRAMEWORK
package. It is the reference for anyone editing the framework, extending
it, or understanding a runtime traceback.

---

## F-1. PIPELINES

### Construct

A pipeline is a value of the shape:

```javascript
{
  type: 'shell' | 'oracle' | ...,
  name: string,
  libs: [ { src, provides } ],
  programs: [ { src, provides } ],
  elements: [ STAGE | BLOCK | PIPELINE, ... ],
  env: object,
  compileonly: boolean,
  pending: Promise|null,
  compilerconstants: { blocktypes, inheritedkeys, analyzers, compilers },
  dnaconstants: object,
  compileroptions: object
}
```

### Built by

`pipeline(type, name, options)` in `js/factory/blockcompiler.js` §1.

### Semantics

- `env` is the pipeline's sole state object. It is created once at
  construction and mutated in place throughout the pipeline's lifetime
  (invariant established by P-AR, refined by P-AV).
- `compileonly` selects between two execution paths:
  - `false` — blocks execute at append time (via `appendblock`'s
    trigger); `run(p, options)` then reduces to resource loading plus a
    structural walk for EVENT and PIPELINE elements.
  - `true` — blocks execute during the walk performed by
    `run(p, options)`.
- `pending` chains the append-time execution of blocks in textual order.
- `compilerconstants` carries the per-type compilers and analysers
  resolved at construction.
- `compileroptions` holds the options passed to the pipeline; used later
  by `compileblock` and the trigger path.

### Where implemented

| Concern | File | Function / site |
|---|---|---|
| Construction | `js/factory/blockcompiler.js` | `pipeline()` (§1) |
| Env initialisation | `js/factory/blockcompiler.js` | `env: opts.baseenv \|\| {}` in `pipeline()` |
| Env mutation on block execution | `js/factory/blockcompiler.js` | `createpersistentelementwrapper` (tail: `execenv[k] = mapped[k]`) |
| Env threading through the walk | `js/factory/blockcompiler.js` | `orchestratepipeline`, `orchestratestage` (env param) |
| Env inheritance for child pipelines | `js/factory/blockcompiler.js` | `processpipelineelement.innerfn` (P-AV) |
| Pending chain | `js/factory/blockcompiler.js` | `appendblock` |

### Rationale

The env-as-single-object invariant keeps the pipeline a Kleisli morphism
chain: each block is `env -> Promise<env>`, and the pipeline as a whole
composes them. Under P-AV, nested pipelines inherit the caller's env by
reference at child-creation time.

---

## F-2. STAGES

A stage is a value of the shape:

```javascript
{ element: 'STAGE', id: string, control: object|null, elements: [ ... ] }
```

Built by `makestage(id, control)` in `js/factory/blockcompiler.js` §1.

The stage's kind is determined by `control.command`:

| Kind | Discriminator | Purpose |
|---|---|---|
| NULL | `control === null` | walk elements unconditionally during the current walk |
| EVENT | `control.command === 'EVENT'` | register a DOM listener; walk elements on firing |
| LOOP | `control.command === 'LOOP'` | iterate elements per the control's `fn` |

The unified dispatcher `runstage(stage, pipelinename, stagepath, env, options, runblocks)` in `js/factory/blockcompiler.js` §4 dispatches by kind at every depth.

### F-2.1 NULL stages

**Parameters.** None — `control === null`.

**Semantics.** The stage's elements are walked in order during the
current walk. Each BLOCK executes (subject to `runblocks`); each nested
STAGE dispatches via `runstage`; each PIPELINE element constructs and
runs its child.

**Async variant.** `control === null` and `stage.async === true` — the
stage's elements are walked via `callwithstack` in an async branch,
allowing the enclosing walk to proceed without awaiting.

**Where implemented.**

| Concern | File | Function |
|---|---|---|
| Dispatch | `js/factory/blockcompiler.js` | `runstage`, NULL branch |
| Element iteration | `js/factory/blockcompiler.js` | `orchestratestage` |
| Async branch | `js/factory/blockcompiler.js` | `runstage`, `stage.async === true` case |

### F-2.2 EVENT stages

**Parameters.**

```javascript
{
  command: 'EVENT',
  sourceid: string,    // DOM element id
  event: string        // 'click' | 'change' | 'input' | ...
}
```

**Semantics.** At walk time, `runstage` calls
`registereventstage(stage, pipelinename, stagepath, env, options)`, which
sends a `REGISTEREVENTLISTENER` message to RENDERACTOR. The stage's
elements are **not** walked at this point.

At firing time, RENDERACTOR's global event observer emits
`EVENTTRIGGERED` with the compiled stage value, the env reference, and
options. HYPERVISOR's handler invokes
`orchestratestage(MESSAGE.STAGE, PIPELINEID, MESSAGE.ENV,
MESSAGE.STAGEPATH, MESSAGE.OPTIONS, true)`, walking the stage's elements
against the env by reference.

**Where implemented.**

| Concern | File | Function |
|---|---|---|
| Dispatch | `js/factory/blockcompiler.js` | `runstage`, EVENT branch |
| Registration emitter | `js/factory/blockcompiler.js` | `registereventstage` |
| Registration receiver | `js/actors/renderactor.js` | `HANDLERS[REGISTEREVENTLISTENER]` |
| DOM observer installation | `js/actors/renderactor.js` | `ENSUREEVENTOBSERVER` |
| Firing emitter | `js/actors/renderactor.js` | the observer's `HANDLER` |
| Firing receiver | `js/actors/hypervisoractor.js` | `HYPERVISORBEHAVIOR.EVENTTRIGGERED` case (P-BA) |

**Rationale.** The registration carries the compiled stage value and
the env reference. On firing, the walker runs the received stage
directly. No STAGEID-based lookup occurs.

### F-2.3 LOOP stages

**Parameters.**

```javascript
{
  command: 'LOOP',
  fn: function(properties, state, loopcount) -> boolean,
  inputs: [ name, ... ]
}
```

**Semantics.** `runstage` calls
`runloop(stage, pipelinename, stagepath, env, options, 0, runblocks)`.
Each iteration:

1. resolves `state = { k: env[k] for k in control.inputs }`;
2. invokes `control.fn(control, state, loopcount)` — the control object
   serves as the `properties` argument;
3. if the fn returns falsy, the loop terminates and the current env is
   returned;
4. otherwise, the stage's elements are walked once, then the loop
   recurses with `loopcount + 1`.

**Where implemented.**

| Concern | File | Function |
|---|---|---|
| Dispatch | `js/factory/blockcompiler.js` | `runstage`, LOOP branch |
| Iteration | `js/factory/blockcompiler.js` | `runloop` |
| Termination | `js/factory/blockcompiler.js` | `if (!proceed) return Promise.resolve(env)` inside `runloop` |

**Termination responsibility.** The framework iterates until
`control.fn` returns falsy. Program authors are responsible for
providing a terminating condition. The yj LOOP stages use
`loopcount >= 5` (recipeloop), `inglen > 0` (ingloop), `havenames > 0`
(havenamescond).

---

## F-3. BLOCKS

A block is a value of the shape:

```javascript
{
  element: 'BLOCK',
  id: string,
  type: 'fn' | 'writer' | 'api' | 'fetch' | 'io'
        | 'domquery' | 'crypto' | 'wait' | 'executionquery',
  behaviour: function,
  inputs: [ name, ... ],
  outputs: { name: type, ... },
  deps: [ name, ... ],
  ... other per-type fields
}
```

Built by `makeblock(id, type, behaviour, attrs)` in
`js/factory/blockcompiler.js` §1.

Per-type compilers live in `createblockcompilers` in
`js/factory/blockcompiler.js` §3, keyed by `blocktypes`.

| Type | Builder | Behaviour signature | Notes |
|---|---|---|---|
| `fn` | `compilers.fn` → `compilefnblock` (in `js/factory/fnblock.js`) | `(inputs, deps, properties) -> any` | purity analysis via `analyzefnblock` |
| `writer` | `compilers.writer` | `(inputs, deps, properties) -> { id, timeout, html }` | renders HTML into an element |
| `api` | `compilers.api` → `compilehttpblock` | (no behaviour; uses `endpoint` / `method` / `mapping`) | POST to APIBASE |
| `fetch` | `compilers.fetch` → `compilehttpblock` | (no behaviour; same shape as `api`) | textual fetch |
| `io` | `compilers.io` | `(inputdata, env) -> any` | DOM-free I/O |
| `domquery` | `compilers.domquery` | (no behaviour; uses `command.COMMAND` / `command.properties`) | proxies to RENDERACTOR |
| `crypto` | `compilers.crypto` | (no behaviour; uses `bytes`) | proxies to RENDERACTOR |
| `wait` | `compilers.wait` | (no behaviour; uses `ms`) | `setTimeout` delay |
| `executionquery` | `compilers.executionquery` | (no behaviour; uses `command.COMMAND` / `command.args`) | proxies to EXECUTIONACTOR |

### Fields

| Field | Meaning |
|---|---|
| `inputs` | array of names; each name is resolved against env; keys become the behaviour's `inputs` bag |
| `outputs` | object of name -> type; the framework extracts the values under these keys from the behaviour's return value and writes them into env |
| `deps` | array of names; each name is resolved against the global scope (window / globalThis) |
| `allowundefinedinputs` | optional; when `true`, the framework's required-inputs guard does not fire |
| `targetlabel` (writer) | the id of the element the writer targets |
| `replace` (writer) | if `true`, replaces content; otherwise appends |
| `command` (domquery, executionquery) | `{ COMMAND, properties }` or `{ COMMAND, args }` |
| `endpoint`, `method`, `mapping` (api / fetch) | HTTP parameters |

### Where implemented

| Concern | File | Function |
|---|---|---|
| Block value | `js/factory/blockcompiler.js` | `makeblock` |
| Per-type compiler registry | `js/factory/blockcompiler.js` | `createblockcompilers` |
| Injection of resolved inputs / deps | `js/factory/blockcompiler.js` | `buildblockproperties` |
| Apply | `js/factory/blockcompiler.js` | inside each compiler's `innerfn`; for `fn`, via `compilefnblock` |
| Purity analysis (fn / writer only) | `js/factory/fnblock.js` | `analyzefnblock`, `assertdefinedinputs` |

---

## F-4. MESSAGES (MAILBOX SYSTEM)

### Message shape

Flat envelope:

```javascript
{
  TYPE: string,        // uppercased
  SENDER: string,      // actor name or 'system'
  TAG: string,         // correlation id
  RESPONSESPEC: { responsetype: string } | undefined,
  CONTEXT: object | undefined,
  ... payload fields, uppercased
}
```

### Vocabulary

`MESSAGETYPES` in `js/messageregistry.js` — a frozen object with one
entry per message name (e.g. `EVENTTRIGGERED: 'EVENTTRIGGERED'`,
`EXECUTEELEMENT: 'EXECUTEELEMENT'`, `TASKRESULT: 'TASKRESULT'`).

`MAILBOXFILTERTYPES` — the subset of types that can satisfy a
`WAITFORMAILBOX` expectation (responses: `RESPONSE`, `APIRESULT`,
`FETCHRESULT`, `TASKRESULT`, `DOMRESULT`, `DBRESULT`,
`EVENTLISTENERREGISTERED`, `SCRIPTLOADED`).

### Public API

| Function | Purpose |
|---|---|
| `GENERATETAG()` | return a fresh correlation tag |
| `SENDINSTRUCTION(recipient, type, payload, tag, sender, responsespec, context)` | deliver an instruction |
| `SENDRESPONSE(recipient, tag, result, sender, responsetype)` | send a response; wraps `{ RESULT: result }` |
| `QUERYMAILBOX(filter)` | non-blocking read of matching envelopes; marks them READ |
| `WAITFORMAILBOX(filter, timeout)` | promise; resolves on a matching envelope or rejects on timeout |
| `MAILGETACTIONSTATUS(id)` | non-blocking query for the status of an action |

### Where implemented

| Concern | File |
|---|---|
| Mailbox storage (envelope array; indices by tag / sender / type) | `js/actors/mailactor.js` |
| Message routing (SEND -> DISPATCHTOACTOR) | `js/actors/mailactor.js` `MAILBEHAVIOR` |
| Expectation registry | `js/actors/mailactor.js` (`EXPECTATIONS`, `CREATEEXPECTATION`, `RESOLVEEXPECTATION`, `REJECTEXPECTATION`) |
| Message vocabulary | `js/messageregistry.js` |
| Per-actor interface map | `js/messageregistry.js` `MESSAGEREGISTRY`; registrations in `js/registerconsumers.js` |

### Convention

Writers emit uppercase keys. Readers read uppercase keys. No
case-aliasing is performed.

---

## F-5. ACTORS

### Actors present

| Actor | File | Behaviour |
|---|---|---|
| `MAILACTOR` | `js/actors/mailactor.js` | mailbox, expectations |
| `WORLDMAPACTOR` | `js/actors/worldmapactor.js` | env storage, update dispatch, persistence |
| `APIACTOR` | `js/actors/apiactor.js` | HTTP `api` / `fetch` execution |
| `RENDERACTOR` | `js/actors/renderactor.js` | DOM operations, event observation, script loading |
| `EXECUTIONACTOR` | `js/actors/executionactor.js` | element task scheduling |
| `DEBUGACTOR` | `js/actors/debugactor.js` | error overlay, log viewer |
| `DBACTOR` | `js/actors/dbactor.js` | localStorage persistence |
| `HYPERVISORACTOR` | `js/actors/hypervisoractor.js` | pipeline registry, event firing walk entry (P-BA) |

### Actor contract

```javascript
BEHAVIOR(ENV, MESSAGE) -> ENV | Promise<ENV>
```

Registered per actor via
`MESSAGEREGISTRY.register(owner, type, iface, handler)` in
`js/registerconsumers.js`. The actor kernel dispatches:

```javascript
DISPATCHTOACTOR(actorName, behavior, message) {
  var currentEnv = GETACTORSTATE('WORLDMAPACTOR');
  var result = behavior(currentEnv, message);
  if (result && typeof result.then === 'function') {
    return result.then(function(newEnv) {
      SETACTORSTATE('WORLDMAPACTOR', newEnv);
      return newEnv;
    });
  }
  SETACTORSTATE('WORLDMAPACTOR', result);
  return result;
}
```

### Where implemented

| Concern | File | Function |
|---|---|---|
| Actor kernel | `js/actors/actorcore.js` | `DISPATCHIMMUTABLE`, `DISPATCHTOACTOR`, `REGISTERACTORSTATE`, `GETACTORSTATE`, `SETACTORSTATE` |
| Env slice helper | `js/actors/actorcore.js` | `ENSUREENVSLICE` |
| Message validator | `js/actors/actorcore.js` | `CREATEMESSAGEVALIDATOR` |
| Actor handle surface | `js/actors/actorcore.js` | `CREATEACTORHANDLE` (SUBMIT / EXPECT / GETACTIONRESULT) |
| Registrations | `js/registerconsumers.js` | one block per actor / type |

---

## F-6. ELEMENT COMPILATION

### What an element is

A stage's `elements` array contains one of:

- a BLOCK value,
- a nested STAGE value,
- a PIPELINE element (a stage-spawn descriptor).

### Per-element dispatch

`orchestratestage` (`js/factory/blockcompiler.js` §4) walks
`stage.elements` and dispatches on `elementdef.element`:

| Element kind | Handling |
|---|---|
| `'BLOCK'` | `processelement` -> `compileblock` -> `compilers[type]` -> `createpersistentelementwrapper` -> SENDINSTRUCTION EXECUTEELEMENT to EXECUTIONACTOR |
| `'PIPELINE'` | `processpipelineelement` -> resolve childstate thunk -> inherit env (P-AV) -> `run(childstate, childoptions)` |
| `'STAGE'` | `processnestedstage` -> delegates to `runstage` (P-BA) |

### Execution flow for a block (fn / writer)

1. `buildblockproperties(merged, inherited, sig, env)` resolves inputs
   (env) and deps (global) into bags.
2. The behaviour is invoked with `(inputs, deps, properties)`.
3. The return value is mapped by the declared output keys via
   `mapoutputs`.
4. Each mapped value is written into env under its key.

### Where implemented

| Concern | File | Function |
|---|---|---|
| Block compilation | `js/factory/blockcompiler.js` | `compileblock` |
| Element wrapping | `js/factory/blockcompiler.js` | `processelement`, `createpersistentelementwrapper` |
| Env write-back | `js/factory/blockcompiler.js` | `createpersistentelementwrapper` tail |
| Output extraction | `js/factory/fnblock.js` | `mapoutputs` |
| Task scheduling | `js/actors/executionactor.js` | `RUNELEMENTTASK` |
| Fn apply | `js/factory/fnblock.js` | `compilefnblock` -> `fn.apply(null, [inputs, deps, properties])` |

---

## F-7. VAR VALUE PASSING (INPUTS / OUTPUTS CHAINING)

### Contract

The env is the sole carrier of inter-block values within a pipeline. A
block's contribution to the env is its return object, mapped by its
declared `outputs`. A block's read of env is its `inputs`, resolved by
the framework at apply time.

### Producer side

The behaviour's returned object is walked by
`mapoutputs(result, outputkeys)`. For each `key` in `outputkeys`, the
value `result[key]` is written into `execenv[key]`. If
`result[key] === undefined`, `mapoutputs` raises a hard error.

### Consumer side

`buildblockproperties` iterates `io.inputs`. For each name `k`, it
evaluates `compilepathaccessor(k)(env)` and writes the result to
`inputsobj[k]`. The behaviour receives `inputsobj` as its first
parameter.

### Assertion

Unless `merged.allowundefinedinputs === true`, `assertdefinedinputs`
runs first: for each declared input, if `env[k] === undefined`, it
collects `k` into a missing list and throws
`[BLOCK_INPUT_UNDEFINED]` after the walk.

### Cross-reference

| Direction | File | Function |
|---|---|---|
| Producer | `js/factory/blockcompiler.js` | `createpersistentelementwrapper` (tail), `mapoutputs` |
| Consumer | `js/factory/blockcompiler.js` | `buildblockproperties` |
| Input guard | `js/factory/fnblock.js` | `assertdefinedinputs` |
| Path resolution | `js/factory/blockcompiler.js` | `compilepathaccessor` |
| Dep resolution | `js/factory/blockcompiler.js` | `buildblockproperties` (deps branch) |

### Deps vs inputs

`inputs` are resolved against env (the pipeline's state). `deps` are
resolved against the global scope (window / globalThis) at apply time.
Deps are the framework's designated channel for functions and other
globals that block behaviours consume without reading them out of env.

---

*End of FRAMEWORK — DEV REFERENCE.*
