# BLOCK-DISCIPLINE

> Project: **FRAMEWORK**
> Code requirements, approach, and style for every block type.

Sources: `./js/factory/blockcompiler.js`,
`./js/factory/blockcompilers.js`, `./js/factory/fnblock.js`,
`./js/factory/pipelineorchestration.js`.

## 1. Scope

Every block type: `fn`, `writer`, `domquery`, `api`, `fetch`, `io`,
`crypto`, `wait`, `executionquery`, `loader`, `captureerror`.

## 2. Discipline (universal)

- Signature: `function(inputs, deps, properties)` for user-authored types.
- Return the block's declared output contract.
- ES5 only.
- No `for`/`while` in hot traversals; prefer `Array.prototype.reduce` /
  `map` / `forEach`.
- Errors: throw an `Error` with a `diagnostic` object.

## 3. Code requirements

### 3.1 `fn`
- Pure. No DOM (`document.`, non-local `style.`).
- Signature `(inputs, deps, properties)`.
- Return any value the block's `outputs` declares.
- Declare every `deps.<name>` in the block's `deps` array.
- Free identifiers must be inputs, deps, builtins, or reserved words.

### 3.2 `writer`
- Same purity as `fn`.
- Return `{ id, timeout, html }` — `id` is the target element's id,
  `html` is the markup, `timeout` is the write-await (ms).
- Not for DOM reads; those belong in `domquery`.

### 3.3 `domquery`
- Declarative: `command: { COMMAND, properties }`.
- Behaviour is framework-provided; the compiler dispatches to RENDERACTOR.
- See `DOMQUERY-COMMANDS.md`.

### 3.4 `api` / `fetch`
- Declarative: `method`, `endpoint`, `mapping: { payload, response }`,
  `validate`.
- `validate(response) → boolean`; a `false` throws
  `[ENVELOPE_INVALID]`.
- Behaviour is framework-provided.

### 3.5 `io`
- Behaviour `(inputs, env) → any | Promise<any>`.
- Runs under `callwithstack` with a continuation.
- Errors propagate via `errk`.

### 3.6 `crypto` / `wait` / `executionquery`
- Declarative; framework-provided behaviour. See `DOMQUERY-COMMANDS.md`
  §9 for the response shapes.

### 3.7 `loader`
- Behaviour `(properties, state) → boolean`.
- Truthy → stop; falsy → poll again after `interval`.
- `timeout` bounds the poll. `markup` is the overlay while active.
- **Prefer per-pane inline loaders over the framework-level overlay.**
  When the overlay is not desired, seed the panel directly (see
  `../pipelines/docs/THEME-SYSTEM.md`).

### 3.8 `captureerror`
- Wraps another block.
- Policy `function({ ERROR, DIAGNOSTIC, ENV, ATTEMPT, TARGETID }) →
  'retry' | 'continue' | <throw>`.
- `retry` re-submits; `continue` yields `{}`; otherwise the thrown error
  propagates.

## 4. Approach

- Prefer small, single-purpose behaviours.
- Compose blocks in a stage rather than nesting within a block.
- Use `captureerror` to guard a fragile block; avoid nesting deeper than
  necessary.
- Use `loader` sparingly; the per-pane inline pattern is preferred.

## 5. Style

- Naming: lowercase identifiers; actions are verbs; no ambiguous
  abbreviations.
- Logging: `logdebug` / `loginfo` / `logwarn` / `logerror`, never
  `console.log`.
- Errors: `new Error('<CONTEXT> message')` with `err.diagnostic`.
- Return shapes: prefer records over `null`.
- ES5: `var`, `function`; no arrow, no `let`/`const`, no template
  literals.

## 6. Forbidden patterns

- DOM access in `fn` / `writer`.
- ES6 syntax.
- Free identifiers not declared.
- Imperative `for` / `while` in hot traversals.
- Silent swallowing of errors.

## 7. Invariants

- I-1. Each behaviour satisfies its type's code requirements.
- I-2. Every `fn` / `writer` passes the analyser gate.
- I-3. Errors surface through the framework's diagnostic channel.
