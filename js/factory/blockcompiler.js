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

function nodeat(p, path) {
  return nodeatat(p, path, 0);
}

function nodeatat(node, path, index) {
  if (index >= path.length) return node;
  return nodeatat(node.elements[path[index]], path, index + 1);
}

function appendstage(p, level, child) {
  if (child.element !== 'STAGE') {
    throw new Error('[appendstage] child must be a stage value');
  }
  return pipelinewith(p, appendat(p.elements, level, 0, child));
}

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
      wait: 'wait', executionquery: 'executionquery',
      loader: 'loader'
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

function exchange(recipient, type, payload, timeout, responsetype, tag) {
  if (tag === undefined) tag = GENERATETAG();
  SENDINSTRUCTION(recipient, type, payload, tag, 'BLOCKCOMPILER', { responsetype: responsetype });
  return WAITFORMAILBOX({ TAG: tag, SENDER: recipient, TYPE: responsetype }, timeout);
}

function sendandawait(recipient, type, payload, timeout, responsetype) {
  return exchange(recipient, type, payload, timeout, responsetype).then(unwrap);
}

function loadscripts(entries, basepath, timeout, label) {
  if (typeof timeout === 'undefined') timeout = mailboxresolve('scriptwitnesstimeout');
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

    var timeout = merged.timeout || mailboxresolve('mailboxwaittimeout');

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
        logwarn(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'loader background poll error:', id, err);
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
        }, mailboxresolve('mailboxwaittimeout'), 'domresult')
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

      return sendandawait('RENDERACTOR', msgtype, outbound, mailboxresolve('mailboxwaittimeout'), 'domresult')
        .then(function(r) {
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
      return sendandawait('RENDERACTOR', MESSAGETYPES.CRYPTO, { BYTES: bytes }, mailboxresolve('mailboxwaittimeout'), 'domresult')
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
      return sendandawait('EXECUTIONACTOR', msgtype, args, mailboxresolve('mailboxwaittimeout'), responsetype)
        .then(function(r) { return wrapblockresult(r, sig); });
    };
    return wrapcompiledfn(innerfn, 'executionquery', id);
  };

  compilers[blocktypes.loader] = function(merged, id, sig) {
    logdebug(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'compiling LOADER block:', id);
    return compileloaderblock(merged, id, sig);
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
        var mapped = mapoutputs(wrapped, Object.keys(el.outputs || {}));
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
  return sendandawait('RENDERACTOR', MESSAGETYPES.REGISTEREVENTLISTENER, payload, mailboxresolve('mailboxwaittimeout'), MESSAGETYPES.EVENTLISTENERREGISTERED)
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

// @proposal=P29 — the RECOVERY stage. Its children execute sequentially.
// On the first child failure, the stage increments the failing element's
// retrycount key, builds a state.error summary, evaluates the predicate,
// and branches on the outcome: 'retry' re-runs the sequence from index 0;
// 'continue' resolves with the current env; 'abort' rejects. On the
// completion path (all children succeeded), the predicate is also
// evaluated (without state.error) so the pipeline can express its
// envelope-validity policy. The capture path also dispatches the
// corresponding CCC message to the execution actor, so manual and
// programmatic recovery share the same transport.
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
  if (typeof SENDINSTRUCTION !== 'function' || typeof MESSAGETYPES === 'undefined') return;
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

  var constants = createblockcompilerconstants();
  var dnaconstants = creatednaserializerconstants();
  var analyzers = createblockanalyzers(constants.blocktypes, dnaconstants);
  var compilers = createblockcompilers(constants.blocktypes, constants.inheritedkeys, options);
  var compilerconstants = { blocktypes: constants.blocktypes, inheritedkeys: constants.inheritedkeys, analyzers: analyzers, compilers: compilers };

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
        elementfn = processelement(childdef, pipelinename, stagepath.concat([childdef.id]), {}, compilerconstants, dnaconstants, options);
      } else if (childdef.element === 'PIPELINE') {
        elementfn = processpipelineelement(childdef, pipelinename, stagepath.concat([childdef.id]), {}, options);
      } else if (childdef.element === 'STAGE') {
        elementfn = processnestedstage(childdef, pipelinename, stagepath.concat([childdef.id]), compilerconstants, dnaconstants, options, runblocks);
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
      // completion path — all children succeeded
      evaluate(env, null, false, null, null).then(resolve).catch(reject);
    }, function(err, childdef) {
      // capture path
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
            logwarn(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
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

// @proposal=P27 — enrich err.diagnostic with PIPELINEID, STAGEPATH, and
// ELEMENTID (if-absent) before propagating the failure.
// @proposal=P30 — switch the catchtimeout check to the classifier
// 'mailbox-wait-timeout'.
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

    var waitduration = (elementdef && typeof elementdef.timeout === 'number' && elementdef.timeout > 0)
      ? elementdef.timeout
      : mailboxresolve('mailboxwaittimeout');
    var catchtimeout = (elementdef && elementdef.catchtimeout === true);

    return exchange('EXECUTIONACTOR', MESSAGETYPES.EXECUTEELEMENT, descriptor, waitduration, 'taskresult', tag)
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
      })
      .catch(function(err) {
        // @proposal=P27 — enrich the diagnostic before any rethrow.
        if (err && typeof err === 'object') {
          if (!err.diagnostic || typeof err.diagnostic !== 'object') {
            err.diagnostic = {};
          }
          if (err.diagnostic.PIPELINEID === undefined) err.diagnostic.PIPELINEID = pipelinename;
          if (err.diagnostic.STAGEPATH === undefined) err.diagnostic.STAGEPATH = stagepath;
          if (err.diagnostic.ELEMENTID === undefined) err.diagnostic.ELEMENTID = elementid;
        }

        // @proposal=P30 — classifier-based timeout check.
        var istimeout = catchtimeout
          && err
          && err.diagnostic
          && err.diagnostic.KIND === 'mailbox-wait-timeout';
        if (!istimeout) throw err;
        var timeoutenv = { ERROR: 'timeout', TAG: tag, KIND: 'mailbox-wait-timeout' };
        var outputkeys2 = Object.keys(blockoutputs || {});
        outputkeys2.forEach(function(k) { execenv[k] = timeoutenv; });
        logwarn(BLOCKCOMPILERSTATE, '[BLOCKCOMPILER]', 'element timed out (caught):', elementid, 'pipeline:', pipelinename);
        return timeoutenv;
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
                      mailboxresolve('mailboxwaittimeout'),
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
// setaccent (unchanged from RUN 36 §2.4)
// ============================================================

function setaccent(selector, accentref, palette, prop) {
  if (!selector || typeof selector !== 'object') {
    throw new Error('[setaccent] selector required');
  }
  if (!selector.id && !selector.tag && !selector.class) {
    throw new Error('[setaccent] selector must declare id, tag, or class');
  }
  if (!palette || typeof palette !== 'object') {
    throw new Error('[setaccent] palette required');
  }

  var entry = null;

  if (typeof accentref === 'number') {
    if (palette.accents && palette.accents[accentref]) {
      entry = palette.accents[accentref];
    } else if (palette.warm && palette.warm[accentref]) {
      entry = palette.warm[accentref];
    }
  } else if (typeof accentref === 'string') {
    if (palette.accents) {
      for (var i = 0; i < palette.accents.length; i++) {
        if (palette.accents[i] && palette.accents[i].name === accentref) {
          entry = palette.accents[i];
          break;
        }
      }
    }
    if (!entry && palette.neutrals && palette.neutrals[accentref]) {
      entry = palette.neutrals[accentref];
    }
    if (!entry && palette[accentref] !== undefined) {
      entry = palette[accentref];
    }
    if (!entry && palette.warm) {
      for (var j = 0; j < palette.warm.length; j++) {
        if (palette.warm[j] && palette.warm[j].name === accentref) {
          entry = palette.warm[j];
          break;
        }
      }
    }
  } else {
    throw new Error('[setaccent] accentref must be a number or string');
  }

  if (!entry) {
    throw new Error('[setaccent] cannot resolve accent ' + String(accentref));
  }

  var hex = (typeof entry === 'string') ? entry : entry.hex;
  if (!hex || typeof hex !== 'string' || hex.charAt(0) !== '#') {
    throw new Error('[setaccent] accent ' + String(accentref) + ' has no hex');
  }

  var cssprop = prop || 'color';

  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.SETACCENT, {
    SELECTOR: selector,
    PROP: cssprop,
    HEX: hex,
    REF: accentref
  }, GENERATETAG(), 'BLOCKCOMPILER');
}
