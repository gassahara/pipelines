# FRAMEWORK — USER REFERENCE

> **Audience.** Authors of pipeline programs (frontend).
> **Companion documents.** `framework-dev-ref.md` (how the framework is
> built), `frontend-dev-ref.md`, `frontend-user-ref.md`.
> **Scope.** How to *use* each framework construct from a pipeline
> program. This reference does not explain the framework's internals;
> see the DEV REF for those.

This document is a practical guide for anyone writing a pipeline
program. It describes the shape of each construct, the fields that
matter, and the rules the framework enforces.

---

## F-8. USING A PIPELINE

### Creating

In a pipeline program:

```javascript
var p = pipeline('shell', 'shell', options);
```

- `type` and `name` are free-form; used in logs and messages.
- `options` is optional. When passed, the pipeline value carries
  `env = options.baseenv || {}`, `compileonly = options.compileonly === true`,
  and the compiler setup.

### Appending

Only the append helpers mutate the pipeline value:

| Helper | Appends |
|---|---|
| `appendlib(p, null, makelib(src, provides))` | a lib (top-level only) |
| `appendprogram(p, null, makeprogram(src, provides))` | a program (top-level only) |
| `appendstage(p, level, makestage(id, control))` | a stage |
| `appendblock(p, level, makeblock(id, type, behaviour, attrs))` | a block |
| `appendpipelineelement(p, level, makepipelineelement(id, childstate, attrs))` | a nested pipeline element |

- `level` is the path (an array of indices) at which to insert.
  `[]` inserts at the top level. `[1]` inserts as an element of the
  top-level stage at index 1. `[1, 9]` inserts into a stage nested
  inside that stage.

### Running

The program ends with:

```javascript
if (options.compileonly === true) return p;
return run(p, options);
```

- The `compileonly` short-circuit returns the pipeline value without
  walking blocks.
- Otherwise `run(p, options)` loads resources and walks.

### Notes

- The env is the sole channel through which a block's outputs reach
  later blocks. Nothing else carries values forward.
- In a non-compileonly pipeline, blocks execute at append time. The
  textual order of `appendblock` calls is the execution order.
- In a compileonly pipeline, execution is deferred to the walk
  performed by `run`. The textual order is still the execution order,
  just delayed.

---

## F-9. USING A STAGE

### NULL stage

```javascript
p = appendstage(p, [], makestage('my-stage', null));
p = appendblock(p, [0], makeblock(/* ... */));
```

Its blocks execute during the current walk.

### EVENT stage

```javascript
p = appendstage(p, [], makestage('my-click-handler',
    { command: 'EVENT', sourceid: 'mybutton', event: 'click' }));
p = appendblock(p, [0], makeblock(/* ... */));
```

- `sourceid` is the DOM element's id.
- `event` is the DOM event name (`'click'`, `'change'`, `'input'`,
  `'mouseenter'`, `'mouseleave'`, `'focus'`, `'blur'`, etc.).
- Registered at walk time; its elements run when the event fires.
- The env the fired walk sees is the same object as the env at
  registration time; values accumulated between registration and
  firing are visible.

### LOOP stage

```javascript
p = appendstage(p, [], makestage('my-loop',
    { command: 'LOOP',
      inputs: ['counter', 'payload'],
      fn: function(properties, state, loopcount) {
        if (loopcount >= 5) return false;
        return state.counter > 0;
      } }));
```

- `inputs` names are resolved against env per iteration.
- `state` carries the resolved values keyed by name.
- `loopcount` starts at 0 and increments.
- Return `false` (or any falsy value) to terminate.
- The framework provides no iteration cap; the fn must terminate.
- `properties` is the control object itself. Most LOOP fns ignore it.

### Nesting

Stages nest freely. Any stage kind may contain any stage kind. The
framework dispatches each nested stage by its own kind.

### Async variant (NULL stages only)

Setting `async: true` on a NULL stage's control runs its elements in
an async branch — the enclosing walk proceeds without awaiting.

---

## F-10. USING A BLOCK

Every block is declared with `makeblock(id, type, behaviour, attrs)`.
Only `fn` and `writer` require a behaviour function.

### fn block

```javascript
makeblock('myfn', 'fn', function(inputs, deps, properties) {
    var x = inputs.x;
    var helper = deps.helper;
    return { result: helper(x) };
}, { inputs: ['x'], outputs: { result: 'number' }, deps: ['helper'] })
```

- Behaviour receives `(inputs, deps, properties)`.
- Free identifiers in the body must be either declared inputs, declared
  deps, or framework builtins. Any other identifier triggers
  `[FN_PURITY_VIOLATION]`.
- The returned object's keys must cover the declared `outputs`; missing
  keys trigger a "missing required output" error.

### writer block

```javascript
makeblock('mywriter', 'writer', function(inputs, deps, properties) {
    return { id: 'target', timeout: 5000, html: '<div>...</div>' };
}, { targetlabel: 'target', replace: true, inputs: [], outputs: {} })
```

- The behaviour builds HTML and returns `{ id, timeout, html }`.
- The framework sends an HTML message to RENDERACTOR targeting
  `targetlabel` or `env.approot`.

### api / fetch blocks

