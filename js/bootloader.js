var PIPELINES_MANIFEST = [
  { src: 'messageregistry.js', provides: ['MESSAGEREGISTRY', 'MESSAGETYPES'] },
  { src: 'verbosity.js', provides: ['createVerbosityConstants', 'createVerbosityFunctions', 'getverbosity', 'setverbosity', 'logcritical', 'logerror', 'logwarn', 'loginfo', 'logdebug', 'getverbosityname'] },
  { src: 'functorial/maybe.js', provides: ['JUST', 'NOTHING', 'of', 'fromnullable', 'getorelselazy', 'MAYBEALGEBRA'] },
  { src: 'evalstack.js', provides: ['createevalstack', 'EVALSTACK', 'frames', 'pushframe', 'popframe', 'peekframe', 'snapshotstack', 'restorestack', 'currentcontinuation', 'chaincontinuations'] },
  { src: 'factory/callwithstack.js', provides: ['callwithstack', 'runwithstack'] },
  { src: 'factory/colorutils.js', provides: ['ColorCore', 'ColorHarmony', 'ColorContrast'] },
  { src: 'factory/closureconsolidator.js', provides: ['consolidateClosures'] },
  { src: 'factory/freevarparser.js', provides: ['detectFreeIdentifiers', 'isIdentifierStart', 'isIdentifierPart', 'containsIdentifier', 'findMatchingParen', 'findBodyBrace'] },
  { src: 'factory/domqueryconstants.js', provides: ['DOMQUERYGETTERS', 'DOMQUERYSETTERS', 'DOMQUERYMESSAGES'] },
  { src: 'actors/actorgc.js', provides: ['createGarbageCollector', 'registerObject', 'updateStatus', 'incrementSent', 'incrementReceived', 'collectEnded', 'listObjects'] },
  { src: 'actors/actorregistry.js', provides: ['createActorRegistry', 'setRenderActor', 'getRenderActor'] },
  { src: 'actors/trigerregistry.js', provides: ['createTriggerRegistry', 'registerTrigger', 'unregisterTrigger', 'revalidateAll', 'getTriggerMap'] },
  { src: 'factory/layoutdirectives.js', provides: ['createLayoutDirectives'] },
  { src: 'fundamental/domref.js', provides: ['GETRAWELEMENT', 'CREATEDOMREF', 'REMOVEREF', 'ISVALIDDOMREF'] },
  { src: 'typesystem.js', provides: ['TYPESCHEMA', 'validateFields', 'validate', 'validatecall', 'validateschema', 'validateformalblock', 'validatestageflow', 'validatemonadalgebra', 'validateblockio', 'validateblockfnio', 'validatecontainerrefs', 'validatespawncontracts', 'validateblocktype', 'validatedomqueryblock', 'validateexecutionqueryblock', 'validatestorequeryblock', 'validateblockproperties'] },
  { src: 'factory/stylizerutilities.js', provides: ['StylizerCore', 'StylizerRewrite', 'StylizerVerify'] },
  { src: 'factory/dnaserializer.js', provides: ['createDnaSerializerConstants', 'validaterevivablefunctionblock', 'validaterevivableobject', 'resolveFromBriefcase', 'prepareFunctionForSerialization', 'serializeSelfContainedClosure'] },
  { src: 'debugformatter.js', provides: ['formatdebugtrace'] },
  { src: 'actors/actorkernel.js', provides: ['registerActorState', 'getActorState', 'setActorState', 'dispatchImmutable', 'dispatchToActor', 'ensureEnvSlice', 'createMessageValidator', 'pingActor', 'getActorRegistry'] },
  { src: 'utils.js', provides: ['createApiConstants', 'escapehtml', 'markdowntohtml', 'formataitext', 'resolvepath', 'getprop', 'getproperty', 'getfunction', 'setproperty', 'createnodefromtemplate', 'deepmerge'] },
  { src: 'actors/dbactor.js', provides: ['dbbehavior', 'serializeDna', 'deserializeDna', 'consolidateGraph', 'restoreGraph', 'serializePairStore', 'deserializePairStore', 'optimizeSerializedDna', 'deoptimizeSerializedDna', 'enqueueDbStore', 'enqueueDbRestore', 'enqueueDbList', 'enqueueDbDelete', 'startDbActor'], owner: 'dbactor', types: ['store', 'restore', 'list', 'delete'] },
  { src: 'actors/mailactor.js', provides: ['mailbehavior', 'generateTag', 'sendInstruction', 'sendResponse', 'startMailActor'], owner: 'mailactor', types: ['send', 'ack'] },
  { src: 'actors/worldmapactor.js', provides: ['worldmapbehavior', 'startWorldmapActor', 'sendworldmappatch', 'updateworldmapfn', 'observeworldmap', 'unobserveworldmap', 'getworldmap'], owner: 'worldmapactor', types: ['update', 'update_fn', 'observe', 'unobserve', 'get_worldmap'] },
  { src: 'actors/apiactor.js', provides: ['apibehavior', 'enqueueapi', 'enqueuefetch'], owner: 'apiactor', types: ['api', 'fetch'] },
  { src: 'actors/debugactor.js', provides: ['debugbehavior', 'enqueueDebugPing', 'enqueueDebugRecover'], owner: 'debugactor', types: ['init_overlay', 'show', 'hide', 'recover', 'ping'] },
  { src: 'actors/executionactor.js', provides: ['executionbehavior', 'enqueueExecutionPipelineLoaded', 'enqueueExecutionSubmit', 'enqueueExecutionAwaitTask', 'enqueueExecutionGetTasks', 'enqueueExecutionGetTaskStatus', 'enqueueExecutionCancelTask', 'enqueueExecutionStopTask', 'enqueueExecutionGetStatus', 'enqueueExecutionEnvUpdated', 'enqueueExecutionCccAbort', 'enqueueExecutionCccContinue', 'enqueueExecutionCccRetry', 'enqueueExecutionRegisterPipeline', 'enqueueExecutionRecover', 'enqueueExecutionPing', 'startExecutionActor', 'ensureExecutionActorReady'], owner: 'executionactor', types: ['pipeline_loaded', 'env_updated', 'get_status', 'execute_element', 'await_task', 'get_tasks', 'get_task_status', 'cancel_task', 'stop_task', 'ccc_abort', 'ccc_continue', 'ccc_retry', 'task_settled', 'recover', 'register_pipeline', 'ping'] },
  { src: 'context.js', provides: ['createinitialworldmap', 'updateworldmap', 'observeworldmap', 'select'] },
  { src: 'actors/renderactor.js', provides: ['renderbehavior', 'enqueuerender', 'enqueueclear', 'enqueuehtml', 'enqueueremove', 'enqueuestyles', 'enqueuesetattr', 'enqueuetoggleclass', 'enqueuecreateelement', 'enqueuecreatecontainer', 'enqueuecreatefromhtml', 'enqueuegethtml', 'enqueuegetvalue', 'enqueuegetstyle', 'enqueuegetposition', 'enqueuesethtml', 'enqueuesetposition', 'enqueuesetstyle', 'enqueuesetvalue', 'enqueueproperty', 'enqueuegetlayout', 'enqueuesetlayout', 'enqueuegetviewport', 'enqueuegetscreen', 'enqueuematchmedia', 'enqueueRenderRegisterTrigger', 'enqueueRenderRegisterTriggerExpectation', 'enqueueRenderRevalidateTriggers', 'enqueueRenderPing', 'enqueueRenderGetBodyHtml', 'enqueueRenderRestoreBodyHtml', 'enqueueRenderRecover', 'enqueueRenderCrypto', 'startRenderActor', 'expectelement', 'handlefilereaderrequest'], owner: 'renderactor', types: ['render', 'clear', 'html', 'remove', 'setstyles', 'setattr', 'toggleclass', 'crypto', 'geolocation', 'persistence', 'createelement', 'createcontainer', 'createfromhtml', 'property', 'gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout', 'sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'getviewport', 'getscreen', 'matchmedia', 'get_body_html', 'restore_body_html', 'recover', 'ping', 'register_trigger', 'register_trigger_expectation', 'revalidate_triggers'] },
  { src: 'factory/blockcompiler.js', provides: ['loadPipeline', 'compileStage', 'resolveNextElement', 'orchestrateStage', 'validatePipelineBriefcase', 'blockcompilerApiResult', 'blockcompilerFetchResult', 'blockcompilerTaskResult', 'blockcompilerPipelineBooted', 'blockcompilerDomResult', 'blockcompilerStageCompletedAck'] },
  { src: 'actors/hypervisoractor.js', provides: ['hypervisorbehavior', 'enqueueHypervisorLoad', 'enqueueHypervisorSave', 'enqueueHypervisorGetEnv', 'enqueueHypervisorSetEnv', 'enqueueHypervisorGetLatestEnv', 'enqueueHypervisorGetRenderHtml', 'enqueueHypervisorSetRenderHtml', 'enqueueHypervisorGetExecutionStack', 'enqueueHypervisorSetExecutionStack', 'enqueueHypervisorGetRoute', 'enqueueHypervisorSetRoute', 'enqueueHypervisorGetActivePipelines', 'enqueueHypervisorRegisterPipeline', 'enqueueHypervisorUnregisterPipeline', 'enqueueHypervisorSetProgram', 'enqueueHypervisorGetProgram', 'enqueueHypervisorMarkBoot', 'enqueueHypervisorSetStageDescriptor', 'enqueueHypervisorGetTriggerRecipientStatus', 'enqueueHypervisorTrigger', 'enqueueHypervisorPing', 'enqueueHypervisorActivateActors', 'enqueueHypervisorBootPipeline', 'enqueueHypervisorStageCompleted', 'startHypervisorActor'], owner: 'hypervisoractor', types: ['load', 'save', 'get_env', 'set_env', 'get_latest_env', 'get_render_html', 'set_render_html', 'get_execution_stack', 'set_execution_stack', 'get_route', 'set_route', 'get_active_pipelines', 'register_pipeline', 'unregister_pipeline', 'set_program', 'get_program', 'mark_boot', 'set_stage_descriptor', 'get_trigger_recipient_status', 'trigger_event', 'ping', 'recover', 'activate_actors', 'boot_pipeline', 'compile_stage', 'stage_completed'] },
  { src: 'registerconsumers.js', provides: ['REGISTERED_CONSUMERS'] }
];

function getRoot() {
  return (typeof window !== 'undefined') ? window : globalThis;
}

function checkExistence(entry) {
  var root = getRoot();
  var missing = [];
  entry.provides.forEach(function(name) {
    if (typeof root[name] === 'undefined') missing.push(name);
  });
  return { ok: missing.length === 0, missing: missing };
}

function checkRegistration(entry) {
  if (!entry.owner) return { ok: true, missing: [] };
  var missing = [];
  entry.types.forEach(function(type) {
    if (typeof MESSAGEREGISTRY.getHandler(entry.owner, type) !== 'function') missing.push(type);
  });
  return { ok: missing.length === 0, missing: missing };
}

function checkStateRegistration(entry) {
  if (!entry.owner) return { ok: true };
  if (entry.owner !== 'worldmapactor') return { ok: true };
  var state = getActorState('worldmapactor');
  return { ok: state !== undefined, missing: state === undefined ? 'worldmapactor' : null };
}

function runPipelineBoot(loadProgram, report, manifest) {
  var list = manifest || PIPELINES_MANIFEST;
  var index = 0;
  var entries = list.slice();
  var loadFailures = [];

  function loadNext() {
    if (index >= entries.length) {
      var regFailures = [];
      entries.forEach(function(entry) {
        if (entry.owner) {
          var reg = checkRegistration(entry);
          if (!reg.ok) {
            regFailures.push({ src: entry.src, missingTypes: reg.missing });
          }
          var st = checkStateRegistration(entry);
          if (!st.ok) {
            regFailures.push({ src: entry.src, missingState: st.missing });
          }
        }
      });

      if (regFailures.length) {
        report({ ok: false, failures: regFailures, loaded: entries.length });
      } else {
        report({ ok: true, failures: [], loaded: entries.length });
      }
      return;
    }

    var entry = entries[index];
    loadProgram(entry, function(err) {
      if (err) {
        loadFailures.push({ src: entry.src, error: err });
        report({ ok: false, failures: loadFailures, loaded: index });
        return;
      }
      var exists = checkExistence(entry);
      if (!exists.ok) {
        loadFailures.push({ src: entry.src, missingGlobals: exists.missing });
        report({ ok: false, failures: loadFailures, loaded: index });
        return;
      }
      index = index + 1;
      loadNext();
    });
  }

  loadNext();
}

var PIPELINES_BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
  ? document.currentScript.src.slice(0, document.currentScript.src.lastIndexOf('/') + 1)
  : '';

function bootPipeline(onDone) {
  function loadScript(entry, done) {
    var s = document.createElement('script');
    s.src = PIPELINES_BASE + entry.src;
    s.onload = function() { done(null); };
    s.onerror = function() { done(new Error('failed to load ' + entry.src)); };
    document.head.appendChild(s);
  }
  runPipelineBoot(loadScript, function(result) {
    if (result.ok) {
      console.log('[BOOTLOADER] all ' + result.loaded + ' programs loaded, existence tests passed');
    } else {
      console.error('[BOOTLOADER] BOOT FAILED after ' + result.loaded + ' programs:', JSON.stringify(result.failures));
    }
    if (typeof onDone === 'function') onDone(result);
  });
}
