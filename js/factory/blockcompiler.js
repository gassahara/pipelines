var blockCompilerState = Object.freeze({ level: createVerbosityConstants().DEBUG });

var FRONTEND_BASE = (typeof window !== 'undefined') ? window.location.origin + '/' : '';
var WITNESS_TIMEOUT = 5000;

function createBlockCompilerConstants() {
  return Object.freeze({
    BLOCKTYPES: Object.freeze({
      FN: 'fn', API: 'api', FETCH: 'fetch', WRITER: 'writer',
      IO: 'io', DOMQUERY: 'domquery', CRYPTO: 'crypto',
      WAIT: 'wait', EXECUTIONQUERY: 'executionquery'
      // STOREQUERY removed
    }),
    INHERITEDKEYS: Object.freeze(['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents'])
  });
}

function cloneObject(obj) {
  var out = {};
  Object.keys(obj || {}).forEach(function(key) { out[key] = obj[key]; });
  return out;
}

function extendObject(target, source) {
  Object.keys(source || {}).forEach(function(key) { target[key] = source[key]; });
  return target;
}

function stripQuotes(str) {
  return str.split('').reduce(function(out, ch) {
    return ch !== '"' && ch !== "'" ? out + ch : out;
  }, '');
}

function splitPathSegments(pathstr) {
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

function containsPathAccessorChars(str) {
  return str.split('').reduce(function(found, c) {
    return found || c === '.' || c === '[' || c === ']';
  }, false);
}

function containsStyleAccess(source) {
  if (typeof source !== 'string') return false;

  function matchesTyle(j, k) {
    var expected = 'tyle';
    if (k >= expected.length) return j;
    if (j >= source.length || source.charAt(j).toLowerCase() !== expected.charAt(k)) return -1;
    return matchesTyle(j + 1, k + 1);
  }

  function skipWhitespace(j) {
    if (j >= source.length) return j;
    var c = source.charAt(j);
    if (c === ' ' || c === '\t' || c === '\n') return skipWhitespace(j + 1);
    return j;
  }

  function scan(i) {
    if (i >= source.length) return false;
    var ch = source.charAt(i);
    if (ch === 's' || ch === 'S') {
      var after = matchesTyle(i + 1, 0);
      if (after !== -1) {
        var ws = skipWhitespace(after);
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
  var segments = pathstr.split('.').reduce(function(acc, dotPart) {
    return acc.concat(splitPathSegments(dotPart).map(function(seg) { return stripQuotes(seg); }));
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
  }, cloneObject(inherited));
}

function resolveDepsArray(depsArray) {
  // deprecated; kept for compatibility but not used.
  throw new Error('[resolveDepsArray] This function is deprecated; use buildDependenciesRegistry instead.');
}

function resolvePipelinePath(path, dependencies) {
  if (typeof path !== 'string') return path;
  var parts = path.split('.');
  var value = dependencies;
  for (var i = 0; i < parts.length; i++) {
    if (value === undefined || value === null) return undefined;
    value = value[parts[i]];
  }
  return value;
}

function resolveStageFromPath(dnaEnvelope, stagePath) {
  var current = dnaEnvelope.definition;
  for (var i = 0; i < stagePath.length; i++) {
    if (current == null) return undefined;
    current = current[stagePath[i]];
  }
  return current;
}

function buildBlockProperties(merged, inherited, io, env, dependencies) {
  if (inherited === undefined) inherited = {};
  if (io === undefined) io = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'buildBlockProperties for block:', merged.id, 'type:', merged.type);

  var properties = buildproperties(merged, inherited);
  var inputsObj = {};

  (io.inputs || []).forEach(function(name) {
    inputsObj[name] = compilepathaccessor(name)(env);
  });

  properties.inputs = inputsObj;
  properties.outputs = io.outputs || {};

  if (merged && merged.deps) {
    if (Array.isArray(merged.deps)) {
      var depsMap = dependencies || window;
      var resolvedDeps = {};
      var missingDeps = [];
      merged.deps.forEach(function(name) {
        if (typeof depsMap[name] !== 'undefined') {
          resolvedDeps[name] = depsMap[name];
        } else if (typeof window[name] !== 'undefined') {
          resolvedDeps[name] = window[name];
        } else {
          missingDeps.push(name);
        }
      });
      if (missingDeps.length > 0) {
        throw new Error('[buildBlockProperties] Missing dependencies for block "' + merged.id + '": ' + missingDeps.join(', '));
      }
      properties.deps = resolvedDeps;
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

function createBlockAnalyzer(rules) {
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

function buildPayload(mappingobj, data) {
  return Object.keys(mappingobj).reduce(function(result, fieldkey) {
    var mappingdef = mappingobj[fieldkey];
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(data);
    else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
      result[fieldkey] = mappingdef.from !== undefined ? data[mappingdef.from] : buildPayload(mappingdef, data);
    } else result[fieldkey] = mappingdef;
    return result;
  }, {});
}

function buildResponse(mappingobj, raw) {
  return Object.keys(mappingobj).reduce(function(result, fieldkey) {
    var mappingdef = mappingobj[fieldkey];
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(raw);
    else if (typeof mappingdef === 'object' && mappingdef !== null && mappingdef.from !== undefined) result[fieldkey] = raw[mappingdef.from];
    else if (typeof mappingdef === 'object' && mappingdef !== null) result[fieldkey] = buildResponse(mappingdef, raw);
    else result[fieldkey] = raw[mappingdef];
    return result;
  }, {});
}

function createBlockAnalyzers(BLOCKTYPES, dnaConstants) {
  var analyzers = {};
  analyzers[BLOCKTYPES.FN] = function(block) {
    var errors = [];
    if (!block.fn) errors.push('fn block must have a function');
    if (typeof block.fn === 'function') {
      if (block.fn.toString().indexOf('document.') !== -1 || containsStyleAccess(block.fn.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors = errors.concat(validaterevivablefunctionblock(block, BLOCKTYPES, dnaConstants));
    }
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[BLOCKTYPES.API] = createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'api block must have an endpoint' },
    { field: 'method', required: true, message: 'api block must have GET/POST method', custom: function(v) { return v === 'GET' || v === 'POST'; } }
  ]);

  analyzers[BLOCKTYPES.FETCH] = createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'fetch block must have an endpoint' },
    { field: 'method', required: true, message: 'fetch block must have GET/POST method', custom: function(v) { return v === 'GET' || v === 'POST'; } }
  ]);

  analyzers[BLOCKTYPES.WRITER] = function(block) {
    var errors = [];
    if (typeof block.fn !== 'function' && typeof block.ref !== 'function') errors.push('writer block must have fn or ref');
    if (typeof block.fn === 'function' || typeof block.ref === 'function') errors = errors.concat(validaterevivablefunctionblock(block, BLOCKTYPES, dnaConstants));
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[BLOCKTYPES.IO] = createBlockAnalyzer([
    { field: 'ref', required: true, type: 'function', message: 'io block ref must be a function' }
  ]);

  analyzers[BLOCKTYPES.DOMQUERY] = function(block) {
    var valid = Boolean(block.command && block.command.COMMAND);
    return { valid: valid, errors: valid ? [] : ['domquery block requires command.COMMAND'], warnings: [], dependencies: [], outputs: block.outputs ? block.outputs : {}, contracts: [] };
  };

  analyzers[BLOCKTYPES.CRYPTO] = createBlockAnalyzer([
    { field: 'outputs', required: true, message: 'crypto block must have outputs', custom: function(v, b) { return Object.keys(b.outputs ? b.outputs : {}).length > 0; } }
  ]);

  analyzers[BLOCKTYPES.WAIT] = createBlockAnalyzer([
    { field: 'ms', required: true, message: 'wait block must have ms' }
  ]);

  analyzers[BLOCKTYPES.EXECUTIONQUERY] = createBlockAnalyzer([
    { field: 'command', required: true, message: 'executionquery requires command', custom: function(v) { return v && typeof v.COMMAND === 'string'; } }
  ]);

  // STOREQUERY analyzer removed

  return Object.freeze(analyzers);
}

function compileHttpBlock(merged, id, sig, isTextual, options) {
  var blockfn = function(env) {
    var label = (isTextual ? 'fetch' : 'api') + ':' + (merged.endpoint || id);
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing http block:', id, 'type:', isTextual ? 'fetch' : 'api', 'endpoint:', merged.endpoint);
    var inputaccessors = (sig.inputs || []).map(compilepathaccessor);
    var inputdata = {};
    (sig.inputs || []).forEach(function(inp, idx) { inputdata[inp] = inputaccessors[idx](env); });

    var endpoint = merged.endpoint;
    if (typeof merged.endpoint === 'string' && containsPathAccessorChars(merged.endpoint)) {
      endpoint = compilepathaccessor(merged.endpoint)(env);
    }
    if (endpoint === undefined) endpoint = merged.endpoint;

    var payload = buildPayload(merged.mapping && merged.mapping.payload ? merged.mapping.payload : {}, inputdata);
    Object.keys(sig.outputs || {}).forEach(function(field) {
      if (payload[field] === undefined && inputdata[field] !== undefined) payload[field] = inputdata[field];
    });

    var tag = GENERATETAG();
    var responseType = isTextual ? 'fetch_result' : 'api_result';
    var sender = 'APIACTOR';

    SENDINSTRUCTION('APIACTOR', isTextual ? MESSAGETYPES.FETCH : MESSAGETYPES.API, {
      endpoint: endpoint,
      method: merged.method,
      payload: payload,
      token: env.authsessionaccesstoken || ''
    }, tag, 'BLOCKCOMPILER', { responseType: responseType });

    return WAITFORMAILBOX({ tag: tag, sender: sender, type: isTextual ? MESSAGETYPES.FETCH_RESULT : MESSAGETYPES.API_RESULT }, WITNESS_TIMEOUT)
      .then(function(mailboxMessage) {
        var response = mailboxMessage.payload;
        var result = response && response.result ? response.result : response;
        if (result && result.error) throw new Error(result.error);
        var finalResult = result.data !== undefined ? result.data : result;
        if (merged.mapping && merged.mapping.response && result && typeof result === 'object') {
          finalResult = buildResponse(merged.mapping.response, result);
        }
        return finalResult;
      });
  };
  blockfn.id = id;
  return blockfn;
}

function createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options) {
  var compilers = {};

  compilers[BLOCKTYPES.FN] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling FN block:', id);
    var blockfn = function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing FN block:', id);
      var fn = merged.fn;
      if (!fn) throw new Error('fn block must have a function: ' + id);
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env, merged.deps);
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

  compilers[BLOCKTYPES.API] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, false, options); };
  compilers[BLOCKTYPES.FETCH] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, true, options); };

  compilers[BLOCKTYPES.WRITER] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var blockfn = function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
      var fn = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!fn) throw new Error('[WRITER] Block "' + id + '" failed validation');
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env, merged.deps);
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
        }, tag, 'BLOCKCOMPILER', { responseType: 'dom_result' });

        return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, WITNESS_TIMEOUT)
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
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.IO] = function(merged, id, sig) {
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling IO block:', id);
    var blockfn = function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing IO block:', id);
      var io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      return callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', function(e) {
        return Promise.resolve(io(inputdata, e));
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.DOMQUERY] = function(merged, id, sig) {
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling DOMQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var blockfn = function(env) {
      var cmd = merged.command && merged.command.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      var props = merged.command.properties || {};

      // Resolve value and classname path accessors
      var resolvedValue = props.value;
      if (typeof props.value === 'string' && (containsPathAccessorChars(props.value) || (sig.inputs || []).indexOf(props.value) !== -1)) {
        resolvedValue = compilepathaccessor(props.value)(env);
      }
      var resolvedClassname = props.classname;
      if (typeof props.classname === 'string' && (containsPathAccessorChars(props.classname) || (sig.inputs || []).indexOf(props.classname) !== -1)) {
        resolvedClassname = compilepathaccessor(props.classname)(env);
      }

      var tag = GENERATETAG();
      var responseType = 'dom_result';
      var msgType;
      switch (cmd) {
        case 'gethtml': msgType = MESSAGETYPES.GETHTML; break;
        case 'getvalue': msgType = MESSAGETYPES.GETVALUE; break;
        case 'getstyle': msgType = MESSAGETYPES.GETSTYLE; break;
        case 'getposition': msgType = MESSAGETYPES.GETPOSITION; break;
        case 'getlayout': msgType = MESSAGETYPES.GETLAYOUT; break;
        case 'sethtml': msgType = MESSAGETYPES.SETHTML; break;
        case 'setposition': msgType = MESSAGETYPES.SETPOSITION; break;
        case 'setstyle': msgType = MESSAGETYPES.SETSTYLE; break;
        case 'setvalue': msgType = MESSAGETYPES.SETVALUE; break;
        case 'setlayout': msgType = MESSAGETYPES.SETLAYOUT; break;
        case 'toggleclass': msgType = MESSAGETYPES.TOGGLECLASS; break;
        case 'property': msgType = MESSAGETYPES.PROPERTY; break;
        case 'getviewport': msgType = MESSAGETYPES.GETVIEWPORT; break;
        case 'getscreen': msgType = MESSAGETYPES.GETSCREEN; break;
        case 'matchmedia': msgType = MESSAGETYPES.MATCHMEDIA; break;
        default: throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      }
      SENDINSTRUCTION('RENDERACTOR', msgType, {
        id: props.id,
        value: resolvedValue,
        classname: resolvedClassname,
        force: props.force,
        query: props.query,
        arguments: props.arguments,
        name: props.name
      }, tag, 'BLOCKCOMPILER', { responseType: responseType });

      return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, WITNESS_TIMEOUT)
        .then(function(mailboxMessage) {
          var response = mailboxMessage.payload;
          return response && response.result !== undefined ? response.result : response;
        });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.CRYPTO] = function(merged, id, sig) {
    var blockfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      var tag = GENERATETAG();
      SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.CRYPTO, { bytes: bytes }, tag, 'BLOCKCOMPILER', { responseType: 'dom_result' });
      return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.DOM_RESULT }, WITNESS_TIMEOUT)
        .then(function(mailboxMessage) {
          return mailboxMessage.payload && mailboxMessage.payload.result !== undefined ? mailboxMessage.payload.result : mailboxMessage.payload;
        });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.WAIT] = function(merged, id) {
    var blockfn = function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      return new Promise(function(r) { setTimeout(r, ms); }).then(function() { return {}; });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.EXECUTIONQUERY] = function(merged, id, sig) {
    var blockfn = function(env) {
      var command = merged.command || {};
      var COMMAND = command.COMMAND;
      var args = command.args || {};
      var tag = GENERATETAG();
      var responseType = 'task_result';
      var msgType;
      switch (COMMAND) {
        case 'get': msgType = MESSAGETYPES.GET_STATUS; break;
        case 'tasks': msgType = MESSAGETYPES.GET_TASKS; break;
        case 'task_status': msgType = MESSAGETYPES.GET_TASK_STATUS; break;
        case 'await_task': msgType = MESSAGETYPES.AWAIT_TASK; break;
        case 'cancel_task': msgType = MESSAGETYPES.CANCEL_TASK; break;
        case 'stop_task': msgType = MESSAGETYPES.STOP_TASK; break;
        default: throw new Error('[executionquery] unknown command: ' + COMMAND);
      }
      SENDINSTRUCTION('EXECUTIONACTOR', msgType, args, tag, 'BLOCKCOMPILER', { responseType: responseType });
      return WAITFORMAILBOX({ tag: tag, sender: 'EXECUTIONACTOR', type: MESSAGETYPES.TASK_RESULT }, WITNESS_TIMEOUT)
        .then(function(mailboxMessage) {
          var response = mailboxMessage.payload;
          return response && response.result !== undefined ? response.result : response;
        });
    };
    blockfn.id = id;
    return blockfn;
  };

  // STOREQUERY compiler removed

  return Object.freeze(compilers);
}

