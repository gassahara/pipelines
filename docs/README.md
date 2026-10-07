# FRAMEWORK — documentation index

> Project: **FRAMEWORK**
> Mechanisms provided by `./js/`. Consumed by the FRONTEND project
> (`./pipelines/`, `./appinit.js`).

## Documents

| File | Subject |
|---|---|
| `STYLE-WALKER.md` | rule walker; shapes; plan/apply; memoization; `stylefn` |
| `DOMQUERY-COMMANDS.md` | complete DOMQUERY command catalogue |
| `COLOR-UTILITIES.md` | `colorcore`, `colorharmony`, `colorcontrast`, `colorpalettes` |
| `PIPELINE-AUTHORING.md` | pipelines, stages, blocks; `deps` discipline; KLEISLI |
| `ANALYSERS.md` | block analyser gate; dep-read symmetry limitation |
| `ACTOR-MODEL.md` | dispatch, mailbox, broadcast, event isolation, cancellation |
| `BLOCK-DISCIPLINE.md` | code requirements and style per block type |
| `ACTOR-DISCIPLINE.md` | authoring an actor: registration, state, handlers, style |
| `CONSUMER-DISCIPLINE.md` | authoring a consumer: lifecycle, shapes, style |

## Boundary

The FRAMEWORK tree owns: the rule walker; the DOMQUERY command surface;
the colour utilities; the block compiler, the analyser gate, the
orchestration; the actor model, the mailbox, the event dispatch; and the
authoring disciplines for blocks, actors, consumers.

It does not own: the pipelines, stages, and blocks declared by the
frontend; the palettes, styles, and rule generators; the AST renderer.
Where a framework document cites a frontend module, it is a
cross-reference; the frontend document at `../pipelines/docs/` owns that
module's content.

## Source tree

The framework source lives under `./js/`. The docs under `./js/docs/`
mirror the source's concerns.
