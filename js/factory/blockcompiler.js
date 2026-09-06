var blockcompilerstate = Object.freeze({ level: createverbosityconstants().DEBUG });

var frontendbase = (typeof window !== 'undefined') ? window.location.origin + '/' : '';
var scriptwitnesstimeout = 5000;
var mailboxwaittimeout = 25000;

function createblockcompilerconstants() {
  return Object.freeze({
    blocktypes: Object.freeze({
      fn: 'fn', api: 'api', fetch: 'fetch', writer: 'writer',
      io: 'io', domquery: 'domquery', crypto: 'crypto',
      wait: 'wait', executionquery: 'executionquery'
    }),
    inheritedkeys: Object.freeze(['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents'])
  });
}

function cloneobject(obj) {
  var out = {};
  Object.keys(obj || {}).forEach(function(key) { out[key] = obj[key]; });
  return out;
}

function extendobject(target, source) {
  Object.keys(source || {}).forEach(function(key) { target[key] = source[key]; });
  return target;
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

function containsstyleaccess(source) {
  if (typeof source !== 'string') return false;

  function matchestyl(j, k) {
    var expected = 'tyle';
    if (k >= expected.length) return j;
    if (j >= source.length || source.charAt(j).toLowerCase() !== expected.charAt(k)) return -1;
    return matchestyl(j + 1, k + 1);
  }

  function skipwhitespace(j) {
    if (j >= source.length) return j;
    var c = source.charAt(j);
    if (c === ' ' || c === '\t' || c === '\n') return skipwhitespace(j + 1);
    return j;
  }

  function scan(i) {
    if (i >= source.length) return false;
    var ch = source.charAt(i);
    if (ch === 's' || ch === 'S') {
      var after = matchestyl(i + 1, 0);
      if (after !== -1) {
        var ws = skipwhitespace(after);
        if (source.charAt(ws) === '.') return true;
      }
    }
    return scan(i + 1);
  }

  return scan(0);
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

  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'buildblockproperties for block:', merged.id, 'type:', merged.type);

  var properties = buildproperties(merged, inherited);
  var inputsobj = {};

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

  return properties;
}

function writeoutputs(sig, env, result, id) {
  var patch = {};
  var outputkeys = sig && sig.outputs ? Object.keys(sig.outputs) : [];
  if (result === null || result === undefined) {
    if (outputkeys.length > 0) throw new Error('block returned ' + result + ' but outputs expected keys: ' + outputkeys.join(', '));
    return patch;
  }
  if (outputkeys.length === 1) {
    var key = outputkeys[0];
    var value = result[key] !== undefined ? result[key] : result;
    patch[key] = value;
    env[key] = value;
    return patch;
  }
  outputkeys.forEach(function(k) {
    if (result[k] === undefined) throw new Error('missing required output "' + k + '" from block result');
    patch[k] = result[k];
    env[k] = result[k];
  });
  return patch;
}

function createerrorcontext(id, stagetype) {
  return function(err) {
    err.diagnostic = err.diagnostic || {};
    err.diagnostic.blockid = id;
    err.diagnostic.stagetype = stagetype;
    throw err;
  };
}

function createblockanalyzer(rules) {
  return function(block) {
    var errors = [];
    rules.forEach(function(rule) {
      var value = block[rule.field];
      if (rule.required && (value === undefined || value === null)) {
        errors.push(rule.message);
      } else if (value !== undefined && value !== null) {
        if (rule.type && typeof value !== rule.type) {
          errors.push(rule.message + ' (expected ' + rule.type + ', got ' + typeof value + ')');
        }
        if (rule.custom && !rule.custom(value, block)) errors.push(rule.message);
      }
    });
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: [],
      dependencies: [],
      outputs: block.outputs ? block.outputs : {},
      contracts: []
    };
  };
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

