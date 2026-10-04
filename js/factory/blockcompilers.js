function buildproperties(merged, inherited) {
  if (inherited === undefined) inherited = {};
  return Object.keys(merged).reduce(function(result, key) {
    if (key !== 'fn' && key !== 'behaviour') result[key] = merged[key];
    return result;
  }, cloneobject(inherited));
}

function buildblockproperties(merged, inherited, io, env) {
  if (inherited === undefined) inherited = {};
  if (io === undefined) io = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'buildblockproperties for block:', merged.id, 'type:', merged.type);

  var properties = buildproperties(merged, inherited);
  var inputsobj = {};

  assertdefinedinputs(
    merged.id || 'unknown',
    io.inputs || [],
    env,
    compilepathaccessor,
    merged.allowundefinedinputs === true
  );

  (io.inputs || []).forEach(function(name) {
    inputsobj[name] = compilepathaccessor(name)(env);
  });

  properties.inputs = inputsobj;
  properties.outputs = io.outputs || {};

  if (merged && merged.deps) {
    if (Array.isArray(merged.deps)) {
      var depsmap = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
      var resolveddeps = {};
      var missingdeps = [];
      merged.deps.forEach(function(name) {
        if (typeof depsmap[name] !== 'undefined') {
          resolveddeps[name] = depsmap[name];
        } else {
          missingdeps.push(name);
        }
      });
      if (missingdeps.length > 0) {
        throw new Error('[buildblockproperties] Missing dependencies for block "' + merged.id + '": ' + missingdeps.join(', '));
      }
      properties.deps = resolveddeps;
    } else {
      properties.deps = merged.deps;
    }
  }

  if (merged.type === 'fn' || merged.type === 'writer') {
    if (!Array.isArray(io.inputs)) {
      throw new Error('[FN_CONTRACT] block "' + (merged.id || 'unknown') + '" must declare "inputs" as an array of strings');
    }
    if (typeof io.outputs !== 'object' || io.outputs === null || Array.isArray(io.outputs)) {
      throw new Error('[FN_CONTRACT] block "' + (merged.id || 'unknown') + '" must declare "outputs" as an object');
    }
    if (merged.deps !== undefined && !Array.isArray(merged.deps)) {
      throw new Error('[FN_CONTRACT] block "' + (merged.id || 'unknown') + '" must declare "deps" as an array of strings');
    }
    var analysis = analyzefnblock(merged, properties.deps || {}, env, blockcompilertools.parsesource);
    if (!analysis.valid) {
      var analysisdiagkind = (analysis.diagnostics && analysis.diagnostics.kind) ? analysis.diagnostics.kind : null;
      var analysisblockid = merged.id || 'unknown';
      if (analysisdiagkind === 'parser-rejected' || analysisdiagkind === 'parser-absent') {
        throw new Error('[FN_ANALYSIS_FAILED] block "' + analysisblockid + '" analysis could not complete (' +
          analysisdiagkind + '): ' + analysis.violations.join(', '));
      }
      throw new Error('[FN_PURITY_VIOLATION] block "' + analysisblockid + '" has undeclared free identifiers: ' + analysis.violations.join(', '));
    }
  }

  return properties;
}

function buildpayload(mappingobj, data) {
  return Object.keys(mappingobj).reduce(function(result, fieldkey) {
    var mappingdef = mappingobj[fieldkey];
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(data);
    else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
      result[fieldkey] = mappingdef.from !== undefined ? data[mappingdef.from] : buildpayload(mappingdef, data);
    } else result[fieldkey] = mappingdef;
    return result;
  }, {});
}

function buildresponse(mappingobj, raw) {
  return Object.keys(mappingobj).reduce(function(result, fieldkey) {
    var mappingdef = mappingobj[fieldkey];
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(raw);
    else if (typeof mappingdef === 'object' && mappingdef !== null && mappingdef.from !== undefined) result[fieldkey] = raw[mappingdef.from];
    else if (typeof mappingdef === 'object' && mappingdef !== null) result[fieldkey] = buildresponse(mappingdef, raw);
    else result[fieldkey] = raw[mappingdef];
    return result;
  }, {});
}

function createerrorcontext(id, stagetype) {
  return function(err) {
    err.diagnostic = err.diagnostic || {};
    err.diagnostic.BLOCKID = id;
    err.diagnostic.STAGETYPE = stagetype;
    throw err;
  };
}