function compileblock(block, inheritedBriefcase, constants, options) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var compiler = constants.COMPILERS[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.ANALYZERS[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockIo = { inputs: block.inputs || [], outputs: block.outputs || {} };
  return compiler(block, block.id, blockIo, inheritedBriefcase);
}

function resolveNextElement(stage, index) {
  if (!stage || !stage.elements || index >= stage.elements.length) return null;
  return stage.elements[index];
}

function processElement(el, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, dependencies, options) {
  var fn = compileblock(el, inheritedBriefcase, constants, options);
  fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' };
  fn.kind = 'element';
  return createPersistentElementWrapper(fn, el, stagePath, pipelineId, options);
}

function processPipelineElement(el, pipelineId, stagePath, inheritedBriefcase, dependencies, options) {
  var elementId = el.id || 'pipeline_unknown';
  logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'processPipelineElement:', elementId, 'pipeline:', el.pipeline);

  var resolvedPipeline = null;
  if (typeof el.pipeline === 'string') {
    resolvedPipeline = resolvePipelinePath(el.pipeline, dependencies || window);
    if (resolvedPipeline && resolvedPipeline.elements) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'resolved pipeline path:', el.pipeline, 'to inner pipeline with elements');
    } else {
      logerror(blockCompilerState, '[BLOCKCOMPILER]', 'failed to resolve pipeline path:', el.pipeline);
      throw new Error('[processPipelineElement] failed to resolve pipeline path: ' + el.pipeline);
    }
  } else {
    resolvedPipeline = el.pipeline;
  }

  var nestedLibs = (resolvedPipeline && resolvedPipeline.libs) || [];
  var nestedPrograms = (resolvedPipeline && resolvedPipeline.programs) || [];

  function isAlreadyLoaded(entry) {
    if (!entry || !entry.provides || entry.provides.length === 0) return false;
    return entry.provides.every(function(name) { return typeof window[name] !== 'undefined'; });
  }

  var filteredLibs = nestedLibs.filter(function(entry) { return !isAlreadyLoaded(entry); });
  var filteredPrograms = nestedPrograms.filter(function(entry) { return !isAlreadyLoaded(entry); });

  var frameworkBase = (typeof PIPELINES_BASE !== 'undefined') ? PIPELINES_BASE : '';
  var frontendBase = options && options.frontendBase ? options.frontendBase : FRONTEND_BASE;
  var witnessTimeout = options && options.witnessTimeout ? options.witnessTimeout : WITNESS_TIMEOUT;

  var loadingPromise;
  if (filteredLibs.length === 0 && filteredPrograms.length === 0) {
    loadingPromise = Promise.resolve();
  } else {
    loadingPromise = loadFrameworkLibs(filteredLibs, frameworkBase, witnessTimeout)
      .then(function() {
        return loadFrontendPrograms(filteredPrograms, frontendBase, witnessTimeout);
      });
  }

  return loadingPromise.then(function() {
    var nestedDeps = buildDependenciesRegistry(nestedPrograms);
    var mergedDependencies = extendObject(cloneObject(dependencies || {}), nestedDeps);

    var blockfn = function(env) {
      var parentEnv = env;
      var childEnv = cloneObject(parentEnv);
      childEnv.containerid = el.container || null;
      childEnv.pipelineid = el.pipelineIdOverride || (el.pipeline && el.pipeline.id) || (el.pipeline && el.pipeline.identity && el.pipeline.identity.id) || 'pipeline_' + elementId;

      var inputkeys = el.inputs || [];
      inputkeys.forEach(function(key) {
        childEnv[key] = compilepathaccessor(key)(parentEnv);
      });

      var childOptions = el.options || {};
      if (childOptions.autorun === undefined) childOptions.autorun = true;
      if (childOptions.baseEnv === undefined) childOptions.baseEnv = childEnv;
      if (childOptions.updateworldmap === undefined) childOptions.updateworldmap = parentEnv.updateworldmap;
      if (childOptions.verbosity === undefined && options && options.verbosity !== undefined) childOptions.verbosity = options.verbosity;

      var innerDnaEnvelope = {
        pipelineId: childEnv.pipelineid,
        definition: { pipeline: resolvedPipeline },
        dependencies: mergedDependencies || {}
      };

      var bootMessage = {
        dna: innerDnaEnvelope,
        accessors: el.accessors || null,
        sinks: el.sinks || [],
        pipelineId: childEnv.pipelineid,
        options: childOptions
      };

      var tag = GENERATETAG();
      var responseType = 'pipeline_booted';
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.BOOT_PIPELINE, bootMessage, tag, 'BLOCKCOMPILER', { responseType: responseType });

      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.PIPELINE_BOOTED }, WITNESS_TIMEOUT)
        .then(function(mailboxMessage) {
          var response = mailboxMessage.payload;
          var result = response && response.result ? response.result : response;
          writeoutputs({ inputs: [], outputs: el.outputs || {} }, parentEnv, result, elementId);
          return result;
        });
    };
    blockfn.id = elementId;
    blockfn.kind = 'pipeline';
    return blockfn;
  });
}

