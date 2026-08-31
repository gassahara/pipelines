# INSTRUCTIONS: Wave 5 — blockcompiler (PROGRAMS tier, largest async surface)
Derived From: PLAN_ITER0.md Wave 5; renderactor consumer-surface audit
Generated: 2026-08-31

## OPERATION_1
- **Target**: `/mnt/ntfs_nvme0n1p3/gassa/comp/shared-functions/pipelines/js/factory/blockcompiler.js`
- **Action**: `REPLACE_FILE` (ES5 + CPS + mail-pattern crypto)
- **Line Range**: 1 - 854
- **Original Block**: current file (ES6: 7 import blocks, `export function loadPipeline/compileStage`, `export {...}`, 10 `async function` compilers + processPipelineElement blockfn, ~35 await sites, computed property `{[outputkey]: result}` L471, `RENDERACTOR.send({...resolve, reject})` L470 — resolve/reject anti-pattern)
- **New Block**: ES5 module. Key transforms:
  1. Imports → require + destructure. Modules: apiactor (enqueueapi, enqueuefetch), callwithstack (callwithstack), evalstack (EVALSTACK), dnaserializer (4 names), verbosity (5 names), renderactor (enqueuehtml, expectelement, enqueuegethtml, enqueuegetvalue, enqueuegetstyle, enqueuegetposition, enqueuesethtml, enqueuesetposition, enqueuesetstyle, enqueuesetvalue, enqueueproperty, enqueuegetlayout, enqueuetlayout, enqueuetoggleclass, enqueuegetviewport, enqueuegetscreen, enqueuematchmedia, enqueueRenderRegisterTriggerExpectation, enqueueRenderCrypto), executionactor (enqueueExecutionSubmit, enqueueExecutionAwaitTask, enqueueExecutionGetStatus, enqueueExecutionGetTasks, enqueueExecutionGetTaskStatus, enqueueExecutionCancelTask, enqueueExecutionStopTask), hypervisoractor (enqueueHypervisorBootPipeline, enqueueHypervisorSetStageDescriptor, enqueueHypervisorStageCompleted), dbactor (enqueueDbStore, enqueueDbRestore, enqueueDbList, enqueueDbDelete).
  2. PURGE unused imports: DOMQUERYGETTERS, DOMQUERYMESSAGES, RENDERACTOR, MESSAGETYPES, enqueueExecutionPipelineLoaded, enqueueExecutionEnvUpdated, enqueueExecutionRegisterPipeline, enqueueHypervisorRegisterPipeline, enqueueHypervisorUnregisterPipeline, enqueueHypervisorGetEnv, enqueueRenderRevalidateTriggers, enqueueRenderRestoreBodyHtml (verified unused in body L1-854). Renderactor consumer surface shrinks accordingly — recorded for Wave 8.
  3. CRYPTO compiler: `RENDERACTOR.send({type, bytes, resolve, reject})` → `enqueueRenderCrypto(bytes)` (new mail-based wrapper, defined in renderactor Wave 8: sendInstruction + awaitResponse, no resolve/reject in messages). Computed property `{[outputkey]: result}` → `var out = {}; out[outputkey] = result;`.
  4. All `async function(env)` → `function(env)` returning promise chains: await → .then accumulation; the callwithstack inner `async function()` → plain function returning the promise from enqueue*.
  5. `export function` / `export {...}` → `module.exports = { loadPipeline, compileStage, compileStageRequestToElements, orchestrateStage, validatePipelineBriefcase }`.
  6. Default params already use `if (x === undefined)` guards in body — retained.
- **Gate**: node --check; grep zero real ES6 (async/await/import/export/const/let/=>/?.); NO RENDERACTOR.send, NO resolve/reject in messages. Load test DEFERRED (blockcompiler requires still-ESM actor modules — full load test at Wave 8 end).

## VERIFICATION
1. node --check.
2. grep gates (incl. anti-pattern scan: `RENDERACTOR.send`, `resolve: resolve, reject: reject`).
3. Behaviour: deferred to Wave 8 integrated load + execution test (blockcompiler compiles a pipeline end-to-end through the mail system).