function unwrap(response) {
  if (!response) return {};
  if (response.RESULT !== undefined) return response.RESULT;
  if (response.result !== undefined) return response.result;
  var inner = response.PAYLOAD;
  if (inner && typeof inner === 'object') {
    if (inner.RESULT !== undefined) return inner.RESULT;
    if (inner.result !== undefined) return inner.result;
  }
  return response;
}

function wrapblockresult(response, sig) {
  var outputkeys = Object.keys(sig.outputs || {});
  if (outputkeys.length === 0) return {};
  if (outputkeys.length === 1) {
    var wrapped = {};
    wrapped[outputkeys[0]] = response;
    return wrapped;
  }
  return response;
}

// ============================================================
// B6 — Composite-error capture
// ============================================================

// @proposal=P38-refined-rev5 — the composite-block error capture.
// @proposal=P41 — attemptsubmit guards synchronous throws.
// @proposal=P43 — suppressshow sentinel.
// @proposal=P55 — built via makegenerator.
// @proposal=P-CCC-FLOW-009 — the CCC registers its settlement handler
// under the wrapped block's innertoken. The CCCNOTIFY connector on
// DISPATCHRESPOND fires this handler when a response carrying
// CCC_TOKEN=innertoken is delivered. The broadcast subscriptions are
// retained as the secondary settlement channel.
// @proposal=CP2 (ARC-49) — the local error binding `_e` is renamed to
// ERRTHROWN.
function makecaptureerror(wrapped, policy) {
  if (!wrapped || wrapped.element !== 'BLOCK') {
    var ERRTHROWN = new Error('[makecaptureerror] wrapped must be a block value');
    ERRTHROWN.diagnostic = { KIND: 'invalid-argument', ARG: 'wrapped', RECEIVED: typeof wrapped };
    throw ERRTHROWN;
  }
  var innertoken = wrapped.token;
  var resolvedpolicy = (typeof policy === 'function') ? policy : defaultpolicy;

  function defaultpolicy(context) { return 'default'; }

  function contextfor(msg, env, attempt) {
    return {
      ERROR: msg.ERROR,
      DIAGNOSTIC: msg.DIAGNOSTIC,
      ENV: env,
      ATTEMPT: attempt,
      TARGETID: wrapped.id
    };
  }

  function errorfromcontext(msg) {
    var failureerror = new Error((msg && msg.ERROR) ? msg.ERROR : 'captureerror abort');
    failureerror.diagnostic = (msg && msg.DIAGNOSTIC) ? msg.DIAGNOSTIC : {};
    return failureerror;
  }

  function onfailed(msg, env, attempt) {
    return resolvedpolicy(contextfor(msg, env, attempt));
  }

  function onexecuted(msg) {
    return msg.RESULT || {};
  }

  function behaviour(env) {
    var attempt = 0;
    var subfailed = null;
    var subexecuted = null;
    var settled = false;
    var resolvepromise = null;
    var rejectpromise = null;

    // @proposal=P-CCC-FLOW-009 — cleanup also unregisters the CCC
    // handler (the primary flow-side settlement channel).
    function cleanup() {
      if (subfailed !== null) UNSUBSCRIBEBROADCAST(subfailed);
      if (subexecuted !== null) UNSUBSCRIBEBROADCAST(subexecuted);
      if (typeof UNREGISTERCCCHANDLER === 'function') {
        UNREGISTERCCCHANDLER(innertoken);
      }
      subfailed = null;
      subexecuted = null;
    }

    function settle(fn, value) {
      if (settled === true) return;
      settled = true;
      cleanup();
      fn(value);
    }

    function attemptsubmit(submissionenv) {
      try {
        var p = submitwrapped(wrapped, submissionenv);
        if (p && typeof p.catch === 'function') {
          p.catch(function (ignored) { /* outcome arrives via the settlement channels */ });
        }
      } catch (sync) {
        settle(rejectpromise, sync);
      }
    }

    function handlefailure(msg) {
      attempt = attempt + 1;
      var decision = onfailed(msg, env, attempt);
      if (decision === 'retry') { attemptsubmit(env); return; }
      if (decision === 'continue') { settle(resolvepromise, {}); return; }
      settle(rejectpromise, errorfromcontext(msg));
    }

    function handlesuccess(msg) {
      settle(resolvepromise, onexecuted(msg));
    }

    return new Promise(function (resolve, reject) {
      resolvepromise = resolve;
      rejectpromise = reject;

      // Secondary channel — the broadcast fan-out.
      subfailed = SUBSCRIBEBROADCAST(
        { TYPE: 'BLOCKFAILED', TOKEN: innertoken },
        handlefailure
      );
      subexecuted = SUBSCRIBEBROADCAST(
        { TYPE: 'BLOCKEXECUTED', TOKEN: innertoken },
        handlesuccess
      );

      // Primary channel — the CCC registry. Fired by DISPATCHRESPOND's
      // connector when a response carries CCC_TOKEN=innertoken. The
      // signal has shape { TYPE, TAG, SENDER, RESPONSE }.
      if (typeof REGISTERCCCHANDLER === 'function') {
        REGISTERCCCHANDLER(innertoken, function (signal) {
          if (!signal) return;
          if (signal.TYPE === 'BLOCKEXECUTED') { handlesuccess(signal); return; }
          if (signal.TYPE === 'BLOCKFAILED') { handlefailure(signal); return; }
        });
      }

      attemptsubmit(env);
    });
  }

  return makegenerator('captureerror', wrapped, behaviour, {
    policy: resolvedpolicy,
    onfailed: onfailed,
    onexecuted: onexecuted
  });
}