function createblockanalyzers(blocktypes, dnaconstants) {
  var analyzers = {};
  analyzers[blocktypes.fn] = function(block) {
    var errors = [];
    if (!block.fn) errors.push('fn block must have a function');
    if (typeof block.fn === 'function') {
      if (block.fn.toString().indexOf('document.') !== -1 || containsstyleaccess(block.fn.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors = errors.concat(validaterevivablefunctionblock(block, blocktypes, dnaconstants));
    }
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[blocktypes.api] = createblockanalyzer([
    { field: 'endpoint', required: true, message: 'api block must have an endpoint' },
    { field: 'method', required: true, message: 'api block must have GET/POST method', custom: function(v) { return v === 'GET' || v === 'POST'; } }
  ]);

  analyzers[blocktypes.fetch] = createblockanalyzer([
    { field: 'endpoint', required: true, message: 'fetch block must have an endpoint' },
    { field: 'method', required: true, message: 'fetch block must have GET/POST method', custom: function(v) { return v === 'GET' || v === 'POST'; } }
  ]);

  analyzers[blocktypes.writer] = function(block) {
    var errors = [];
    if (typeof block.fn !== 'function' && typeof block.ref !== 'function') errors.push('writer block must have fn or ref');
    if (typeof block.fn === 'function' || typeof block.ref === 'function') errors = errors.concat(validaterevivablefunctionblock(block, blocktypes, dnaconstants));
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[blocktypes.io] = createblockanalyzer([
    { field: 'ref', required: true, type: 'function', message: 'io block ref must be a function' }
  ]);

  analyzers[blocktypes.domquery] = function(block) {
    var valid = Boolean(block.command && block.command.COMMAND);
    return { valid: valid, errors: valid ? [] : ['domquery block requires command.COMMAND'], warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[blocktypes.crypto] = createblockanalyzer([
    { field: 'outputs', required: true, message: 'crypto block must have outputs', custom: function(v, b) { return Object.keys(b.outputs ? b.outputs : {}).length > 0; } }
  ]);

  analyzers[blocktypes.wait] = createblockanalyzer([
    { field: 'ms', required: true, message: 'wait block must have ms' }
  ]);

  analyzers[blocktypes.executionquery] = createblockanalyzer([
    { field: 'command', required: true, message: 'executionquery requires command', custom: function(v) { return v && typeof v.COMMAND === 'string'; } }
  ]);

  return Object.freeze(analyzers);
}

function compilehttpblock(merged, id, sig, istextual, options) {
  var innerfn = function(env) {
    var label = (istextual ? 'fetch' : 'api') + ':' + (merged.endpoint || id);
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

    var tag = GENERATETAG();
    var responsetype = istextual ? 'fetch_result' : 'api_result';
    var sender = 'APIACTOR';

    SENDINSTRUCTION('APIACTOR', istextual ? MESSAGETYPES.FETCH : MESSAGETYPES.API, {
      endpoint: endpoint,
      method: merged.method,
      payload: payload,
      token: env.authsessionaccesstoken || ''
    }, tag, 'BLOCKCOMPILER', { responsetype: responsetype });

    var timeout = merged.timeout || mailboxwaittimeout;
    return WAITFORMAILBOX({ tag: tag, sender: sender, type: istextual ? MESSAGETYPES.FETCH_RESULT : MESSAGETYPES.API_RESULT }, timeout)
      .then(function(mailboxmessage) {
        var response = mailboxmessage.payload;
        var result = response && response.result ? response.result : response;
        if (result && result.error) throw new Error(result.error);
        var finalresult = result.data !== undefined ? result.data : result;
        if (merged.mapping && merged.mapping.response && result && typeof result === 'object') {
          finalresult = buildresponse(merged.mapping.response, result);
        }
        return finalresult;
      });
  };

  var blockfn = function(env) {
    return callwithstack(EVALSTACK, (istextual ? 'fetch' : 'api') + ':' + id, 'async-await', function() {
      return innerfn(env);
    }, [env], {
      context: { env: env, pipestate: env.pipestate },
      capturecontinuation: true,
      errk: createerrorcontext(id, istextual ? 'fetch' : 'api')
    });
  };
  blockfn.id = id;
  return blockfn;
}

function createblockcompilers(blocktypes, inheritedkeys, dependencies, options) {
  var compilers = {};

  compilers[blocktypes.fn] = function(merged, id, sig, inheritedproperties) {
    if (inheritedproperties === undefined) inheritedproperties = {};
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling FN block:', id);
    var blockfn = function(env) {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing FN block:', id);
      var fn = merged.fn;
      if (!fn) throw new Error('fn block must have a function: ' + id);
      var properties = buildblockproperties(merged, inheritedproperties, sig, env, dependencies);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var fnargs = [properties].concat(inputargs);
      return callwithstack(EVALSTACK, 'fn:' + (merged.ref || id), 'async-await', function() {
        return Promise.resolve(fn.apply(null, fnargs)).then(function(result) { return result || {}; });
      }, [env], { context: { env: env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') })
      .then(function(result) {
        return result;
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[blocktypes.api] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, false, options); };
  compilers[blocktypes.fetch] = function(merged, id, sig) { return compilehttpblock(merged, id, sig, true, options); };

  compilers[blocktypes.writer] = function(merged, id, sig, inheritedproperties) {
    if (inheritedproperties === undefined) inheritedproperties = {};
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var innerfn = function(env) {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
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
        var tag = GENERATETAG();
        SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.HTML, {
          id: target,
          markup: result.html,
          append: !merged.replace
        }, tag, 'BLOCKCOMPILER', { responsetype: 'dom_result' });

        return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, mailboxwaittimeout)
          .then(function() {
            if (result.id && Object.keys(sig.outputs || {}).length > 0) {
              return expectelement(result.id, result.timeout || 5000).then(function(domref) {
                env[Object.keys(sig.outputs)[0]] = result;
                env[result.id] = domref;
                return result;
              });
            }
            return result;
          });
      });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'writer:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'writer')
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[blocktypes.io] = function(merged, id, sig) {
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling IO block:', id);
    var innerfn = function(env) {
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'executing IO block:', id);
      var io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      return callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', function(e) {
        return Promise.resolve(io(inputdata, e));
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'io:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'io')
      });
    };
    blockfn.id = id;
    return blockfn;
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

      var tag = GENERATETAG();
      var responsetype = 'dom_result';
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
      SENDINSTRUCTION('RENDERACTOR', msgtype, {
        id: props.id,
        value: resolvedvalue,
        classname: resolvedclassname,
        force: props.force,
        query: props.query,
        arguments: props.arguments,
        name: props.name
      }, tag, 'BLOCKCOMPILER', { responsetype: responsetype });

      return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          var response = mailboxmessage.payload;
          return response && response.result !== undefined ? response.result : response;
        });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'domquery:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'domquery')
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[blocktypes.crypto] = function(merged, id, sig) {
    var innerfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      var tag = GENERATETAG();
      SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.CRYPTO, { bytes: bytes }, tag, 'BLOCKCOMPILER', { responsetype: 'dom_result' });
      return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          return mailboxmessage.payload && mailboxmessage.payload.result !== undefined ? mailboxmessage.payload.result : mailboxmessage.payload;
        });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'crypto:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'crypto')
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[blocktypes.wait] = function(merged, id) {
    var innerfn = function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      return new Promise(function(r) { setTimeout(r, ms); }).then(function() { return {}; });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'wait:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'wait')
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[blocktypes.executionquery] = function(merged, id, sig) {
    var innerfn = function(env) {
      var command = merged.command || {};
      var cmd = command.COMMAND;
      var args = command.args || {};
      var tag = GENERATETAG();
      var responsetype = 'task_result';
      var msgtype;
      switch (cmd) {
        case 'get': msgtype = MESSAGETYPES.GET_STATUS; break;
        case 'tasks': msgtype = MESSAGETYPES.GET_TASKS; break;
        case 'task_status': msgtype = MESSAGETYPES.GET_TASK_STATUS; break;
        case 'await_task': msgtype = MESSAGETYPES.AWAIT_TASK; break;
        case 'cancel_task': msgtype = MESSAGETYPES.CANCEL_TASK; break;
        case 'stop_task': msgtype = MESSAGETYPES.STOP_TASK; break;
        default: throw new Error('[executionquery] unknown command: ' + cmd);
      }
      SENDINSTRUCTION('EXECUTIONACTOR', msgtype, args, tag, 'BLOCKCOMPILER', { responsetype: responsetype });
      return WAITFORMAILBOX({ tag: tag, sender: 'EXECUTIONACTOR', type: MESSAGETYPES.TASK_RESULT }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          var response = mailboxmessage.payload;
          return response && response.result !== undefined ? response.result : response;
        });
    };
    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'executionquery:' + id, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(id, 'executionquery')
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  return Object.freeze(compilers);
}

function compileblock(block, inheritedbriefcase, constants, options) {
  if (inheritedbriefcase === undefined) inheritedbriefcase = {};
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

function resolvenextelement(stage, index) {
  if (!stage || !stage.elements || index >= stage.elements.length) return null;
  return stage.elements[index];
}

function processelement(el, pipelineid, stagepath, inheritedbriefcase, constants, dnaconstants, dependencies, options) {
  var fn = compileblock(el, inheritedbriefcase, constants, options);
  fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' };
  fn.kind = 'element';
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
  var elementid = el.id || 'pipeline_unknown';
  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'processpipelineelement:', elementid, 'pipeline:', el.pipeline);

  var resolvedpipeline = null;
  var parentcontainer = null;

  if (typeof el.pipeline === 'string') {
    var segments = el.pipeline.split('.');
    if (segments.length > 1 && segments[segments.length - 1] === 'pipeline') {
      var parentpath = segments.slice(0, -1).join('.');
      parentcontainer = resolvepipelinepath(parentpath, dependencies || (typeof window !== 'undefined' ? window : (typeof globalthis !== 'undefined' ? globalthis : {})));
      logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'derived parent container for dependencies:', parentpath);
    }
    resolvedpipeline = resolvepipelinepath(el.pipeline, dependencies || (typeof window !== 'undefined' ? window : (typeof globalthis !== 'undefined' ? globalthis : {})));
    if (!resolvedpipeline || !resolvedpipeline.elements) {
      logerror(blockcompilerstate, '[BLOCKCOMPILER]', 'failed to resolve pipeline path:', el.pipeline);
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
      childenv.pipelineid = el.pipelineidoverride || (el.pipeline && el.pipeline.id) || (el.pipeline && el.pipeline.identity && el.pipeline.identity.id) || 'pipeline_' + elementid;

      var inputkeys = el.inputs || [];
      inputkeys.forEach(function(key) {
        childenv[key] = compilepathaccessor(key)(parentenv);
      });

      var childoptions = el.options || {};
      if (childoptions.autorun === undefined) childoptions.autorun = true;
      if (childoptions.baseenv === undefined) childoptions.baseenv = childenv;
      if (childoptions.updateworldmap === undefined) childoptions.updateworldmap = parentenv.updateworldmap;
      if (childoptions.verbosity === undefined && options && options.verbosity !== undefined) childoptions.verbosity = options.verbosity;

      var innerdnaenvelope = {
        pipelineid: childenv.pipelineid,
        definition: { pipeline: resolvedpipeline },
        dependencies: mergeddependencies || {}
      };

      var bootmessage = {
        dna: innerdnaenvelope,
        accessors: el.accessors || null,
        sinks: el.sinks || [],
        pipelineid: childenv.pipelineid,
        options: childoptions
      };

      var tag = GENERATETAG();
      var responsetype = 'pipeline_booted';
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.BOOT_PIPELINE, bootmessage, tag, 'BLOCKCOMPILER', { responsetype: responsetype });

      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.PIPELINE_BOOTED }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          var response = mailboxmessage.payload;
          var result = response && response.result ? response.result : response;
          writeoutputs({ inputs: [], outputs: el.outputs || {} }, parentenv, result, elementid);
          return result;
        });
    };

    var blockfn = function(env) {
      return callwithstack(EVALSTACK, 'pipeline:' + elementid, 'async-await', function() { return innerfn(env); }, [env], {
        context: { env: env, pipestate: env.pipestate },
        capturecontinuation: true,
        errk: createerrorcontext(elementid, 'pipeline')
      });
    };
    blockfn.id = elementid;
    blockfn.kind = 'pipeline';
    return blockfn;
  });
}

