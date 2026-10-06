function exchange(recipient, type, payload, timeout, responsetype, tag) {
  if (tag === undefined) tag = GENERATETAG();
  var ISRESPONSE = (typeof GETRESPONSETYPES === 'function')
    && GETRESPONSETYPES()[responsetype] === true;
  if (ISRESPONSE) {
    var P = SENDINSTRUCTION(
      recipient, type, payload, tag, 'BLOCKCOMPILER',
      { responsetype: responsetype }, null, 'promise'
    );
    return P.then(function (RESOLVED) {
      if (RESOLVED && typeof RESOLVED === 'object' && RESOLVED.RESPONSE !== undefined) {
        return RESOLVED.RESPONSE;
      }
      return RESOLVED;
    });
  }
  SENDINSTRUCTION(
    recipient, type, payload, tag, 'BLOCKCOMPILER',
    { responsetype: responsetype }, null, 'mailbox'
  );
  return WAITFORMAILBOX({ TAG: tag, SENDER: recipient, TYPE: responsetype }, timeout);
}

function sendandawait(recipient, type, payload, timeout, responsetype) {
  return exchange(recipient, type, payload, timeout, responsetype).then(function (V) {
    if (V === undefined) {
      var undefErr = new Error('[RESPONSE-SHAPE-VIOLATION] undefined response for responsetype ' + responsetype);
      undefErr.diagnostic = {
        KIND: 'response-shape-violation',
        RESPONSETYPE: responsetype,
        RECIPIENT: recipient,
        TYPE: type
      };
      throw undefErr;
    }
    if (V !== null && typeof V === 'object' && !Array.isArray(V) &&
        Object.prototype.hasOwnProperty.call(V, 'GC') &&
        Object.prototype.hasOwnProperty.call(V, 'HTML') &&
        Object.prototype.hasOwnProperty.call(V, 'VIEWPORT') &&
        Object.prototype.hasOwnProperty.call(V, 'TRIGGEROBSERVERINSTALLED')) {
      var sliceErr = new Error('[RESPONSE-SHAPE-VIOLATION] response for responsetype ' + responsetype +
        ' is the RENDERACTOR env slice (the response chain has been corrupted)');
      sliceErr.diagnostic = {
        KIND: 'response-shape-violation',
        RESPONSETYPE: responsetype,
        RECIPIENT: recipient,
        TYPE: type,
        RECEIVED_KEYS: Object.keys(V)
      };
      throw sliceErr;
    }
    return unwrap(V);
  });
}

// ============================================================
// B11b — Loader primitives
// ============================================================

function loadscriptwithwitness(entry, basepath, timeout) {
  // @proposal=P-FACTORY-ACTOR-NAME-INVERSION — the RENDERACTOR-owned
  // type names ('LOADSCRIPT' request, 'SCRIPTLOADED' response) are
  // obtained from their owner via RENDERACTORNAMES() rather than
  // inlined as string literals.
  var RNAMES = RENDERACTORNAMES();
  return sendandawait('RENDERACTOR', RNAMES.LOADSCRIPT,
                      { SRC: basepath + entry.src },
                      mailboxresolve('mailboxwaittimeout'),
                      RNAMES.SCRIPTLOADED)
    .then(function(response) {
      if (response && response.ERROR) throw new Error(response.ERROR);
      if (entry.provides && entry.provides.length > 0) {
        return waitforwitness(entry, timeout);
      }
    });
}

function loadscripts(entries, basepath, timeout, label) {
  if (typeof timeout === 'undefined') timeout = mailboxresolve('scriptwitnesstimeout');
  var normalized = normalizeentries(entries);
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', label, normalized.length);
  return loadscriptssequentially(normalized, basepath, timeout);
}

// @proposal=P43 — suppressshow pass-through.
function wrapcompiledfn(innerfn, kind, id, blockkind) {
  var blockfn = function(env) {
    return callwithstack(null, kind + ':' + id, 'async-await',
      function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        suppressshow: env.suppressshow === true,
        errk: createerrorcontext(id, kind)
      });
  };
  blockfn.id = id;
  if (blockkind !== undefined) blockfn.kind = blockkind;
  return blockfn;
}

// ============================================================
// B11c — Stage runners
// ============================================================