```javascript
makeblock('myapi', 'api', null, {
    method: 'POST',
    endpoint: 'my-function',
    timeout: 30000,
    mapping: { payload: { text: { from: 'querytext' } } },
    inputs: ['querytext'],
    outputs: { response: 'object' }
})
```

- The framework builds the payload via `mapping.payload` (each field is
  either a literal, a function, or `{ from: 'name' }`).
- The response can be reshaped via `mapping.response`.

### domquery blocks

```javascript
makeblock('myquery', 'domquery', null, {
    command: { COMMAND: 'getvalue', properties: { id: 'input1' } },
    inputs: [],
    outputs: { value: 'string' }
})
```

- The framework forwards the command to RENDERACTOR.
- Valid commands include `gethtml`, `getvalue`, `getstyle`,
  `getposition`, `getlayout`, `setstyle`, `sethtml`, `toggleclass`,
  `getviewport`, `getelements`, `checkoverflow`, `checkspacing`,
  `correctoverflow`, `rewritestyleattrs`, `optimizetextvisibility`, and
  others. See RENDERACTOR's dispatch for the full set.

### executionquery blocks

```javascript
makeblock('myquery', 'executionquery', null, {
    command: { COMMAND: 'tasks', args: {} },
    inputs: [],
    outputs: { tasks: 'array' }
})
```

- Valid commands: `get`, `tasks`, `taskstatus`, `awaittask`,
  `canceltask`, `stoptask`.

### crypto, wait

- `crypto` takes `bytes` (default 512) and returns random bytes.
- `wait` takes `ms` (number or a path in env) and delays.

### Common attrs

| Attr | Applies to | Meaning |
|---|---|---|
| `inputs` | all | array of names resolved against env |
| `outputs` | all | object of name -> type; keys the return value must cover |
| `deps` | all | array of names resolved against global scope |
| `allowundefinedinputs` | all | when `true`, the required-inputs guard is disabled |

---

## F-11. USING MESSAGES

Most pipeline programs never touch the mailbox directly. The framework's
`sendandawait` handles request/response for the compiler, and blocks
that need cross-actor calls (api / fetch / domquery / executionquery /
crypto) do so via their compilers.

For custom interactions:

```javascript
var tag = GENERATETAG();
SENDINSTRUCTION('APIACTOR', MESSAGETYPES.API, { ENDPOINT, METHOD, PAYLOAD, TOKEN }, tag, 'MYCALLER');
WAITFORMAILBOX({ TAG: tag, SENDER: 'APIACTOR', TYPE: 'apiresult' }, 30000).then(function(envelope) {
    var result = envelope.PAYLOAD.RESULT;
    /* ... */
});
```

### Rules

- Message fields are uppercased.
- The tag is the correlation id; the sender is the caller's identifier.
- A response is sent with `SENDRESPONSE(recipient, tag, result, sender, responsetype)`.
- Filters use uppercase keys (`TAG`, `SENDER`, `TYPE`).

### Message types

The vocabulary is `MESSAGETYPES` (in `js/messageregistry.js`). See the
framework's DEV REF F-4 for the full list. Common ones:

- `EXECUTEELEMENT` — instruct EXECUTIONACTOR to run a block.
- `TASKRESULT` — the result of a scheduled task.
- `UPDATE` — update the world map (env).
- `EVENTTRIGGERED` — signal that a registered DOM event fired.
- `REGISTEREVENTLISTENER` — register an EVENT-stage listener.

---

## F-12. USING ACTORS

Pipeline programs do not invoke actors directly. The framework's block
compilers dispatch on behalf of blocks. If a custom actor extension is
needed, it is registered in `js/registerconsumers.js` with an interface
map and a handler.

If a pipeline program needs to interact with an actor's request /
response protocol, the usual route is:

1. choose a block type that already owns the channel (api, fetch,
   domquery, crypto, executionquery, wait), or
2. use the mailbox functions directly (`SENDINSTRUCTION`,
   `WAITFORMAILBOX`).

Direct invocation of `DISPATCHTOACTOR` from a pipeline program is not
supported; the block-level abstractions exist precisely so that
programs do not need it.

---

## F-13. QUICK REFERENCE TABLE

| Construct | Maker | Key attrs | Kind determined by |
|---|---|---|---|
| pipeline | `pipeline(type, name, options)` | — | — |
| lib | `makelib(src, provides)` | `src`, `provides` | — |
| program | `makeprogram(src, provides)` | `src`, `provides` | — |
| stage | `makestage(id, control)` | `control` | `control.command` |
| block | `makeblock(id, type, behaviour, attrs)` | `type`, `inputs`, `outputs`, `deps` | `type` |
| pipeline element | `makepipelineelement(id, childstate, attrs)` | `childstate`, `inputs`, `outputs` | — |

### Appending

| Call | Level |
|---|---|
| `appendlib(p, null, ...)` | top-level only |
| `appendprogram(p, null, ...)` | top-level only |
| `appendstage(p, level, ...)` | any level |
| `appendblock(p, level, ...)` | any level |
| `appendpipelineelement(p, level, ...)` | any level |

### Running

```javascript
if (options.compileonly === true) return p;
return run(p, options);
```

---

*End of FRAMEWORK — USER REFERENCE.*
