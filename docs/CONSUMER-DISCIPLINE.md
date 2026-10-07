# CONSUMER-DISCIPLINE

> Project: **FRAMEWORK**
> Code requirements, approach, and style for authoring a consumer.

Sources: `./js/actors/actorcore.js`, `./js/actors/mailactor.js`,
`./js/actors/executionactor.js` (reference implementation).

## 1. Scope

A **consumer** is the entry of `ACTORCONSUMERS[NAME]` registered by
`REGISTERDISPATCH`. It is the actor's invoked behaviour.

## 2. Discipline — the signature

    function (ENV, MESSAGE) → any | Promise<any>

## 3. The lifecycle (via `DISPATCHTOACTOR`)

1. **project** — `DISPATCHPROJECT(RESOLVED, MESSAGE, ACTORNAME)` returns
   `{ ENV, RESPONSE }`:
   - `undefined` / `true` / `false` / `null` / non-object →
     `{ ENV: undefined, RESPONSE: undefined }`;
   - `{ ENV, RESPONSE }` → those two fields;
   - any other object → `{ ENV: <the object>, RESPONSE: undefined }`.
2. **publish** — `DISPATCHPUBLISH(ACTORNAME, OUT.ENV)` when
   `OUT.ENV !== undefined`.
3. **install** — `DISPATCHINSTALL(INSTALLER, MESSAGE)` (idempotent
   expectation installation).
4. **respond** — `DISPATCHRESPOND(MESSAGE, OUT.RESPONSE, ACTORNAME)`:
   - `WAITMODE: 'promise'` → no response sent (the promise carries it);
   - otherwise `SENDRESPONSE(SENDER, TAG, RESPONSE, ACTORNAME, RESPONSETYPE)`;
   - if `CCC_TOKEN` present, `CCCNOTIFY(CCC_TOKEN, { TYPE, TAG, SENDER, RESPONSE })`.

## 4. Code requirements

- Do not mutate `ENV` in place; return a new env or `{ ENV, RESPONSE }`.
- Do not call `SENDRESPONSE` directly; use the `RESPONSE` field.
- Do not branch on `MESSAGE.WAITMODE`; the dispatcher handles it.
- Async work returns a Promise; use `Promise.resolve`.
- ES5.

## 5. Approach

- Prefer the `{ ENV, RESPONSE }` shape when the response is a value.
- Return `ENV` (plain) when state changed and no response is needed.
- Return `{ ENV: undefined, RESPONSE: <value> }` to respond without
  publishing.
- Idempotent installers.

## 6. Style

- Consumers are `<ACTOR>BEHAVIOR`.
- ES5.

## 7. Forbidden patterns

- Direct `SENDRESPONSE`.
- In-place `ENV` mutation.
- Branching on `WAITMODE`.

## 8. Invariants

- I-1. The lifecycle phases run in order.
- I-2. Projection is by field presence.
- I-3. Respond respects `WAITMODE`.