function tagfn(fn, meta) {
  if (meta.blockmeta !== undefined) fn.blockmeta = meta.blockmeta;
  if (meta.originalfn !== undefined) fn.originalfn = meta.originalfn;
  if (meta.kind !== undefined) fn.kind = meta.kind;
  return fn;
}

function resolvenextelement(stage, index) {
  if (!stage || !stage.elements || index >= stage.elements.length) return null;
  return stage.elements[index];
}

function processelement(el, pipelinename, stagepath, inherited, constants, dnaconstants, options) {
  var fn = compileblock(el, inherited, constants, options);
  tagfn(fn, {
    blockmeta: { id: el.id, type: el.type, replace: el.replace, sync: el.sync || 'awaited' },
    originalfn: (typeof el.behaviour === 'function') ? el.behaviour : null,
    kind: 'element'
  });
  return createpersistentelementwrapper(fn, el, stagepath, pipelinename, options);
}

function loadpipelinedependencies(pipelineslice, options) {
  var libs = (pipelineslice && pipelineslice.libs) || [];
  var deps = (pipelineslice && pipelineslice.programs) || [];
  var frameworkbase = (typeof pipelinesbase !== 'undefined') ? pipelinesbase : '';
  var frontbase = options && options.frontendbase ? options.frontendbase : (typeof frontendbase !== 'undefined' ? frontendbase : '');
  var witnesstimeout = options && options.witnesstimeout ? options.witnesstimeout : mailboxresolve('scriptwitnesstimeout');

  return loadframeworklibs(libs, frameworkbase, witnesstimeout)
    .then(function() {
      return loadfrontendprograms(deps, frontbase, witnesstimeout);
    });
}

function processpipelineelement(el, pipelinename, stagepath, inherited, options) {
  var elementid = el.id || 'pipelineunknown';

  if (typeof el.childstate !== 'function') {
    var thunkerr = new Error('[processpipelineelement] PIPELINE element "' + elementid + '" must declare "childstate" as a zero-argument function');
    thunkerr.diagnostic = { KIND: 'childstate-thunk-required', ELEMENTID: elementid, RECEIVED: typeof el.childstate };
    throw thunkerr;
  }

  var innerfn = function(env) {
    var parentenv = env;

    return Promise.resolve(el.childstate()).then(function(childstate) {
      if (!childstate || typeof childstate !== 'object') {
        var stateerr = new Error('[processpipelineelement] PIPELINE element "' + elementid + '" childstate() returned invalid state');
        stateerr.diagnostic = { KIND: 'state-invalid', ELEMENTID: elementid, RECEIVED: typeof childstate };
        throw stateerr;
      }

      if (!childstate.env) childstate.env = {};
      Object.keys(parentenv).forEach(function(k) {
        if (childstate.env[k] === undefined) {
          childstate.env[k] = parentenv[k];
        }
      });

      var derivedname = el.nameoverride || childstate.name || ('pipeline' + elementid);
      if (childstate.env.pipelinename === undefined) {
        childstate.env.pipelinename = derivedname;
      }
      if (el.container && childstate.env.containerid === undefined) {
        childstate.env.containerid = el.container;
      }

      var childoptions = el.options || {};
      if (childoptions.autorun === undefined) childoptions.autorun = true;
      if (childoptions.strictrefonly === undefined && options && options.strictrefonly !== undefined) {
        childoptions.strictrefonly = options.strictrefonly;
      }

      return run(childstate, childoptions).then(function(result) {
        var wrapped = wrapblockresult(result, { outputs: el.outputs || {} });
        var mapped = mapoutputs(wrapped, Object.keys(el.outputs || {}), el.outputs);
        Object.keys(mapped).forEach(function(k) { parentenv[k] = mapped[k]; });
        return wrapped;
      });
    });
  };

  return wrapcompiledfn(innerfn, 'pipeline', elementid, 'pipeline');
}

