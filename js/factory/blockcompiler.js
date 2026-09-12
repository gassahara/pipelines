// ============================================================
// §1 — Constants & path accessors
// ============================================================

var BLOCKCOMPILERSTATE = { level: createverbosityconstants().DEBUG };

var frontendbase = (typeof window !== 'undefined') ? window.location.origin + '/' : '';
var scriptwitnesstimeout = 5000;
var mailboxwaittimeout = 25000;

// ---- Injected tools for parser/serializer independence ----
var blockcompilertools = {
  parsesource: (typeof parsesource === 'function') ? parsesource :
    (typeof detectfreeidentifiers === 'function') ? function(src) {
      try {
        return { ok: true, identifiers: detectfreeidentifiers(src), errors: [] };
      } catch (e) {
        return { ok: false, identifiers: [], errors: [e && e.message ? e.message : String(e)] };
      }
    } : function() {
      return { ok: false, identifiers: [], errors: ['no free variable parser available'] };
    },
  serializeclosure: (typeof serializeselfcontainedclosure === 'function') ? serializeselfcontainedclosure : null
};

function setblockcompilertools(tools) {
  if (!tools || typeof tools !== 'object') return;
  if (typeof tools.parsesource === 'function') blockcompilertools.parsesource = tools.parsesource;
  if (typeof tools.serializeclosure === 'function') blockcompilertools.serializeclosure = tools.serializeclosure;
}

function createblockcompilerconstants() {
  return {
    blocktypes: {
      fn: 'fn', api: 'api', fetch: 'fetch', writer: 'writer',
      io: 'io', domquery: 'domquery', crypto: 'crypto',
      wait: 'wait', executionquery: 'executionquery'
    },
    inheritedkeys: ['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents']
  };
}

// ---- C.2.3: entry-walker ----
function walkentries(source, acc, step) {
  var keys = Object.keys(source || {});
  for (var i = 0; i < keys.length; i++) {
    acc = step(acc, keys[i], source[keys[i]]);
  }
  return acc;
}

function cloneobject(obj) {
  return walkentries(obj || {}, {}, function(acc, k, v) { acc[k] = v; return acc; });
}

function extendobject(target, source) {
  return walkentries(source || {}, target, function(acc, k, v) { acc[k] = v; return acc; });
}

function stripquotes(str) {
  return str.split('').reduce(function(out, ch) {
    return ch !== '"' && ch !== "'" ? out + ch : out;
  }, '');
}

function splitpathsegments(pathstr) {
  function scan(i, current, parts) {
    if (i >= pathstr.length) {
      if (current) parts.push(current);
      return parts;
    }
    var ch = pathstr.charAt(i);
    if (ch === '[' || ch === ']' || ch === '.') {
      if (current) parts.push(current);
      return scan(i + 1, '', parts);
    }
    return scan(i + 1, current + ch, parts);
  }
  return scan(0, '', []);
}

function containspathaccessorchars(str) {
  return str.split('').reduce(function(found, c) {
    return found || c === '.' || c === '[' || c === ']';
  }, false);
}

function compilepathaccessor(pathstr) {
  if (typeof pathstr !== 'string') {
    return function() { return pathstr; };
  }
  var segments = pathstr.split('.').reduce(function(acc, dotpart) {
    return acc.concat(splitpathsegments(dotpart).map(function(seg) { return stripquotes(seg); }));
  }, []);
  return function(env) {
    return segments.reduce(function(curr, key) { return (curr != null ? curr[key] : undefined); }, env);
  };
}

function buildproperties(merged, inherited) {
  if (inherited === undefined) inherited = {};
  return Object.keys(merged).reduce(function(result, key) {
    if (key !== 'fn') result[key] = merged[key];
    return result;
  }, cloneobject(inherited));
}

function resolvedepsarray(depsarray) {
  throw new Error('[resolvedepsarray] This function is deprecated; use builddependenciesregistry instead.');
}

function resolvepipelinepath(path, dependencies) {
  if (typeof path !== 'string') return path;
  return path.split('.').reduce(function(value, part) {
    if (value === undefined || value === null) return undefined;
    return value[part];
  }, dependencies);
}

function resolvestagefrompath(dnaenvelope, stagepath) {
  return (stagepath || []).reduce(function(current, segment) {
    if (current == null) return undefined;
    return current[segment];
  }, dnaenvelope.definition);
}

