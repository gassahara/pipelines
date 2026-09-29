// blockcompiler.js — pipeline compiler concern.
//
// @proposal=P5 (corrected) — the blockcompiler is a DECLARATIVE SEMAPHORE.
// Construction API + finalizers (run / compile). No DNA envelope.
//
// @proposal=P9 (Cycle P9-04) — batches applied:
//   9.3  Removed: resolvedepsarray, resolvepipelinepath,
//        resolvestagefrompath, builddependenciesregistry.
//   9.4  Removed: `dependencies` parameter chain. buildblockproperties
//        resolves deps via the shared global space unconditionally.
//        Renamed: `inheritedbriefcase` → `inherited`.
//        Removed: `nextstagemessage` parameter.
//        Renamed: local `pipelineid` → `pipelinename`.
//   9.5  Renamed: element field `pipelineidoverride` → `nameoverride`;
//        element field `dna` → `childstate`.
//   9.9  Removed: `response.payload` lowercase read in unwrap.
//
// @proposal=P9 (Cycle P9-06 call-site correction) — DEV-P9-06-CALLSHAPE
// closed.
//
// @proposal=P10 (Cycle P10-02, batch 10.1) — `globalthis` →
// `globalThis` at three sites.
//
// @proposal=P11 (Cycle P11-02, batch 11.1 blockcompiler side) — the
// writer and io compilers now read `merged.behaviour` only.
//
// @proposal=P11 (Cycle P11-04, batch 11.2) — the DNA-era
// serialization hook is removed.
//
// @proposal=P-J (path-addressed structural appends) — appendstage,
// appendblock, and appendpipelineelement descend by a positional path.
//
// @proposal=P-L — nodeat / nodeatat added as the positional reader.
//
// @proposal=P-M — deepreplace removed.
//
// @proposal=P-Q — loadscriptwithwitness routes DOM side effects through
// RENDERACTOR via LOADSCRIPT/SCRIPTLOADED.
//
// @proposal=P-AO — the writer compiler's behaviour invocation is aligned
// with the fn compiler convention: the writer body receives
// (inputs, deps, properties).
//
// @proposal=P-AR — the blockcompiler becomes the trigger point of the
// existing execution flow. appendblock triggers the flow for the block
// being appended. The framework's injection mechanism
// (buildblockproperties), the extraction mechanism (mapoutputs), and
// the env-write (execenv[k]) are unchanged. run() is reduced to
// resource loading plus a structural pass for EVENT stages and
// PIPELINE elements. pipeline() carries env, compileonly, and the
// append-time pending chain.
//
// @proposal=P-AT — orchestratepipeline dispatches top-level EVENT
// stages to registereventstage and skips their blocks during the
// structural walk. EVENT stages are trigger stages: their blocks are
// supposed to execute when the event fires, not when the walk reaches
// them. The nested-EVENT handler in processnestedstage is unchanged.

// ============================================================
// §1 — Construction API
// ============================================================

function makelib(src, provides) {
  return { src: src, provides: provides };
}

function makeprogram(src, provides) {
  return { src: src, provides: provides };
}

function makestage(id, control) {
  return { element: 'STAGE', id: id, control: control, elements: [] };
}

function makeblock(id, type, behaviour, attrs) {
  var a = attrs || {};
  var b = { element: 'BLOCK', id: id, type: type };
  if (behaviour !== null && behaviour !== undefined) b.behaviour = behaviour;
  Object.keys(a).forEach(function(k) { b[k] = a[k]; });
  return b;
}

function makepipelineelement(id, childstate, attrs) {
  var a = attrs || {};
  var b = { element: 'PIPELINE', id: id, childstate: childstate };
  Object.keys(a).forEach(function(k) { b[k] = a[k]; });
  return b;
}

// @proposal=P-AR — pipeline() now carries the running env, the
// compileonly flag, the append-time pending chain, and the per-pipeline
// compiler setup that appendblock needs in order to trigger the flow.
function pipeline(type, name, options) {
  var opts = options || {};
  var constants = createblockcompilerconstants();
  var dnaconstants = creatednaserializerconstants();
  var analyzers = createblockanalyzers(constants.blocktypes, dnaconstants);
  var compilers = createblockcompilers(constants.blocktypes, constants.inheritedkeys, opts);
  return {
    type: type,
    name: name,
    libs: [],
    programs: [],
    elements: [],
    env: opts.baseenv || {},
    compileonly: opts.compileonly === true,
    pending: null,
    compilerconstants: {
      blocktypes: constants.blocktypes,
      inheritedkeys: constants.inheritedkeys,
      analyzers: analyzers,
      compilers: compilers
    },
    dnaconstants: dnaconstants,
    compileroptions: opts
  };
}

