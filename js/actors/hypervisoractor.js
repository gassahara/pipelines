var HYPERVISORVERBOSITYCONSTANTS = createVerbosityConstants();

function ENSUREHYPERVISORSLICE(env) {
  return ENSUREENVSLICE(env, 'hypervisor', function() {
    return {
      boot: true,
      envByPipeline: {},
      renderHtml: '',
      executionStack: [],
      routes: {},
      activePipelines: [],
      programs: {},
      loadedPipelines: {},
      nextStageMessages: {}
    };
  });
}

function CREATEHYPERVISORERRORCONTEXT(label) {
  return function(err) {
    if (!err) err = new Error('unknown hypervisor error');
    if (!err.diagnostic) err.diagnostic = {};
    err.diagnostic.hypervisorstage = label;
    throw err;
  };
}

function REGISTERHYPERVISORPIPELINE(hyperSlice, pipelineId) {
  if (!hyperSlice.activePipelines) hyperSlice.activePipelines = [];
  if (hyperSlice.activePipelines.indexOf(pipelineId) === -1) {
    hyperSlice.activePipelines.push(pipelineId);
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'hypervisor', value: hyperSlice }]
    }, GENERATETAG(), 'HYPERVISORACTOR');
  }
}

function COMPILESTAGEFROMSTOREDDNA(hyperSlice, pipelineId, stagePath, env, options) {
  var entry = hyperSlice.loadedPipelines && hyperSlice.loadedPipelines[pipelineId];
  if (!entry || !entry.dna) {
    return Promise.resolve({ error: 'missing DNA for pipeline: ' + pipelineId });
  }
  return blockcompilerCompileStage(entry.dna, stagePath, env || {}, options || {});
}

function HANDLESTAGECOMPLETED(hyperSlice, message) {
  var key = message.pipelineId + ':' + message.stageId;
  loginfo(hyperSlice, '[HYPERVISOR]', 'action STAGE_COMPLETED:', key);

  if (message.sender && message.tag) {
    SENDRESPONSE(message.sender, message.tag, { stageId: message.stageId }, 'HYPERVISORACTOR', MESSAGETYPES.STAGE_COMPLETED_ACK);
  }

  if (message.env !== undefined && message.env !== null) {
    if (!hyperSlice.envByPipeline) hyperSlice.envByPipeline = {};
    if (!hyperSlice.envByPipeline[message.pipelineId]) hyperSlice.envByPipeline[message.pipelineId] = {};
    hyperSlice.envByPipeline[message.pipelineId].env = message.env;
    hyperSlice.envByPipeline[message.pipelineId].updatedAt = Date.now();
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      updates: [{ path: 'hypervisor', value: hyperSlice }]
    }, GENERATETAG(), 'HYPERVISORACTOR');
  }

  var nextMsg = message.nextStageMessage || (hyperSlice.nextStageMessages ? hyperSlice.nextStageMessages[key] : null);
  if (nextMsg) {
    if (hyperSlice.nextStageMessages && hyperSlice.nextStageMessages[key]) delete hyperSlice.nextStageMessages[key];
    var nextStagePath;
    if (nextMsg.stagePath && Array.isArray(nextMsg.stagePath) && nextMsg.stagePath.length > 0) {
      nextStagePath = nextMsg.stagePath;
    } else {
      nextStagePath = ['pipeline', 'elements', nextMsg.stageIndex];
    }
    COMPILESTAGEFROMSTOREDDNA(
      hyperSlice,
      nextMsg.pipelineId || message.pipelineId,
      nextStagePath,
      nextMsg.env || message.env || {},
      nextMsg.options || {}
    ).then(function() {
      // Next stage will send its own stage_completed
    }).catch(function(err) {
      logwarn(hyperSlice, '[HYPERVISOR]', 'next stage orchestration failed:', err);
    });
  } else {
    if (hyperSlice.activePipelines) {
      hyperSlice.activePipelines = hyperSlice.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
    }
  }
}