function registerEventStage(stage, pipelineId, stagePath, options) {
  var sourceid = stage.control.sourceid;
  var event = stage.control.event;
  if (!sourceid || !event) {
    return Promise.reject(new Error('[registerEventStage] EVENT stage missing sourceid/event'));
  }
  var tag = GENERATETAG();
  var payload = {
    pipelineId: pipelineId,
    stageId: stage.id,
    stagePath: stagePath,
    sourceid: sourceid,
    event: event,
    control: stage.control,
    elements: stage.elements,
    briefcase: stage.briefcase || {},
    options: options || {}
  };
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.REGISTER_EVENT_LISTENER, payload, tag, 'BLOCKCOMPILER', { responseType: MESSAGETYPES.EVENT_LISTENER_REGISTERED });
  return WAITFORMAILBOX({ tag: tag, sender: 'RENDERACTOR', type: MESSAGETYPES.EVENT_LISTENER_REGISTERED }, WITNESS_TIMEOUT)
    .then(function(mailboxMessage) {
      var response = mailboxMessage.payload;
      if (response && response.error) {
        throw new Error('[registerEventStage] Registration failed for ' + stage.id + ': ' + response.error);
      }
      if (response && response.result !== undefined) {
        return response.result;
      }
      return true;
    });
}

function processNestedStage(childStage, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, dependencies, options) {
  var childStagePath = stagePath.concat([childStage.id]);
  var childBriefcase = cloneObject(inheritedBriefcase || {});
  if (childStage.briefcase) {
    Object.keys(childStage.briefcase).forEach(function(key) { childBriefcase[key] = childStage.briefcase[key]; });
  }

  if (childStage.control && childStage.control.command === 'EVENT') {
    return registerEventStage(childStage, pipelineId, childStagePath, options)
      .then(function() {
        var noopWrapper = function(env) { return Promise.resolve(env); };
        noopWrapper.isEventRegistration = true;
        return noopWrapper;
      });
  }

  if (childStage.async === true) {
    var asyncWrapper = function(env) {
      return callwithstack(
        EVALSTACK,
        'nested-stage:' + childStage.id,
        'async-await',
        function() {
          orchestrateStage(childStage, pipelineId, dependencies, env, childStagePath, options || {}, null)
            .catch(function(err) {
              logwarn(blockCompilerState, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
            });
          return undefined;
        },
        [env],
        { context: { env: env }, capturecontinuation: true, attachContinuation: false }
      );
    };
    asyncWrapper.asyncStage = true;
    return asyncWrapper;
  } else {
    var syncWrapper = function(env) {
      return callwithstack(
        EVALSTACK,
        'nested-stage:' + childStage.id,
        'async-await',
        function() {
          return orchestrateStage(childStage, pipelineId, dependencies, env, childStagePath, options || {}, null);
        },
        [env],
        { context: { env: env }, capturecontinuation: true, attachContinuation: false }
      );
    };
    syncWrapper.asyncStage = false;
    return syncWrapper;
  }
}

function orchestrateStage(stage, pipelineId, dependencies, env, stagePath, options, nextStageMessage) {
  var constants = createBlockCompilerConstants();
  var BLOCKTYPES = constants.BLOCKTYPES;
  var INHERITEDKEYS = constants.INHERITEDKEYS;
  var dnaConstants = createDnaSerializerConstants();
  var ANALYZERS = createBlockAnalyzers(BLOCKTYPES, dnaConstants);
  var COMPILERS = createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options);
  var compilerConstants = { BLOCKTYPES: BLOCKTYPES, INHERITEDKEYS: INHERITEDKEYS, ANALYZERS: ANALYZERS, COMPILERS: COMPILERS };

  var index = 0;
  var stageToken = { cancelled: false };

  function runNext() {
    if (index >= (stage.elements || []).length) {
      var tag = GENERATETAG();
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.STAGE_COMPLETED, {
        pipelineId: pipelineId,
        stageId: stage.id,
        nextStageMessage: nextStageMessage || null,
        env: env
      }, tag, 'BLOCKCOMPILER', { responseType: 'stage_completed_ack' });
      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.STAGE_COMPLETED_ACK }, WITNESS_TIMEOUT)
        .then(function() { return; });
    }

    var elementDef = resolveNextElement(stage, index);
    if (!elementDef) {
      index++;
      return runNext();
    }

    var elementFn;
    if (elementDef.element === 'BLOCK') {
      elementFn = processElement(elementDef, pipelineId, stagePath.concat([elementDef.id]), {}, compilerConstants, dnaConstants, dependencies, options);
    } else if (elementDef.element === 'PIPELINE') {
      elementFn = processPipelineElement(elementDef, pipelineId, stagePath.concat([elementDef.id]), {}, dependencies, options);
    } else if (elementDef.element === 'STAGE') {
      elementFn = processNestedStage(elementDef, pipelineId, stagePath.concat([elementDef.id]), {}, compilerConstants, dnaConstants, dependencies, options);
    } else {
      throw new Error('[orchestrateStage] unexpected element type: ' + elementDef.element);
    }

    blockCompilerState.activeCancellationToken = stageToken;

    return Promise.resolve(elementFn).then(function(fn) {
      return fn(env);
    }).then(function() {
      index++;
      return runNext();
    }).catch(function(err) {
      stageToken.cancelled = true;
      blockCompilerState.activeCancellationToken = null;
      logerror(blockCompilerState, '[BLOCKCOMPILER]', 'Element failed:', elementDef.id, err);
      throw err;
    }).then(function(result) {
      blockCompilerState.activeCancellationToken = null;
      return result;
    });
  }

  return runNext();
}

