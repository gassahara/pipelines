# PIPELINE-AUTHORING

> Project: **FRAMEWORK**
> How to declare a pipeline, its stages, and its blocks.

Sources: `./js/factory/fnblock.js`, `./js/factory/blockcompiler.js`,
`./js/factory/blockcompilers.js`, `./js/factory/pipelineorchestration.js`.

## 1. Pipeline structure

    pipeline(type, name, options) → { type, name, libs, programs, elements, env, … }

Helpers: `makelib`, `makeprogram`, `makestage`, `makeblock`,
`makepipelineelement`, `appendlib`, `appendprogram`, `appendstage`,
`appendblock`, `appendpipelement`.

## 2. Stage taxonomy

| Control | Class | Lifecycle |
|---|---|---|
| `null` | O — orchestration | once per pipeline boot |
| `{ command:'EVENT', sourceid, event }` | E — event | per matching event |
| `{ command:'LOOP', fn, inputs }` | L — loop | while `fn` truthy |
| `{ command:'RECOVERY', fn, inputs }` | R — recovery | with CCC semantics |

**Design rule.** One-shot setup → class O. Reactive behaviour → class E.

## 3. Block types

| Type | Domain | Notes |
|---|---|---|
| fn | pure | `document.`, non-local `style.` forbidden |
| writer | pure | returns `{ id, timeout, html }` |
| domquery | DOM effect | dispatches to RENDERACTOR |
| api, fetch | API effect | dispatches to APIACTOR |
| io | IO effect | host IO |
| crypto, wait, executionquery | effect | various |
| loader | polling driver | iterative fix-point |
| captureerror | composite | wraps a block |

## 4. Block declaration

    makeblock(id, type, behaviour, {
        inputs:  [ '<name>', … ],
        outputs: { '<name>': '<type>', … },
        deps:    [ '<global name>', … ]
    })

## 5. The `deps` discipline

A behaviour reads `deps.<name>` only for names declared in its block's
`deps` array. `buildblockproperties` resolves each declared name from
`window`/`globalThis`; an undeclared name is absent.

## 5b. EVENT stages: the run env

An EVENT stage runs on a copy of the env captured at registration; its writes
are run-local and are not merged back into the pipeline env
(`hypervisoractor.js::HYPERVISORBEHAVIOREVENTTRIGGERED`). Every input a block
in such a stage declares is therefore one of exactly three things:

    1. a boot value the pipeline env already carried;
    2. a key an earlier block of the SAME run wrote;
    3. a framework-injected key — today, `event`
       (`{ type, key, targetid }`, from the triggering DOM event).

An input that is none of these is a defect: the run cannot supply it. The
observer installs a listener for every event name a stage declares
(click, input, change, keydown, resize, focus, blur, mouseenter, mouseleave;
`resize` is bound on `window`), and matches producers by element id — or by
the `window` source for window-scoped stages.

## 6. The analyser gate

`compileblock` runs the type's analyser before compiling: KLEISLI purity
for `fn`/`writer`; free-identifier completeness; dep-usage scan.
See `ANALYSERS.md`.

## 7. KLEISLI purity

`fn` and `writer` are pure: no DOM access. DOM reads belong in `domquery`
blocks; DOM writes in `writer` blocks. The gate reads the body's source, so it
is textual: a name that merely ends in `style` is data, a property named
`style` on a DOM node is the violation.

Declared output shapes are enforced where the value enters the env: a block
whose result violates its declaration raises `[RESPONSE-SHAPE-VIOLATION]`
naming the key, the expected shape and the observed type. The shape tokens are
`string`, `number`, `boolean`, `object`, `array`, `function`, `any`, each
optionally suffixed with `?` for a value that may be absent.

## 8. Style

ES5 throughout: `var`, `function`; no arrow functions, no `let`/`const`,
no template literals. Recursion or `Array.prototype.reduce` / `map` /
`forEach` for iteration.

## 9. Invariants

- I-1. Every declared dep is present in the block's `deps` array.
- I-2. Every `fn`/`writer` passes the analyser's three checks.
- I-3. No `fn`/`writer` reads the DOM.