// @proposal=P38-refined-rev5 / @proposal=P43 / @proposal=P52 — submitwrapped.
function submitwrapped(block, env) {
  var submissionenv = {};
  Object.keys(env || {}).forEach(function (k) { submissionenv[k] = env[k]; });
  submissionenv.suppressshow = true;
  var compilerconstants = makecompilerconstants({});
  var compiled = compileblock(block, {}, compilerconstants, {});
  var wrapper = createpersistentelementwrapper(
    compiled, block, [], (env && env.pipelinename) || 'unknownpipeline', {}
  );
  return wrapper(submissionenv);
}

// ============================================================
// B8 — Block compilers
// ============================================================

function compilehttpblock(merged, id, sig, istextual, options) {
  var innerfn = function(env) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing http block:', id, 'type:', istextual ? 'fetch' : 'api', 'endpoint:', merged.endpoint);
    var inputaccessors = (sig.inputs || []).map(compilepathaccessor);
    var inputdata = {};
    (sig.inputs || []).forEach(function(inp, idx) { inputdata[inp] = inputaccessors[idx](env); });

    var endpoint = merged.endpoint;
    if (typeof merged.endpoint === 'string' && containspathaccessorchars(merged.endpoint)) {
      endpoint = compilepathaccessor(merged.endpoint)(env);
    }
    if (endpoint === undefined) endpoint = merged.endpoint;

    var payload = buildpayload(merged.mapping && merged.mapping.payload ? merged.mapping.payload : {}, inputdata);
    Object.keys(sig.outputs || {}).forEach(function(field) {
      if (payload[field] === undefined && inputdata[field] !== undefined) payload[field] = inputdata[field];
    });

    var timeout = merged.timeout || mailboxresolve('mailboxwaittimeout');

    return sendandawait('APIACTOR', istextual ? MESSAGETYPES.FETCH : MESSAGETYPES.API, {
      ENDPOINT: endpoint,
      METHOD: merged.method,
      PAYLOAD: payload,
      TOKEN: env.authsessionaccesstoken || ''
    }, timeout, istextual ? MESSAGETYPES.FETCHRESULT : MESSAGETYPES.APIRESULT)
      .then(function(result) {
        if (result && result.error) throw new Error(result.error);
        var finalresult = result && result.data !== undefined ? result.data : result;
        if (merged.mapping && merged.mapping.response && result && typeof result === 'object') {
          finalresult = buildresponse(merged.mapping.response, result);
        }
        if (typeof merged.validate === 'function' && merged.validate(finalresult) === false) {
          var envelopeerror = new Error('[ENVELOPE_INVALID]');
          envelopeerror.diagnostic = { KIND: 'envelope-invalid' };
          throw envelopeerror;
        }
        return wrapblockresult(finalresult, sig);
      });
  };

  return wrapcompiledfn(innerfn, istextual ? 'fetch' : 'api', id);
}

