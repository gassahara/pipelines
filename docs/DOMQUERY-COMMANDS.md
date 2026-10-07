# DOMQUERY-COMMANDS

> Project: **FRAMEWORK**
> The complete DOMQUERY command catalogue.

Sources: `./js/actors/renderactorhandler*.js`,
`./js/actors/renderactor.js`,
`./js/factory/blockcompilers.js`,
`./js/actors/renderactorprimitives.js`.

## 1. Dispatch

A `domquery` block declares `command: { COMMAND, properties }`.
`blockcompilers.js::compilers.domquery` resolves the command via
`RENDERACTORNAMES()`, awaits `RENDERACTOR`'s `DOMRESULT`. A
`RESPONSE.ERROR` throws unless the handler signals missing-target skip.

## 2. Registry

`domquerygetters`, `domquerysetters`, `domquerymessages` in
`renderactorprimitives.js` enumerate the surface;
`VALIDATEDOMQUERYCOMMAND` gates `properties.id` (string) — except
`getviewport`, `getscreen`, `matchmedia` — and the setters' declared
requirements.

## 3. Queries

| Command | Required | Response |
|---|---|---|
| gethtml | id | `{ TAG, INNERHTML }` |
| getvalue | id | the element's value |
| getstyle | id | computed style record |
| getposition | id | `{ X, Y, WIDTH, HEIGHT, TOP, RIGHT, BOTTOM, LEFT }` |
| getlayout | id | `{ OFFSETWIDTH, OFFSETHEIGHT, …, CLIENTHEIGHT }` |
| getviewport | — | `{ VIEWPORTWIDTH, VIEWPORTHEIGHT }` |
| getscreen | — | `{ SCREENWIDTH, SCREENHEIGHT, AVAILWIDTH, AVAILHEIGHT }` |
| matchmedia | query | `{ MATCHES }` |
| getelements | id; opt tagname, limit | `{ DESCRIPTORS }` |

## 4. Mutations

| Command | Required | Behaviour |
|---|---|---|
| sethtml | id, value | `EL.innerHTML = value` |
| setvalue | id, value | `EL.value = value` |
| setstyle | id, value (record) | `EL.style[k] = value[k]` |
| setposition | id, value (record) | same as setstyle |
| setlayout | id, value (record) | `EL[k] = value[k]` |
| setattr | id, name, value | `EL.setAttribute(name, value)` |
| toggleclass | id, classname; opt force | classList toggle |
| clear | id | empty the element |
| remove | id | remove the element |
| html | id, markup, append | insert markup |
| render | id, renderer, data, env | invoke renderer |
| restorebodyhtml | html | set body's innerHTML |

## 5. Layout

| Command | Required | Response |
|---|---|---|
| panelayout | id, shape, viewport; opt height | `{ APPLIED, MAXWIDTH, SHAPE, ROLE, HEIGHT }` |
| checkoverflow | id; opt options | `{ VIOLATIONS }` |
| checkspacing | id; opt options | `{ VIOLATIONS }` |
| checkoverlap | id; opt options | `{ VIOLATIONS }` |
| checkscrollability | id; opt options | `{ VIOLATIONS }` |
| checkcontrolledoverlay | id; opt options | `{ VIOLATIONS }` |
| correctoverflow | id; opt options | `{ APPLIED, CONVERGED }` |
| correctspacing | id; opt options | `{ APPLIED, CONVERGED }` |
| correctoverlap | id; opt options | `{ APPLIED, CONVERGED }` |
| correctscrollability | id; opt options | `{ APPLIED, CONVERGED }` |
| correctcontrolledoverlay | id; opt options | `{ APPLIED, CONVERGED }` |
| consolidatestyles | id; opt safeprops | `{ APPLIED }` |

## 6. `rewritestyleattrs`

    { COMMAND: 'rewritestyleattrs',
      properties: { id: '<target>', rules: '<env key>' } }

Delegates to `SUREWRITESTYLEATTRS` (see `STYLE-WALKER.md`). Accepts every
rule shape: legacy selectors, step fields, `style`, `stylefn`. Returns
`{ RESPONSE: <count> }`. **Missing-target**: returns `{ ERROR: 'element
not found: <id>' }` and the block throws.

## 7. Missing-target tolerance

The `CHECK*`/`CORRECT*` handlers return `{ APPLIED:false, SKIPPED:'element
not found: <id>' }` for a missing target. The block's throw-on-ERROR path
is not entered for this class.

## 8. Theme

| Command | Required |
|---|---|
| palettegenerate | ruleset; opt overrides |
| setaccent | selector, prop, hex; opt ref |
| optimizecontrast | id; opt themestyles, options |
| optimizeharmony | id; opt themestyles, options |
| optimizetextvisibility | id; opt themestyles, options |
| optimizebuttonvisibility | id |
| verifycontrast | id; opt minratio |
| verifytextvisibility | id |
| verifybuttonvisibility | id |
| verifyharmony | id; opt options |
| checkfocusvisibility | id |

## 9. IO

`crypto`, `persistence`, `loadscript`, `geolocation`, `loadingindicator`,
`registereventlistener`, `createelement`, `createcontainer`,
`createfromhtml`, `property`, `recover`, `ping` — required properties and
responses as in the sources.

## 10. Invariants

- I-1. `properties.id` required except for `getviewport`, `getscreen`,
  `matchmedia`.
- I-2. Every response is `{ RESPONSE: … }` or a rejection.
- I-3. The RENDERACTOR env-slice sentinel is rejected defensively.
