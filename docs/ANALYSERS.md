# ANALYSERS

> Project: **FRAMEWORK**
> The block analyser gate.

Source: `./js/factory/fnblock.js`.

## 1. Overview

`compileblock` runs the type's analyser before compiling. `fn` and
`writer` share the same gate.

## 2. The three checks

### 2.1 KLEISLI purity
The behaviour's source is scanned for `document.` and for a non-local
`style.` access. A hit rejects the block with
`[KLEISLI VIOLATION] fn block accesses DOM directly`.

### 2.2 Free-identifier completeness
`analyzefnblock` invokes a source parser to obtain the free identifiers.
Each must be an `inputs.<name>`, a `deps.<name>`, a builtin, or a
reserved word. Otherwise `[FN_PURITY_VIOLATION]`.

### 2.3 Dep usage
`analyzedepusage(src, declared)` scans for `properties.deps.<name>`
patterns and rejects any name not in the block's `deps` array with
`[FN_DEP_UNDECLARED]`.

## 3. Known limitation — dep-read symmetry

The dep-usage analyser scans for `properties.deps.<name>` only. It does
**not** scan direct `deps.<name>` reads in the second argument position.
A behaviour written in the idiomatic `(inputs, deps, properties)` form
that reads `deps.<name>` directly is therefore not checked against the
block's `deps` array. A missing declaration yields an `undefined` at
runtime; a subsequent call throws.

**Recommended practice.** Keep `deps.<name>` reads and the block's
`deps` array in lockstep. Until a future framework-scope extension closes
this symmetry, the analyser cannot enforce it.

## 4. Invariants

- I-1. `document.` in a `fn`/`writer` behaviour → always rejected.
- I-2. An undeclared free identifier → always rejected.
- I-3. The dep-read symmetry limitation is documented.