// ---- P-J — shared helpers for the path-addressed appends ----

function pipelinewith(p, elements) {
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.elements = elements;
  return next;
}

function appendat(elements, level, i, child) {
  if (i >= level.length) return elements.concat([child]);
  var idx = level[i];
  var target = elements[idx];
  if (!target || !target.elements) {
    throw new Error('[append] path does not address a node with an elements array');
  }
  return elements.map(function(node, j) {
    if (j !== idx) return node;
    var extended = {};
    Object.keys(node).forEach(function(k) { extended[k] = node[k]; });
    extended.elements = appendat(node.elements, level, i + 1, child);
    return extended;
  });
}

// ---- P-L — positional reader ----

function nodeat(p, path) {
  return nodeatat(p, path, 0);
}

function nodeatat(node, path, index) {
  if (index >= path.length) return node;
  return nodeatat(node.elements[path[index]], path, index + 1);
}

// ---- P-J — path-addressed structural appends (Class A) ----

function appendstage(p, level, child) {
  if (child.element !== 'STAGE') {
    throw new Error('[appendstage] child must be a stage value');
  }
  return pipelinewith(p, appendat(p.elements, level, 0, child));
}

// @proposal=P-AR — appendblock triggers the flow for the block being
// appended. Under compileonly the block is attached but not executed.
function appendblock(p, level, child) {
  if (level.length === 0) {
    throw new Error('[appendblock] level must address a stage (not the pipeline root)');
  }
  if (child.element !== 'BLOCK') {
    throw new Error('[appendblock] child must be a block value');
  }
  var attached = pipelinewith(p, appendat(p.elements, level, 0, child));

  if (p.compileonly === true) {
    return attached;
  }

  var prev = p.pending || Promise.resolve();
  var elementid = child.id || 'elementunknown';
  var stagepath = level;

  attached.pending = prev.then(function() {
    return triggerblockflow(attached, child, elementid, stagepath);
  }).then(function(updatedenv) {
    attached.env = updatedenv;
    return attached;
  });

  return attached;
}

// @proposal=P-AR — triggerblockflow is the append-time entry point of
// the existing flow.
function triggerblockflow(p, child, elementid, stagepath) {
  var env = p.env || {};
  var constants = p.compilerconstants;
  var dnaconstants = p.dnaconstants;
  var options = p.compileroptions;
  var compiled = compileblock(child, {}, constants, options);
  var elementfn = createpersistentelementwrapper(compiled, child, stagepath, p.name, options);
  return Promise.resolve(elementfn(env)).then(function() {
    return env;
  });
}

function appendpipelineelement(p, level, child) {
  if (level.length === 0) {
    throw new Error('[appendpipelineelement] level must address a stage (not the pipeline root)');
  }
  if (child.element !== 'PIPELINE') {
    throw new Error('[appendpipelineelement] child must be a pipelineelement value');
  }
  return pipelinewith(p, appendat(p.elements, level, 0, child));
}

// ---- Class B — pre-execution recorders (top-level-only, R-1) ----

function appendlib(p, parent, child) {
  if (parent !== null) {
    throw new Error('[appendlib] libs attach only at pipeline level (parent must be null)');
  }
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.libs = p.libs.concat([child]);
  return next;
}

function appendprogram(p, parent, child) {
  if (parent !== null) {
    throw new Error('[appendprogram] programs attach only at pipeline level (parent must be null)');
  }
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.programs = p.programs.concat([child]);
  return next;
}

// ============================================================
// §2 — Constants & path accessors
// ============================================================

var BLOCKCOMPILERSTATE = { level: createverbosityconstants().DEBUG };

var frontendbase = (typeof window !== 'undefined') ? window.location.origin + '/' : '';
var scriptwitnesstimeout = 5000;
var mailboxwaittimeout = 25000;

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
    }
};

function setblockcompilertools(tools) {
  if (!tools || typeof tools !== 'object') return;
  if (typeof tools.parsesource === 'function') blockcompilertools.parsesource = tools.parsesource;
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
    if (key !== 'fn' && key !== 'behaviour') result[key] = merged[key];
    return result;
  }, cloneobject(inherited));
}

function buildblockproperties(merged, inherited, io, env) {
  if (inherited === undefined) inherited = {};
  if (io === undefined) io = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'buildblockproperties for block:', merged.id, 'type:', merged.type);

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

