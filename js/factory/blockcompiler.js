// ============================================================
// UPDATED FILE: js/factory/blockcompiler.js
// Changes applied:
//   P‑REFACTOR: no stage executor; Element orchestration only.
//   loadPipeline sends BOOT_PIPELINE with preprocessed firstStage.
//   compileStage returns elementFunctions + nextStageMessage.
//   orchestrateStage recursively processes elements.
// ============================================================

import { enqueueapi, enqueuefetch } from '../actors/apiactor.js';
import { callwithstack } from './callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import {
  createDnaSerializerConstants,
  validaterevivablefunctionblock,
  validaterevivableobject,
  serializeSelfContainedClosure
} from './dnaserializer.js';
import {
  createVerbosityConstants,
  logdebug,
  loginfo,
  logwarn,
  logerror
} from '../verbosity.js';
import {
  enqueuehtml, expectelement, enqueuegethtml, enqueuegetvalue,
  enqueuegetstyle, enqueuegetposition, enqueuesethtml, enqueuesetposition,
  enqueuesetstyle, enqueuesetvalue, enqueueproperty, enqueuegetlayout,
  enqueusetlayout, enqueuetoggleclass, DOMQUERYGETTERS, DOMQUERYSETTERS,
  DOMQUERYMESSAGES, RENDERACTOR, MESSAGETYPES, enqueuegetviewport,
  enqueuegetscreen, enqueuematchmedia, enqueueRenderRegisterTriggerExpectation,
  enqueueRenderRevalidateTriggers, enqueueRenderRestoreBodyHtml
} from '../actors/renderactor.js';
import {
  enqueueExecutionPipelineLoaded,
  enqueueExecutionSubmit, enqueueExecutionAwaitTask,
  enqueueExecutionGetStatus, enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus, enqueueExecutionCancelTask, enqueueExecutionStopTask,
  enqueueExecutionEnvUpdated,
  enqueueExecutionRegisterPipeline
} from '../actors/executionactor.js';
import {
  enqueueHypervisorRegisterPipeline,
  enqueueHypervisorUnregisterPipeline,
  enqueueHypervisorGetEnv,
  enqueueHypervisorBootPipeline,
  enqueueHypervisorSetStageDescriptor,
  enqueueHypervisorStageCompleted
} from '../actors/hypervisoractor.js';

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
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    if (ch !== '"' && ch !== "'") out += ch;
  }
  return out;
}

function splitPathSegments(pathstr) {
  var parts = [];
  var current = '';
  var i = 0;
  while (i < pathstr.length) {
    var ch = pathstr.charAt(i);
    if (ch === '[' || ch === ']' || ch === '.') {
      if (current) parts.push(current);
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  if (current) parts.push(current);
  return parts;
}

function containsPathAccessorChars(str) {
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    if (c === '.' || c === '[' || c === ']') return true;
  }
  return false;
}

function containsStyleAccess(source) {
  if (typeof source !== 'string') return false;
  var i = 0;
  while (i < source.length) {
    var ch = source.charAt(i);
    if (ch === 's' || ch === 'S') {
      var j = i + 1;
      var expected = 'tyle';
      var k = 0;
      while (k < expected.length && j < source.length && source.charAt(j).toLowerCase() === expected.charAt(k)) {
        j++;
        k++;
      }
      if (k === expected.length) {
        while (j < source.length && (source.charAt(j) === ' ' || source.charAt(j) === '\t' || source.charAt(j) === '\n')) j++;
        if (source.charAt(j) === '.') return true;
      }
    }
    i++;
  }
  return false;
}

function compilepathaccessor(pathstr) {
  if (typeof pathstr !== 'string') {
    return function() { return pathstr; };
  }
  var segments = [];
  var dotParts = pathstr.split('.');
  for (var di = 0; di < dotParts.length; di++) {
    var sub = splitPathSegments(dotParts[di]);
    for (var si = 0; si < sub.length; si++) {
      segments.push(stripQuotes(sub[si]));
    }
  }
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
  var blockfn = async function(env) {
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

    var rawresult = await callwithstack(
      EVALSTACK, label, 'async-await',
      async function() {
        var apiresolve;
        if (isTextual) {
          apiresolve = await enqueuefetch(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' });
        } else {
          apiresolve = await enqueueapi(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' });
        }
        return { status: apiresolve.status, data: apiresolve.data };
      },
      [], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, label) }
    );

    var result = rawresult.data;
    if (merged.mapping && merged.mapping.response) {
      if (rawresult && typeof rawresult === 'object' && !Array.isArray(rawresult)) {
        result = buildResponse(merged.mapping.response, rawresult);
      } else {
        result = rawresult.data || rawresult;
      }
    }
    var outputkeys = Object.keys(sig.outputs || {});
    if (outputkeys.length === 1) env[outputkeys[0]] = result;
    else if (typeof result === 'object' && result) {
      outputkeys.forEach(function(key) { if (result[key] !== undefined) env[key] = result[key]; });
    }
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'http block completed:', id, 'status:', rawresult && rawresult.status);
  };
  blockfn.id = id;
  return blockfn;
}

function createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options) {
  var compilers = {};
  compilers[BLOCKTYPES.FN] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling FN block:', id);
    var blockfn = async function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing FN block:', id);
      var fn = merged.fn;
      if (!fn) throw new Error('fn block must have a function: ' + id);
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var fnargs = [properties].concat(inputargs);
      var result = await callwithstack(EVALSTACK, 'fn:' + (merged.ref || id), 'async-await', async function() { return (await fn.apply(null, fnargs)) || {}; }, [env], { context: { env: env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') });
      writeoutputs(sig, env, result, id);
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'completed FN block:', id);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.API] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, false, options); };
  compilers[BLOCKTYPES.FETCH] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, true, options); };

  compilers[BLOCKTYPES.WRITER] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling WRITER block:', id);
    var blockfn = async function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing WRITER block:', id);
      var fn = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!fn) throw new Error('[WRITER] Block "' + id + '" failed validation');
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var result = await fn(properties, inputargs);
      if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) throw new Error('[WRITER] Block "' + id + '" returned invalid result');
      var target = merged.targetlabel || env.approot;
      if (!target) throw new Error('[WRITER] missing targetlabel/approot');
      await enqueuehtml(target, result.html, !merged.replace);
      if (result.id && Object.keys(sig.outputs || {}).length > 0) {
        var domref = await expectelement(result.id, result.timeout || 5000);
        env[Object.keys(sig.outputs)[0]] = result;
        env[result.id] = domref;
      }
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'completed WRITER block:', id, 'target:', target);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.IO] = function(merged, id, sig) {
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling IO block:', id);
    var blockfn = async function(env) {
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'executing IO block:', id);
      var io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      var res = await callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', async function(e) { return await io(inputdata, e); }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
      logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'completed IO block:', id);
      return res;
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.DOMQUERY] = function(merged, id, sig) {
    logdebug(blockCompilerState, '[BLOCKCOMPILER]', 'compiling DOMQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var blockfn = async function(env) {
      var cmd = merged.command && merged.command.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      var props = merged.command.properties || {};
      if (cmd === 'getviewport') return writeoutputs(sig, env, await enqueuegetviewport(), id);
      if (cmd === 'getscreen') return writeoutputs(sig, env, await enqueuegetscreen(), id);
      if (cmd === 'matchmedia') return writeoutputs(sig, env, await enqueuematchmedia(props.query), id);
      var handlerMap = {
        gethtml: enqueuegethtml, getvalue: enqueuegetvalue, getstyle: enqueuegetstyle,
        getposition: enqueuegetposition, getlayout: enqueuegetlayout, sethtml: enqueuesethtml,
        setposition: enqueuesetposition, setstyle: enqueuesetstyle, setvalue: enqueuesetvalue,
        setlayout: enqueusetlayout, toggleclass: enqueuetoggleclass, property: enqueueproperty
      };
      var handler = handlerMap[cmd];
      if (!handler) throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);
      var result = await callwithstack(EVALSTACK, 'domquery:' + cmd, 'async-await', async function() {
        if (DOMQUERYSETTERS.indexOf(cmd) !== -1) {
          if (cmd === 'toggleclass') return await handler(props.id, props.classname != null ? props.classname : props.value, props.force !== undefined ? props.force : false);
          var val = sig.inputs && sig.inputs.length > 0 ? compilepathaccessor(props.value)(env) : props.value;
          return await handler(props.id, val);
        }
        return await handler(props.id);
      }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + cmd) });
      writeoutputs(sig, env, result, id);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.CRYPTO] = function(merged, id, sig) {
    var blockfn = async function(env) {
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var result = await new Promise(function(resolve, reject) { RENDERACTOR.send({ type: MESSAGETYPES.CRYPTO, bytes: merged.bytes || 512, resolve: resolve, reject: reject }); });
      env[outputkey] = result;
      return {};
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.WAIT] = function(merged, id) {
    var blockfn = async function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      await new Promise(function(r) { setTimeout(r, ms); });
      return {};
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.EXECUTIONQUERY] = function(merged, id, sig) {
    var blockfn = async function(env) {
      var command = merged.command || {};
      var COMMAND = command.COMMAND;
      var args = command.args || {};
      var result;
      switch (COMMAND) {
        case 'get': result = await enqueueExecutionGetStatus(args.pipelineid || env.pipelineid || null); break;
        case 'tasks': result = await enqueueExecutionGetTasks(args); break;
        case 'task_status': result = await enqueueExecutionGetTaskStatus(args.taskid); break;
        case 'await_task': result = await enqueueExecutionAwaitTask(args.taskid); break;
        case 'cancel_task': await enqueueExecutionCancelTask(args.taskid); return;
        case 'stop_task': await enqueueExecutionStopTask(args.taskid); return;
        default: throw new Error('[executionquery] unknown command: ' + COMMAND);
      }
      writeoutputs(sig, env, { result: result }, id);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.STOREQUERY] = function(merged, id) {
    var blockfn = async function() { throw new Error('[STOREQUERY] Block "' + id + '" is not implemented'); };
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
  throw new Error('unexpected nested element type: ' + node.element);
}

function processElement(el, pipelineId, stagePath, inheritedBriefcase, constants, dnaConstants, options) {
  var fn = compileblock(el, inheritedBriefcase, constants, options);
  fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' };
  fn.kind = 'element';
  return createPersistentElementWrapper(fn, el, stagePath, pipelineId, options);
}

function processPipelineElement(el, pipelineId, stagePath, inheritedBriefcase, options) {
  var elementId = el.id || 'pipeline_unknown';
  var blockfn = async function(env) {
    var parentEnv = env;
    var childEnv = cloneObject(parentEnv);
    childEnv.containerid = el.container || null;
    childEnv.pipelineid = el.pipelineIdOverride || (el.pipeline && el.pipeline.id) || (el.pipeline && el.pipeline.identity && el.pipeline.identity.id) || 'pipeline_' + elementId;

    var inputkeys = el.inputs || [];
    for (var i = 0; i < inputkeys.length; i++) {
      childEnv[inputkeys[i]] = compilepathaccessor(inputkeys[i])(parentEnv);
    }

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
      bootPromise.then(function(bootResult) { env[outputkey] = bootResult; }).catch(function(err) { env[outputkey] = { status: 'failed', error: err && err.message ? err.message : String(err) }; });
    }
  };
  blockfn.id = elementId;
  blockfn.kind = 'pipeline';
  return blockfn;
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
    var childId = elementFn.id || ('element_' + index);
    return elementFn(currentEnv).then(function(result) {
      return runElement(index + 1, currentEnv);
    });
  }

  return runElement(0, env).then(function(finalEnv) {
    return enqueueHypervisorStageCompleted(pipelineId, stage.id, nextStageMessage || null, finalEnv).then(function() {
      return finalEnv;
    });
  });
}

export function loadPipeline(pipelineDefinition, pipelineId, options) {
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

export function compileStage(stageDef, briefcase, pipelineId, stagePath, fullPipeline, options) {
  // kept for compatibility, but hypervisor should use compileStageRequestToElements + orchestrateStage
  var stageIndex = fullPipeline.elements.indexOf(stageDef);
  return compileStageRequestToElements(fullPipeline, stageIndex, stagePath, briefcase, {}, options);
}

export { compileStageRequestToElements, orchestrateStage };

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
