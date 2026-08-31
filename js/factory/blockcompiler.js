// ============================================================
// UPDATED FILE: js/factory/blockcompiler.js
// Change applied: ES5 + CPS rewrite (async/await → promise chains),
// imports → require, module.exports. CRYPTO block now uses
// enqueueRenderCrypto(bytes) — mail-based wrapper (sendInstruction +
// awaitResponse, NO resolve/reject in messages) defined in
// renderactor. Computed property names → manual objects. Unused
// imports purged (DOMQUERYGETTERS/DOMQUERYMESSAGES/RENDERACTOR/
// MESSAGETYPES + 6 unused enqueue* wrappers). DOMQUERYSETTERS
// sourced from domqueryconstants (leaf), not renderactor.
// ============================================================


var blockCompilerState = Object.freeze({ level: createVerbosityConstants().DEBUG });

function createBlockCompilerConstants() {
  return Object.freeze({
    BLOCKTYPES: Object.freeze({
      FN: 'fn', API: 'api', FETCH: 'fetch', WRITER: 'writer',
      IO: 'io', DOMQUERY: 'domquery', CRYPTO: 'crypto',
      WAIT: 'wait', EXECUTIONQUERY: 'executionquery', STOREQUERY: 'storequery'
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

function buildBlockProperties(merged, inherited, io, env) {
  if (inherited === undefined) inherited = {};
  if (io === undefined) io = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  var properties = buildproperties(merged, inherited);
  var inputsObj = {};

  (io.inputs || []).forEach(function(name) {
    inputsObj[name] = compilepathaccessor(name)(env);
  });

  properties.inputs = inputsObj;
  properties.outputs = io.outputs || {};

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

  analyzers[BLOCKTYPES.STOREQUERY] = createBlockAnalyzer([
    { field: 'command', required: true, message: 'storequery requires command', custom: function(v) { return v && typeof v.COMMAND === 'string'; } }
  ]);

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

    return callwithstack(
      EVALSTACK, label, 'async-await',
      function() {
        if (isTextual) {
          return enqueuefetch(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' }).then(function(apiresolve) {
            return { status: apiresolve.status, data: apiresolve.data };
          });
        }
        return enqueueapi(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' }).then(function(apiresolve) {
          return { status: apiresolve.status, data: apiresolve.data };
        });
      },
      [], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, label) }
    ).then(function(rawresult) {
      var result = rawresult.data;
      if (merged.mapping && merged.mapping.response) {
        if (rawresult && typeof rawresult === 'object' && !Array.isArray(rawresult)) {
          result = buildResponse(merged.mapping.response, rawresult);
        } else {
          result = rawresult.data || rawresult;
        }
      }
      // P5: use writeoutputs for consistent output handling
      writeoutputs(sig, env, result, id);
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'http block completed:', id, 'status:', rawresult && rawresult.status);
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
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var fnargs = [properties].concat(inputargs);
      return callwithstack(EVALSTACK, 'fn:' + (merged.ref || id), 'async-await', function() {
        return Promise.resolve(fn.apply(null, fnargs)).then(function(result) { return result || {}; });
      }, [env], { context: { env: env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') }).then(function(result) {
        writeoutputs(sig, env, result, id);
        logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'completed FN block:', id);
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
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      return Promise.resolve(fn(properties, inputargs)).then(function(result) {
        if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) throw new Error('[WRITER] Block "' + id + '" returned invalid result');
        var target = merged.targetlabel || env.approot;
        if (!target) throw new Error('[WRITER] missing targetlabel/approot');
        return enqueuehtml(target, result.html, !merged.replace).then(function() {
          if (result.id && Object.keys(sig.outputs || {}).length > 0) {
            return expectelement(result.id, result.timeout || 5000).then(function(domref) {
              env[Object.keys(sig.outputs)[0]] = result;
              env[result.id] = domref;
            });
          }
        }).then(function() {
          logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'completed WRITER block:', id, 'target:', target);
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
      if (cmd === 'getviewport') return enqueuegetviewport().then(function(r) { return writeoutputs(sig, env, r, id); });
      if (cmd === 'getscreen') return enqueuegetscreen().then(function(r) { return writeoutputs(sig, env, r, id); });
      if (cmd === 'matchmedia') return enqueuematchmedia(props.query).then(function(r) { return writeoutputs(sig, env, r, id); });
      var handlerMap = {
        gethtml: enqueuegethtml, getvalue: enqueuegetvalue, getstyle: enqueuegetstyle,
        getposition: enqueuegetposition, getlayout: enqueuegetlayout, sethtml: enqueuesethtml,
        setposition: enqueuesetposition, setstyle: enqueuesetstyle, setvalue: enqueuesetvalue,
        setlayout: enqueuetlayout, toggleclass: enqueuetoggleclass, property: enqueueproperty
      };
      var handler = handlerMap[cmd];
      if (!handler) throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      return callwithstack(EVALSTACK, 'domquery:' + cmd, 'async-await', function() {
        if (DOMQUERYSETTERS.indexOf(cmd) !== -1) {
          if (cmd === 'toggleclass') return handler(props.id, props.classname != null ? props.classname : props.value, props.force !== undefined ? props.force : false);
          var val = sig.inputs && sig.inputs.length > 0 ? compilepathaccessor(props.value)(env) : props.value;
          return handler(props.id, val);
        }
        return handler(props.id);
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + cmd) }).then(function(result) {
        writeoutputs(sig, env, result, id);
      });
    };
    blockfn.id = id;
    return blockfn;
  };

  // P4: validate bytes; crypto via mail-based enqueueRenderCrypto (no resolve/reject in messages)
  compilers[BLOCKTYPES.CRYPTO] = function(merged, id, sig) {
    var blockfn = function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var bytes = merged.bytes === undefined ? 512 : merged.bytes;
      if (typeof bytes !== 'number' || bytes <= 0) throw new Error('[crypto] bytes must be a positive number');
      return enqueueRenderCrypto(bytes).then(function(result) {
        var out = {};
        out[outputkey] = result;
        writeoutputs(sig, env, out, id);
        return {};
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
      switch (COMMAND) {
        case 'get':
          return enqueueExecutionGetStatus(args.pipelineid || env.pipelineid || null).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'tasks':
          return enqueueExecutionGetTasks(args).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'task_status':
          return enqueueExecutionGetTaskStatus(args.taskid).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'await_task':
          return enqueueExecutionAwaitTask(args.taskid).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'cancel_task':
          return enqueueExecutionCancelTask(args.taskid).then(function() { return; });
        case 'stop_task':
          return enqueueExecutionStopTask(args.taskid).then(function() { return; });
        default:
          throw new Error('[executionquery] unknown command: ' + COMMAND);
      }
    };
    blockfn.id = id;
    return blockfn;
  };

  // P6: STOREQUERY block implemented
  compilers[BLOCKTYPES.STOREQUERY] = function(merged, id, sig) {
    var blockfn = function(env) {
      var command = merged.command || {};
      var COMMAND = command.COMMAND;
      var args = command.args || {};
      switch (COMMAND) {
        case 'store':
          if (!args.key) throw new Error('[storequery] store requires key');
          return enqueueDbStore(args.key, args.value !== undefined ? args.value : compilepathaccessor(args.value)(env)).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'restore':
          if (!args.key) throw new Error('[storequery] restore requires key');
          return enqueueDbRestore(args.key).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'list':
          return enqueueDbList().then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        case 'delete':
          if (!args.key) throw new Error('[storequery] delete requires key');
          return enqueueDbDelete(args.key).then(function(result) {
            writeoutputs(sig, env, { result: result }, id);
          });
        default:
          throw new Error('[storequery] unknown command: ' + COMMAND);
      }
    };
    blockfn.id = id;
    return blockfn;
  };

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

function processNode(node, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options) {
  if (node.element === 'BLOCK') return processElement(node, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options);
  if (node.element === 'PIPELINE') return processPipelineElement(node, pipelineId, stagePath, inheritedBriefcase, options);
  if (node.element === 'STAGE') return processNestedStage(node, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options);
  throw new Error('unexpected nested element type: ' + node.element);
}

function processElement(el, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options) {
  var fn = compileblock(el, inheritedBriefcase, constants, options);
  fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' };
  fn.kind = 'element';
  return createPersistentElementWrapper(fn, el, stagePath, pipelineId, options);
}

// P1: processPipelineElement now returns a promise that resolves after boot completes
function processPipelineElement(el, pipelineId, stagePath, inheritedBriefcase, options) {
  var elementId = el.id || 'pipeline_unknown';
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

    var bootMessage = {
      pipeline: el.pipeline,
      accessors: el.accessors || null,
      sinks: el.sinks || [],
      pipelineId: childEnv.pipelineid,
      options: childOptions
    };

    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'PIPELINE boot request:', childEnv.pipelineid);

    var bootPromise = enqueueHypervisorBootPipeline(bootMessage);
    var outputkey = Object.keys(el.outputs || {})[0] || null;
    if (outputkey) {
      return bootPromise.then(function(bootResult) {
        env[outputkey] = bootResult;
        return bootResult;
      }).catch(function(err) {
        env[outputkey] = { status: 'failed', error: err && err.message ? err.message : String(err) };
        throw err;
      });
    }
    return bootPromise;
  };
  blockfn.id = elementId;
  blockfn.kind = 'pipeline';
  return blockfn;
}

// P21: process nested stage element
function processNestedStage(childStage, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options) {
  var childStagePath = stagePath.concat([childStage.id]);
  var childBriefcase = cloneObject(inheritedBriefcase || {});
  if (childStage.briefcase) {
    Object.keys(childStage.briefcase).forEach(function(key) { childBriefcase[key] = childStage.briefcase[key]; });
  }

  // If trigger stage, register separately and return no-op wrapper
  if (childStage.control && childStage.control.command === 'TRIGGER') {
    var sourceid = childStage.control.sourceid;
    var event = childStage.control.event;
    if (!sourceid || !event) throw new Error('[processNestedStage] trigger stage missing sourceid/event');
    var descriptor = {
      pipelineId: pipelineId,
      stageId: childStage.id,
      stagePath: childStagePath,
      control: childStage.control,
      elements: childStage.elements,
      briefcase: childBriefcase,
      options: options || {}
    };
    // Register with hypervisor (descriptor) and renderactor (trigger listener)
    enqueueHypervisorSetStageDescriptor(pipelineId, childStage.id, descriptor).catch(function(err) {
      logwarn(blockCompilerState, '[BLOCKCOMPILER]', 'failed to set nested stage descriptor:', err);
    });
    enqueueRenderRegisterTriggerExpectation({
      pipelineId: pipelineId,
      stageId: childStage.id,
      stagePath: childStagePath,
      sourceid: sourceid,
      event: event,
      control: childStage.control,
      children: childStage.elements,
      output: null,
      env: null
    }).catch(function(err) {
      logwarn(blockCompilerState, '[BLOCKCOMPILER]', 'failed to register nested trigger:', err);
    });
    var noopWrapper = function(env) { return Promise.resolve(env); };
    noopWrapper.isTriggerRegistration = true;
    return noopWrapper;
  }

  // For normal and async stages, recursively compile child stage
  var childResult = compileStageRequestToElements(
    { elements: [childStage] },
    0,
    childStagePath,
    childBriefcase,
    {},
    options || {}
  );

  var childElementFunctions = childResult.elementFunctions;
  var childNextStageMessage = childResult.nextStageMessage;
  var childStageDef = childResult.stage;

  if (childStage.async === true) {
    var asyncWrapper = function(env) {
      // fire and forget
      orchestrateStage(childStageDef, childElementFunctions, pipelineId, env, childStagePath, options || {}, childNextStageMessage)
        .catch(function(err) {
          logwarn(blockCompilerState, '[BLOCKCOMPILER]', 'async nested stage failed:', err);
        });
      return undefined;
    };
    asyncWrapper.asyncStage = true;
    return asyncWrapper;
  } else {
    var syncWrapper = function(env) {
      return orchestrateStage(childStageDef, childElementFunctions, pipelineId, env, childStagePath, options || {}, childNextStageMessage);
    };
    syncWrapper.asyncStage = false;
    return syncWrapper;
  }
}

function compileStageRequestToElements(pipeline, stageIndex, stagePath, briefcase, env, options) {
  if (options === undefined) options = {};
  var constants = createBlockCompilerConstants();
  var BLOCKTYPES = constants.BLOCKTYPES;
  var INHERITEDKEYS = constants.INHERITEDKEYS;
  var dnaConstants = createDnaSerializerConstants();
  var ANALYZERS = createBlockAnalyzers(BLOCKTYPES, dnaConstants);
  var COMPILERS = createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options);
  var compilerConstants = { BLOCKTYPES: BLOCKTYPES, INHERITEDKEYS: INHERITEDKEYS, ANALYZERS: ANALYZERS, COMPILERS: COMPILERS };

  var stage = pipeline.elements[stageIndex];
  if (!stage || stage.element !== 'STAGE') throw new Error('[compileStageRequestToElements] invalid stage at index ' + stageIndex);

  var stageBriefcase = cloneObject(briefcase || {});
  Object.keys(stage.briefcase || {}).forEach(function(key) { stageBriefcase[key] = stage.briefcase[key]; });

  var elementFunctions = [];
  (stage.elements || []).forEach(function(child) {
    if (child.element === 'BLOCK') {
      elementFunctions.push(processElement(child, pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline', stagePath.concat([stage.id]), stageBriefcase, compilerConstants, dnaConstants, options));
    } else if (child.element === 'PIPELINE') {
      elementFunctions.push(processPipelineElement(child, pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline', stagePath.concat([stage.id]), stageBriefcase, options));
    } else if (child.element === 'STAGE') {
      elementFunctions.push(processNestedStage(child, pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline', stagePath.concat([stage.id]), stageBriefcase, compilerConstants, dnaConstants, options));
    }
  });

  var nextStageMessage = null;
  if (stageIndex + 1 < pipeline.elements.length) {
    nextStageMessage = {
      type: 'compile_stage',
      pipeline: pipeline,
      pipelineId: pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline',
      stageIndex: stageIndex + 1,
      stagePath: stagePath,
      briefcase: stageBriefcase,
      env: null,
      options: options
    };
  }

  return { elementFunctions: elementFunctions, nextStageMessage: nextStageMessage, stage: stage };
}

function orchestrateStage(stage, elementFunctions, pipelineId, env, stagePath, options, nextStageMessage) {
  function runElement(index, currentEnv) {
    if (index >= elementFunctions.length) {
      return Promise.resolve(currentEnv);
    }
    var elementFn = elementFunctions[index];
    if (elementFn.asyncStage === true) {
      elementFn(currentEnv);
      return runElement(index + 1, currentEnv);
    } else {
      return elementFn(currentEnv).then(function(result) {
        return runElement(index + 1, currentEnv);
      });
    }
  }

  return runElement(0, env).then(function(finalEnv) {
    return enqueueHypervisorStageCompleted(pipelineId, stage.id, nextStageMessage || null, finalEnv).then(function() {
      return finalEnv;
    });
  });
}

function loadPipeline(pipelineDefinition, pipelineId, options) {
  if (options === undefined) options = {};
  var id = pipelineId || pipelineDefinition.id || (pipelineDefinition.identity && pipelineDefinition.identity.id) || 'default_pipeline';
  loginfo(blockCompilerState, '[BLOCKCOMPILER]', 'loadPipeline request for pipeline:', id);
  var firstStage = {
    stageIndex: 0,
    stagePath: [],
    briefcase: pipelineDefinition.briefcase || {}
  };
  return enqueueHypervisorBootPipeline({
    pipeline: pipelineDefinition,
    accessors: options.accessors || null,
    sinks: options.sinks || [],
    pipelineId: id,
    options: {
      autorun: options.autorun !== false,
      baseEnv: options.baseEnv || {},
      updateworldmap: options.updateworldmap || null,
      verbosity: options.verbosity
    },
    firstStage: firstStage
  });
}

function compileStage(stageDef, briefcase, pipelineId, stagePath, fullPipeline, options) {
  var stageIndex = fullPipeline.elements.indexOf(stageDef);
  return compileStageRequestToElements(fullPipeline, stageIndex, stagePath, briefcase, {}, options);
}

// P2: validatePipelineBriefcase implementation
function validatePipelineBriefcase(briefcase) {
  var errors = [];
  if (briefcase === undefined || briefcase === null) {
    return { valid: true, errors: [] };
  }
  if (typeof briefcase !== 'object') {
    errors.push('[validatePipelineBriefcase] briefcase must be an object');
    return { valid: false, errors: errors };
  }
  // Use revivability validator for functions and nested objects
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
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'submitting element:', elementId);
    return enqueueExecutionSubmit({
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
    }).then(function(submitted) {
      return enqueueExecutionAwaitTask(submitted.taskid);
    });
  }
  wrapper.id = elementId;
  wrapper.kind = 'element';
  if (compiledElement.blockmeta) wrapper.blockmeta = compiledElement.blockmeta;
  return wrapper;
}