function buildblockproperties(merged, inherited, io, env, dependencies) {
  if (inherited === undefined) inherited = {};
  if (io === undefined) io = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'buildblockproperties for block:', merged.id, 'type:', merged.type);

  var properties = buildproperties(merged, inherited);
  var inputsobj = {};

  // ---- A7 / P20-call: C11 runtime input-definedness enforcement ----
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
      var depsmap = dependencies || (typeof window !== 'undefined' ? window : (typeof globalthis !== 'undefined' ? globalthis : {}));
      var resolveddeps = {};
      var missingdeps = [];
      merged.deps.forEach(function(name) {
        if (typeof depsmap[name] !== 'undefined') {
          resolveddeps[name] = depsmap[name];
        } else if (typeof window !== 'undefined' && typeof window[name] !== 'undefined') {
          resolveddeps[name] = window[name];
        } else if (typeof globalthis !== 'undefined' && typeof globalthis[name] !== 'undefined') {
          resolveddeps[name] = globalthis[name];
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
      // OP-026 (R-29a): DISTINGUISH the failure kinds. A completed analysis that FOUND free identifiers is a
      // purity violation; an analysis that could NOT COMPLETE is an analysis failure and must carry the parser's
      // own diagnostic. Before this change every violation string was concatenated into the fixed phrase
      // "has undeclared free identifiers", so a parser crash was reported as a purity breach — the defect graded
      // as FB-29. The kind is already produced by fnblock (@file=js/factory/fnblock.js#L753-L775), so this is a
      // branch, not a new signal.
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

function createerrorcontext(id, stagetype) {
  return function(err) {
    err.diagnostic = err.diagnostic || {};
    err.diagnostic.BLOCKID = id;
    err.diagnostic.STAGETYPE = stagetype;
    throw err;
  };
}

// ---- C.2.1: unwrap response envelope ----
function unwrap(response) {
  if (!response) return {};
  if (response.RESULT !== undefined) return response.RESULT;
  if (response.result !== undefined) return response.result;
  return response;
}

// ---- C.2.2: send-and-await triad ----
function sendandawait(recipient, type, payload, timeout, responsetype) {
  var tag = GENERATETAG();
  SENDINSTRUCTION(recipient, type, payload, tag, 'BLOCKCOMPILER', { responsetype: responsetype });
  return WAITFORMAILBOX({ tag: tag, sender: recipient, type: responsetype }, timeout).then(unwrap);
}

// ---- C.2.4: loader factorisation ----
function loadscripts(entries, basepath, timeout, label) {
  if (typeof timeout === 'undefined') timeout = scriptwitnesstimeout;
  var normalized = normalizeentries(entries);
  loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', label, normalized.length);
  return loadscriptssequentially(normalized, basepath, timeout);
}

// ---- A8 / P24: shared wrapper for compiled block functions ----
function wrapcompiledfn(innerfn, kind, id, blockkind) {
  var blockfn = function(env) {
    return callwithstack(evalstack, kind + ':' + id, 'async-await',
      function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, kind)
      });
  };
  blockfn.id = id;
  if (blockkind !== undefined) blockfn.kind = blockkind;
  return blockfn;
}

// ============================================================
// §2 — Block compilers
// ============================================================

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

// ---- OP-193: compilehttpblock response handler via sendandawait ----
function compilehttpblock(merged, id, sig, istextual, options) {
  var innerfn = function(env) {
    var label = (istextual ? 'fetch' : 'api') + ':' + (merged.endpoint || id);
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'executing http block:', id, 'type:', istextual ? 'fetch' : 'api', 'endpoint:', merged.endpoint);
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

    var timeout = merged.timeout || mailboxwaittimeout;

    return sendandawait('APIACTOR', istextual ? MESSAGETYPES.FETCH : MESSAGETYPES.API, {
      ENDPOINT: endpoint,
      METHOD: merged.method,
      PAYLOAD: payload,
      TOKEN: env.authsessionaccesstoken || ''
    }, timeout, istextual ? 'fetchresult' : 'apiresult')
      .then(function(result) {
        if (result && result.error) throw new Error(result.error);
        var finalresult = result && result.data !== undefined ? result.data : result;
        if (merged.mapping && merged.mapping.response && result && typeof result === 'object') {
          finalresult = buildresponse(merged.mapping.response, result);
        }
        return finalresult;
      });
  };

  return wrapcompiledfn(innerfn, istextual ? 'fetch' : 'api', id);
}

