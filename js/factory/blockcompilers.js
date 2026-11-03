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

      var BNAMES = BROADCASTNAMES();
      subfailed = SUBSCRIBEBROADCAST(
        { TYPE: BNAMES.BLOCKFAILED, TOKEN: innertoken },
        handlefailure
      );
      subexecuted = SUBSCRIBEBROADCAST(
        { TYPE: BNAMES.BLOCKEXECUTED, TOKEN: innertoken },
        handlesuccess
      );

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

    var ANAMES = APIACTORNAMES();

    return sendandawait('APIACTOR', istextual ? ANAMES.FETCH : ANAMES.API, {
      ENDPOINT: endpoint,
      METHOD: merged.method,
      PAYLOAD: payload,
      TOKEN: env.authsessionaccesstoken || ''
    }, timeout, istextual ? ANAMES.FETCHRESULT : ANAMES.APIRESULT)
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

    var RNAMES = RENDERACTORNAMES();

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
      if (typeof SENDINSTRUCTION === 'function') {
        SENDINSTRUCTION('RENDERACTOR', RNAMES.LOADINGINDICATOR, payload, tag, 'BLOCKCOMPILER');
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

// ============================================================
// buildtheoriesdebug — theory-block diagnostic report
// @proposal=P-THEORY-DEBUG-1 (RUN 31, Frozen)
//
// Mirrors js/factory/theory.js's M3 (score) and M4 (winner: strict >,
// first-in-tie) semantics. Invoked only when the block's
// command.properties.debug === true. Pure (no mutation of block,
// leafast, deps). Total (never throws; per-witness and per-extractor
// errors captured into the report).
// ============================================================
function buildtheoriesdebug(block, leafast, deps) {
    if (!block || !Array.isArray(block.theories)) {
        return {
            schema: 'theoriesdebug.v1',
            error: 'invalid-theory-block',
            received_type: typeof block
        };
    }
    var leaf_count = Array.isArray(leafast) ? leafast.length : 0;

    function summarize_leaf() {
        if (!Array.isArray(leafast) || leafast.length === 0) {
            return { length: 0, first_node_kind: null, first_tag: null, first_text_preview: null };
        }
        var first = leafast[0];
        var kind = 'unknown';
        if (first && typeof first.tag === 'string') kind = 'element';
        else if (first && typeof first.text === 'string') kind = 'text';
        var tag = (kind === 'element') ? first.tag : null;
        var text = null;
        if (kind === 'text' && typeof first.text === 'string') {
            var t = first.text;
            text = t.length > 80 ? t.slice(0, 80) + '\u2026' : t;
        }
        return { length: leaf_count, first_node_kind: kind, first_tag: tag, first_text_preview: text };
    }

    function evalwitness(w, idx) {
        var entry = {
            index: idx,
            name: (w && typeof w.name === 'string') ? w.name : 'unknown',
            weight: (w && typeof w.weight === 'number') ? w.weight : 0,
            fired: false, threw: false, error_message: null
        };
        if (!w || !w.theoryfunction || typeof w.theoryfunction.fn !== 'function') {
            entry.threw = true;
            entry.error_message = 'witness fn not callable';
            return entry;
        }
        try {
            entry.fired = !!w.theoryfunction.fn(leafast, deps);
        } catch (e) {
            entry.threw = true;
            entry.error_message = (e && e.message) ? e.message : String(e);
        }
        return entry;
    }

    function evaltheory(t, idx) {
        var wits = (t && Array.isArray(t.witnesses)) ? t.witnesses : [];
        var wentries = wits.map(evalwitness);
        var score = wentries.reduce(function (acc, w) {
            return acc + (w.fired ? w.weight : 0);
        }, 0);
        return {
            index: idx,
            theoryid: (t && typeof t.theoryid === 'string') ? t.theoryid : 'unknown',
            score: score,
            is_winner: false,
            witness_count: wentries.length,
            witnesses: wentries,
            extractor_ran: false,
            extractor_result_type: 'undefined',
            extractor_result_length: null,
            extractor_result_sample: null,
            extractor_error_message: null
        };
    }

    var tentries = block.theories.map(evaltheory);

    var winner_idx = null;
    tentries.forEach(function (te, i) {
        if (winner_idx === null) { winner_idx = i; return; }
        if (te.score > tentries[winner_idx].score) { winner_idx = i; }
    });

    var winner_names = [];
    var winner_summary = null;

    if (winner_idx !== null) {
        tentries[winner_idx].is_winner = true;
        var wt = block.theories[winner_idx];
        if (wt && wt.extractor && typeof wt.extractor.fn === 'function') {
            try {
                var names = wt.extractor.fn(leafast, deps);
                tentries[winner_idx].extractor_ran = true;
                tentries[winner_idx].extractor_result_type = Array.isArray(names) ? 'array' : typeof names;
                if (Array.isArray(names)) {
                    tentries[winner_idx].extractor_result_length = names.length;
                    tentries[winner_idx].extractor_result_sample = names.slice(0, 3);
                    winner_names = names;
                }
            } catch (e) {
                tentries[winner_idx].extractor_ran = true;
                tentries[winner_idx].extractor_error_message =
                    (e && e.message) ? e.message : String(e);
            }
        }
        winner_summary = {
            theoryid: tentries[winner_idx].theoryid,
            score: tentries[winner_idx].score,
            names_count: (tentries[winner_idx].extractor_result_length !== null)
                ? tentries[winner_idx].extractor_result_length
                : 0
        };
    }

    var totals = tentries.reduce(function (acc, te) {
        return {
            theories_evaluated: acc.theories_evaluated + 1,
            witnesses_evaluated: acc.witnesses_evaluated + te.witnesses.length,
            witnesses_fired: acc.witnesses_fired + te.witnesses.filter(function (w) { return w.fired; }).length
        };
    }, { theories_evaluated: 0, witnesses_evaluated: 0, witnesses_fired: 0 });

    return {
        schema: 'theoriesdebug.v1',
        leafinput_count: leaf_count,
        leafinput_summary: summarize_leaf(),
        theories: tentries,
        winner: winner_summary,
        winner_names_verbatim: winner_names,
        totals: totals
    };
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

        var SENTINELATTR = 'data-writer-proof-id';
        var sentinelMarkup = '<span ' + SENTINELATTR + '="' + id +
          '" style="display:none" aria-hidden="true"></span>' + result.html;

        var RNAMES = RENDERACTORNAMES();

        return sendandawait('RENDERACTOR', RNAMES.HTML, {
          ID: target,
          MARKUP: sentinelMarkup,
          APPEND: !merged.replace
        }, mailboxresolve('mailboxwaittimeout'), RNAMES.DOMRESULT)
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

            var targetNode = document.getElementById(target);
            var sentinelFound = targetNode && targetNode.querySelector('[' + SENTINELATTR + '="' + id + '"]');
            if (!sentinelFound) {
              var proofErr = new Error('[WRITER-WRITE-PROOF-FAILED] writer "' + id +
                '" reported success but the sentinel was not found in #' + target);
              proofErr.diagnostic = {
                KIND: 'writer-write-proof-failed',
                BLOCKID: id,
                TARGET: target,
                SENTINEL: id
              };
              throw proofErr;
            }

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
      var resolvedsources = props.sources;
      if (typeof props.sources === 'string' && (containspathaccessorchars(props.sources) || (sig.inputs || []).indexOf(props.sources) !== -1)) {
        resolvedsources = compilepathaccessor(props.sources)(env);
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

      var RNAMES = RENDERACTORNAMES();

      var msgtype;
      switch (cmd) {
        case 'gethtml': msgtype = RNAMES.GETHTML; break;
        case 'getvalue': msgtype = RNAMES.GETVALUE; break;
        case 'getstyle': msgtype = RNAMES.GETSTYLE; break;
        case 'getposition': msgtype = RNAMES.GETPOSITION; break;
        case 'getlayout': msgtype = RNAMES.GETLAYOUT; break;
        case 'sethtml': msgtype = RNAMES.SETHTML; break;
        case 'setposition': msgtype = RNAMES.SETPOSITION; break;
        case 'setstyle': msgtype = RNAMES.SETSTYLE; break;
        case 'setvalue': msgtype = RNAMES.SETVALUE; break;
        case 'setlayout': msgtype = RNAMES.SETLAYOUT; break;
        case 'toggleclass': msgtype = RNAMES.TOGGLECLASS; break;
        case 'property': msgtype = RNAMES.PROPERTY; break;
        case 'getviewport': msgtype = RNAMES.GETVIEWPORT; break;
        case 'getscreen': msgtype = RNAMES.GETSCREEN; break;
        case 'matchmedia': msgtype = RNAMES.MATCHMEDIA; break;
        case 'getelements': msgtype = RNAMES.GETELEMENTS; break;
        case 'checkoverflow':            msgtype = RNAMES.CHECKOVERFLOW; break;
        case 'checkspacing':             msgtype = RNAMES.CHECKSPACING; break;
        case 'checkoverlap':             msgtype = RNAMES.CHECKOVERLAP; break;
        case 'checkscrollability':       msgtype = RNAMES.CHECKSCROLLABILITY; break;
        case 'checkcontrolledoverlay':   msgtype = RNAMES.CHECKCONTROLLEDOVERLAY; break;
        case 'correctoverflow':          msgtype = RNAMES.CORRECTOVERFLOW; break;
        case 'correctspacing':           msgtype = RNAMES.CORRECTSPACING; break;
        case 'correctoverlap':           msgtype = RNAMES.CORRECTOVERLAP; break;
        case 'correctscrollability':     msgtype = RNAMES.CORRECTSCROLLABILITY; break;
        case 'correctcontrolledoverlay': msgtype = RNAMES.CORRECTCONTROLLEDOVERLAY; break;
        case 'rewritestyleattrs':        msgtype = RNAMES.REWRITESTYLEATTRS; break;
        case 'settransformations':       msgtype = RNAMES.SETTRANSFORMATIONS; break;
        case 'consolidatestyles':        msgtype = RNAMES.CONSOLIDATESTYLES; break;
        case 'panelayout':               msgtype = RNAMES.PANELAYOUT; break;
        case 'palettegenerate':          msgtype = RNAMES.PALETTEGENERATE; break;
        case 'optimizecontrast':         msgtype = RNAMES.OPTIMIZECONTRAST; break;
        case 'optimizeharmony':          msgtype = RNAMES.OPTIMIZEHARMONY; break;
        case 'optimizetextvisibility':   msgtype = RNAMES.OPTIMIZETEXTVISIBILITY; break;
        case 'optimizebuttonvisibility': msgtype = RNAMES.OPTIMIZEBUTTONVISIBILITY; break;
        case 'verifycontrast':           msgtype = RNAMES.VERIFYCONTRAST; break;
        case 'verifytextvisibility':     msgtype = RNAMES.VERIFYTEXTVISIBILITY; break;
        case 'verifybuttonvisibility':   msgtype = RNAMES.VERIFYBUTTONVISIBILITY; break;
        case 'verifyharmony':            msgtype = RNAMES.VERIFYHARMONY; break;
        case 'checkfocusvisibility':     msgtype = RNAMES.CHECKFOCUSVISIBILITY; break;
        default: throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      }

      var outbound = {
        ID: props.id,
        VALUE: resolvedvalue,
        CLASSNAME: resolvedclassname,
        RULES: resolvedrules,
        SOURCES: resolvedsources,
        TRANSDUCERSET: props.transducerset,
        MODE: props.mode,
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

      return sendandawait('RENDERACTOR', msgtype, outbound, mailboxresolve('mailboxwaittimeout'), RNAMES.DOMRESULT)
        .then(function(r) {
          if (r && typeof r === 'object' && !Array.isArray(r) &&
              Object.prototype.hasOwnProperty.call(r, 'GC') &&
              Object.prototype.hasOwnProperty.call(r, 'HTML') &&
              Object.prototype.hasOwnProperty.call(r, 'VIEWPORT') &&
              Object.prototype.hasOwnProperty.call(r, 'TRIGGEROBSERVERINSTALLED')) {
            var shapeErr = new Error('[RESPONSE-SHAPE-VIOLATION] DOMQUERY ' + cmd +
              ' received the RENDERACTOR env slice for id "' + props.id +
              '" — the response chain has been corrupted');
            shapeErr.diagnostic = {
              KIND: 'response-shape-violation',
              CMD: cmd,
              ID: props.id,
              RECEIVED_KEYS: Object.keys(r)
            };
            throw shapeErr;
          }
          if (r && typeof r === 'object' && r.ERROR !== undefined) {
            var domqErr = new Error('[DOMQUERY] ' + cmd + ' failed for id "' + props.id + '": ' +
              (typeof r.ERROR === 'string' ? r.ERROR : JSON.stringify(r.ERROR)));
            domqErr.diagnostic = { KIND: 'domquery-renderactor-failed', CMD: cmd, ID: props.id, RESPONSE: r };
            throw domqErr;
          }
          var appliedinfo = '';
          if (r && typeof r === 'object' && r.APPLIED !== undefined) {
            appliedinfo = ' APPLIED=' + r.APPLIED;
            if (r.BYTES !== undefined) {
              appliedinfo = appliedinfo + ' BYTES=' + r.BYTES;
            }
          }
          logdebug(blockcompilerstate, '[BLOCKCOMPILER]',
            'domquery', cmd, 'for', props.id, ':',
            (r && typeof r === 'object' && r.ERROR ? 'error' : 'ok') + appliedinfo);
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

      var RNAMES = RENDERACTORNAMES();

      return sendandawait('RENDERACTOR', RNAMES.CRYPTO, { BYTES: bytes }, mailboxresolve('mailboxwaittimeout'), RNAMES.DOMRESULT)
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

      var ENAMES = EXECUTIONACTORNAMES();

      var responsetype = ENAMES.TASKRESULT;
      var msgtype;
      switch (cmd) {
        case 'get': msgtype = ENAMES.GETSTATUS; break;
        case 'tasks': msgtype = ENAMES.GETTASKS; break;
        case 'taskstatus': msgtype = ENAMES.GETTASKSTATUS; break;
        case 'awaittask': msgtype = ENAMES.AWAITTASK; break;
        case 'canceltask': msgtype = ENAMES.CANCELTASK; break;
        case 'stoptask': msgtype = ENAMES.STOPTASK; break;
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

  // @proposal=P-16.5 + P-16.5-correction — theory block type.
  // Four-command dispatch (inittheory / addtheoryfunction / addtheory /
  // runtheories) with shape preconditions per P-16.5-correction Option A.
  // The compiler resolves property values and deps via buildblockproperties
  // and passes values to the framework functions (no identifier lookups).
  compilers[blocktypes.theory] = function(merged, id, sig) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling THEORY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var innerfn = function(env) {
      var props = (merged.command && merged.command.properties) || {};
      var cmd = merged.command && merged.command.COMMAND;
      var inheritedproperties = {};
      var blockprops = buildblockproperties(merged, inheritedproperties, sig, env);
      var inputs = blockprops.inputs || {};
      var deps = blockprops.deps || {};
      var inputnames = sig.inputs || [];
      var outputnames = Object.keys(sig.outputs || {});

      if (cmd === 'inittheory') {
        if (inputnames.length !== 0 || outputnames.length !== 1) {
          var e1 = new Error('[theory] invalid-inittheory-shape');
          e1.diagnostic = { KIND: 'invalid-inittheory-shape', INPUTS: inputnames, OUTPUTS: outputnames };
          throw e1;
        }
        var statekey0 = outputnames[0];
        var out0 = {};
        out0[statekey0] = maketheoryblock();
        return out0;
      }

      if (cmd === 'addtheoryfunction' || cmd === 'addtheory') {
        if (inputnames.length !== 1 ||
            outputnames.length !== 1 ||
            outputnames[0] !== inputnames[0]) {
          var e2 = new Error('[theory] invalid-accumulator-shape');
          e2.diagnostic = { KIND: 'invalid-accumulator-shape', INPUTS: inputnames, OUTPUTS: outputnames };
          throw e2;
        }
        var statekey1 = inputnames[0];
        var state1 = inputs[statekey1];

        if (cmd === 'addtheoryfunction') {
          var fnval = deps[props.fnname];
          var tf1 = maketheoryfunction(props.name, fnval);
          var newstate1 = addtheoryfunction(state1, tf1);
          var out1 = {};
          out1[statekey1] = newstate1;
          return out1;
        }

        var witnessvalues = (props.witnesses || []).map(function (w) {
          var wtf = maketheoryfunction(w.name, deps[w.fnname]);
          return makewitness(w.name, w.weight, wtf);
        });
        var extractor = maketheoryfunction(props.extractorname, deps[props.extractorfnname]);
        var theory = maketheory(props.theoryid, witnessvalues, extractor);
        var newstate2 = addtheory(state1, theory);
        var out2 = {};
        out2[statekey1] = newstate2;
        return out2;
      }

      if (cmd === 'runtheories') {
        if (inputnames.length < 2) {
          var e3 = new Error('[theory] invalid-runtheories-shape');
          e3.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'too-few-inputs', INPUTS: inputnames };
          throw e3;
        }
        if (inputnames.indexOf(props.leafinput) === -1) {
          var e4 = new Error('[theory] invalid-runtheories-shape');
          e4.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'leafinput-not-in-inputs', LEAFINPUT: props.leafinput, INPUTS: inputnames };
          throw e4;
        }
        var statekey2 = inputnames[0];
        if (statekey2 === props.leafinput) {
          var e5 = new Error('[theory] invalid-runtheories-shape');
          e5.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'statekey-equals-leafinput', STATEKEY: statekey2, LEAFINPUT: props.leafinput };
          throw e5;
        }
        if (outputnames.indexOf('ingredientnames') === -1 ||
            outputnames.indexOf('ingredientcount') === -1) {
            var e6 = new Error('[theory] invalid-runtheories-shape');
            e6.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'unexpected-output-keys', OUTPUTS: outputnames };
            throw e6;
        }
        var has_debug_output = outputnames.indexOf('theoriesdebug') !== -1;
        var outputnames_ok = outputnames.every(function (k) {
            return k === 'ingredientnames' || k === 'ingredientcount' || k === 'theoriesdebug';
        });
        if (!outputnames_ok) {
            var e6b = new Error('[theory] invalid-runtheories-shape');
            e6b.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'unexpected-output-keys', OUTPUTS: outputnames };
            throw e6b;
        }
        if (has_debug_output && props.debug !== true) {
            var e6c = new Error('[theory] invalid-runtheories-shape');
            e6c.diagnostic = { KIND: 'invalid-runtheories-shape', REASON: 'theoriesdebug-output-requires-debug-true', DEBUG: props.debug, OUTPUTS: outputnames };
            throw e6c;
        }
        var rr = runtheories(inputs[statekey2], inputs[props.leafinput], deps);
        var out = { ingredientnames: rr.names, ingredientcount: rr.names.length };
        if (props.debug === true) {
            var report = buildtheoriesdebug(inputs[statekey2], inputs[props.leafinput], deps);
            if (has_debug_output) {
                out.theoriesdebug = report;
            }
            if (typeof SENDINSTRUCTION === 'function' && typeof DEBUGACTORNAMES === 'function') {
                try {
                    var DNAMES = DEBUGACTORNAMES();
                    SENDINSTRUCTION('DEBUGACTOR', DNAMES.LOGLINE, {
                        LEVEL: 'info',
                        MESSAGE: 'theory-debug',
                        DATA: { blockid: id, report: report },
                        TIMESTAMP: Date.now(),
                        PREFIX: 'theory'
                    }, null, 'THEORY-DEBUG');
                } catch (notifyerr) { /* diagnostic failures must not affect result */ }
            }
            if (typeof logblockdebug === 'function' && typeof blockcompilerstate === 'object') {
                try {
                    logblockdebug(blockcompilerstate, '[THEORY-DEBUG]', id, report);
                } catch (logerr) { /* diagnostic failures must not affect result */ }
            }
        }
        return out;
      }

      var e7 = new Error('[theory] invalid-command: ' + String(cmd));
      e7.diagnostic = { KIND: 'invalid-command', CMD: cmd };
      throw e7;
    };
    return wrapcompiledfn(innerfn, 'theory', id);
  };

  return compilers;
}
