# INSTRUCTIONS: Wave 1 — Foundation (evalstack, callwithstack, actorkernel, dbactor, mailactor)
Derived From: PLAN_ES5_MAILACTOR.md Wave 1 (P-3, P-4)
Generated: 2026-08-31

## OPERATION_1
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/evalstack.js`
- **Action**: `REPLACE_FILE` (full ES5 rewrite)
- **Line Range**: 1 - 29
- **Original Block**: current file (29 lines, ES6: export, const, arrows, spread, optional chaining, getter shorthand, default param `meta = {}`, shorthand methods)
- **New Block**: full ES5 CommonJS file. Rules: `var` only; function expressions; `module.exports = { ... }` at bottom; `slice()` instead of spread; `x && x.prop` chains; explicit `meta` default via `meta !== undefined ? meta : {}`; explicit key:value in object literals; `get frames` becomes a plain function `getframes()` plus `frames` array exported as live reference (kept as `var frames = stack` reference — do NOT use `get` shorthand; export `frames` as the array object so `debugformatter.js`'s `import { frames }` equivalent works via `module.exports.frames`).
- **ES5 output gate**: zero `import|export|const|let|=>|async|await|\?\.|` + zero spread `...` in array literals.

## OPERATION_2
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/callwithstack.js`
- **Action**: `REPLACE_FILE` (full ES5 rewrite)
- **Line Range**: 1 - 94
- **Original Block**: current file (94 lines, ES6: export, const, destructuring `{ argrules, resultrule }`, arrows, template literals, optional chaining `label?.startsWith`, spread `{ ...options }`, catch-without-binding `catch {`, default param `options = {}`, Promise retained — callwithstack contract REQUIRES promise return, kept per blueprint contradiction-resolution §2)
- **New Block**: full ES5 CommonJS file. Rules: var; function expressions; destructuring → `var argrules = typecheck.argrules;`; template literals → string concat; `label && label.startsWith(...)`; spread → manual copy `var merged = {}; Object.keys(options).forEach(...)`; `catch (e)`; default param → `options = options !== undefined ? options : {}`; Promise kept (P-4 resolution). `module.exports = { callwithstack, runwithstack }`.
- **ES5 output gate**: zero `import|export|const|let|=>|async|await|\?\.|` backtick; zero `{ argrules` destructuring.

## OPERATION_3
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/actors/actorkernel.js`
- **Action**: `REPLACE_FILE` (full ES5 rewrite)
- **Line Range**: 1 - 344
- **Original Block**: current file (344 lines, ES6: import, const, async functions in createDbMailbox/drainMemory/drainDb/processMessage/pollMailbox, Promise retained for mailbox ops + waitforemptymailbox)
- **New Block**: full ES5 CommonJS file. Rules: `var createGarbageCollector = require('./actorgc.js').createGarbageCollector;` + verbosity destructured requires at top; all `async function` → `function` returning promise chains (`.then`/`.catch` retained — blueprint §2 keeps Promise at kernel surface; async SYNTAX removed); `mailboxType 'mail'` setInterval polling preserved (L300-319); `module.exports = { createactor, createMessageValidator, pingActor, getActorRegistry }`.
- **Critical**: `processMessage` must return a promise when behavior returns a thenable; `drainMemory`/`drainDb`/`pollMailbox` become non-async functions chaining `.then` and re-scheduling via setTimeout/setInterval. `send` for mail type still routes through `options.mailTransport.sendInstruction(...).catch(...)`.
- **ES5 output gate**: zero `import|export|const|let|=>|async|await|\?\.|` backtick.

## OPERATION_4
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/actors/dbactor.js`
- **Action**: `REPLACE_FILE` (full ES5 rewrite)
- **Line Range**: 1 - 461
- **Original Block**: current file (461 lines, ES6: import, export; body is already var/function style; Promise in enqueue kept)
- **New Block**: full ES5 CommonJS file. Rules: `var createactor = require('./actorkernel.js').createactor;` + verbosity requires; keep entire body (already ES5-style); replace `export { ... }` with `module.exports = { DBMESSAGETYPES, DBACTOR, startDbActor, serializeDna, deserializeDna, consolidateGraph, restoreGraph, serializePairStore, deserializePairStore, optimizeSerializedDna, deoptimizeSerializedDna, enqueueDbStore, enqueueDbRestore, enqueueDbList, enqueueDbDelete }`.
- **ES5 output gate**: zero `import|export|const|let|=>|async|await|\?\.|` backtick.

## OPERATION_5
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/actors/mailactor.js`
- **Action**: `REPLACE_FILE` (full ES5 rewrite)
- **Line Range**: 1 - 244
- **Original Block**: current file (244 lines, ES6: import, export, const-free but `async function loadInitialMailState`, `async function awaitResponse`, top-level `await loadInitialMailState()` at L144 — MUST be removed for CJS, arrows in Object.keys().forEach)
- **New Block**: full ES5 CommonJS file. Rules: requires at top (`createactor`, enqueueDbStore/Restore/Delete, verbosity); `loadInitialMailState()` becomes a plain function returning a promise (async keyword removed); top-level await replaced with synchronous `createInitialMailState()` as the initial state passed to `createactor`, then a post-load `enqueueDbRestore('actor:state:mail').then(...)` merge that updates `MAILACTOR.getstate()` when saved state exists (preserves persistence semantics without top-level await); `awaitResponse` becomes non-async polling using promise chain + setTimeout recursion; `Object.keys(payload).forEach(function(key) {...})`; `module.exports = { MAILACTOR, MAILMESSAGETYPES, startMailActor, sendInstruction, requestUnreadMessages, sendResponse, awaitResponse, generateTag }`.
- **ES5 output gate**: zero `import|export|const|let|=>|async|await|\?\.|` backtick; zero top-level `await`.

## VERIFICATION (per plan §5)
1. `node --check` each of the 5 files → exit 0.
2. grep gates per file.
3. require-load: `node -e "require('./js/evalstack.js'); require('./js/factory/callwithstack.js'); require('./js/actors/dbactor.js'); require('./js/actors/mailactor.js'); require('./js/actors/actorkernel.js'); console.log('WAVE1 LOADED')"` — note mailactor/actorkernel require-load may touch localStorage via dbactor getStorage (returns null in Node — safe).