function createblockcompilers(blocktypes, inheritedkeys, dependencies, options) {
  var compilers = {};

  compilers[blocktypes.fn] = function(merged, id, sig, inheritedproperties) {
    var runtime = {
      blockcompilerstate: BLOCKCOMPILERSTATE,
      logdebug: logdebug,
      logblockdebug: logblockdebug,
      callwithstack: callwithstack,
      evalstack: evalstack,
      compilepathaccessor: compilepathaccessor,
      buildblockproperties: buildblockproperties,
      createerrorcontext: createerrorcontext
    };
    return compilefnblock(merged, id, sig, inheritedproperties, dependencies, options, runtime);
  };

  compilers[blocktypes.api] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, false, options); };
  compilers[blocktypes.fetch] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, true, options); };

  // ---- OP-194: writer via sendandawait ----
  compilers[blocktypes.writer] = function(merged, id, sig, inheritedproperties) {
    if (inheritedproperties === undefined) inheritedproperties = {};
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var innerfn = function(env) {
      logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
      var fn = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!fn) throw new Error('[WRITER] Block "' + id + '" failed validation');
      var properties = buildblockproperties(merged, inheritedproperties, sig, env, dependencies);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      return Promise.resolve(fn(properties, inputargs)).then(function(result) {
        if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) {
          throw new Error('[WRITER] Block "' + id + '" returned invalid result');
        }
        var target = merged.targetlabel || env.approot;
        if (!target) throw new Error('[WRITER] missing targetlabel/approot');

        return sendandawait('RENDERACTOR', MESSAGETYPES.HTML, {
          ID: target,
          MARKUP: result.html,
          APPEND: !merged.replace
        }, mailboxwaittimeout, 'domresult')
          .then(function() {
            if (result.id && Object.keys(sig.outputs || {}).length > 0) {
              return EXPECTELEMENT(result.id, result.timeout || 5000).then(function(domref) {
                env[Object.keys(sig.outputs)[0]] = result;
                env[result.id] = domref;
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
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compiling IO block:', id);
    var innerfn = function(env) {
      logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'executing IO block:', id);
      // R-41 (analysis8, constraint #4): the IO block accepts an INLINE `fn:`, mirroring the writer branch at
      // #L350. Before this change the branch read `merged.ref` only, so an io block declaring its function inline
      // — the form the standing constraint requires — failed validation although the block type is otherwise
      // complete. The error message and the trace label are corrected with the lookup, since both also assumed
      // the ref-only form.
      var io = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!io) throw new Error('io block "' + id + '" must declare an inline fn or a ref function');
      var ioname = (typeof merged.fn === 'function') ? id : (merged.ref || id);
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      return callwithstack(evalstack, 'io:' + ioname, 'async-await', function(e) {
        return Promise.resolve(io(inputdata, e));
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
    };
    return wrapcompiledfn(innerfn, 'io', id);
  };

  // ---- OP-195: domquery via sendandawait ----
  compilers[blocktypes.domquery] = function(merged, id, sig) {
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compiling DOMQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
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
        default: throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      }

      return sendandawait('RENDERACTOR', msgtype, {
        ID: props.id,
        VALUE: resolvedvalue,
        CLASSNAME: resolvedclassname,
        FORCE: props.force,
        QUERY: props.query,
        ARGUMENTS: props.arguments,
        NAME: props.name
      }, mailboxwaittimeout, 'domresult');
    };
    return wrapcompiledfn(innerfn, 'domquery', id);
  };

  compilers[blocktypes.crypto] = function(merged, id, sig) {
    var innerfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      return sendandawait('RENDERACTOR', MESSAGETYPES.CRYPTO, { BYTES: bytes }, mailboxwaittimeout, 'domresult');
    };
    return wrapcompiledfn(innerfn, 'crypto', id);
  };

  compilers[blocktypes.wait] = function(merged, id) {
    var innerfn = function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      return new Promise(function(r) { setTimeout(r, ms); }).then(function() { return {}; });
    };
    return wrapcompiledfn(innerfn, 'wait', id);
  };

  compilers[blocktypes.executionquery] = function(merged, id, sig) {
    var innerfn = function(env) {
      var command = merged.command || {};
      var cmd = command.COMMAND;
      var args = command.args || {};
      var responsetype = 'taskresult';
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
      return sendandawait('EXECUTIONACTOR', msgtype, args, mailboxwaittimeout, responsetype);
    };
    return wrapcompiledfn(innerfn, 'executionquery', id);
  };

  return compilers;
}

function compileblock(block, inheritedbriefcase, constants, options) {
  if (inheritedbriefcase === undefined) inheritedbriefcase = {};
  if (options && options.tools) setblockcompilertools(options.tools);
  if (block.ref && typeof block.ref === 'string') {
    var refTarget = (typeof window !== 'undefined') ? window[block.ref] : (typeof globalthis !== 'undefined' ? globalthis[block.ref] : undefined);
    if (typeof refTarget !== 'function') {
      throw new Error('[compileblock] ref function not found: ' + block.ref);
    }
    block.fn = refTarget;
    if (!block.deps) block.deps = {};
    block.deps[block.ref] = refTarget;
  }
  var compiler = constants.compilers[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.analyzers[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockio = { inputs: block.inputs || [], outputs: block.outputs || {} };
  return compiler(block, block.id, blockio, inheritedbriefcase);
}

// ---- END segment 1 of 3 ----






// ============================================================
// §3 — Pipeline orchestration
// ============================================================

// ---- OP-197 (BC-2): blockfn tagging helper ----
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

// ---- OP-198: processelement via tagfn ----
function processelement(el, pipelineid, stagepath, inheritedbriefcase, constants, dnaconstants, dependencies, options) {
  var fn = compileblock(el, inheritedbriefcase, constants, options);
  tagfn(fn, {
    blockmeta: { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' },
    originalfn: (typeof el.fn === 'function') ? el.fn : (typeof el.ref === 'function' ? el.ref : null),
    kind: 'element'
  });
  return createpersistentelementwrapper(fn, el, stagepath, pipelineid, options);
}

function loadpipelinedependencies(container, options) {
  var libs = (container && container.libs) || [];
  var deps = (container && container.deps) || (container && container.programs) || [];
  var frameworkbase = (typeof pipelinesbase !== 'undefined') ? pipelinesbase : '';
  var frontbase = options && options.frontendbase ? options.frontendbase : (typeof frontendbase !== 'undefined' ? frontendbase : '');
  var witnesstimeout = options && options.witnesstimeout ? options.witnesstimeout : scriptwitnesstimeout;

  return loadframeworklibs(libs, frameworkbase, witnesstimeout)
    .then(function() {
      return loadfrontendprograms(deps, frontbase, witnesstimeout);
    })
    .then(function() {
      return builddependenciesregistry(deps);
    });
}

function processpipelineelement(el, pipelineid, stagepath, inheritedbriefcase, dependencies, options) {
  var elementid = el.id || 'pipelineunknown';
  logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'processpipelineelement:', elementid, 'pipeline:', el.pipeline);

  var resolvedpipeline = null;
  var parentcontainer = null;

  if (typeof el.pipeline === 'string') {
    var segments = el.pipeline.split('.');
    if (segments.length > 1 && segments[segments.length - 1] === 'pipeline') {
      var parentpath = segments.slice(0, -1).join('.');
      parentcontainer = resolvepipelinepath(parentpath, dependencies || (typeof window !== 'undefined' ? window : (typeof globalthis !== 'undefined' ? globalthis : {})));
      logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'derived parent container for dependencies:', parentpath);
    }
    resolvedpipeline = resolvepipelinepath(el.pipeline, dependencies || (typeof window !== 'undefined' ? window : (typeof globalthis !== 'undefined' ? globalthis : {})));
    if (!resolvedpipeline || !resolvedpipeline.elements) {
      logerror(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'failed to resolve pipeline path:', el.pipeline);
      throw new Error('[processpipelineelement] failed to resolve pipeline path: ' + el.pipeline);
    }
  } else {
    resolvedpipeline = el.pipeline;
  }

  var depcontainer = parentcontainer || resolvedpipeline;

  return loadpipelinedependencies(depcontainer, options).then(function(nesteddeps) {
    var mergeddependencies = extendobject(cloneobject(dependencies || {}), nesteddeps);

    var innerfn = function(env) {
      var parentenv = env;
      var childenv = cloneobject(parentenv);
      childenv.containerid = el.container || null;
      childenv.pipelineid = el.pipelineidoverride || (el.pipeline && el.pipeline.id) || (el.pipeline && el.pipeline.identity && el.pipeline.identity.id) || 'pipeline' + elementid;

      var inputkeys = el.inputs || [];
      inputkeys.forEach(function(key) {
        childenv[key] = compilepathaccessor(key)(parentenv);
      });

      var childoptions = el.options || {};
      if (childoptions.autorun === undefined) childoptions.autorun = true;
      if (childoptions.baseenv === undefined) childoptions.baseenv = childenv;
      if (childoptions.updateworldmap === undefined) childoptions.updateworldmap = parentenv.updateworldmap;
      if (childoptions.verbosity === undefined && options && options.verbosity !== undefined) childoptions.verbosity = options.verbosity;

      var rawDNA = resolvedpipeline;

      if (!rawDNA.id && !(rawDNA.identity && rawDNA.identity.id)) {
        rawDNA.id = childenv.pipelineid;
      }

      var bootdnafn = (typeof bootdna === 'function') ? bootdna : window.bootdna;
      if (typeof bootdnafn !== 'function') {
        throw new Error('[processpipelineelement] bootdna function not available');
      }

      var nestedPipelineId = childenv.pipelineid;
      if (!rawDNA.id && !(rawDNA.identity && rawDNA.identity.id)) {
        rawDNA.id = nestedPipelineId;
      }

      return bootdnafn(rawDNA, childoptions)
        .then(function(result) {
          var outputkeys = Object.keys(el.outputs || {});
          var mapped = mapoutputs(result, outputkeys);
          Object.keys(mapped).forEach(function(k) { parentenv[k] = mapped[k]; });
          return result;
        })
        .catch(function(err) {
          throw err;
        });
    };

    // R-ARC-24: tagging handled by wrapcompiledfn's 4th arg
    return wrapcompiledfn(innerfn, 'pipeline', elementid, 'pipeline');
  });
}

// ---- OP-196: registereventstage via sendandawait ----
function registereventstage(stage, pipelineid, stagepath, options) {
  var sourceid = stage.control.sourceid;
  var event = stage.control.event;
  if (!sourceid || !event) {
    return Promise.reject(new Error('[registereventstage] EVENT stage missing sourceid/event'));
  }
  var payload = {
    PIPELINEID: pipelineid,
    STAGEID: stage.id,
    STAGEPATH: stagepath,
    SOURCEID: sourceid,
    EVENT: event,
    CONTROL: stage.control,
    ELEMENTS: stage.elements,
    BRIEFCASE: stage.briefcase || {},
    OPTIONS: options || {}
  };
  return sendandawait('RENDERACTOR', MESSAGETYPES.REGISTEREVENTLISTENER, payload, mailboxwaittimeout, MESSAGETYPES.EVENTLISTENERREGISTERED)
    .then(function(response) {
      if (response && response.error) {
        throw new Error('[registereventstage] Registration failed for ' + stage.id + ': ' + response.error);
      }
      if (response && response.RESULT !== undefined) {
        return response.RESULT;
      }
      if (response && response.result !== undefined) {
        return response.result;
      }
      return true;
    });
}

// R-ARC-25: processnestedstage does not use tagfn (no blockmeta/originalfn/kind)
function processnestedstage(childstage, pipelineid, stagepath, inheritedbriefcase, constants, dnaconstants, dependencies, options) {
  var childstagepath = stagepath.concat([childstage.id]);
  var childbriefcase = cloneobject(inheritedbriefcase || {});
  if (childstage.briefcase) {
    Object.keys(childstage.briefcase).forEach(function(key) { childbriefcase[key] = childstage.briefcase[key]; });
  }

  if (childstage.control && childstage.control.command === 'EVENT') {
    return registereventstage(childstage, pipelineid, childstagepath, options)
      .then(function() {
        var noopwrapper = function(env) { return Promise.resolve(env); };
        noopwrapper.iseventregistration = true;
        return noopwrapper;
      });
  }

  if (childstage.async === true) {
    var asyncwrapper = function(env) {
      return callwithstack(
        evalstack,
        'nested-stage:' + childstage.id,
        'async-await',
        function() {
          orchestratestage(childstage, pipelineid, dependencies, env, childstagepath, options || {}, null)
            .catch(function(err) {
              logwarn(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
            });
          return undefined;
        },
        [env],
        { context: { env: env }, capturecontinuation: true, attachcontinuation: false }
      );
    };
    asyncwrapper.asyncstage = true;
    return asyncwrapper;
  } else {
    var syncwrapper = function(env) {
      return callwithstack(
        evalstack,
        'nested-stage:' + childstage.id,
        'async-await',
        function() {
          return orchestratestage(childstage, pipelineid, dependencies, env, childstagepath, options || {}, null);
        },
        [env],
        { context: { env: env }, capturecontinuation: true, attachcontinuation: false }
      );
    };
    syncwrapper.asyncstage = false;
    return syncwrapper;
  }
}

function buildnextstagemessage(pipeline, stageindex, pipelineid, env, options) {
  var nextindex = stageindex + 1;
  if (!pipeline || !pipeline.elements || nextindex >= pipeline.elements.length) return null;
  return {
    type: 'compilestage',
    pipeline: pipeline,
    pipelineid: pipelineid,
    stageindex: nextindex,
    stagepath: ['pipeline', 'elements', nextindex],
    briefcase: {},
    env: env || {},
    options: options || {}
  };
}

// ---- OP-192: sendstagecompleted via sendandawait with R-ARC-03 postprocessing ----
function sendstagecompleted(pipelineid, stageid, nextstagemessage, env) {
  return sendandawait('HYPERVISORACTOR', MESSAGETYPES.STAGECOMPLETED, {
    PIPELINEID: pipelineid,
    STAGEID: stageid,
    NEXTSTAGEMESSAGE: nextstagemessage,
    ENV: env || {}
  }, mailboxwaittimeout, 'stagecompletedack')
    .then(function() { return; });
}

function orchestratestage(stage, pipelineid, dependencies, env, stagepath, options, nextstagemessage) {
  var constants = createblockcompilerconstants();
  var blocktypes = constants.blocktypes;
  var inheritedkeys = constants.inheritedkeys;
  var dnaconstants = creatednaserializerconstants();
  var analyzers = createblockanalyzers(blocktypes, dnaconstants);
  var compilers = createblockcompilers(blocktypes, inheritedkeys, dependencies, options);
  var compilerconstants = { blocktypes: blocktypes, inheritedkeys: inheritedkeys, analyzers: analyzers, compilers: compilers };

  var index = 0;
  var stagetoken = { CANCELLED: false };

  function runnext() {
    if (index >= (stage.elements || []).length) {
      return sendstagecompleted(pipelineid, stage.id, nextstagemessage || null, env);
    }

    var elementdef = resolvenextelement(stage, index);
    if (!elementdef) {
      index++;
      return runnext();
    }

    var elementfn;
    if (elementdef.element === 'BLOCK') {
      elementfn = processelement(elementdef, pipelineid, stagepath.concat([elementdef.id]), {}, compilerconstants, dnaconstants, dependencies, options);
    } else if (elementdef.element === 'PIPELINE') {
      elementfn = processpipelineelement(elementdef, pipelineid, stagepath.concat([elementdef.id]), {}, dependencies, options);
    } else if (elementdef.element === 'STAGE') {
      elementfn = processnestedstage(elementdef, pipelineid, stagepath.concat([elementdef.id]), {}, compilerconstants, dnaconstants, dependencies, options);
    } else {
      throw new Error('[orchestratestage] unexpected element type: ' + elementdef.element);
    }

    BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN = stagetoken;

    return Promise.resolve(elementfn).then(function(fn) {
      return fn(env);
    }).then(function() {
      index++;
      return runnext();
    }).catch(function(err) {
      stagetoken.CANCELLED = true;
      BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN = null;
      logerror(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'Element failed:', elementdef.id, err);
      throw err;
    }).then(function(result) {
      BLOCKCOMPILERSTATE.ACTIVECANCELLATIONTOKEN = null;
      return result;
    });
  }

  return runnext();
}

function createpersistentelementwrapper(compiledelement, elementdef, stagepath, pipelineid, options) {
  var elementid = elementdef.id || compiledelement.id || 'elementunknown';
  function wrapper(env) {
    var path = stagepath;
    var execenv = env;
    var executor = function(executioncontext) {
      var effectiveenv = executioncontext.ENV || execenv;
      return compiledelement(effectiveenv);
    };
    var blockinputs = elementdef && elementdef.inputs ? elementdef.inputs : [];
    var blockoutputs = elementdef && elementdef.outputs ? elementdef.outputs : {};
    var inputargs = blockinputs.map(function(inp) { return compilepathaccessor(inp)(execenv); });
    var originalfn = compiledelement.originalfn || elementdef.fn || elementdef.ref;
    var closureserialized = null;
    if (blockcompilertools.serializeclosure && typeof originalfn === 'function') {
      closureserialized = blockcompilertools.serializeclosure(originalfn, inputargs, execenv, elementdef.deps || {});
    }
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'submitting element:', elementid, 'pipeline:', pipelineid, 'stagepath:', JSON.stringify(stagepath));
    var tag = GENERATETAG();
    var descriptor = {
      PIPELINEID: pipelineid,
      PATH: path,
      ELEMENTID: elementid,
      ENV: execenv,
      SIGNATURE: { INPUTS: blockinputs, OUTPUTS: blockoutputs },
      EXECUTOR: executor,
      PROPERTIES: elementdef || {},
      SERIALIZED: closureserialized,
      ORIGIN: compiledelement.origin || null,
      PROGRAMREF: null
    };

    if (typeof logblockdebug === 'function') {
      logblockdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', elementid, {
        descriptorKeys: Object.keys(descriptor),
        hasEnv: typeof descriptor.ENV !== 'undefined',
        hasExecutor: typeof descriptor.EXECUTOR === 'function',
        hasSignature: typeof descriptor.SIGNATURE === 'object'
      });
    }

    SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.EXECUTEELEMENT, descriptor, tag, 'BLOCKCOMPILER', { responsetype: 'taskresult' });

    return WAITFORMAILBOX({ tag: tag, sender: 'EXECUTIONACTOR', type: MESSAGETYPES.TASKRESULT }, mailboxwaittimeout)
      .then(function(mailboxmessage) {
        var payload = mailboxmessage && mailboxmessage.payload ? mailboxmessage.payload : {};
        var outerresult = payload.RESULT !== undefined ? payload.RESULT : (payload.result !== undefined ? payload.result : payload);
        var result = outerresult.RESULT !== undefined ? outerresult.RESULT : (outerresult.result !== undefined ? outerresult.result : outerresult);
        // ----- R-2 / P2 : surface task failure BEFORE output mapping -----
        if (result && typeof result === 'object' && result.ERROR !== undefined) {
          var failuremessage = typeof result.ERROR === 'string'
            ? result.ERROR
            : (result.ERROR && typeof result.ERROR.message === 'string'
                ? result.ERROR.message
                : String(result.ERROR));
          var failureError = new Error(failuremessage);
          failureError.diagnostic = failureError.diagnostic || {};
          failureError.diagnostic.BLOCKID = elementid;
          failureError.diagnostic.PIPELINEID = pipelineid;
          failureError.diagnostic.TASKID = result.TASKID || null;
          failureError.diagnostic.ORIGIN = 'createpersistentelementwrapper';
          throw failureError;
        }
        // ----- end R-2 / P2 -----
        var outputkeys = Object.keys(blockoutputs || {});
        var mapped = mapoutputs(result, outputkeys);
        Object.keys(mapped).forEach(function(k) { execenv[k] = mapped[k]; });
        logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'element completed:', elementid, 'pipeline:', pipelineid);
        if (typeof logblockdebug === 'function') {
          logblockdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', elementid, { result: result });
        }
        return result;
      });
  }
  wrapper.id = elementid;
  wrapper.kind = 'element';
  if (compiledelement.blockmeta) wrapper.blockmeta = compiledelement.blockmeta;
  return wrapper;
}