function waitForWitness(entry, timeout) {
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    function check() {
      if (!entry.provides || entry.provides.length === 0) return resolve();
      var allDefined = entry.provides.every(function(name) {
        return typeof window[name] !== 'undefined';
      });
      if (allDefined) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('timeout waiting for witness from ' + entry.src));
      setTimeout(check, 10);
    }
    check();
  });
}

function loadScriptWithWitness(entry, basePath, timeout) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = basePath + entry.src;
    s.onload = function() {
      setTimeout(function() {
        if (entry.provides && entry.provides.length > 0) {
          waitForWitness(entry, timeout).then(resolve).catch(reject);
        } else {
          resolve();
        }
      }, 0);
    };
    s.onerror = function() { reject(new Error('failed to load ' + entry.src)); };
    document.head.appendChild(s);
  });
}

function loadScriptsSequentially(entries, basePath, timeout) {
  if (!entries || entries.length === 0) return Promise.resolve();
  var index = 0;
  function loadNext() {
    if (index >= entries.length) return Promise.resolve();
    var entry = entries[index];
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'loading script:', entry.src);
    return loadScriptWithWitness(entry, basePath, timeout).then(function() {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'script loaded:', entry.src);
      index++;
      return loadNext();
    });
  }
  return loadNext();
}

function normalizeEntries(entries) {
  return (entries || []).map(function(entry) {
    if (typeof entry === 'string') return { src: entry, provides: null };
    return entry;
  });
}