function sendandawait(recipient, type, payload, timeout, responsetype) {
  var tag = GENERATETAG();
  SENDINSTRUCTION(recipient, type, payload, tag, 'BLOCKCOMPILER', { responsetype: responsetype });
  return WAITFORMAILBOX({ TAG: tag, SENDER: recipient, TYPE: responsetype }, timeout).then(unwrap);
}

function loadscripts(entries, basepath, timeout, label) {
  if (typeof timeout === 'undefined') timeout = scriptwitnesstimeout;
  var normalized = normalizeentries(entries);
  loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', label, normalized.length);
  return loadscriptssequentially(normalized, basepath, timeout);
}

function wrapcompiledfn(innerfn, kind, id, blockkind) {
  var blockfn = function(env) {
    return callwithstack(null, kind + ':' + id, 'async-await',
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
// §3 — Block compilers
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
        return wrapblockresult(finalresult, sig);
      });
  };

  return wrapcompiledfn(innerfn, istextual ? 'fetch' : 'api', id);
}

function createblockcompilers(blocktypes, inheritedkeys, options) {
  var compilers = {};

  compilers[blocktypes.fn] = function(merged, id, sig, inheritedproperties) {
    var runtime = {
      blockcompilerstate: BLOCKCOMPILERSTATE,
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
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var innerfn = function(env) {
      logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
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

      return sendandawait('RENDERACTOR', msgtype, {
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
      }, mailboxwaittimeout, 'domresult')
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'domquery', id);
  };

  compilers[blocktypes.crypto] = function(merged, id, sig) {
    var innerfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      return sendandawait('RENDERACTOR', MESSAGETYPES.CRYPTO, { BYTES: bytes }, mailboxwaittimeout, 'domresult')
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
      return sendandawait('EXECUTIONACTOR', msgtype, args, mailboxwaittimeout, responsetype)
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'executionquery', id);
  };

  return compilers;
}

function compileblock(block, inherited, constants, options) {
  if (inherited === undefined) inherited = {};
  if (options && options.tools) setblockcompilertools(options.tools);

  if (typeof block.behaviour !== 'function' && options && options.strictrefonly === true) {
    var hasbehaviour = typeof block.behaviour === 'function';
    var haslegacyfn = typeof block.fn === 'function';
    var hasref = block.ref && typeof block.ref === 'string';
    if (!hasbehaviour && (haslegacyfn || hasref)) {
      throw new Error('[compileblock] P5 violation: block "' + (block.id || 'unknown') +
        '" uses inline fn: or ref:; the target program model requires behaviour: <exposed function>');
    }
  }

  if (block.ref && typeof block.ref === 'string' && typeof block.behaviour !== 'function') {
    var refTarget = (typeof window !== 'undefined') ? window[block.ref] : (typeof globalThis !== 'undefined' ? globalThis[block.ref] : undefined);
    if (typeof refTarget === 'function') block.behaviour = refTarget;
  }

  var compiler = constants.compilers[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.analyzers[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockio = { inputs: block.inputs || [], outputs: block.outputs || {} };
  return compiler(block, block.id, blockio, inherited);
}

// ============================================================
// §4 — Pipeline orchestration
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
  var witnesstimeout = options && options.witnesstimeout ? options.witnesstimeout : scriptwitnesstimeout;

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
    var childenv = {};
    var inputkeys = el.inputs || [];
    inputkeys.forEach(function(key) {
      childenv[key] = compilepathaccessor(key)(parentenv);
    });

    return Promise.resolve(el.childstate()).then(function(childstate) {
      if (!childstate || typeof childstate !== 'object') {
        var stateerr = new Error('[processpipelineelement] PIPELINE element "' + elementid + '" childstate() returned invalid state');
        stateerr.diagnostic = { KIND: 'state-invalid', ELEMENTID: elementid, RECEIVED: typeof childstate };
        throw stateerr;
      }

      var derivedname = el.nameoverride || childstate.name || ('pipeline' + elementid);
      childenv.pipelinename = derivedname;
      if (el.container) childenv.containerid = el.container;

      var childoptions = el.options || {};
      if (childoptions.autorun === undefined) childoptions.autorun = true;
      if (childoptions.baseenv === undefined) childoptions.baseenv = childenv;
      if (childoptions.strictrefonly === undefined && options && options.strictrefonly !== undefined) childoptions.strictrefonly = options.strictrefonly;

      return run(childstate, childoptions).then(function(result) {
        var wrapped = wrapblockresult(result, { outputs: el.outputs || {} });
        var mapped = mapoutputs(wrapped, Object.keys(el.outputs || {}));
        Object.keys(mapped).forEach(function(k) { parentenv[k] = mapped[k]; });
        return wrapped;
      });
    });
  };

  return wrapcompiledfn(innerfn, 'pipeline', elementid, 'pipeline');
}

