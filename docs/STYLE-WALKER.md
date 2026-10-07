# STYLE-WALKER

> Project: **FRAMEWORK**
> The rule walker `SUREWRITESTYLEATTRS` and its companion `SUAPPLYSTEP`.

Source: `./js/factory/renderactorstyle.js`.

## 1. Public entry

    SUREWRITESTYLEATTRS(root, rules, sc) → <count>

Applies every matching rule's declarations to every matching element in
`root`'s subtree; returns the count of applied declarations. Invoked by
the DOMQUERY command `rewritestyleattrs` (see `DOMQUERY-COMMANDS.md` §6).

## 2. Rule shapes

### 2.1 Legacy selectors
`{ id, tag, class }` — any one matches.

### 2.2 Step fields
`{ axis, index, skip, depth, content }` — a rule carrying any of these
is a **step rule**; candidate selection delegates to `SUAPPLYSTEP`.

- `axis`: `self|parent|ancestor|child|descendant|nextsibling|previoussibling`
  (default `descendant`).
- `index`: 0-based ordinal.
- `skip`: sibling offset.
- `depth`: descendant depth.
- `content`: `{ text, mode:'substring'|'exact', casesensitive:bool }`.

### 2.3 Style forms
- **Record**: `style: { … }` — applied identically to every match.
- **Function**: `stylefn: function(EL, rulecontext) { … }` — invoked
  once per match; the returned record is applied.

If both present, `stylefn` wins. `rulecontext` is `{ root, sc }`,
computed once per rule per invocation.

## 3. Plan / apply

`SUREWRITESTYLEATTRS` factors its work:

- **Plan**: `buildplan(root, rules, sc, sink)` — for each step rule,
  `SUAPPLYSTEP` runs once and candidates are marked with
  `SRSAMARKERPREFIX + ri`. Each rule gets a `rulecontext`.
- **Apply**: recursive walk over `EL.children`; per element per rule,
  `matchentry` (O(1) for step rules via the marker; three-way check for
  legacy); on match, `applyentry` dispatches `stylefn` or `style`.
- **Cleanup**: `try { … } finally { cleanup(plan); }` — removes every
  expando marker, including on a partial plan.

## 4. Cost

**O(N · K)** per invocation.

## 5. Invariants

- I-1. Behaviour is independent of legacy vs. step selectors.
- I-2. `stylefn` wins over `style` on the same rule.
- I-3. No marker remains after the walker returns.
- I-4. ES5; functional-recursive walk.