function loadFrameworkLibs(libs, basePath, timeout) {
  if (typeof timeout === 'undefined') timeout = WITNESS_TIMEOUT;
  var normalized = normalizeEntries(libs);
  loginfo(blockCompilerState, '[BLOCKCOMPILER]', 'loading framework libs:', normalized.length);
  return loadScriptsSequentially(normalized, basePath, timeout);
}

function loadFrontendPrograms(programs, basePath, timeout) {
  if (typeof timeout === 'undefined') timeout = WITNESS_TIMEOUT;
  var normalized = normalizeEntries(programs);
  loginfo(blockCompilerState, '[BLOCKCOMPILER]', 'loading frontend programs:', normalized.length);
  return loadScriptsSequentially(normalized, basePath, timeout);
}

function buildDependenciesRegistry(entries) {
  var registry = {};
  var missing = [];
  (entries || []).forEach(function(entry) {
    (entry.provides || []).forEach(function(name) {
      if (typeof window[name] !== 'undefined') {
        registry[name] = window[name];
      } else {
        missing.push(name);
      }
    });
  });
  if (missing.length > 0) {
    throw new Error('[buildDependenciesRegistry] Missing global(s): ' + missing.join(', '));
  }
  logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'dependencies registry keys:', Object.keys(registry));
  return registry;
}