function registereventstage(stage, pipelinename, stagepath, options) {
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
    BRIEFCASE: stage.briefcase || {},
    OPTIONS: options || {}
  };
  return sendandawait('RENDERACTOR', MESSAGETYPES.REGISTEREVENTLISTENER, payload, mailboxwaittimeout, MESSAGETYPES.EVENTLISTENERREGISTERED)
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
  var childstagepath = stagepath.concat([childstage.id]);

  if (childstage.control && childstage.control.command === 'EVENT') {
    return registereventstage(childstage, pipelinename, childstagepath, options)
      .then(function() {
        var noopwrapper = function(env) { return Promise.resolve(env); };
        noopwrapper.iseventregistration = true;
        return noopwrapper;
      });
  }

  if (childstage.async === true) {
    var asyncwrapper = function(env) {
      return callwithstack(
        null,
        'nested-stage:' + childstage.id,
        'async-await',
        function() {
          orchestratestage(childstage, pipelinename, env, childstagepath, options || {}, runblocks)
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
        null,
        'nested-stage:' + childstage.id,
        'async-await',
        function() {
          return orchestratestage(childstage, pipelinename, env, childstagepath, options || {}, runblocks);
        },
        [env],
        { context: { env: env }, capturecontinuation: true, attachcontinuation: false }
      );
    };
    syncwrapper.asyncstage = false;
    return syncwrapper;
  }
}

// @proposal=P-AR — orchestratestage accepts a `runblocks` flag.
// @proposal=P-AT — top-level EVENT stages are dispatched in
// orchestratepipeline before reaching orchestratestage; this function
// continues to handle ordinary stages and nested-EVENT stages.
function orchestratestage(stage, pipelinename, env, stagepath, options, runblocks) {
  var constants = createblockcompilerconstants();
  var blocktypes = constants.blocktypes;
  var inheritedkeys = constants.inheritedkeys;
  var dnaconstants = creatednaserializerconstants();
  var analyzers = createblockanalyzers(blocktypes, dnaconstants);
  var compilers = createblockcompilers(blocktypes, inheritedkeys, options);
  var compilerconstants = { blocktypes: blocktypes, inheritedkeys: inheritedkeys, analyzers: analyzers, compilers: compilers };

  var index = 0;
  var stagetoken = { CANCELLED: false };
  var execute = runblocks === true;

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
      elementfn = processelement(elementdef, pipelinename, stagepath.concat([elementdef.id]), {}, compilerconstants, dnaconstants, options);
    } else if (elementdef.element === 'PIPELINE') {
      elementfn = processpipelineelement(elementdef, pipelinename, stagepath.concat([elementdef.id]), {}, options);
    } else if (elementdef.element === 'STAGE') {
      elementfn = processnestedstage(elementdef, pipelinename, stagepath.concat([elementdef.id]), compilerconstants, dnaconstants, options, execute);
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

// @proposal=P-AR — createpersistentelementwrapper's internals are
// preserved. Under Design A the wrapper is invoked from
// triggerblockflow at append time, and from orchestratestage at run
// time for compileonly pipelines.
function createpersistentelementwrapper(compiledelement, elementdef, stagepath, pipelinename, options) {
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
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'submitting element:', elementid, 'pipeline:', pipelinename, 'stagepath:', JSON.stringify(stagepath));
    var tag = GENERATETAG();
    var descriptor = {
      PIPELINEID: pipelinename,
      PATH: path,
      ELEMENTID: elementid,
      ENV: execenv,
      SIGNATURE: { INPUTS: blockinputs, OUTPUTS: blockoutputs },
      EXECUTOR: executor,
      PROPERTIES: elementdef || {},
      ORIGIN: compiledelement.origin || null
    };

    SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.EXECUTEELEMENT, descriptor, tag, 'BLOCKCOMPILER', { responsetype: 'taskresult' });

    return WAITFORMAILBOX({ TAG: tag, SENDER: 'EXECUTIONACTOR', TYPE: MESSAGETYPES.TASKRESULT }, mailboxwaittimeout)
      .then(function(mailboxmessage) {
        var payload = mailboxmessage && mailboxmessage.PAYLOAD ? mailboxmessage.PAYLOAD : {};
        var outerresult = payload.RESULT !== undefined ? payload.RESULT : (payload.result !== undefined ? payload.result : payload);
        var result = outerresult.RESULT !== undefined ? outerresult.RESULT : (outerresult.result !== undefined ? outerresult.result : outerresult);
        if (result && typeof result === 'object' && result.ERROR !== undefined) {
          var failuremessage = typeof result.ERROR === 'string'
            ? result.ERROR
            : (result.ERROR && typeof result.ERROR.message === 'string'
                ? result.ERROR.message
                : String(result.ERROR));
          var failureError = new Error(failuremessage);
          failureError.diagnostic = failureError.diagnostic || {};
          failureError.diagnostic.BLOCKID = elementid;
          failureError.diagnostic.PIPELINEID = pipelinename;
          failureError.diagnostic.TASKID = result.TASKID || null;
          throw failureError;
        }
        var outputkeys = Object.keys(blockoutputs || {});
        var mapped = mapoutputs(result, outputkeys);
        Object.keys(mapped).forEach(function(k) { execenv[k] = mapped[k]; });
        logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'element completed:', elementid, 'pipeline:', pipelinename);
        return result;
      });
  }
  wrapper.id = elementid;
  wrapper.kind = 'element';
  if (compiledelement.blockmeta) wrapper.blockmeta = compiledelement.blockmeta;
  return wrapper;
}

