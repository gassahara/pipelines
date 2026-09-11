var HYPERVISORVERBOSITYCONSTANTS = createverbosityconstants();

// loadpipeline is defined globally by blockcompiler.js
// Ensure it is available (safety check)
if (typeof loadpipeline === 'undefined') {
  throw new Error('[HYPERVISORACTOR] loadpipeline is not defined. Ensure blockcompiler.js is loaded first.');
}

function ENSUREHYPERVISORSLICE(ENV) {
  return ENSUREENVSLICE(ENV, 'hypervisor', function() {
    return {
      BOOT: true,
      ENVBYPIPELINE: {},
      RENDERHTML: '',
      EXECUTIONSTACK: [],
      ROUTES: {},
      ACTIVEPIPELINES: [],
      PROGRAMS: {},
      LOADEDPIPELINES: {},
      NEXTSTAGEMESSAGES: {}
    };
  });
}

function CREATEHYPERVISORERRORCONTEXT(LABEL) {
  return function(ERR) {
    if (!ERR) ERR = new Error('unknown hypervisor error');
    if (!ERR.DIAGNOSTIC) ERR.DIAGNOSTIC = {};
    ERR.DIAGNOSTIC.HYPERVISORSTAGE = LABEL;
    throw ERR;
  };
}

function REGISTERHYPERVISORPIPELINE(HYPERSLICE, PIPELINEID) {
  if (!HYPERSLICE.ACTIVEPIPELINES) HYPERSLICE.ACTIVEPIPELINES = HYPERSLICE.ACTIVEPIPELINES || [];
  if (HYPERSLICE.ACTIVEPIPELINES.indexOf(PIPELINEID) === -1) {
    HYPERSLICE.ACTIVEPIPELINES.push(PIPELINEID);
    SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
      UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
    }, GENERATETAG(), 'HYPERVISORACTOR');
  }
}

function COMPILESTAGEFROMSTOREDDNA(HYPERSLICE, PIPELINEID, STAGEPATH, ENV, OPTIONS) {
  var LOADED = HYPERSLICE.LOADEDPIPELINES;
  var ENTRY = LOADED && LOADED[PIPELINEID];
  if (!ENTRY || !ENTRY.DNA) {
    return Promise.resolve({ ERROR: 'missing DNA for pipeline: ' + PIPELINEID });
  }
  var ENVMAP = HYPERSLICE.ENVBYPIPELINE;
  var LATESTENV = (ENVMAP && ENVMAP[PIPELINEID] && ENVMAP[PIPELINEID].ENV) || ENV || {};
  var COMPFN = (typeof blockcompilercompilestage === 'function') ? blockcompilercompilestage :
    ((typeof compilestage === 'function') ? compilestage : function() { return Promise.resolve(); });
  return COMPFN(ENTRY.DNA, STAGEPATH, LATESTENV, OPTIONS || {});
}