function loaderexpressionsignature(merged, id) {
  if (typeof merged.behaviour !== 'function') {
    throw new Error('[LOADER] Block "' + id + '" must declare a behaviour function (the expression)');
  }
  if (merged.interval !== undefined) {
    if (typeof merged.interval !== 'number' || merged.interval <= 0 || Math.floor(merged.interval) !== merged.interval) {
      throw new Error('[LOADER] Block "' + id + '" interval must be a positive integer');
    }
  }
  if (merged.timeout !== undefined) {
    if (typeof merged.timeout !== 'number' || merged.timeout <= 0 || Math.floor(merged.timeout) !== merged.timeout) {
      throw new Error('[LOADER] Block "' + id + '" timeout must be a positive integer');
    }
  }
  if (merged.interval !== undefined && merged.timeout !== undefined && merged.timeout < merged.interval) {
    throw new Error('[LOADER] Block "' + id + '" timeout must be >= interval');
  }
  return true;
}

function compileloaderblock(merged, id, sig) {
  loaderexpressionsignature(merged, id);

  var expression = merged.behaviour;
  var interval = (merged.interval !== undefined) ? merged.interval : null;
  var timeout = (merged.timeout !== undefined) ? merged.timeout : null;
  var markup = (typeof merged.markup === 'string' && merged.markup !== '') ? merged.markup : null;
  var overlayid = id;
  var inputnames = Array.isArray(merged.inputs) ? merged.inputs : [];
  var allowundefined = merged.allowundefinedinputs === true;
  var properties = merged;

  var innerfn = function(env) {
    var effinterval = (interval !== null) ? interval : mailboxresolve('pollinterval');
    var efftimeout = (timeout !== null) ? timeout : mailboxresolve('expectationtimeout');
    var starttime = Date.now();

    function resolvestate() {
      var state = {};
      inputnames.forEach(function(name) {
        state[name] = compilepathaccessor(name)(env);
      });
      return state;
    }

    function assertinputs(state) {
      if (allowundefined) return;
      var missing = inputnames.filter(function(k) { return state[k] === undefined; });
      if (missing.length > 0) {
        throw new Error('[LOADER] Block "' + id + '" has undefined inputs: ' + missing.join(', '));
      }
    }

    function sendloading(action) {
      var tag = GENERATETAG();
      var payload = { ACTION: action, ID: overlayid };
      if (action === 'SHOW' && markup !== null) payload.MARKUP = markup;
      if (typeof SENDINSTRUCTION === 'function' && typeof MESSAGETYPES !== 'undefined') {
        SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.LOADINGINDICATOR, payload, tag, 'BLOCKCOMPILER');
      }
      return Promise.resolve();
    }

    function release() {
      return sendloading('HIDE');
    }

    function pollstep() {
      if (Date.now() - starttime >= efftimeout) {
        return release();
      }
      var state;
      try {
        state = resolvestate();
        assertinputs(state);
      } catch (stateerr) {
        return release().then(function() { throw stateerr; });
      }
      var presult;
      try {
        presult = expression(properties, state);
      } catch (sync) {
        return release().then(function() { throw sync; });
      }
      return Promise.resolve(presult).then(function(value) {
        if (!value) {
          return release();
        }
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(pollstep());
          }, effinterval);
        });
      });
    }

    function launchbackgroundpoll() {
      Promise.resolve().then(pollstep).catch(function(err) {
        logwarn(blockcompilerstate, '[BLOCKCOMPILER]', 'loader background poll error:', id, err);
      });
    }

    return sendloading('SHOW').then(function() {
      launchbackgroundpoll();
      return {};
    });
  };

  return wrapcompiledfn(innerfn, 'loader', id);
}

