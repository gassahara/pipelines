# ACTOR-MODEL

> Project: **FRAMEWORK**
> Dispatch, mailbox, broadcast, event-stage isolation, cancellation.

Sources: `./js/actors/actorcore.js`, `./js/actors/mailactor.js`,
`./js/actors/hypervisoractor.js`,
`./js/factory/pipelineorchestration.js`.

## 1. Actors

An actor has state (`GETACTORSTATE`/`SETACTORSTATE`), a dispatch
behaviour (`REGISTERDISPATCH`), a consumer table (`ACTORCONSUMERS`), and
per-message-type handlers (`REGISTERACTORMESSAGE`).

## 2. Message envelope

    { TYPE, SENDER, TAG, RECIPIENT, WAITMODE, RESPONSESPEC?, CONTEXT? }

`TAG` is from `GENERATETAG()`. `WAITMODE` is `direct` / `mailbox` /
`promise`.

## 3. `SENDINSTRUCTION` routing

`INFERDISPATCHSTRATEGY` selects:

- **mailbox** — response types, poller recipients, fallback;
- **broadcast** — registered broadcasters;
- **direct** — actors with a dispatch behaviour (with optional batching).

Direct: `DISPATCHTOACTOR(NAME, CONSUMER, MESSAGE, INSTALLER)`. Broadcast:
`DISPATCHBROADCAST(MESSAGE)` iterates subscribers. Mailbox: writes the
flat message under `mail:unopened:<TAG>`; MAILACTOR reads, delivers, and
moves it to `mail:opened:<TAG>`.

## 4. Message-type ifaces

Types are values produced by `messagetype(NAME, SPEC)` and registered via
`REGISTERMESSAGETYPE(TYPEVALUE)`. `SENDINSTRUCTION` validates payloads
against the recipient's registered ifaces.

## 5. Event-stage isolation

`HYPERVISORBEHAVIOREVENTTRIGGERED(ENV, ARGS)`:

1. Reads `ARGS.ENV` (captured at registration).
2. **Clones** it into `ISOLATEDENV`.
3. Invokes `orchestratestage(ARGS.STAGE, …, ISOLATEDENV, …)`.
4. Publishes a fresh `NEXTENV` from the resolved result.

**Contract.** Each event runs on its own env. Concurrent events do not
race. The env captured at registration is not mutated.

## 6. Cancellation semantics

Each stage constructs a local `stagetoken = { CANCELLED: false }`. On
stage-element failure, `stagetoken.CANCELLED = true`; the stage
rejects. **There is no global active-cancellation slot.** The framework
has no notion of a single active stage; `GENERATETAG` gives per-message
identity; `DISPATCHTOACTOR` treats each dispatch independently.

## 7. Invariants

- I-1. Each message has a unique `TAG`.
- I-2. Each event runs on its own env.
- I-3. Cancellation is per-stage; no global slot exists.