function registereventstage(stage, pipelinename, stagepath, env, options) {
  var sourceid = stage.control.sourceid;
  var event = stage.control.event;
  if (!sourceid || !event) {
    return Promise.reject(new Error('[registereventstage] EVENT stage missing sourceid/event'));
  }
  var payload = {
    PIPELINEID: pipelinename,
    STAGEID: stage.id,
    STAGEPATH: stagepath,
    SOURCEID: sourceid,
    EVENT: event,
    CONTROL: stage.control,
    ELEMENTS: stage.elements,
    STAGE: stage,
    ENV: env || {},
    BRIEFCASE: stage.briefcase || {},
    OPTIONS: options || {}
  };
  // @proposal=P-FACTORY-ACTOR-NAME-INVERSION — the RENDERACTOR-owned
  // type names ('REGISTEREVENTLISTENER' request,
  // 'EVENTLISTENERREGISTERED' response) are obtained from their owner
  // via RENDERACTORNAMES() rather than inlined as string literals.
  var RNAMES = RENDERACTORNAMES();
  return sendandawait('RENDERACTOR', RNAMES.REGISTEREVENTLISTENER, payload, mailboxresolve('mailboxwaittimeout'), RNAMES.EVENTLISTENERREGISTERED)
    .then(function(response) {
      if (response && response.error) {
        throw new Error('[registereventstage] Registration failed for ' + stage.id + ': ' + response.error);
      }
      if (response && response.RESULT !== undefined) return response.RESULT;
      if (response && response.result !== undefined) return response.result;
      return true;
    });
}

function processnestedstage(childstage, pipelinename, stagepath, constants, dnaconstants, options, runblocks) {
  return function(env) {
    return runstage(childstage, pipelinename, stagepath, env, options, runblocks);
  };
}

function buildrecoveryerrorstate(err, elementid, pipelinename, stagepath) {
  var diag = (err && err.diagnostic) || {};
  return {
    BLOCKID: diag.BLOCKID || elementid || null,
    ELEMENTID: diag.ELEMENTID || elementid || null,
    PIPELINEID: diag.PIPELINEID || pipelinename || null,
    STAGEPATH: diag.STAGEPATH || stagepath || [],
    KIND: diag.KIND || null,
    MESSAGE: (err && err.message) ? err.message : String(err)
  };
}

function dispatchcccrecovery(type, pipelinename, stagepath, elementid, continuation) {
  // @proposal=P-EXECUTIONACTOR-TYPE-PROVISION — the former guard
  //   `typeof MESSAGETYPES === 'undefined'`
  // is removed. No manifest-loaded file declares MESSAGETYPES, and the
  // guard, being always true, silently disabled CCC recovery dispatch.
  if (typeof SENDINSTRUCTION !== 'function') return;
  SENDINSTRUCTION('EXECUTIONACTOR', type, {
    PIPELINEID: pipelinename || 'UNKNOWNPIPELINE',
    PATH: (stagepath || []).concat([elementid]),
    ELEMENTID: elementid || 'UNKNOWNELEMENT',
    CONTINUATION: continuation || null
  }, null, 'BLOCKCOMPILER');
}