function findNextNonEventStage(pipeline, startIndex) {
  if (!pipeline || !pipeline.elements) return null;
  for (var i = startIndex; i < pipeline.elements.length; i++) {
    var s = pipeline.elements[i];
    if (s && (!s.control || s.control.command !== 'EVENT')) {
      return { stage: s, index: i };
    }
  }
  return null;
}

function blockcompilerCompileStage(dnaEnvelope, stagePath, env, options) {
  logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'blockcompilerCompileStage:', dnaEnvelope.pipelineId, 'stagePath', JSON.stringify(stagePath));
  if (!dnaEnvelope || !dnaEnvelope.definition || !dnaEnvelope.definition.pipeline) {
    throw new Error('[blockcompilerCompileStage] invalid DNA envelope');
  }
  options = options || {};
  options.pipelineId = dnaEnvelope.pipelineId;
  options.dependencies = dnaEnvelope.dependencies || {};

  var pipeline = dnaEnvelope.definition.pipeline;
  var stage = resolveStageFromPath(dnaEnvelope, stagePath);
  if (!stage || stage.element !== 'STAGE') {
    throw new Error('[blockcompilerCompileStage] stage not found at path: ' + JSON.stringify(stagePath));
  }

  var stageIndex = stagePath[stagePath.length - 1];
  var isEventStage = stage.control && stage.control.command === 'EVENT';
  var isEventTrigger = options.isEventTrigger === true;

  if (isEventStage && !isEventTrigger) {
    // P46: Boot-time EVENT stage: register only, then skip to next non-EVENT stage
    return registerEventStage(stage, dnaEnvelope.pipelineId, stagePath, options)
      .then(function() {
        var next = findNextNonEventStage(pipeline, stageIndex + 1);
        var nextStageMessage = null;
        if (next) {
          nextStageMessage = {
            type: 'compile_stage',
            pipeline: pipeline,
            pipelineId: dnaEnvelope.pipelineId,
            stageIndex: next.index,
            stagePath: ['pipeline', 'elements', next.index],
            briefcase: {},
            env: env || {},
            options: options
          };
        }

        var tag = GENERATETAG();
        SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.STAGE_COMPLETED, {
          pipelineId: dnaEnvelope.pipelineId,
          stageId: stage.id,
          nextStageMessage: nextStageMessage,
          env: env || {}
        }, tag, 'BLOCKCOMPILER', { responseType: 'stage_completed_ack' });

        return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.STAGE_COMPLETED_ACK }, WITNESS_TIMEOUT)
          .then(function() { return; });
      });
  }

  // Non-EVENT or already-registered EVENT: orchestrate normally
  var next = findNextNonEventStage(pipeline, stageIndex + 1);
  var nextStageMessage = null;
  if (!isEventTrigger && next) {
    nextStageMessage = {
      type: 'compile_stage',
      pipeline: pipeline,
      pipelineId: dnaEnvelope.pipelineId,
      stageIndex: next.index,
      stagePath: ['pipeline', 'elements', next.index],
      briefcase: {},
      env: null,
      options: options
    };
  }

  return orchestrateStage(stage, dnaEnvelope.pipelineId, dnaEnvelope.dependencies || {}, env || {}, stagePath, options, nextStageMessage);
}