// Pure behavior function: (env, message) -> env
function HYPERVISORBEHAVIOR(env, message) {
  logdebug(env, '[HYPERVISOR]', 'behavior handling action:', message.type);

  var hyperSlice = ENSUREHYPERVISORSLICE(env);

  switch (message.type) {
    case MESSAGETYPES.LOAD:
      return env;
    case MESSAGETYPES.SAVE:
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.GET_ENV: {
      var p = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId];
      var result = p ? p.env : null;
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, result, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    }
    case MESSAGETYPES.SET_ENV: {
      if (!hyperSlice.envByPipeline) hyperSlice.envByPipeline = {};
      if (!hyperSlice.envByPipeline[message.pipelineId]) hyperSlice.envByPipeline[message.pipelineId] = {};
      hyperSlice.envByPipeline[message.pipelineId].env = message.env || {};
      hyperSlice.envByPipeline[message.pipelineId].updatedAt = Date.now();
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    }
    case MESSAGETYPES.GET_LATEST_ENV: {
      var pState = hyperSlice.envByPipeline && hyperSlice.envByPipeline[message.pipelineId];
      var latest = pState ? pState.env : null;
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, latest, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    }
    case MESSAGETYPES.GET_RENDER_HTML:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, hyperSlice.renderHtml || '', 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.SET_RENDER_HTML:
      hyperSlice.renderHtml = message.html || '';
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.GET_EXECUTION_STACK:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, hyperSlice.executionStack || [], 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.SET_EXECUTION_STACK:
      hyperSlice.executionStack = message.stack || [];
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.GET_ROUTE:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, hyperSlice.routes && message.key ? (hyperSlice.routes[message.key] || null) : null, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.SET_ROUTE:
      if (!hyperSlice.routes) hyperSlice.routes = {};
      hyperSlice.routes[message.key] = message.route || null;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.GET_ACTIVE_PIPELINES:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, (hyperSlice.activePipelines || []).slice(), 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.REGISTER_PIPELINE:
      REGISTERHYPERVISORPIPELINE(hyperSlice, message.pipelineId);
      return env;
    case MESSAGETYPES.UNREGISTER_PIPELINE:
      if (!hyperSlice.activePipelines) hyperSlice.activePipelines = [];
      hyperSlice.activePipelines = hyperSlice.activePipelines.filter(function(id) { return id !== message.pipelineId; });
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.SET_PROGRAM:
      if (!hyperSlice.programs) hyperSlice.programs = {};
      hyperSlice.programs[message.programKey] = message.programSource;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.GET_PROGRAM:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, hyperSlice.programs && message.programKey ? (hyperSlice.programs[message.programKey] || null) : null, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.MARK_BOOT:
      hyperSlice.boot = message.boot !== false;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return env;
    case MESSAGETYPES.EVENT_TRIGGERED: {
      var pipelineId = message.pipelineId;
      var stageId = message.stageId;
      var stagePath = message.stagePath || ['pipeline', 'elements', -1];

      var rootEntry = hyperSlice.envByPipeline && hyperSlice.envByPipeline[pipelineId];
      var envForTrigger = rootEntry ? rootEntry.env : { pipelineid: pipelineId };

      var loadedEntry = hyperSlice.loadedPipelines && hyperSlice.loadedPipelines[pipelineId];
      if (!loadedEntry || !loadedEntry.dna) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: 'missing loaded pipeline DNA' }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        return env;
      }

      loginfo(env, '[HYPERVISOR]', 'EVENT_TRIGGERED compiling stage:', pipelineId, stageId, stagePath);

      COMPILESTAGEFROMSTOREDDNA(hyperSlice, pipelineId, stagePath, envForTrigger, loadedEntry.options || {})
        .then(function() {
          if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { started: true }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        })
        .catch(function(err) {
          logwarn(env, '[HYPERVISOR]', 'EVENT_TRIGGERED compilation failed:', err);
          if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: err.message || String(err) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        });
      return env;
    }
    case MESSAGETYPES.PING:
      if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, true, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return env;
    case MESSAGETYPES.RECOVER:
      DBRESTORE('actor:state:hypervisor').then(function(saved) {
        if (saved && typeof saved === 'object') env.hypervisor = saved;
        else env.hypervisor = {
          boot: true, envByPipeline: {}, renderHtml: '', executionStack: [],
          routes: {}, activePipelines: [], programs: {}, loadedPipelines: {}, nextStageMessages: {}
        };
        SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
          updates: [{ path: 'hypervisor', value: env.hypervisor }]
        }, GENERATETAG(), 'HYPERVISORACTOR');
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, env, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      }).catch(function(e) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: e.message || String(e) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      });
      return env;
    case MESSAGETYPES.ACTIVATE_ACTORS:
      return env;
    case MESSAGETYPES.BOOT_PIPELINE: {
      var bootOptions = message.options || {};
      if (bootOptions.autorun === undefined) bootOptions.autorun = true;
      if (bootOptions.verbosity === undefined && env.verbosity !== undefined) bootOptions.verbosity = env.verbosity;

      var pipelineId = message.pipelineId;
      var dnaEnvelope = message.dna;
      if (!dnaEnvelope || !dnaEnvelope.definition) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: '[HYPERVISOR] missing DNA envelope' }, 'HYPERVISORACTOR', MESSAGETYPES.PIPELINE_BOOTED);
        return env;
      }

      hyperSlice.loadedPipelines = hyperSlice.loadedPipelines || {};
      hyperSlice.loadedPipelines[pipelineId] = {
        dna: dnaEnvelope,
        options: bootOptions,
        accessors: message.accessors || null,
        sinks: message.sinks || []
      };

      REGISTERHYPERVISORPIPELINE(hyperSlice, pipelineId);
      SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.PIPELINE_LOADED, { pipelineid: pipelineId, env: {} }, null, 'HYPERVISORACTOR');
      SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.REGISTER_PIPELINE, { pipelineid: pipelineId, dna: null, env: {} }, null, 'HYPERVISORACTOR');

      if (message.sender && message.tag) {
        SENDRESPONSE(message.sender, message.tag, { started: true, pipelineId: pipelineId }, 'HYPERVISORACTOR', MESSAGETYPES.PIPELINE_BOOTED);
      }

      var stagePath = message.stagePath || ['pipeline', 'elements', 0];
      COMPILESTAGEFROMSTOREDDNA(hyperSlice, pipelineId, stagePath, bootOptions.baseEnv || {}, bootOptions)
        .then(function() {})
        .catch(function(err) {
          logwarn(env, '[HYPERVISOR]', 'boot pipeline orchestration failed:', err);
        });

      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'hypervisor', value: hyperSlice }]
      }, GENERATETAG(), 'HYPERVISORACTOR');

      return env;
    }
    case MESSAGETYPES.COMPILE_STAGE: {
      logdebug(env, '[HYPERVISOR]', 'action COMPILE_STAGE:', message.pipelineId, 'stagePath:', JSON.stringify(message.stagePath));
      COMPILESTAGEFROMSTOREDDNA(
        hyperSlice,
        message.pipelineId,
        message.stagePath || ['pipeline','elements',0],
        message.env || {},
        message.options || {}
      ).then(function(res) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, res, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      }).catch(function(err) {
        if (message.sender && message.tag) SENDRESPONSE(message.sender, message.tag, { error: err.message || String(err) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      });
      return env;
    }
    case MESSAGETYPES.STAGE_COMPLETED: {
      HANDLESTAGECOMPLETED(hyperSlice, message);
      return env;
    }
    default:
      logwarn(env, '[HYPERVISOR]', 'unknown message type:', message.type);
      return env;
  }
}