function runrecovery(stage, pipelinename, stagepath, env, options, runblocks) {
  var control = stage.control || {};
  var inputnames = control.inputs || [];
  var predicate = control.fn;

  var compilerconstants = makecompilerconstants(options);

  function buildstate(errorState) {
    var state = {};
    inputnames.forEach(function(k) {
      if (k === 'error') {
        state.error = errorState || null;
      } else {
        state[k] = env[k];
      }
    });
    if (inputnames.indexOf('error') === -1) {
      state.error = errorState || null;
    }
    return state;
  }

  function runchilddef(childdef, index, done, fail) {
    if (index >= (stage.elements || []).length) {
      done();
      return;
    }
    if (!childdef) { runchilddef(resolvenextelement(stage, index + 1), index + 1, done, fail); return; }

    if (childdef.element === 'BLOCK' && runblocks !== true) {
      runchilddef(resolvenextelement(stage, index + 1), index + 1, done, fail);
      return;
    }

    var elementfn;
    try {
      if (childdef.element === 'BLOCK') {
        elementfn = processelement(childdef, pipelinename, stagepath.concat([childdef.id]), {}, compilerconstants, {}, options);
      } else if (childdef.element === 'PIPELINE') {
        elementfn = processpipelineelement(childdef, pipelinename, stagepath.concat([childdef.id]), {}, options);
      } else if (childdef.element === 'STAGE') {
        elementfn = processnestedstage(childdef, pipelinename, stagepath.concat([childdef.id]), compilerconstants, {}, options, runblocks);
      } else {
        throw new Error('[runrecovery] unexpected element type: ' + childdef.element);
      }
    } catch (thrown) {
      fail(thrown, childdef);
      return;
    }

    Promise.resolve(elementfn).then(function(fn) {
      return fn(env);
    }).then(function() {
      runchilddef(resolvenextelement(stage, index + 1), index + 1, done, fail);
    }).catch(function(err) {
      fail(err, childdef);
    });
  }

  function evaluate(outcomeenv, errorstate, fromcapture, elementid, continuation) {
    var state = buildstate(errorstate);
    var outcome;
    try {
      outcome = predicate(control, state);
    } catch (e) {
      outcome = 'abort';
    }
    if (outcome === 'retry') {
      if (fromcapture) {
        dispatchcccrecovery('CCCRETRY', pipelinename, stagepath, elementid, continuation);
      }
      return Promise.resolve().then(function() {
        return runrecovery(stage, pipelinename, stagepath, outcomeenv, options, runblocks);
      });
    }
    if (outcome === 'continue') {
      if (fromcapture) {
        dispatchcccrecovery('CCCCONTINUE', pipelinename, stagepath, elementid, continuation);
      }
      return Promise.resolve(outcomeenv);
    }
    if (fromcapture) {
      dispatchcccrecovery('CCCABORT', pipelinename, stagepath, elementid, continuation);
    }
    var abortmessage = errorstate && errorstate.MESSAGE ? errorstate.MESSAGE : 'recovery abort';
    return Promise.reject(new Error(abortmessage));
  }

  return new Promise(function(resolve, reject) {
    runchilddef(resolvenextelement(stage, 0), 0, function() {
      evaluate(env, null, false, null, null).then(resolve).catch(reject);
    }, function(err, childdef) {
      var failingid = (childdef && childdef.id) ? childdef.id : 'elementunknown';
      env[failingid + 'retrycount'] = (env[failingid + 'retrycount'] || 0) + 1;
      var errorstate = buildrecoveryerrorstate(err, failingid, pipelinename, stagepath);
      var continuation = (err && err.diagnostic) ? err.diagnostic.CONTINUATION : null;
      evaluate(env, errorstate, true, failingid, continuation).then(resolve).catch(reject);
    });
  });
}

function runstage(stage, pipelinename, stagepath, env, options, runblocks) {
  if (!stage) return Promise.resolve(env);
  var kind = (stage.control && stage.control.command) || null;

  if (kind === 'EVENT') {
    return registereventstage(stage, pipelinename, stagepath, env, options)
      .then(function() { return env; });
  }

  if (kind === 'LOOP') {
    return runloop(stage, pipelinename, stagepath, env, options, 0, runblocks);
  }

  if (kind === 'RECOVERY') {
    return runrecovery(stage, pipelinename, stagepath, env, options, runblocks);
  }

  if (stage.async === true) {
    return callwithstack(
      null,
      'nested-stage:' + stage.id,
      'async-await',
      function() {
        orchestratestage(stage, pipelinename, env, stagepath, options || {}, runblocks)
          .catch(function(err) {
            logwarn(blockcompilerstate, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
          });
        return undefined;
      },
      [env],
      { context: { env: env }, capturecontinuation: true, attachcontinuation: false }
    );
  }

  return orchestratestage(stage, pipelinename, env, stagepath, options, runblocks);
}

function runloop(stage, pipelinename, stagepath, env, options, loopcount, runblocks) {
  var inputs = (stage.control && stage.control.inputs) || [];
  var state = {};
  inputs.forEach(function(k) { state[k] = env[k]; });

  var proceed = stage.control.fn(stage.control, state);
  if (!proceed) return Promise.resolve(env);

  return orchestratestage(stage, pipelinename, env, stagepath, options, runblocks)
    .then(function() {
      return runloop(stage, pipelinename, stagepath, env, options, loopcount + 1, runblocks);
    });
}

// @proposal=P-EVENT-STAGE-ISOLATION (RUN 157/158) — the three reads/writes
// of `blockcompilerstate.ACTIVECANCELLATIONTOKEN` that appeared in the
// deployed orchestratestage body have been removed. The framework has no
// notion of a single active stage; each message carries its own tag
// (GENERATETAG), each dispatch is independent (DISPATCHTOACTOR). Cancellation
// is identified by the stagetoken local — a per-invocation object — and by
// nothing else.
function orchestratestage(stage, pipelinename, env, stagepath, options, runblocks) {
  var compilerconstants = makecompilerconstants(options);
  var execute = runblocks === true;

  var index = 0;
  var stagetoken = { CANCELLED: false };

  function runnext() {
    if (index >= (stage.elements || []).length) {
      return Promise.resolve(env);
    }

    var elementdef = resolvenextelement(stage, index);
    if (!elementdef) {
      index++;
      return runnext();
    }

    if (elementdef.element === 'BLOCK' && !execute) {
      index++;
      return runnext();
    }

    var elementfn;
    if (elementdef.element === 'BLOCK') {
      elementfn = processelement(elementdef, pipelinename, stagepath.concat([elementdef.id]), {}, compilerconstants, {}, options);
    } else if (elementdef.element === 'PIPELINE') {
      elementfn = processpipelineelement(elementdef, pipelinename, stagepath.concat([elementdef.id]), {}, options);
    } else if (elementdef.element === 'STAGE') {
      elementfn = processnestedstage(elementdef, pipelinename, stagepath.concat([elementdef.id]), compilerconstants, {}, options, execute);
    } else {
      throw new Error('[orchestratestage] unexpected element type: ' + elementdef.element);
    }

    return Promise.resolve(elementfn).then(function(fn) {
      return fn(env);
    }).then(function() {
      index++;
      return runnext();
    }).catch(function(err) {
      stagetoken.CANCELLED = true;
      logerror(blockcompilerstate, '[BLOCKCOMPILER]', 'Element failed:', elementdef.id, err);
      throw err;
    });
  }

  return runnext();
}

// ============================================================
// B13 — Loader primitives
// ============================================================

function waitforwitness(entry, timeout) {
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function check() {
      if (!entry.provides || entry.provides.length === 0) return resolve();
      var alldefined = entry.provides.every(function(name) {
        return typeof window[name] !== 'undefined' || typeof globalThis[name] !== 'undefined';
      });
      if (alldefined) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('timeout waiting for witness from ' + entry.src));
      setTimeout(check, 10);
    }
    check();
  });
}