// Behavior function: (env, message) -> env | promise<env>
function HYPERVISORBEHAVIOR(ENV, MESSAGE) {
  logdebug(ENV, '[HYPERVISOR]', 'BEHAVIOR HANDLING ACTION:', MESSAGE.TYPE);

  var HYPERSLICE = ENSUREHYPERVISORSLICE(ENV);
  var PIPELINEID = MESSAGE.PIPELINEID || MESSAGE.pipelineId;

  switch (MESSAGE.TYPE) {
    case MESSAGETYPES.LOAD:
      return ENV;
    case MESSAGETYPES.SAVE:
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.GETENV: {
      var ENVMAP = HYPERSLICE.ENVBYPIPELINE;
      var P = ENVMAP && ENVMAP[PIPELINEID];
      var RESULT = P ? P.ENV : null;
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, RESULT, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    }
    case MESSAGETYPES.SETENV: {
      if (!HYPERSLICE.ENVBYPIPELINE) HYPERSLICE.ENVBYPIPELINE = HYPERSLICE.ENVBYPIPELINE || {};
      if (!HYPERSLICE.ENVBYPIPELINE[PIPELINEID]) HYPERSLICE.ENVBYPIPELINE[PIPELINEID] = {};
      HYPERSLICE.ENVBYPIPELINE[PIPELINEID].ENV = MESSAGE.ENV || {};
      HYPERSLICE.ENVBYPIPELINE[PIPELINEID].UPDATEDAT = Date.now();
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    }
    case MESSAGETYPES.GETLATESTENV: {
      var ENVMAP2 = HYPERSLICE.ENVBYPIPELINE;
      var PSTATE = ENVMAP2 && ENVMAP2[PIPELINEID];
      var LATEST = PSTATE ? PSTATE.ENV : null;
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, LATEST, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    }
    case MESSAGETYPES.GETRENDERHTML:
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, HYPERSLICE.RENDERHTML || '', 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    case MESSAGETYPES.SETRENDERHTML:
      HYPERSLICE.RENDERHTML = MESSAGE.HTML || '';
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.GETEXECUTIONSTACK:
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, HYPERSLICE.EXECUTIONSTACK || [], 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    case MESSAGETYPES.SETEXECUTIONSTACK:
      HYPERSLICE.EXECUTIONSTACK = MESSAGE.STACK || [];
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.GETROUTE:
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, HYPERSLICE.ROUTES && MESSAGE.KEY ? (HYPERSLICE.ROUTES[MESSAGE.KEY] || null) : null, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    case MESSAGETYPES.SETROUTE:
      if (!HYPERSLICE.ROUTES) HYPERSLICE.ROUTES = {};
      HYPERSLICE.ROUTES[MESSAGE.KEY] = MESSAGE.ROUTE || null;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.GETACTIVEPIPELINES:
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, (HYPERSLICE.ACTIVEPIPELINES || []).slice(), 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    case MESSAGETYPES.REGISTERPIPELINE:
      REGISTERHYPERVISORPIPELINE(HYPERSLICE, PIPELINEID);
      return ENV;
    case MESSAGETYPES.UNREGISTERPIPELINE:
      if (!HYPERSLICE.ACTIVEPIPELINES) HYPERSLICE.ACTIVEPIPELINES = HYPERSLICE.ACTIVEPIPELINES || [];
      HYPERSLICE.ACTIVEPIPELINES = HYPERSLICE.ACTIVEPIPELINES.filter(function(ID) { return ID !== PIPELINEID; });
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.SETPROGRAM: {
      var PROGKEY = MESSAGE.PROGRAMKEY || MESSAGE.programKey;
      var PROGSOURCE = MESSAGE.PROGRAMSOURCE || MESSAGE.programSource;
      if (!HYPERSLICE.PROGRAMS) HYPERSLICE.PROGRAMS = {};
      HYPERSLICE.PROGRAMS[PROGKEY] = PROGSOURCE;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    }
    case MESSAGETYPES.GETPROGRAM: {
      var PKEY = MESSAGE.PROGRAMKEY || MESSAGE.programKey;
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, HYPERSLICE.PROGRAMS && PKEY ? (HYPERSLICE.PROGRAMS[PKEY] || null) : null, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    }
    case MESSAGETYPES.MARKBOOT:
      HYPERSLICE.BOOT = MESSAGE.BOOT !== false;
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
      }, GENERATETAG(), 'HYPERVISORACTOR');
      return ENV;
    case MESSAGETYPES.EVENTTRIGGERED: {
      var STAGEID = MESSAGE.STAGEID || MESSAGE.stageId;
      var STAGEPATH = MESSAGE.STAGEPATH || MESSAGE.stagePath || ['pipeline', 'elements', -1];

      var LOADEDMAP = HYPERSLICE.LOADEDPIPELINES;
      var LOADEDENTRY = LOADEDMAP && LOADEDMAP[PIPELINEID];
      if (!LOADEDENTRY || !LOADEDENTRY.DNA) {
        if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: 'missing loaded pipeline DNA' }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        return ENV;
      }

      loginfo(ENV, '[HYPERVISOR]', 'EVENTTRIGGERED COMPILING STAGE:', PIPELINEID, STAGEID, STAGEPATH);

      var EVENTOPTIONS = LOADEDENTRY.OPTIONS || {};
      EVENTOPTIONS.ISEVENTTRIGGER = true;

      COMPILESTAGEFROMSTOREDDNA(HYPERSLICE, PIPELINEID, STAGEPATH, {}, EVENTOPTIONS)
        .then(function() {
          if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { STARTED: true }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        })
        .catch(function(ERR) {
          logwarn(ENV, '[HYPERVISOR]', 'EVENTTRIGGERED COMPILATION FAILED:', ERR);
          if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: ERR.message || String(ERR) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
        });
      return ENV;
    }
    case MESSAGETYPES.PING:
      if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, true, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      return ENV;
    case MESSAGETYPES.RECOVER:
      DBRESTORE('actor:state:hypervisor').then(function(SAVED) {
        if (SAVED && typeof SAVED === 'object') ENV.HYPERVISOR = SAVED;
        else ENV.HYPERVISOR = {
          BOOT: true, ENVBYPIPELINE: {}, RENDERHTML: '', EXECUTIONSTACK: [],
          ROUTES: {}, ACTIVEPIPELINES: [], PROGRAMS: {}, LOADEDPIPELINES: {}, NEXTSTAGEMESSAGES: {}
        };
        SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
          UPDATES: [{ PATH: 'hypervisor', VALUE: ENV.HYPERVISOR }]
        }, GENERATETAG(), 'HYPERVISORACTOR');
        if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, ENV, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      }).catch(function(E) {
        if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: E.message || String(E) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      });
      return ENV;
    case MESSAGETYPES.ACTIVATEACTORS:
      return ENV;

    // ===== REMOVED: BOOTPIPELINE case (no longer used) =====
    // The old BOOTPIPELINE case is removed; the new BOOTDNA case replaces it.
    // ===== END REMOVED =====

    // ===== REFACTORED BOOTDNA case =====
    case MESSAGETYPES.BOOTDNA: {
      loginfo(ENV, '[HYPERVISOR]', 'ACTION BOOTDNA for pipeline:', MESSAGE.pipelineId);

      var rawDNA = MESSAGE.dna;          // raw DNA object (e.g., shellpipeline)
      var pipelineId = MESSAGE.pipelineId || (rawDNA && (rawDNA.identity && rawDNA.identity.id) || rawDNA.id);
      var options = MESSAGE.options || {};

      if (!rawDNA || !pipelineId) {
        if (MESSAGE.SENDER && MESSAGE.TAG) {
          SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, {
            ERROR: 'BOOTDNA: missing dna or pipelineId',
            type: 'BOOTERROR'
          }, 'HYPERVISORACTOR', MESSAGETYPES.PIPELINEBOOTED);
        }
        return ENV;
      }

      // Store the raw DNA for potential future use (e.g., event stages, resumption)
      if (!HYPERSLICE.LOADEDPIPELINES) HYPERSLICE.LOADEDPIPELINES = {};
      HYPERSLICE.LOADEDPIPELINES[pipelineId] = {
        DNA: rawDNA,          // store the raw DNA
        OPTIONS: options,
        ACCESSORS: null,
        SINKS: []
      };

      // Check for existing environment (for resumability)
      var existingEnv = HYPERSLICE.ENVBYPIPELINE && HYPERSLICE.ENVBYPIPELINE[pipelineId];
      var stageIndex = 0;
      var env = {};

      if (existingEnv && existingEnv.ENV && existingEnv.currentStageIndex !== undefined) {
        // Resume from saved state
        stageIndex = existingEnv.currentStageIndex;
        env = existingEnv.ENV;
        loginfo(ENV, '[HYPERVISOR]', 'Resuming pipeline ' + pipelineId + ' at stage ' + stageIndex);
      } else {
        // Start fresh
        loginfo(ENV, '[HYPERVISOR]', 'Starting new pipeline ' + pipelineId + ' from stage 0');
        if (!HYPERSLICE.ENVBYPIPELINE) HYPERSLICE.ENVBYPIPELINE = {};
        HYPERSLICE.ENVBYPIPELINE[pipelineId] = {
          ENV: {},
          currentStageIndex: 0,
          status: 'running',
          startedAt: Date.now()
        };
        env = {};
      }

      // Call loadpipeline (internal) from blockcompiler, passing raw DNA
      return loadpipeline(rawDNA, stageIndex, env, options)
        .then(function(result) {
          var newEnv = result.env || env;
          var nextStageIndex = result.nextStageIndex;

          // Update environment state
          if (!HYPERSLICE.ENVBYPIPELINE) HYPERSLICE.ENVBYPIPELINE = {};
          if (!HYPERSLICE.ENVBYPIPELINE[pipelineId]) HYPERSLICE.ENVBYPIPELINE[pipelineId] = {};
          HYPERSLICE.ENVBYPIPELINE[pipelineId].ENV = newEnv;
          HYPERSLICE.ENVBYPIPELINE[pipelineId].currentStageIndex = (nextStageIndex !== null) ? nextStageIndex : -1;
          HYPERSLICE.ENVBYPIPELINE[pipelineId].status = (nextStageIndex === null) ? 'complete' : 'running';
          if (nextStageIndex === null) {
            HYPERSLICE.ENVBYPIPELINE[pipelineId].completedAt = Date.now();
          }
          SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
            UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
          }, GENERATETAG(), 'HYPERVISORACTOR');

          // Send success response (BOOTREADY)
          var responsePayload = {
            type: 'BOOTREADY',
            pipelineId: pipelineId,
            env: newEnv,
            currentStageIndex: nextStageIndex,
            status: HYPERSLICE.ENVBYPIPELINE[pipelineId].status
          };
          if (MESSAGE.SENDER && MESSAGE.TAG) {
            SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, responsePayload, 'HYPERVISORACTOR', MESSAGETYPES.PIPELINEBOOTED);
          }
          return ENV;
        })
        .catch(function(err) {
          logerror(ENV, '[HYPERVISOR]', 'BOOTDNA stage compilation failed:', err);
          var errorPayload = {
            type: 'BOOTERROR',
            pipelineId: pipelineId,
            ERROR: err.message || String(err),
            DIAGNOSTIC: err.diagnostic || {}
          };
          if (MESSAGE.SENDER && MESSAGE.TAG) {
            SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, errorPayload, 'HYPERVISORACTOR', MESSAGETYPES.PIPELINEBOOTED);
          }
          // Update status to error
          if (HYPERSLICE.ENVBYPIPELINE && HYPERSLICE.ENVBYPIPELINE[pipelineId]) {
            HYPERSLICE.ENVBYPIPELINE[pipelineId].status = 'error';
          }
          return ENV;
        });
    }
    // ===== END REFACTORED BOOTDNA =====

    case MESSAGETYPES.COMPILESTAGE: {
      var STAGEPATH = MESSAGE.STAGEPATH || MESSAGE.stagePath || ['pipeline', 'elements', 0];
      logdebug(ENV, '[HYPERVISOR]', 'ACTION COMPILESTAGE:', PIPELINEID, 'STAGEPATH:', JSON.stringify(STAGEPATH));
      COMPILESTAGEFROMSTOREDDNA(
        HYPERSLICE,
        PIPELINEID,
        STAGEPATH,
        MESSAGE.ENV || {},
        MESSAGE.OPTIONS || {}
      ).then(function(RES) {
        if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, RES, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      }).catch(function(ERR) {
        if (MESSAGE.SENDER && MESSAGE.TAG) SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: ERR.message || String(ERR) }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
      });
      return ENV;
    }

    // ===== REFACTORED STAGECOMPLETED case =====
    case MESSAGETYPES.STAGECOMPLETED: {
      loginfo(ENV, '[HYPERVISOR]', 'ACTION STAGECOMPLETED for pipeline:', MESSAGE.pipelineId, 'stage:', MESSAGE.stageId);
      var pipeId = MESSAGE.PIPELINEID || MESSAGE.pipelineId;
      var stageId = MESSAGE.STAGEID || MESSAGE.stageId;

      // Update environment state
      if (MESSAGE.ENV !== undefined && MESSAGE.ENV !== null) {
        if (!HYPERSLICE.ENVBYPIPELINE) HYPERSLICE.ENVBYPIPELINE = {};
        if (!HYPERSLICE.ENVBYPIPELINE[pipeId]) HYPERSLICE.ENVBYPIPELINE[pipeId] = {};
        HYPERSLICE.ENVBYPIPELINE[pipeId].ENV = MESSAGE.ENV;
        HYPERSLICE.ENVBYPIPELINE[pipeId].lastStageId = stageId;
        HYPERSLICE.ENVBYPIPELINE[pipeId].updatedAt = Date.now();
        SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
          UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
        }, GENERATETAG(), 'HYPERVISORACTOR');
      }

      // Determine next stage index
      var nextStageIndex = null;
      var nextMsg = MESSAGE.NEXTSTAGEMESSAGE || MESSAGE.nextStageMessage;
      if (nextMsg) {
        if (nextMsg.stageindex !== undefined) nextStageIndex = nextMsg.stageindex;
        else if (nextMsg.stageIndex !== undefined) nextStageIndex = nextMsg.stageIndex;
        else if (nextMsg.STAGEINDEX !== undefined) nextStageIndex = nextMsg.STAGEINDEX;
      }

      if (nextStageIndex !== null && nextStageIndex >= 0) {
        // There is a next stage – delegate to loadpipeline
        loginfo(ENV, '[HYPERVISOR]', 'Continuing pipeline ' + pipeId + ' to stage ' + nextStageIndex);
        // Retrieve the raw DNA for this pipeline
        var dnaEntry = HYPERSLICE.LOADEDPIPELINES && HYPERSLICE.LOADEDPIPELINES[pipeId];
        if (!dnaEntry || !dnaEntry.DNA) {
          logwarn(ENV, '[HYPERVISOR]', 'Missing DNA for pipeline ' + pipeId + ' – cannot continue');
          if (MESSAGE.SENDER && MESSAGE.TAG) {
            SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, { ERROR: 'Missing DNA for continuation' }, 'HYPERVISORACTOR', MESSAGETYPES.RESPONSE);
          }
          return ENV;
        }
        var rawDNA = dnaEntry.DNA;
        var env = MESSAGE.ENV || HYPERSLICE.ENVBYPIPELINE[pipeId].ENV || {};
        var options = dnaEntry.OPTIONS || {};

        // Call loadpipeline with raw DNA and next stage index
        loadpipeline(rawDNA, nextStageIndex, env, options)
          .then(function(result) {
            var newEnv = result.env || env;
            var nextNextIndex = result.nextStageIndex;

            // Update environment state
            if (!HYPERSLICE.ENVBYPIPELINE) HYPERSLICE.ENVBYPIPELINE = {};
            if (!HYPERSLICE.ENVBYPIPELINE[pipeId]) HYPERSLICE.ENVBYPIPELINE[pipeId] = {};
            HYPERSLICE.ENVBYPIPELINE[pipeId].ENV = newEnv;
            HYPERSLICE.ENVBYPIPELINE[pipeId].currentStageIndex = (nextNextIndex !== null) ? nextNextIndex : -1;
            HYPERSLICE.ENVBYPIPELINE[pipeId].status = (nextNextIndex === null) ? 'complete' : 'running';
            if (nextNextIndex === null) {
              HYPERSLICE.ENVBYPIPELINE[pipeId].completedAt = Date.now();
            }
            SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
              UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
            }, GENERATETAG(), 'HYPERVISORACTOR');

            // Acknowledge the STAGECOMPLETED message
            if (MESSAGE.SENDER && MESSAGE.TAG) {
              SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, {
                stageId: stageId,
                pipelineId: pipeId,
                nextStageIndex: nextNextIndex,
                status: HYPERSLICE.ENVBYPIPELINE[pipeId].status
              }, 'HYPERVISORACTOR', MESSAGETYPES.STAGECOMPLETEDACK);
            }
          })
          .catch(function(err) {
            logerror(ENV, '[HYPERVISOR]', 'Failed to compile next stage for pipeline ' + pipeId + ':', err);
            if (MESSAGE.SENDER && MESSAGE.TAG) {
              SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, {
                ERROR: err.message || String(err),
                DIAGNOSTIC: err.diagnostic || {}
              }, 'HYPERVISORACTOR', MESSAGETYPES.STAGECOMPLETEDACK);
            }
            // Update status to error
            if (HYPERSLICE.ENVBYPIPELINE && HYPERSLICE.ENVBYPIPELINE[pipeId]) {
              HYPERSLICE.ENVBYPIPELINE[pipeId].status = 'error';
            }
          });
      } else {
        // No next stage – pipeline complete
        loginfo(ENV, '[HYPERVISOR]', 'Pipeline ' + pipeId + ' completed.');
        if (HYPERSLICE.ENVBYPIPELINE && HYPERSLICE.ENVBYPIPELINE[pipeId]) {
          HYPERSLICE.ENVBYPIPELINE[pipeId].status = 'complete';
          HYPERSLICE.ENVBYPIPELINE[pipeId].completedAt = Date.now();
        }
        SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
          UPDATES: [{ PATH: 'hypervisor', VALUE: HYPERSLICE }]
        }, GENERATETAG(), 'HYPERVISORACTOR');
        if (MESSAGE.SENDER && MESSAGE.TAG) {
          SENDRESPONSE(MESSAGE.SENDER, MESSAGE.TAG, {
            stageId: stageId,
            pipelineId: pipeId,
            status: 'complete'
          }, 'HYPERVISORACTOR', MESSAGETYPES.STAGECOMPLETEDACK);
        }
      }
      return ENV;
    }
    // ===== END REFACTORED STAGECOMPLETED =====

    default:
      logwarn(ENV, '[HYPERVISOR]', 'UNKNOWN MESSAGE TYPE:', MESSAGE.TYPE);
      return ENV;
  }
}

