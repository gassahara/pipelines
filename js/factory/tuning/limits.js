// js/factory/tuning/limits.js — the framework's numeric limits, ONE home.
//
// WHY THIS FILE EXISTS (SCOPE-SFP-003 / OP-033b, discovered while verifying OP-026/OP-027):
//   js/factory/fnblock.js#L723 reads the source-size ceiling as a BARE IDENTIFIER:
//     if (typeof src === 'string' && src.length > fnmaxsourcechars) { … }
//   A bare reference to an undeclared name is not a soft `undefined` comparison — it raises ReferenceError, and
//   the only declaration of `fnmaxsourcechars` in the tree lived in js/factory/analyzer.js (now deleted).
//   BOOT MANIFEST and therefore never loads. The consequence is that, in the working tree, analyzefnblock()
//   throws ReferenceError on its first invocation and EVERY fn block fails its analysis.
//   This was previously recorded as a "vacuous guard" (src.length > undefined); that reading was WRONG and is
//   corrected by this artefact — the guard is not vacuous, it is fatal.
//
// PROVENANCE OF THE VALUE: 50000, taken from the single pre-existing declaration
//   (was @file=js/factory/analyzer.js#L4:  var fnmaxsourcechars = 50000;)
// so the ceiling is preserved rather than chosen. The largest provider block currently measured in
// frontend/pipelines/shell.js is ~5.5 KB, so this ceiling does not constrain the G2 port.
//
// NOT A DELETE-TARGET: js/factory/tuning/ exists so that limits have a declared home; it must not be removed
// while any loaded file reads a limit from it.

var fnmaxsourcechars = 50000;