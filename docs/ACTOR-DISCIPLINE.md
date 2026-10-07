# ACTOR-DISCIPLINE

> Project: **FRAMEWORK**
> Code requirements, approach, and style for authoring an actor.

Sources: `./js/actors/actorcore.js`, `./js/actors/mailactor.js`,
`./js/actors/executionactor.js` (reference implementation).

## 1. Scope

The authoring of an actor: registration order, state handling, handler
contract, dispatch contract, concurrency, style.

## 2. Discipline — registration order

The canonical six-step sequence, in order:

1. **Message types.** `messagetype(NAME, SPEC)` + `REGISTERMESSAGETYPE`.
2. **Response types.** `REGISTERRESPONSETYPE(name)` for each.
3. **Per-type handlers.** `REGISTERACTORMESSAGE(NAME, TYPEVALUE, HANDLER)`.
4. **Dispatch behaviour.** `REGISTERDISPATCH(NAME, BEHAVIOR)`.
5. **State.** `REGISTERACTORSTATE(NAME, INITIAL)`.
6. **Handle and start.** `CREATEACTORHANDLE(NAME)` + a `START<NAME>`.

Each step is required. Omitting (3) yields unknown-type responses;
omitting (5) yields `undefined` state.

## 3. Code requirements

### 3.1 State
- State is a plain object; accessed via `GETACTORSTATE` / `SETACTORSTATE`.
- **Never mutate `ENV` in place.** Return a new `ENV` (or `{ ENV, RESPONSE }`).
- For sub-states, use `ENSUREENVSLICE(ENV, SLICENAME, INITFN)`.

### 3.2 Handlers
- Signature `(ENV, ARGS) → any | { ENV, RESPONSE }`.
- `ARGS` is the payload projected from `MESSAGE` (via
  `EXTRACTPAYLOAD`); fields not in the type's iface are absent.
- Async handlers return a Promise.
- Handlers do not perform side effects outside the actor's state.

### 3.3 Dispatch behaviour
- `REGISTERDISPATCH(NAME, BEHAVIOR)` registers the actor's router.
- The router uses `INVOKEHANDLER(NAME, ENV, MESSAGE)`.
- On unmatched type, return `ENV` unchanged.

### 3.4 Return-shape conventions
- **State changed, no response:** `return NEXTENV;`.
- **State changed + response:** `return { ENV: NEXTENV, RESPONSE: <value> };`.
- **No state change + response:** `return { ENV: undefined, RESPONSE: <value> };`.

### 3.5 Event isolation
Reference `ACTOR-MODEL.md` §5. Actors that handle events clone the env
before invoking `orchestratestage`.

## 4. Approach

- Register in the six-step order.
- Keep state slices minimal; use `ENSUREENVSLICE` for sub-states.
- Handle only the types the actor declares.
- Prefer the `{ ENV, RESPONSE }` shape when responding.

## 5. Style

- Dispatch behaviour: `<ACTOR>BEHAVIOR`.
- Handlers: `<ACTOR>BEHAVIOR<ACTION>`.
- Producers: `ENQUEUE<ACTOR><ACTION>`.
- ES5: `var`, `function`; no arrow, no `let`/`const`, no template
  literals.

## 6. Forbidden patterns

- Mutating `ENV` in place.
- A global "active" slot for state across concurrent dispatches.
- Responding via `SENDRESPONSE` inside a handler (use `RESPONSE`).
- Reading `MESSAGE.WAITMODE` to alter the handler's behaviour (the
  dispatcher handles routing).

## 7. Invariants

- I-1. Registration follows the six-step order.
- I-2. State changes are expressed by returning a new `ENV`.
- I-3. The dispatcher routes every message through the registered
  behaviour.