function loadPipeline(pipelineDefinition, pipelineId, options) {
  if (options === undefined) options = {};
  var id = pipelineId || pipelineDefinition.id || (pipelineDefinition.identity && pipelineDefinition.identity.id) || 'default_pipeline';
  loginfo(blockCompilerState, '[BLOCKCOMPILER]', 'loadPipeline start for pipeline:', id);

  var libs = pipelineDefinition.libs || [];
  var programs = pipelineDefinition.programs || [];
  var frameworkBase = (typeof PIPELINES_BASE !== 'undefined') ? PIPELINES_BASE : '';
  var frontendBase = options.frontendBase || FRONTEND_BASE;
  var witnessTimeout = options.witnessTimeout || WITNESS_TIMEOUT;

  return loadFrameworkLibs(libs, frameworkBase, witnessTimeout)
    .then(function() {
      return loadFrontendPrograms(programs, frontendBase, witnessTimeout);
    })
    .then(function() {
      loginfo(blockCompilerState, '[BLOCKCOMPILER]', 'all dependencies loaded for pipeline:', id);

      var dnaEnvelope = {
        pipelineId: id,
        definition: pipelineDefinition,
        dependencies: buildDependenciesRegistry(programs),
        loadedAt: Date.now()
      };

      var tag = GENERATETAG();
      SENDINSTRUCTION('HYPERVISORACTOR', MESSAGETYPES.BOOT_PIPELINE, {
        pipelineId: id,
        dna: dnaEnvelope,
        stagePath: ['pipeline', 'elements', 0],
        accessors: options.accessors || null,
        sinks: options.sinks || [],
        options: {
          autorun: options.autorun !== false,
          baseEnv: options.baseEnv || {},
          updateworldmap: options.updateworldmap || null,
          verbosity: options.verbosity
        }
      }, tag, 'BLOCKCOMPILER', {
        responseType: 'pipeline_booted'
      });

      return WAITFORMAILBOX({ tag: tag, sender: 'HYPERVISORACTOR', type: MESSAGETYPES.PIPELINE_BOOTED }, witnessTimeout)
        .then(function(mailboxMessage) {
          var response = mailboxMessage.payload;
          if (response && response.error) throw new Error(response.error);
          return response && response.result ? response.result : response;
        });
    });
}