function registereventstage(stage, pipelineid, stagepath, options) {
  var sourceid = stage.control.sourceid;
  var event = stage.control.event;
  if (!sourceid || !event) {
    return Promise.reject(new Error('[registereventstage] EVENT stage missing sourceid/event'));
  }
  var tag = GENERATETAG();
  var payload = {
    pipelineid: pipelineid,
    stageid: stage.id,
    stagepath: stagepath,
    sourceid: sourceid,
    event: event,
    control: stage.control,
    elements: stage.elements,
    briefcase: stage.briefcase || {},
    options: options || {}
  };
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.REGISTER_EVENT_LISTENER, payload, tag, 'BLOCKCOMPILER', { responsetype: MESSAGETYPES.EVENT_LISTENER_REGISTERED });
  return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.EVENT_LISTENER_REGISTERED }, mailboxwaittimeout)
    .then(function(mailboxmessage) {
      var response = mailboxmessage.payload;
      if (response && response.error) {
        throw new Error('[registereventstage] Registration failed for ' + stage.id + ': ' + response.error);
      }
      if (response && response.result !== undefined) {
        return response.result;
      }
      return true;
    });
}

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
        EVALSTACK,
        'nested-stage:' + childstage.id,
        'async-await',
        function() {
          orchestratestage(childstage, pipelineid, dependencies, env, childstagepath, options || {}, null)
            .catch(function(err) {
              logwarn(blockcompilerstate, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
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
        EVALSTACK,
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
    type: 'compile_stage',
    pipeline: pipeline,
    pipelineid: pipelineid,
    stageindex: nextindex,
    stagepath: ['pipeline', 'elements', nextindex],
    briefcase: {},
    env: env || {},
    options: options || {}
  };
}

function sendstagecompleted(pipelineid, stageid, nextstagemessage, env) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.STAGE_COMPLETED, {
    pipelineid: pipelineid,
    stageid: stageid,
    nextstagemessage: nextstagemessage,
    env: env || {}
  }, tag, 'BLOCKCOMPILER', { responsetype: 'stage_completed_ack' });
  return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.STAGE_COMPLETED_ACK }, mailboxwaittimeout)
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
  var stagetoken = { cancelled: false };

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

    blockcompilerstate.activecancellationtoken = stagetoken;

    return Promise.resolve(elementfn).then(function(fn) {
      return fn(env);
    }).then(function() {
      index++;
      return runnext();
    }).catch(function(err) {
      stagetoken.cancelled = true;
      blockcompilerstate.activecancellationtoken = null;
      logerror(blockcompilerstate, '[BLOCKCOMPILER]', 'Element failed:', elementdef.id, err);
      throw err;
    }).then(function(result) {
      blockcompilerstate.activecancellationtoken = null;
      return result;
    });
  }

  return runnext();
}

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
  if (typeof timeout === 'undefined') timeout = scriptwitnesstimeout;
  var normalized = normalizeentries(libs);
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'loading framework libs:', normalized.length);
  return loadscriptssequentially(normalized, basepath, timeout);
}