// ============================================================
// §5 — Loader primitives
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

function loadscriptwithwitness(entry, basepath, timeout) {
  return sendandawait('RENDERACTOR', MESSAGETYPES.LOADSCRIPT,
                      { SRC: basepath + entry.src },
                      mailboxwaittimeout,
                      MESSAGETYPES.SCRIPTLOADED)
    .then(function(response) {
      if (response && response.ERROR) throw new Error(response.ERROR);
      if (entry.provides && entry.provides.length > 0) {
        return waitforwitness(entry, timeout);
      }
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

// ============================================================
// §6 — Finalizers
// ============================================================

// @proposal=P-AR — orchestratepipeline walks the tree to dispatch EVENT
// stages and PIPELINE elements. Under Design A, BLOCK elements are
// already executed at append time; this walker uses runblocks=false so
// that BLOCK elements are skipped. Compileonly pipelines use
// runblocks=true to execute the deferred blocks.
//
// @proposal=P-AT — the walker dispatches top-level EVENT stages to
// registereventstage. The stage's blocks are not walked. Ordinary
// stages (including those with `async` or no control) fall through to
// orchestratestage.
function orchestratepipeline(p, stageindex, env, options, runblocks) {
  if (stageindex >= p.elements.length) return Promise.resolve(env);
  var stage = p.elements[stageindex];
  if (!stage || stage.element !== 'STAGE') {
    return orchestratepipeline(p, stageindex + 1, env, options, runblocks);
  }
  var stagepath = ['elements', stageindex];

  if (stage.control && stage.control.command === 'EVENT') {
    return registereventstage(stage, p.name, stagepath, options)
      .then(function() {
        return orchestratepipeline(p, stageindex + 1, env, options, runblocks);
      });
  }

  return orchestratestage(stage, p.name, env, stagepath, options, runblocks)
    .then(function() {
      return orchestratepipeline(p, stageindex + 1, env, options, runblocks);
    });
}

function loadpipelineresources(p, options) {
  return loadpipelinedependencies(p, options);
}

// @proposal=P-AR — run() is reduced to:
//   1. resource loading;
//   2. for non-compileonly pipelines, awaiting the append-time pending
//      chain, then a structural walk (runblocks=false) to register EVENT
//      stages and construct PIPELINE children;
//      for compileonly pipelines, a structural walk with runblocks=true
//      (the deferred blocks execute at that point).
//
// @proposal=P-AT — the structural walk itself dispatches top-level EVENT
// stages to registereventstage; their blocks are not executed at walk
// time even under runblocks=true.
function run(p, options) {
  if (options === undefined) options = {};
  loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'run pipeline:', p.name, 'type:', p.type);

  return loadpipelineresources(p, options).then(function() {
    if (p.compileonly === true) {
      var cenv = p.env || options.baseenv || {};
      return orchestratepipeline(p, 0, cenv, options, true).then(function(finalenv) {
        p.env = finalenv;
        loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'pipeline complete (compileonly):', p.name);
        return finalenv;
      });
    }

    var pending = p.pending || Promise.resolve(p);
    return Promise.resolve(pending).then(function() {
      var renv = p.env || options.baseenv || {};
      return orchestratepipeline(p, 0, renv, options, false).then(function(finalenv) {
        p.env = finalenv;
        loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'pipeline complete:', p.name);
        return finalenv;
      });
    });
  });
}

function compile(p, options) {
  if (options === undefined) options = {};
  loginfo(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compile pipeline:', p.name, 'type:', p.type);
  return loadpipelineresources(p, options).then(function() { return p; });
}

// ============================================================
// §7 — Exports
// ============================================================