// ---- END segment 2 of 3 ----



// ============================================================
// §4 — Loader & boot
// ============================================================

function waitforwitness(entry, timeout) {
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function check() {
      if (!entry.provides || entry.provides.length === 0) return resolve();
      var alldefined = entry.provides.every(function(name) {
        return typeof window[name] !== 'undefined' || typeof globalthis[name] !== 'undefined';
      });
      if (alldefined) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('timeout waiting for witness from ' + entry.src));
      setTimeout(check, 10);
    }
    check();
  });
}

function loadscriptwithwitness(entry, basepath, timeout) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = basepath + entry.src;
    s.onload = function() {
      setTimeout(function() {
        if (entry.provides && entry.provides.length > 0) {
          waitforwitness(entry, timeout).then(resolve).catch(reject);
        } else {
          resolve();
        }
      }, 0);
    };
    s.onerror = function() { reject(new Error('failed to load ' + entry.src)); };
    document.head.appendChild(s);
  });
}

function loadscriptssequentially(entries, basepath, timeout) {
  if (!entries || entries.length === 0) return Promise.resolve();
  var index = 0;
  function loadnext() {
    if (index >= entries.length) return Promise.resolve();
    var entry = entries[index];
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'loading script:', entry.src);
    return loadscriptwithwitness(entry, basepath, timeout).then(function() {
      logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'script loaded:', entry.src);
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

function builddependenciesregistry(entries) {
  var registry = {};
  var missing = [];
  (entries || []).forEach(function(entry) {
    (entry.provides || []).forEach(function(name) {
      if (typeof window !== 'undefined' && typeof window[name] !== 'undefined') {
        registry[name] = window[name];
      } else if (typeof globalthis !== 'undefined' && typeof globalthis[name] !== 'undefined') {
        registry[name] = globalthis[name];
      } else {
        missing.push(name);
      }
    });
  });
  if (missing.length > 0) {
    throw new Error('[builddependenciesregistry] Missing global(s): ' + missing.join(', '));
  }
  logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'dependencies registry keys:', Object.keys(registry));
  return registry;
}

function BLOCKCOMPILERCOMPILESTAGE(dnaenvelope, stagepath, env, options) {
  logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'blockcompilercompilestage:', dnaenvelope.pipelineid, 'stagepath', JSON.stringify(stagepath));
  if (!dnaenvelope || !dnaenvelope.definition || !dnaenvelope.definition.pipeline) {
    throw new Error('[blockcompilercompilestage] invalid DNA envelope');
  }
  options = options || {};
  options.pipelineid = dnaenvelope.pipelineid;
  options.dependencies = dnaenvelope.dependencies || {};

  var pipeline = dnaenvelope.definition.pipeline;
  var stage = resolvestagefrompath(dnaenvelope, stagepath);
  if (!stage || stage.element !== 'STAGE') {
    throw new Error('[blockcompilercompilestage] stage not found at path: ' + JSON.stringify(stagepath));
  }

  var stageindex = stagepath[stagepath.length - 1];
  var iseventstage = stage.control && stage.control.command === 'EVENT';
  var iseventtrigger = options.iseventtrigger === true;

  if (iseventstage && !iseventtrigger) {
    return registereventstage(stage, dnaenvelope.pipelineid, stagepath, options)
      .then(function() {
        var nextstagemessage = buildnextstagemessage(pipeline, stageindex, dnaenvelope.pipelineid, env, options);
        return sendstagecompleted(dnaenvelope.pipelineid, stage.id, nextstagemessage, env);
      });
  }

  var nextstagemessage = buildnextstagemessage(pipeline, stageindex, dnaenvelope.pipelineid, env, options);
  return orchestratestage(stage, dnaenvelope.pipelineid, dnaenvelope.dependencies || {}, env || {}, stagepath, options, nextstagemessage);
}