function compileStage(stageDef, briefcase, pipelineId, stagePath, fullPipeline, options) {
  return null;
}

function validatePipelineBriefcase(briefcase) {
  var errors = [];
  if (briefcase === undefined || briefcase === null) {
    return { valid: true, errors: [] };
  }
  if (typeof briefcase !== 'object') {
    errors.push('[validatePipelineBriefcase] briefcase must be an object');
    return { valid: false, errors: errors };
  }
  try {
    var dnaConstants = createDnaSerializerConstants();
    var revivabilityErrors = validaterevivableobject(briefcase, 'briefcase', dnaConstants);
    errors = errors.concat(revivabilityErrors);
  } catch (err) {
    errors.push('[validatePipelineBriefcase] validation error: ' + err.message);
  }
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function createPersistentElementWrapper(compiledElement, elementDef, stagePath, pipelineId, options) {
  var elementId = elementDef.id || compiledElement.id || 'element_unknown';
  function wrapper(env) {
    var path = stagePath.concat([elementId]);
    var execEnv = env;
    var executor = function(executionContext) {
      var effectiveEnv = executionContext.env || execEnv;
      return compiledElement(effectiveEnv);
    };
    var blockInputs = elementDef && elementDef.inputs ? elementDef.inputs : [];
    var blockOutputs = elementDef && elementDef.outputs ? elementDef.outputs : {};
    var inputargs = blockInputs.map(function(inp) { return compilepathaccessor(inp)(execEnv); });
    var closureSerialized = null;
    if (typeof compiledElement === 'function') closureSerialized = serializeSelfContainedClosure(compiledElement, inputargs, execEnv);
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'submitting element:', elementId, 'pipeline:', pipelineId, 'stagePath:', JSON.stringify(stagePath));
    var tag = GENERATETAG();
    var descriptor = {
      pipelineid: pipelineId,
      path: path,
      elementid: elementId,
      env: execEnv,
      signature: { inputs: blockInputs, outputs: blockOutputs },
      executor: executor,
      properties: elementDef || {},
      serialized: closureSerialized,
      origin: compiledElement.origin || null,
      programRef: null,
      elementId: elementId
    };

    SENDINSTRUCTION('EXECUTIONACTOR', MESSAGETYPES.EXECUTE_ELEMENT, descriptor, tag, 'BLOCKCOMPILER', { responseType: 'task_result' });

    return WAITFORMAILBOX({ tag: tag, sender: 'EXECUTIONACTOR', type: MESSAGETYPES.TASK_RESULT }, WITNESS_TIMEOUT)
      .then(function(mailboxMessage) {
        var payload = mailboxMessage.payload;
        var outerResult = payload && payload.result !== undefined ? payload.result : payload;
        var result = outerResult && outerResult.result !== undefined ? outerResult.result : outerResult;
        writeoutputs({ inputs: blockInputs, outputs: blockOutputs }, execEnv, result, elementId);
        logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'element completed:', elementId, 'pipeline:', pipelineId);
        return result;
      });
  }
  wrapper.id = elementId;
  wrapper.kind = 'element';
  if (compiledElement.blockmeta) wrapper.blockmeta = compiledElement.blockmeta;
  return wrapper;
}