function ENQUEUEHYPERVISOR(type, payload, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('HYPERVISORACTOR', type, payload || {}, tag, 'system', responseSpec);
}

function ENQUEUEHYPERVISORLOAD(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.LOAD, {}, responseSpec); }
function ENQUEUEHYPERVISORSAVE(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SAVE, {}, responseSpec); }
function ENQUEUEHYPERVISORGETENV(pipelineId, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_ENV, { pipelineId: pipelineId }, responseSpec); }
function ENQUEUEHYPERVISORSETENV(pipelineId, env, stageId, elementId, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SET_ENV, { pipelineId: pipelineId, env: env, stageId: stageId, elementId: elementId }, responseSpec); }
function ENQUEUEHYPERVISORGETLATESTENV(pipelineId, stageId, elementId, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_LATEST_ENV, { pipelineId: pipelineId, stageId: stageId, elementId: elementId }, responseSpec); }
function ENQUEUEHYPERVISORGETRENDERHTML(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_RENDER_HTML, {}, responseSpec); }
function ENQUEUEHYPERVISORSETRENDERHTML(html, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SET_RENDER_HTML, { html: html }, responseSpec); }
function ENQUEUEHYPERVISORGETEXECUTIONSTACK(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_EXECUTION_STACK, {}, responseSpec); }
function ENQUEUEHYPERVISORSETEXECUTIONSTACK(stack, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SET_EXECUTION_STACK, { stack: stack }, responseSpec); }
function ENQUEUEHYPERVISORGETROUTE(key, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_ROUTE, { key: key }, responseSpec); }
function ENQUEUEHYPERVISORSETROUTE(key, route, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SET_ROUTE, { key: key, route: route }, responseSpec); }
function ENQUEUEHYPERVISORGETACTIVEPIPELINES(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_ACTIVE_PIPELINES, {}, responseSpec); }
function ENQUEUEHYPERVISORREGISTERPIPELINE(pipelineId, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.REGISTER_PIPELINE, { pipelineId: pipelineId }, responseSpec); }
function ENQUEUEHYPERVISORUNREGISTERPIPELINE(pipelineId, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.UNREGISTER_PIPELINE, { pipelineId: pipelineId }, responseSpec); }
function ENQUEUEHYPERVISORSETPROGRAM(programKey, programSource, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SET_PROGRAM, { programKey: programKey, programSource: programSource }, responseSpec); }
function ENQUEUEHYPERVISORGETPROGRAM(programKey, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.GET_PROGRAM, { programKey: programKey }, responseSpec); }
function ENQUEUEHYPERVISORMARKBOOT(boot, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.MARK_BOOT, { boot: boot }, responseSpec); }
function ENQUEUEHYPERVISORPING(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.PING, {}, responseSpec); }
function ENQUEUEHYPERVISORACTIVATEACTORS(responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.ACTIVATE_ACTORS, {}, responseSpec); }
function ENQUEUEHYPERVISORBOOTPIPELINE(payload, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.BOOT_PIPELINE, payload, responseSpec); }
function ENQUEUEHYPERVISORSTAGECOMPLETED(pipelineId, stageId, nextStageMessage, env, responseSpec) { return ENQUEUEHYPERVISOR(MESSAGETYPES.STAGE_COMPLETED, { pipelineId: pipelineId, stageId: stageId, nextStageMessage: nextStageMessage, env: env }, responseSpec); }

function STARTHYPERVISORACTOR(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    dispatch: function(message) { return DISPATCHTOACTOR('HYPERVISORACTOR', HYPERVISORBEHAVIOR, message); }
  };
}