function LOADPIPELINE(dna, stageIndex, env, options) {
  if (stageIndex === undefined) stageIndex = 0;
  if (env === undefined) env = {};
  if (options === undefined) options = {};

  var pipelineDef = dna.pipeline;
  if (!pipelineDef) {
    var err = new Error('loadpipeline: DNA missing pipeline property');
    err.diagnostic = { dnaId: dna.id || (dna.identity && dna.identity.id) || 'unknown' };
    return Promise.reject(err);
  }

  var stages = pipelineDef.elements || pipelineDef.stages || [];
  if (stageIndex >= stages.length) {
    var err = new Error('loadpipeline: stage index ' + stageIndex + ' out of bounds (max ' + stages.length + ')');
    err.diagnostic = { dnaId: dna.id || (dna.identity && dna.identity.id) || 'unknown', stageIndex: stageIndex };
    return Promise.reject(err);
  }
  var stage = stages[stageIndex];
  if (!stage || stage.element !== 'STAGE') {
    var err = new Error('loadpipeline: element at index ' + stageIndex + ' is not a STAGE');
    err.diagnostic = { dnaId: dna.id || (dna.identity && dna.identity.id) || 'unknown', stageIndex: stageIndex };
    return Promise.reject(err);
  }

  var pipelineId = dna.id || (dna.identity && dna.identity.id) || 'temp';
  var dnaEnvelope = {
    pipelineid: pipelineId,
    definition: { pipeline: pipelineDef },
    dependencies: {}
  };

  var stagePath = ['pipeline', 'elements', stageIndex];

  return BLOCKCOMPILERCOMPILESTAGE(dnaEnvelope, stagePath, env, options)
    .then(function(result) {
      var nextStageIndex = null;
      if (result && result.nextStageMessage) {
        var nextMsg = result.nextStageMessage;
        if (nextMsg && nextMsg.stageindex !== undefined) {
          nextStageIndex = nextMsg.stageindex;
        } else if (nextMsg && nextMsg.stageIndex !== undefined) {
          nextStageIndex = nextMsg.stageIndex;
        }
      }
      return {
        env: result.env || env,
        nextStageIndex: nextStageIndex,
        result: result
      };
    });
}