function loadfrontendprograms(programs, basepath, timeout) {
  if (typeof timeout === 'undefined') timeout = scriptwitnesstimeout;
  var normalized = normalizeentries(programs);
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'loading frontend programs:', normalized.length);
  return loadscriptssequentially(normalized, basepath, timeout);
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
  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'dependencies registry keys:', Object.keys(registry));
  return registry;
}

function blockcompilercompilestage(dnaenvelope, stagepath, env, options) {
  logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'blockcompilercompilestage:', dnaenvelope.pipelineid, 'stagepath', JSON.stringify(stagepath));
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

function loadpipeline(pipelinedefinition, pipelineid, options) {
  if (options === undefined) options = {};
  var id = pipelineid || pipelinedefinition.id || (pipelinedefinition.identity && pipelinedefinition.identity.id) || 'default_pipeline';
  loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'loadpipeline start for pipeline:', id);

  return loadpipelinedependencies(pipelinedefinition, options)
    .then(function(depsregistry) {
      loginfo(blockcompilerstate, '[BLOCKCOMPILER]', 'all dependencies loaded for pipeline:', id);

      var dnaenvelope = {
        pipelineid: id,
        definition: pipelinedefinition,
        dependencies: depsregistry,
        loadedat: Date.now()
      };

      var tag = GENERATETAG();
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.BOOT_PIPELINE, {
        pipelineid: id,
        dna: dnaenvelope,
        stagepath: ['pipeline', 'elements', 0],
        accessors: options.accessors || null,
        sinks: options.sinks || [],
        options: {
          autorun: options.autorun !== false,
          baseenv: options.baseenv || {},
          updateworldmap: options.updateworldmap || null,
          verbosity: options.verbosity
        }
      }, tag, 'BLOCKCOMPILER', {
        responsetype: 'pipeline_booted'
      });

      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.PIPELINE_BOOTED }, mailboxwaittimeout)
        .then(function(mailboxmessage) {
          var response = mailboxmessage.payload;
          if (response && response.error) throw new Error(response.error);
          return response && response.result ? response.result : response;
        });
    });
}