function createblockcompilers(blocktypes, inheritedkeys, options) {
  var compilers = {};

  compilers[blocktypes.fn] = function(merged, id, sig, inheritedproperties) {
    var runtime = {
      blockcompilerstate: blockcompilerstate,
      logdebug: logdebug,
      logblockdebug: logblockdebug,
      callwithstack: callwithstack,
      compilepathaccessor: compilepathaccessor,
      buildblockproperties: buildblockproperties,
      createerrorcontext: createerrorcontext
    };
    return compilefnblock(merged, id, sig, inheritedproperties, options, runtime);
  };

  compilers[blocktypes.api] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, false, options); };
  compilers[blocktypes.fetch] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, true, options); };

  compilers[blocktypes.writer] = function(merged, id, sig, inheritedproperties) {
    if (inheritedproperties === undefined) inheritedproperties = {};
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var innerfn = function(env) {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
      var fn = merged.behaviour;
      if (typeof fn !== 'function') throw new Error('[WRITER] Block "' + id + '" failed validation');
      var properties = buildblockproperties(merged, inheritedproperties, sig, env);
      var inputs = properties.inputs || {};
      var deps   = properties.deps   || {};
      return Promise.resolve(fn(inputs, deps, properties)).then(function(result) {
        if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) {
          throw new Error('[WRITER] Block "' + id + '" returned invalid result');
        }
        var target = merged.targetlabel || env.approot;
        if (!target) throw new Error('[WRITER] missing targetlabel/approot');

        return sendandawait('RENDERACTOR', MESSAGETYPES.HTML, {
          ID: target,
          MARKUP: result.html,
          APPEND: !merged.replace
        }, mailboxresolve('mailboxwaittimeout'), MESSAGETYPES.DOMRESULT)
          .then(function(response) {
            if (response && typeof response === 'object' && response.ERROR !== undefined) {
              var htmlErr = new Error('[WRITER] HTML action failed for "' + target + '": ' +
                (typeof response.ERROR === 'string' ? response.ERROR : JSON.stringify(response.ERROR)));
              htmlErr.diagnostic = { KIND: 'writer-html-failed', TARGET: target, RESPONSE: response };
              throw htmlErr;
            }
            logdebug(blockcompilerstate, '[BLOCKCOMPILER]',
              'writer HTML response for', target, ':',
              (response && response.ERROR ? 'error' : 'ok'));
            if (target && Object.keys(sig.outputs || {}).length > 0) {
              return EXPECTELEMENT(target, 5000, 500).then(function(domref) {
                env[Object.keys(sig.outputs)[0]] = result;
                env[target] = domref;
                return result;
              });
            }
            return result;
          });
      });
    };
    return wrapcompiledfn(innerfn, 'writer', id);
  };

  compilers[blocktypes.io] = function(merged, id, sig) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling IO block:', id);
    var innerfn = function(env) {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing IO block:', id);
      var io = merged.behaviour;
      if (typeof io !== 'function') throw new Error('io block "' + id + '" must declare a behaviour');
      var ioname = id;
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      return callwithstack(null, 'io:' + ioname, 'async-await', function(e) {
        return Promise.resolve(io(inputdata, e));
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') })
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'io', id);
  };

  compilers[blocktypes.domquery] = function(merged, id, sig) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling DOMQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var innerfn = function(env) {
      var cmd = merged.command && merged.command.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      var props = merged.command.properties || {};

      var resolvedvalue = props.value;
      if (typeof props.value === 'string' && (containspathaccessorchars(props.value) || (sig.inputs || []).indexOf(props.value) !== -1)) {
        resolvedvalue = compilepathaccessor(props.value)(env);
      }
      var resolvedclassname = props.classname;
      if (typeof props.classname === 'string' && (containspathaccessorchars(props.classname) || (sig.inputs || []).indexOf(props.classname) !== -1)) {
        resolvedclassname = compilepathaccessor(props.classname)(env);
      }
      var resolvedrules = props.rules;
      if (typeof props.rules === 'string' && (containspathaccessorchars(props.rules) || (sig.inputs || []).indexOf(props.rules) !== -1)) {
        resolvedrules = compilepathaccessor(props.rules)(env);
      }
      var resolvedsafeprops = props.safeprops;
      if (typeof props.safeprops === 'string' && (containspathaccessorchars(props.safeprops) || (sig.inputs || []).indexOf(props.safeprops) !== -1)) {
        resolvedsafeprops = compilepathaccessor(props.safeprops)(env);
      }
      var resolvedthemestyles = props.themestyles;
      if (typeof props.themestyles === 'string' && (containspathaccessorchars(props.themestyles) || (sig.inputs || []).indexOf(props.themestyles) !== -1)) {
        resolvedthemestyles = compilepathaccessor(props.themestyles)(env);
      }
      var resolvedoptions = props.options;
      if (typeof props.options === 'string' && (containspathaccessorchars(props.options) || (sig.inputs || []).indexOf(props.options) !== -1)) {
        resolvedoptions = compilepathaccessor(props.options)(env);
      }
      var resolvedviewport = props.viewport;
      if (typeof props.viewport === 'string' && (containspathaccessorchars(props.viewport) || (sig.inputs || []).indexOf(props.viewport) !== -1)) {
        resolvedviewport = compilepathaccessor(props.viewport)(env);
      }

      var msgtype;
      switch (cmd) {
        case 'gethtml': msgtype = MESSAGETYPES.GETHTML; break;
        case 'getvalue': msgtype = MESSAGETYPES.GETVALUE; break;
        case 'getstyle': msgtype = MESSAGETYPES.GETSTYLE; break;
        case 'getposition': msgtype = MESSAGETYPES.GETPOSITION; break;
        case 'getlayout': msgtype = MESSAGETYPES.GETLAYOUT; break;
        case 'sethtml': msgtype = MESSAGETYPES.SETHTML; break;
        case 'setposition': msgtype = MESSAGETYPES.SETPOSITION; break;
        case 'setstyle': msgtype = MESSAGETYPES.SETSTYLE; break;
        case 'setvalue': msgtype = MESSAGETYPES.SETVALUE; break;
        case 'setlayout': msgtype = MESSAGETYPES.SETLAYOUT; break;
        case 'toggleclass': msgtype = MESSAGETYPES.TOGGLECLASS; break;
        case 'property': msgtype = MESSAGETYPES.PROPERTY; break;
        case 'getviewport': msgtype = MESSAGETYPES.GETVIEWPORT; break;
        case 'getscreen': msgtype = MESSAGETYPES.GETSCREEN; break;
        case 'matchmedia': msgtype = MESSAGETYPES.MATCHMEDIA; break;
        case 'getelements': msgtype = MESSAGETYPES.GETELEMENTS; break;
        case 'checkoverflow':            msgtype = MESSAGETYPES.CHECKOVERFLOW; break;
        case 'checkspacing':             msgtype = MESSAGETYPES.CHECKSPACING; break;
        case 'checkoverlap':             msgtype = MESSAGETYPES.CHECKOVERLAP; break;
        case 'checkscrollability':       msgtype = MESSAGETYPES.CHECKSCROLLABILITY; break;
        case 'checkcontrolledoverlay':   msgtype = MESSAGETYPES.CHECKCONTROLLEDOVERLAY; break;
        case 'correctoverflow':          msgtype = MESSAGETYPES.CORRECTOVERFLOW; break;
        case 'correctspacing':           msgtype = MESSAGETYPES.CORRECTSPACING; break;
        case 'correctoverlap':           msgtype = MESSAGETYPES.CORRECTOVERLAP; break;
        case 'correctscrollability':     msgtype = MESSAGETYPES.CORRECTSCROLLABILITY; break;
        case 'correctcontrolledoverlay': msgtype = MESSAGETYPES.CORRECTCONTROLLEDOVERLAY; break;
        case 'rewritestyleattrs':        msgtype = MESSAGETYPES.REWRITESTYLEATTRS; break;
        case 'consolidatestyles':        msgtype = MESSAGETYPES.CONSOLIDATESTYLES; break;
        case 'panelayout':               msgtype = MESSAGETYPES.PANELAYOUT; break;
        case 'palettegenerate':          msgtype = MESSAGETYPES.PALETTEGENERATE; break;
        case 'optimizecontrast':         msgtype = MESSAGETYPES.OPTIMIZECONTRAST; break;
        case 'optimizeharmony':          msgtype = MESSAGETYPES.OPTIMIZEHARMONY; break;
        case 'optimizetextvisibility':   msgtype = MESSAGETYPES.OPTIMIZETEXTVISIBILITY; break;
        case 'optimizebuttonvisibility': msgtype = MESSAGETYPES.OPTIMIZEBUTTONVISIBILITY; break;
        case 'verifycontrast':           msgtype = MESSAGETYPES.VERIFYCONTRAST; break;
        case 'verifytextvisibility':     msgtype = MESSAGETYPES.VERIFYTEXTVISIBILITY; break;
        case 'verifybuttonvisibility':   msgtype = MESSAGETYPES.VERIFYBUTTONVISIBILITY; break;
        case 'verifyharmony':            msgtype = MESSAGETYPES.VERIFYHARMONY; break;
        case 'checkfocusvisibility':     msgtype = MESSAGETYPES.CHECKFOCUSVISIBILITY; break;
        default: throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      }

      var outbound = {
        ID: props.id,
        VALUE: resolvedvalue,
        CLASSNAME: resolvedclassname,
        RULES: resolvedrules,
        SAFEPROPS: resolvedsafeprops,
        THEMESTYLES: resolvedthemestyles,
        MINRATIO: props.minratio,
        FORCE: props.force,
        QUERY: props.query,
        ARGUMENTS: props.arguments,
        NAME: props.name,
        TAGNAME: props.tagname,
        LIMIT: props.limit,
        OPTIONS: resolvedoptions
      };
      if (cmd === 'panelayout') {
        outbound.SHAPE = props.shape;
        outbound.VIEWPORT = resolvedviewport;
        if (props.height !== undefined) {
          outbound.HEIGHT = props.height;
        }
      }
      if (cmd === 'palettegenerate') {
        outbound.RULESET = props.ruleset;
        outbound.OVERRIDES = props.overrides;
      }

      return sendandawait('RENDERACTOR', msgtype, outbound, mailboxresolve('mailboxwaittimeout'), MESSAGETYPES.DOMRESULT)
        .then(function(r) {
          if (r && typeof r === 'object' && r.ERROR !== undefined) {
            var domqErr = new Error('[DOMQUERY] ' + cmd + ' failed for id "' + props.id + '": ' +
              (typeof r.ERROR === 'string' ? r.ERROR : JSON.stringify(r.ERROR)));
            domqErr.diagnostic = { KIND: 'domquery-renderactor-failed', CMD: cmd, ID: props.id, RESPONSE: r };
            throw domqErr;
          }
          logdebug(blockcompilerstate, '[BLOCKCOMPILER]',
            'domquery', cmd, 'for', props.id, ':',
            (r && typeof r === 'object' && r.ERROR ? 'error' : 'ok'));
          if (cmd === 'palettegenerate' && r && typeof r === 'object' && r.PALETTE !== undefined) {
            return wrapblockresult(r.PALETTE, sig);
          }
          return wrapblockresult(r, sig);
        });
    };
    return wrapcompiledfn(innerfn, 'domquery', id);
  };

  compilers[blocktypes.crypto] = function(merged, id, sig) {
    var innerfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      return sendandawait('RENDERACTOR', MESSAGETYPES.CRYPTO, { BYTES: bytes }, mailboxresolve('mailboxwaittimeout'), MESSAGETYPES.DOMRESULT)
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'crypto', id);
  };

  compilers[blocktypes.wait] = function(merged, id, sig) {
    var innerfn = function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      return new Promise(function(r) { setTimeout(r, ms); })
        .then(function() { return wrapblockresult({}, sig); });
    };
    return wrapcompiledfn(innerfn, 'wait', id);
  };

  compilers[blocktypes.executionquery] = function(merged, id, sig) {
    var innerfn = function(env) {
      var command = merged.command || {};
      var cmd = command.COMMAND;
      var args = command.args || {};
      var responsetype = MESSAGETYPES.TASKRESULT;
      var msgtype;
      switch (cmd) {
        case 'get': msgtype = MESSAGETYPES.GETSTATUS; break;
        case 'tasks': msgtype = MESSAGETYPES.GETTASKS; break;
        case 'taskstatus': msgtype = MESSAGETYPES.GETTASKSTATUS; break;
        case 'awaittask': msgtype = MESSAGETYPES.AWAITTASK; break;
        case 'canceltask': msgtype = MESSAGETYPES.CANCELTASK; break;
        case 'stoptask': msgtype = MESSAGETYPES.STOPTASK; break;
        default: throw new Error('[executionquery] unknown command: ' + cmd);
      }
      return sendandawait('EXECUTIONACTOR', msgtype, args, mailboxresolve('mailboxwaittimeout'), responsetype)
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'executionquery', id);
  };

  compilers[blocktypes.loader] = function(merged, id, sig) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling LOADER block:', id);
    return compileloaderblock(merged, id, sig);
  };

  compilers[blocktypes.captureerror] = function(merged, id, sig) {
    return wrapcompiledfn(merged.behaviour, 'captureerror', id);
  };

  return compilers;
}