function bootdna(dna, options) {
  if (options === undefined) options = {};
  var dnaId = dna.id || (dna.identity && dna.identity.id) || 'defaultpipeline';
  loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'bootdna start for pipeline:', dnaId);

  return loadpipelinedependencies(dna, options)
    .then(function(depsregistry) {
      loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'dependencies loaded for bootdna:', dnaId);

      var tag = GENERATETAG();
      var bootedType = MESSAGETYPES.PIPELINEBOOTED;
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.BOOTDNA, {
        DNA: dna,
        PIPELINEID: dnaId,
        OPTIONS: options,
        SENDER: 'BLOCKCOMPILER',
        TAG: tag
      }, tag, 'BLOCKCOMPILER', {
        responsetype: bootedType
      });

      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: bootedType }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          var response = mailboxmessage && mailboxmessage.payload ? mailboxmessage.payload : {};
          var result = response.RESULT;
          if (result && result.ERROR) {
            var err = new Error(result.ERROR);
            err.diagnostic = result.DIAGNOSTIC || {};
            throw err;
          }
          if (result && result.TYPE === 'BOOTERROR') {
            var err = new Error(result.ERROR || 'BOOTERROR received');
            err.diagnostic = result.DIAGNOSTIC || {};
            throw err;
          }
          return result;
        });
    });
}

function validatepipelinebriefcase(briefcase) {
  var errors = [];
  if (briefcase === undefined || briefcase === null) {
    return { valid: true, errors: [] };
  }
  if (typeof briefcase !== 'object') {
    errors.push('[validatepipelinebriefcase] briefcase must be an object');
    return { valid: false, errors: errors };
  }
  try {
    var dnaconstants = creatednaserializerconstants();
    var revivabilityerrors = validaterevivableobject(briefcase, 'briefcase', dnaconstants);
    errors = errors.concat(revivabilityerrors);
  } catch (err) {
    errors.push('[validatepipelinebriefcase] validation error: ' + err.message);
  }
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ============================================================
// §5 — Exports
// ============================================================