function compilestage(stagedef, briefcase, pipelineid, stagepath, fullpipeline, options) {
  return null;
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

function createpersistentelementwrapper(compiledelement, elementdef, stagepath, pipelineid, options) {
  var elementid = elementdef.id || compiledelement.id || 'element_unknown';
  function wrapper(env) {
    var path = stagepath.concat([elementid]);
    var execenv = env;
    var executor = function(executioncontext) {
      var effectiveenv = executioncontext.env || execenv;
      return compiledelement(effectiveenv);
    };
    var blockinputs = elementdef && elementdef.inputs ? elementdef.inputs : [];
    var blockoutputs = elementdef && elementdef.outputs ? elementdef.outputs : {};
    var inputargs = blockinputs.map(function(inp) { return compilepathaccessor(inp)(execenv); });
    var closureserialized = null;
    if (typeof compiledelement === 'function') closureserialized = serializeselfcontainedclosure(compiledelement, inputargs, execenv);
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'submitting element:', elementid, 'pipeline:', pipelineid, 'stagepath:', JSON.stringify(stagepath));
    var tag = GENERATETAG();
    var descriptor = {
      pipelineid: pipelineid,
      path: path,
      elementid: elementid,
      env: execenv,
      signature: { inputs: blockinputs, outputs: blockoutputs },
      executor: executor,
      properties: elementdef || {},
      serialized: closureserialized,
      origin: compiledelement.origin || null,
      programref: null,
      elementid: elementid
    };

    SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.EXECUTE_ELEMENT, descriptor, tag, 'BLOCKCOMPILER', { responsetype: 'task_result' });

    return WAITFORMAILBOX({ tag: tag, sender: 'EXECUTIONACTOR', type: MESSAGETYPES.TASK_RESULT }, mailboxwaittimeout)
      .then(function(mailboxmessage) {
        var payload = mailboxmessage.payload;
        var outerresult = payload && payload.result !== undefined ? payload.result : payload;
        var result = outerresult && outerresult.result !== undefined ? outerresult.result : outerresult;
        writeoutputs({ inputs: blockinputs, outputs: blockoutputs }, execenv, result, elementid);
        logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'element completed:', elementid, 'pipeline:', pipelineid);
        return result;
      });
  }
  wrapper.id = elementid;
  wrapper.kind = 'element';
  if (compiledelement.blockmeta) wrapper.blockmeta = compiledelement.blockmeta;
  return wrapper;
}