function loadscriptssequentially(entries, basepath, timeout) {
  if (!entries || entries.length === 0) return Promise.resolve();
  var index = 0;
  function loadnext() {
    if (index >= entries.length) return Promise.resolve();
    var entry = entries[index];
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'loading script:', entry.src);
    return loadscriptwithwitness(entry, basepath, timeout).then(function() {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'script loaded:', entry.src);
      index++;
      return loadnext();
    });
  }
  return loadnext();
}

function normalizeentries(entries) {
  return (entries || []).map(function(entry) {
    if (typeof entry === 'string') return { src: entry, provides: null };
    return entry;
  });
}

function loadframeworklibs(libs, basepath, timeout) {
  return loadscripts(libs, basepath, timeout, 'loading framework libs:');
}

function loadfrontendprograms(programs, basepath, timeout) {
  return loadscripts(programs, basepath, timeout, 'loading frontend programs:');
}

// ============================================================
// B14 — Finalizers
// ============================================================

function orchestratepipeline(p, stageindex, env, options, runblocks) {
  if (stageindex >= p.elements.length) return Promise.resolve(env);
  var stage = p.elements[stageindex];
  if (!stage || stage.element !== 'STAGE') {
    return orchestratepipeline(p, stageindex + 1, env, options, runblocks);
  }
  var stagepath = ['elements', stageindex];
  return runstage(stage, p.name, stagepath, env, options, runblocks)
    .then(function() {
      return orchestratepipeline(p, stageindex + 1, env, options, runblocks);
    });
}

function loadpipelineresources(p, options) {
  return loadpipelinedependencies(p, options);
}

function run(p, options) {
  if (options === undefined) options = {};
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'run pipeline:', p.name, 'type:', p.type);

  return loadpipelineresources(p, options).then(function() {
    if (options && options.roster === true) emitinitializationroster(p);
    var cenv = p.env || options.baseenv || {};
    return orchestratepipeline(p, 0, cenv, options, true).then(function(finalenv) {
      p.env = finalenv;
      loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'run pipeline complete:', p.name);
      return finalenv;
    });
  });
}

function compile(p, options) {
  if (options === undefined) options = {};
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'compile pipeline:', p.name, 'type:', p.type);
  return loadpipelineresources(p, options).then(function() {
    if (options && options.roster === true) emitinitializationroster(p);
    return p;
  });
}