function ENQUEUEHYPERVISOR(TYPE, PAYLOAD, RESPONSESPEC) {
  var TAG = GENERATETAG();
  SENDINSTRUCTION('HYPERVISORACTOR', TYPE, PAYLOAD || {}, TAG, 'system', RESPONSESPEC);
}

function ENQUEUEHYPERVISORLOAD(RESPONSESPEC) { return ENQUEUEHYPERVISOR(MESSAGETYPES.LOAD, {}, RESPONSESPEC); }
function ENQUEUEHYPERVISORSAVE(RESPONSESPEC) { return ENQUEUEHYPERVISOR(MESSAGETYPES.SAVE, {}, RESPONSESPEC); }
function ENQUEUEHYPERVISORGETENV(PIPELINEID, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETENV;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSETENV(PIPELINEID, ENV, STAGEID, ELEMENTID, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.SETENV;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID, ENV: ENV, STAGEID: STAGEID, ELEMENTID: ELEMENTID }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETLATESTENV(PIPELINEID, STAGEID, ELEMENTID, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETLATESTENV;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID, STAGEID: STAGEID, ELEMENTID: ELEMENTID }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETRENDERHTML(RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETRENDERHTML;
  return ENQUEUEHYPERVISOR(TYPE, {}, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSETRENDERHTML(HTML, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.SETRENDERHTML;
  return ENQUEUEHYPERVISOR(TYPE, { HTML: HTML }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETEXECUTIONSTACK(RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETEXECUTIONSTACK;
  return ENQUEUEHYPERVISOR(TYPE, {}, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSETEXECUTIONSTACK(STACK, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.SETEXECUTIONSTACK;
  return ENQUEUEHYPERVISOR(TYPE, { STACK: STACK }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETROUTE(KEY, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETROUTE;
  return ENQUEUEHYPERVISOR(TYPE, { KEY: KEY }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSETROUTE(KEY, ROUTE, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.SETROUTE;
  return ENQUEUEHYPERVISOR(TYPE, { KEY: KEY, ROUTE: ROUTE }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETACTIVEPIPELINES(RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETACTIVEPIPELINES;
  return ENQUEUEHYPERVISOR(TYPE, {}, RESPONSESPEC);
}
function ENQUEUEHYPERVISORREGISTERPIPELINE(PIPELINEID, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.REGISTERPIPELINE;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORUNREGISTERPIPELINE(PIPELINEID, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.UNREGISTERPIPELINE;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSETPROGRAM(PROGRAMKEY, PROGRAMSOURCE, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.SETPROGRAM;
  return ENQUEUEHYPERVISOR(TYPE, { PROGRAMKEY: PROGRAMKEY, PROGRAMSOURCE: PROGRAMSOURCE }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORGETPROGRAM(PROGRAMKEY, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.GETPROGRAM;
  return ENQUEUEHYPERVISOR(TYPE, { PROGRAMKEY: PROGRAMKEY }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORMARKBOOT(BOOT, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.MARKBOOT;
  return ENQUEUEHYPERVISOR(TYPE, { BOOT: BOOT }, RESPONSESPEC);
}
function ENQUEUEHYPERVISORPING(RESPONSESPEC) { return ENQUEUEHYPERVISOR(MESSAGETYPES.PING, {}, RESPONSESPEC); }
function ENQUEUEHYPERVISORACTIVATEACTORS(RESPONSESPEC) {
  var TYPE = MESSAGETYPES.ACTIVATEACTORS;
  return ENQUEUEHYPERVISOR(TYPE, {}, RESPONSESPEC);
}
function ENQUEUEHYPERVISORSTAGECOMPLETED(PIPELINEID, STAGEID, NEXTSTAGEMESSAGE, ENV, RESPONSESPEC) {
  var TYPE = MESSAGETYPES.STAGECOMPLETED;
  return ENQUEUEHYPERVISOR(TYPE, { PIPELINEID: PIPELINEID, STAGEID: STAGEID, NEXTSTAGEMESSAGE: NEXTSTAGEMESSAGE, ENV: ENV }, RESPONSESPEC);
}

function STARTHYPERVISORACTOR(OPTIONS) {
  if (OPTIONS !== undefined) {
    var LVL = typeof OPTIONS === 'number' ? OPTIONS :
      (OPTIONS && OPTIONS.VERBOSITY !== undefined ? OPTIONS.VERBOSITY : (OPTIONS && OPTIONS.VERBOSITYLEVEL));
    if (LVL !== undefined) {
      var ENV = GETACTORSTATE('WORLDMAPACTOR');
      if (ENV) ENV.VERBOSITY = LVL;
    }
  }
  return {
    GETSTATE: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    DISPATCH: function(MESSAGE) { return DISPATCHTOACTOR('HYPERVISORACTOR', HYPERVISORBEHAVIOR, MESSAGE); }
  };
}