// UPPERCASE aliases for actor files
var BLOCKCOMPILERCOMPILESTAGE = blockcompilercompilestage;
var COMPILESTAGE = compilestage;
var LOADPIPELINE = loadpipeline;
var RESOLVENEXTELEMENT = resolvenextelement;
var ORCHESTRATESTAGE = orchestratestage;
var VALIDATEPIPELINEBRIEFCASE = validatepipelinebriefcase;
var BUILD_BLOCK_PROPERTIES = buildblockproperties;
var PROCESS_ELEMENT = processelement;
var PROCESS_PIPELINE_ELEMENT = processpipelineelement;
var REGISTER_EVENT_STAGE = registereventstage;
var PROCESS_NESTED_STAGE = processnestedstage;
var CREATE_PERSISTENT_ELEMENT_WRAPPER = createpersistentelementwrapper;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadpipeline: loadpipeline,
    compilestage: compilestage,
    resolvenextelement: resolvenextelement,
    orchestratestage: orchestratestage,
    validatepipelinebriefcase: validatepipelinebriefcase,
    blockcompilercompilestage: blockcompilercompilestage,
    createblockcompilerconstants: createblockcompilerconstants,
    buildblockproperties: buildblockproperties,
    processelement: processelement,
    processpipelineelement: processpipelineelement,
    registereventstage: registereventstage,
    processnestedstage: processnestedstage,
    createpersistentelementwrapper: createpersistentelementwrapper,
    BLOCKCOMPILERCOMPILESTAGE: BLOCKCOMPILERCOMPILESTAGE,
    COMPILESTAGE: COMPILESTAGE,
    LOADPIPELINE: LOADPIPELINE,
    RESOLVENEXTELEMENT: RESOLVENEXTELEMENT,
    ORCHESTRATESTAGE: ORCHESTRATESTAGE,
    VALIDATEPIPELINEBRIEFCASE: VALIDATEPIPELINEBRIEFCASE,
    BUILD_BLOCK_PROPERTIES: BUILD_BLOCK_PROPERTIES,
    PROCESS_ELEMENT: PROCESS_ELEMENT,
    PROCESS_PIPELINE_ELEMENT: PROCESS_PIPELINE_ELEMENT,
    REGISTER_EVENT_STAGE: REGISTER_EVENT_STAGE,
    PROCESS_NESTED_STAGE: PROCESS_NESTED_STAGE,
    CREATE_PERSISTENT_ELEMENT_WRAPPER: CREATE_PERSISTENT_ELEMENT_WRAPPER
  };
}
