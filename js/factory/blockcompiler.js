// ============================================================
// UPDATED FILE: js/factory/blockcompiler.js
// Change applied: validatePipelineBriefcase now returns {valid, errors}
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
import { createVerbosityConstants, createVerbosityFunctions } from '../verbosity.js';
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
  enqueueExecutionPipelineLoaded, enqueueExecutionStageState,
  enqueueExecutionSubmit, enqueueExecutionSubmitStage, enqueueExecutionAwaitTask,
  enqueueExecutionEnvUpdated, enqueueExecutionRecover, enqueueExecutionGetStatus,
  enqueueExecutionStopStage, enqueueExecutionCancelStage, enqueueExecutionBreakStage,
  enqueueExecutionRestartStage, enqueueExecutionContinueStage, enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus, enqueueExecutionCancelTask, enqueueExecutionStopTask,
  enqueueExecutionRegisterPipeline
} from '../actors/executionactor.js';
import {
  enqueueHypervisorRegisterPipeline,
  enqueueHypervisorUnregisterPipeline,
  enqueueHypervisorSetEnv,
  enqueueHypervisorGetEnv,
  enqueueHypervisorGetLatestEnv,
  enqueueHypervisorBootPipeline,
  enqueueHypervisorSetRoute,
  enqueueHypervisorGetRoute,
  enqueueHypervisorGetActivePipelines,
  enqueueHypervisorSetProgram,
  enqueueHypervisorGetProgram,
  enqueueHypervisorGetRenderHtml,
  enqueueHypervisorSetRenderHtml,
  enqueueHypervisorSetStageDescriptor
} from '../actors/hypervisoractor.js';
import { consolidateClosures } from './closureconsolidator.js';

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

function createBlockCompilerLogger(verbosityOrOptions) {
  var constants = createVerbosityConstants();
  var fns = createVerbosityFunctions(constants);
  var level = constants.DEBUG;
  if (verbosityOrOptions !== undefined && verbosityOrOptions !== null) {
    if (typeof verbosityOrOptions === 'number' || typeof verbosityOrOptions === 'string') {
      level = verbosityOrOptions;
    } else if (typeof verbosityOrOptions === 'object') {
      if (verbosityOrOptions.verbosity !== undefined) level = verbosityOrOptions.verbosity;
      else if (verbosityOrOptions.verbosityLevel !== undefined) level = verbosityOrOptions.verbosityLevel;
      else if (verbosityOrOptions.level !== undefined) level = verbosityOrOptions.level;
    }
  }
  return fns.createLogger('[BLOCKCOMPILER]', level);
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

function sanitizeEnv(env, maxBytes) {
  if (maxBytes === undefined) maxBytes = 128 * 1024;
  return Object.keys(env || {}).reduce(function(out, key) {
    var value = env[key];
    if (typeof value === 'function') {
      if (key === 'registersubscription') out[key] = '[Function:registersubscription]';
      return out;
    }
    if (typeof Node !== 'undefined' && value instanceof Node) return out;
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) return out;
    try {
      var json = JSON.stringify(value);
      out[key] = json.length > maxBytes ? '[large-value omitted]' : JSON.parse(json);
    } catch (e) {
      out[key] = null;
    }
    return out;
  }, {});
}

function createPersistentElementWrapper(compiledElement, elementDef, stagePath, pipelineId, options) {
  var elementId = elementDef.id || compiledElement.id || 'element_unknown';
  var logger = createBlockCompilerLogger(options);

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
    if (typeof compiledElement === 'function') {
      closureSerialized = serializeSelfContainedClosure(compiledElement, inputargs, execEnv);
    }

    logger.debug('submitting persistent element execution:', elementId, 'pipeline:', pipelineId, 'path:', path);

    return enqueueExecutionSubmit({
      pipelineid: pipelineId,
      path: path,
      elementid: elementId,
      env: execEnv,
      signature: {
        inputs: blockInputs,
        outputs: blockOutputs
      },
      executor: executor,
      properties: elementDef || {},
      serialized: closureSerialized,
      origin: compiledElement.origin || null,
      programRef: null,
      elementId: elementId
    }).then(function(submitted) {
      logger.debug('element task submitted, awaiting taskid:', submitted.taskid);
      return enqueueExecutionAwaitTask(submitted.taskid);
    });
  }

  wrapper.id = elementId;
  wrapper.kind = 'element';

  if (compiledElement.blockmeta) {
    wrapper.blockmeta = compiledElement.blockmeta;
  }

  return wrapper;
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
    if (typeof block.fn !== 'function' && typeof block.ref !== 'function') {
      errors.push('writer block must have fn or ref');
    }
    if (typeof block.fn === 'function' || typeof block.ref === 'function') {
      errors = errors.concat(validaterevivablefunctionblock(block, BLOCKTYPES, dnaConstants));
    }
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
  var logger = createBlockCompilerLogger(options);
  var blockfn = async function(env) {
    var label = (isTextual ? 'fetch' : 'api') + ':' + (merged.endpoint || id);
    logger.debug('executing http block:', id, 'type:', isTextual ? 'fetch' : 'api', 'endpoint:', merged.endpoint);
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

    logger.debug('http block sending request:', label, 'payload keys:', Object.keys(payload).join(', '));

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
    logger.debug('http block completed:', id, 'status:', rawresult && rawresult.status);
  };
  blockfn.id = id;
  return blockfn;
}

function createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options) {
  var compilers = {};
  var logger = createBlockCompilerLogger(options);

  compilers[BLOCKTYPES.FN] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logger.debug('compiling FN block:', id);
    var blockfn = async function(env) {
      logger.debug('executing FN block:', id);
      var fn = merged.fn;
      if (!fn) throw new Error('fn block must have a function: ' + id);
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var fnargs = [properties].concat(inputargs);
      var result = await callwithstack(
        EVALSTACK, 'fn:' + (merged.ref || id), 'async-await',
        async function() { return (await fn.apply(null, fnargs)) || {}; },
        [env],
        { context: { env: env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') }
      );
      writeoutputs(sig, env, result, id);
      logger.debug('completed FN block:', id);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.API] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, false, options); };
  compilers[BLOCKTYPES.FETCH] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, true, options); };

  compilers[BLOCKTYPES.WRITER] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    logger.debug('compiling WRITER block:', id);
    var blockfn = async function(env) {
      logger.debug('executing WRITER block:', id);
      var fn = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!fn) throw new Error('[WRITER] Block "' + id + '" failed validation');
      var properties = buildBlockProperties(merged, inheritedProperties, sig, env);
      var inputargs = (sig.inputs || []).map(compilepathaccessor).map(function(f) { return f(env); });
      var result = await fn(properties, inputargs);
      if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) {
        throw new Error('[WRITER] Block "' + id + '" returned invalid result');
      }
      var target = merged.targetlabel || env.approot;
      if (!target) throw new Error('[WRITER] missing targetlabel/approot');
      await enqueuehtml(target, result.html, !merged.replace);
      if (result.id && Object.keys(sig.outputs || {}).length > 0) {
        var domref = await expectelement(result.id, result.timeout || 5000);
        env[Object.keys(sig.outputs)[0]] = result;
        env[result.id] = domref;
      }
      logger.debug('completed WRITER block:', id, 'target:', target);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.IO] = function(merged, id, sig) {
    logger.debug('compiling IO block:', id);
    var blockfn = async function(env) {
      logger.debug('executing IO block:', id);
      var io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      var res = await callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', async function(e) { return await io(inputdata, e); }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
      logger.debug('completed IO block:', id);
      return res;
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.DOMQUERY] = function(merged, id, sig) {
    logger.debug('compiling DOMQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var blockfn = async function(env) {
      var cmd = merged.command && merged.command.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      var props = merged.command.properties || {};
      logger.debug('executing DOMQUERY block:', id, 'command:', cmd);

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

      var result = await callwithstack(
        EVALSTACK, 'domquery:' + cmd, 'async-await',
        async function() {
          if (DOMQUERYSETTERS.indexOf(cmd) !== -1) {
            if (cmd === 'toggleclass') return await handler(props.id, props.classname != null ? props.classname : props.value, props.force !== undefined ? props.force : false);
            var val = sig.inputs && sig.inputs.length > 0 ? compilepathaccessor(props.value)(env) : props.value;
            return await handler(props.id, val);
          }
          return await handler(props.id);
        },
        [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + cmd) }
      );
      writeoutputs(sig, env, result, id);
      logger.debug('completed DOMQUERY block:', id, 'command:', cmd);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.CRYPTO] = function(merged, id, sig) {
    logger.debug('compiling CRYPTO block:', id);
    var blockfn = async function(env) {
      logger.debug('executing CRYPTO block:', id, 'bytes:', merged.bytes || 512);
      var outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      var result = await new Promise(function(resolve, reject) { RENDERACTOR.send({ type: MESSAGETYPES.CRYPTO, bytes: merged.bytes || 512, resolve: resolve, reject: reject }); });
      env[outputkey] = result;
      logger.debug('completed CRYPTO block:', id);
      return {};
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.WAIT] = function(merged, id) {
    logger.debug('compiling WAIT block:', id, 'ms:', merged.ms);
    var blockfn = async function(env) {
      var ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      logger.debug('executing WAIT block:', id, 'ms:', ms);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      await new Promise(function(r) { setTimeout(r, ms); });
      logger.debug('completed WAIT block:', id);
      return {};
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.EXECUTIONQUERY] = function(merged, id, sig) {
    logger.debug('compiling EXECUTIONQUERY block:', id, 'command:', merged.command && merged.command.COMMAND);
    var blockfn = async function(env) {
      var command = merged.command || {};
      var COMMAND = command.COMMAND;
      var args = command.args || {};
      logger.debug('executing EXECUTIONQUERY block:', id, 'command:', COMMAND);
      var result;
      switch (COMMAND) {
        case 'get': result = await enqueueExecutionGetStatus(args.pipelineid || env.pipelineid || null); break;
        case 'tasks': result = await enqueueExecutionGetTasks(args); break;
        case 'task_status': result = await enqueueExecutionGetTaskStatus(args.taskid); break;
        case 'await_task': result = await enqueueExecutionAwaitTask(args.taskid); break;
        case 'cancel_task': await enqueueExecutionCancelTask(args.taskid); return;
        case 'stop_task': await enqueueExecutionStopTask(args.taskid); return;
        case 'stop': await enqueueExecutionStopStage(args.pipelineid, args.stageid); return;
        case 'cancel': await enqueueExecutionCancelStage(args.pipelineid, args.stageid); return;
        case 'break': await enqueueExecutionBreakStage(args.pipelineid, args.stageid); return;
        case 'restart': await enqueueExecutionRestartStage(args.pipelineid, args.stageid, args.elementid || null); return;
        case 'continue': await enqueueExecutionContinueStage(args.pipelineid, args.stageid); return;
        case 'recover': result = await enqueueExecutionRecover(); break;
        default: throw new Error('[executionquery] unknown command: ' + COMMAND);
      }
      writeoutputs(sig, env, { result: result }, id);
      logger.debug('completed EXECUTIONQUERY block:', id, 'command:', COMMAND);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.STOREQUERY] = function(merged, id, sig) {
    logger.debug('compiling STOREQUERY block:', id);
    var blockfn = async function() {
      throw new Error('[STOREQUERY] Block "' + id + '" is not implemented; cannot execute storequery.');
    };
    blockfn.id = id;
    return blockfn;
  };

  return Object.freeze(compilers);
}

function compileblock(block, inheritedBriefcase, constants, options) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var logger = createBlockCompilerLogger(options);
  logger.debug('compileblock block:', block.id, 'type:', block.type);
  var compiler = constants.COMPILERS[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.ANALYZERS[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockIo = {
    inputs: block.inputs || [],
    outputs: block.outputs || {}
  };
  var blockfn = compiler(block, block.id, blockIo, inheritedBriefcase);
  return blockfn;
}

function mapOrderedChildren(children) {
  return children.map(function(ch) {
    return {
      type: ch.kind === 'stage' ? 'stage' : 'element',
      id: ch.id,
      status: ch.kind === 'stage' ? 'awaiting' : 'WAITING',
      children: ch.kind === 'stage' ? [] : undefined,
      savedAt: ch.kind !== 'stage' ? Date.now() : undefined
    };
  });
}

function createTriggerRegistration(stage, children, pipelineId, stagePath) {
  var control = stage.control;
  var id = stage.id;

  return {
    pipelineId: pipelineId,
    stageId: id,
    stagePath: stagePath,
    sourceid: control.sourceid,
    event: control.event,
    control: control,
    children: children,
    output: stage.output || null
  };
}

function processNode(node, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options) {
  var logger = createBlockCompilerLogger(options);
  logger.debug('processNode element:', node.element, 'id:', node.id);
  if (node.element === 'BLOCK') {
    return processElement(node, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options);
  }
  if (node.element === 'STAGE') {
    return processStage(node, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options);
  }
  if (node.element === 'PIPELINE') {
    return processPipelineElement(node, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options);
  }
  throw new Error('unknown element type: ' + node.element);
}

function processElement(el, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options) {
  var logger = createBlockCompilerLogger(options);
  logger.debug('processElement element:', el.id, 'type:', el.type);
  var fn = compileblock(el, inheritedBriefcase, constants, options);
  fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace, sync: el.sync || 'awaited' };
  fn.kind = 'element';
  return createPersistentElementWrapper(fn, el, stagePath, pipelineId, options);
}

function processPipelineElement(el, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, orderedStages, options) {
  var elementId = el.id || 'pipeline_unknown';
  var logger = createBlockCompilerLogger(options);
  logger.debug('processPipelineElement element:', elementId);
  var blockfn = async function(env) {
    var parentEnv = env;
    var childEnv = cloneObject(parentEnv);
    childEnv.containerid = el.container || null;
    childEnv.pipelineid = pipelineId;

    var inputkeys = el.inputs || [];
    for (var i = 0; i < inputkeys.length; i++) {
      childEnv[inputkeys[i]] = compilepathaccessor(inputkeys[i])(parentEnv);
    }

    var childPipelineId = el.pipelineIdOverride
      || (el.pipeline && el.pipeline.id)
      || (el.pipeline && el.pipeline.identity && el.pipeline.identity.id)
      || 'child_pipeline';

    var childOptions = el.options || {};
    if (childOptions.autorun === undefined) childOptions.autorun = true;
    if (childOptions.baseEnv === undefined) childOptions.baseEnv = childEnv;
    if (childOptions.updateworldmap === undefined) childOptions.updateworldmap = parentEnv.updateworldmap;
    if (childOptions.verbosity === undefined && options && options.verbosity !== undefined) childOptions.verbosity = options.verbosity;

    var bootMessage = {
      pipeline: el.pipeline,
      accessors: el.accessors || null,
      sinks: el.sinks || [],
      pipelineId: childPipelineId,
      options: childOptions
    };

    logger.debug('PIPELINE element boot request:', childPipelineId, bootMessage);

    var bootPromise = enqueueHypervisorBootPipeline(bootMessage);
    var outputkey = Object.keys(el.outputs || {})[0] || null;
    if (outputkey) {
      bootPromise.then(function(bootResult) {
        env[outputkey] = bootResult;
      }).catch(function(err) {
        env[outputkey] = { status: 'failed', error: err && err.message ? err.message : String(err) };
      });
    }
  };
  blockfn.id = elementId;
  blockfn.kind = 'pipeline';
  return blockfn;
}

function processStageHeader(stage, pipelineId, parentPath, inheritedBriefcase, constants, dnaConstants, options) {
  var logger = createBlockCompilerLogger(options);
  logger.debug('processStageHeader stage:', stage.id);
  var stageBriefcase = cloneObject(inheritedBriefcase);
  Object.keys(stage.briefcase || {}).forEach(function(key) { stageBriefcase[key] = stage.briefcase[key]; });

  var briefcaseErrors = validaterevivableobject(stageBriefcase, 'stage.' + stage.id + '.briefcase', dnaConstants);
  if (briefcaseErrors.length > 0) {
    logger.error('processStageHeader briefcase revivability failed:', briefcaseErrors);
    throw new Error('[processStageHeader] briefcase revivability failed: ' + briefcaseErrors.join(', '));
  }

  var stagePath = parentPath.concat([stage.id]);
  var reads = [], writes = [];
  (stage.elements || []).filter(function(e) { return e.element === 'BLOCK'; }).forEach(function(e) {
    (e.inputs || []).forEach(function(k) { if (reads.indexOf(k) === -1) reads.push(k); });
    Object.keys(e.outputs || {}).forEach(function(k) { if (writes.indexOf(k) === -1) writes.push(k); });
  });

  var controlCommand = stage.control && stage.control.command ? stage.control.command : null;
  var sync = stage.async === true ? 'async' : 'awaited';

  return {
    stagePath: stagePath,
    stageBriefcase: stageBriefcase,
    controlCommand: controlCommand,
    sync: sync,
    meta: {
      async: stage.async === true,
      stageid: stage.id,
      reads: reads,
      writes: writes,
      snapshotKey: 'stage:' + stage.id,
      recoverable: true,
      notifyOnDone: stage.notifyOnDone === true,
      controlCommand: controlCommand,
      path: stagePath,
      sync: sync
    }
  };
}

function processStage(stage, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, orderedStages, options) {
  var logger = createBlockCompilerLogger(options);
  logger.debug('processStage stage:', stage.id);
  var header = processStageHeader(stage, pipelineId, parentPath, inheritedBriefcase, constants, dnaConstants, options);
  var stagePath = header.stagePath;
  var stageBriefcase = header.stageBriefcase;

  var children = (stage.elements || []).map(function(child) {
    return processNode(child, pipelineId, resumeFrom, stagePath, stageBriefcase, constants, dnaConstants, orderedStages, options);
  });

  if (header.controlCommand === 'TRIGGER') {
    logger.debug('processStage created TRIGGER stage:', stage.id);
    var triggerFn = async function(env) {
      return env;
    };
    triggerFn.id = stage.id;
    triggerFn.kind = 'stage';
    triggerFn.stagemeta = header.meta;
    triggerFn.controlCommand = 'TRIGGER';
    triggerFn.isTrigger = true;
    triggerFn.triggerChildren = children;
    triggerFn.rawControl = stage.control;
    triggerFn.pipelineId = pipelineId;
    triggerFn.stagePath = stagePath;
    if (orderedStages) orderedStages.push(triggerFn);
    return triggerFn;
  }

  var isResumeStage = resumeFrom && resumeFrom.path && resumeFrom.path[0] === stage.id;
  var startIndex = isResumeStage ? Math.max(0, findIndex(stage.elements || [], function(el) { return el.id === resumeFrom.path[resumeFrom.path.length - 1]; })) : 0;

  var fn = stageRunner(stage, children, startIndex, pipelineId, isResumeStage, stagePath, resumeFrom, orderedStages, options);
  fn.id = stage.id;
  fn.kind = 'stage';
  fn.stagemeta = header.meta;
  fn.controlCommand = header.controlCommand;
  fn.isTrigger = false;
  if (orderedStages) orderedStages.push(fn);

  return fn;
}

function processPipeline(elements, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, orderedStages, options) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var logger = createBlockCompilerLogger(options);
  logger.debug('processPipeline elements count:', elements.length);

  function loop(index, stages) {
    if (index >= elements.length) {
      return stages;
    }

    var el = elements[index];
    if (el.element !== 'STAGE') {
      logger.error('processPipeline invalid top-level pipeline element:', el.element);
      throw new Error('[processPipeline] top-level pipeline element must be STAGE, got ' + el.element);
    }

    var compiledStage = processStage(el, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, orderedStages, options);
    stages.push(compiledStage);

    return loop(index + 1, stages);
  }

  return loop(0, []);
}

function createTriggerRegistrationFromStage(compiledTriggerStage) {
  return {
    pipelineId: compiledTriggerStage.pipelineId,
    stageId: compiledTriggerStage.id,
    stagePath: compiledTriggerStage.stagePath,
    sourceid: compiledTriggerStage.rawControl.sourceid,
    event: compiledTriggerStage.rawControl.event,
    control: compiledTriggerStage.rawControl,
    children: compiledTriggerStage.triggerChildren,
    output: compiledTriggerStage.stagemeta.output || null
  };
}

function findIndex(arr, predicate) {
  for (var i = 0; i < arr.length; i++) if (predicate(arr[i], i)) return i;
  return -1;
}

function stageRunner(stage, children, startIndex, pipelineId, resumeStage, stagePath, resumeFrom, orderedStages, options) {
  var control = stage.control;
  var id = stage.id;
  if (!control || !control.command) return defaultRunner(id, children, startIndex, pipelineId, stagePath, options);
  if (control.command === 'LOOP') return loopRunner(id, control, children, startIndex, pipelineId, stagePath, options);
  throw new Error('unknown stage command: ' + control.command);
}

function defaultRunner(id, children, startIndex, pipelineId, stagePath, options) {
  var logger = createBlockCompilerLogger(options);
  return async function(env) {
    logger.debug('executing defaultRunner stage:', id, 'pipeline:', pipelineId);
    var stageExecutor = async function(execEnv) {
      await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(function() {});
      var result = await executeChildren(children.slice(startIndex), execEnv, id, pipelineId, stagePath, options);
      return result.env || execEnv;
    };
    var submitted = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: stageExecutor, env: env });
    await enqueueExecutionAwaitTask(submitted.taskid);
    logger.debug('completed defaultRunner stage:', id);
  };
}

function loopRunner(id, control, children, startIndex, pipelineId, stagePath, options) {
  var logger = createBlockCompilerLogger(options);
  return async function(env) {
    logger.debug('executing loopRunner stage:', id, 'pipeline:', pipelineId);
    var stageExecutor = async function(execEnv) {
      await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(function() {});
      var controlprops = {};
      Object.keys(control).forEach(function(k) { if (k !== 'fn' && k !== 'inputs' && k !== 'command') controlprops[k] = control[k]; });
      var inputaccessors = (control.inputs || []).map(compilepathaccessor);

      function runLoop(iteration, currentEnv) {
        if (!currentEnv.rngactive) return Promise.resolve(currentEnv);
        logger.debug('loopRunner stage:', id, 'iteration:', iteration);
        var childSlice = iteration === 0 ? children.slice(startIndex) : children;
        return executeChildren(childSlice, currentEnv, id, pipelineId, stagePath, options).then(function(result) {
          var newEnv = result.env || currentEnv;
          var fnargs = [controlprops].concat(inputaccessors.map(function(fn) { return fn(newEnv); }));
          return Promise.resolve(control.fn.apply(null, fnargs)).then(function(shouldContinue) {
            if (!shouldContinue) {
              logger.debug('loopRunner stage:', id, 'loop finished at iteration:', iteration);
              return newEnv;
            }
            return runLoop(iteration + 1, newEnv);
          });
        });
      }

      return runLoop(0, execEnv);
    };
    var submitted = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: stageExecutor, env: env });
    await enqueueExecutionAwaitTask(submitted.taskid);
    logger.debug('completed loopRunner stage:', id);
  };
}

function deepcloneevent(e) {
  if (!e) return {};
  var c = {};
  for (var k in e) if (typeof e[k] !== 'function') c[k] = e[k];
  return c;
}

function executeChildren(children, env, stageid, pipelineId, stagePath, options) {
  var logger = createBlockCompilerLogger(options);
  function collect(index, outputs) {
    if (index >= children.length) {
      return Promise.resolve({ env: env, spawnOutputs: outputs });
    }
    var child = children[index];
    var childId = child && child.id ? child.id : ('child_' + index);
    logger.debug('executeChildren stage:', stageid, 'child:', childId, '(' + (index + 1) + '/' + children.length + ')');
    if (child && !child.origin) {
      child.origin = {
        pipelineId: pipelineId || null,
        stageId: stageid,
        stagePath: stagePath || [],
        elementId: child.id || null,
        childIndex: index,
        loopIteration: env._loopIteration || 0,
        triggerIndex: index
      };
    }
    return child(env).then(function(result) {
      logger.debug('executeChildren child completed:', childId, 'in stage:', stageid);
      return collect(index + 1, outputs);
    }).catch(function(err) {
      logger.error('executeChildren child failed:', childId, 'in stage:', stageid, err);
      err.message = 'child ' + (stageid || 'unnamed') + '/' + (child.id || 'unnamed') + ': ' + err.message;
      throw err;
    });
  }

  return collect(0, []);
}

function waitForBootReady() {
  return new Promise(function(resolve) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function onDomReady() {
        document.removeEventListener('DOMContentLoaded', onDomReady);
        resolve();
      }, { once: true });
      return;
    }

    if (document.readyState !== 'complete') {
      window.addEventListener('load', function onLoad() {
        window.removeEventListener('load', onLoad);
        resolve();
      }, { once: true });
      return;
    }

    resolve();
  });
}

function runTrampoline(env, stages, pipelineId, options) {
  var logger = createBlockCompilerLogger(options);

  async function step(stack, currentEnv) {
    await waitForBootReady();

    if (stack.length === 0) return currentEnv;

    var nextStageId = stack[0];
    var stageIndex = findIndex(stages, function(s, idx) {
      return (s.id || s.stagemeta.stageid || ('stage_' + idx)) === nextStageId;
    });

    if (stageIndex === -1) {
      logger.debug('runTrampoline stage not found, skipping:', nextStageId);
      return step(stack.slice(1), currentEnv);
    }

    var stage = stages[stageIndex];

    if (stage.isTrigger) {
      logger.debug('runTrampoline trigger stage skipped:', nextStageId);
      return enqueueExecutionStageState(pipelineId, nextStageId, { status: 'completed' })
        .catch(function() {})
        .then(function() {
          return step(stack.slice(1), currentEnv);
        });
    }

    function continueWithStage() {
      return executeStageStep(stage, nextStageId, stack, currentEnv, pipelineId);
    }

    if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP' && stage.control.fn) {
      return Promise.resolve(stage.control.fn(currentEnv)).then(function(condition) {
        if (!condition) {
          logger.debug('runTrampoline skipping stage:', nextStageId, 'control condition false');
          return step(stack.slice(1), currentEnv);
        }
        return continueWithStage();
      });
    }

    return continueWithStage();
  }

  async function executeStageStep(stage, nextStageId, stack, currentEnv, pipelineId) {
    await waitForBootReady();

    logger.debug('runTrampoline executing stage step:', nextStageId);

    return enqueueExecutionStageState(pipelineId, nextStageId, { status: 'running' })
      .catch(function() {})
      .then(function() {
        return stage(currentEnv);
      })
      .then(function(patch) {
        var newEnv = currentEnv;
        if (patch && typeof patch === 'object') {
          if (newEnv.updateworldmap) newEnv.updateworldmap(patch);
          else newEnv = extendObject(cloneObject(newEnv), patch);
        }

        return enqueueExecutionStageState(pipelineId, nextStageId, { status: 'completed' })
          .catch(function() {})
          .then(function() {
            return enqueueExecutionEnvUpdated(pipelineId, newEnv).catch(function() {});
          })
          .then(function() {
            return enqueueHypervisorSetEnv(pipelineId, newEnv).catch(function(err) {
              logger.warn('hypervisor env update failed:', err);
            });
          })
          .then(function() {
            return step(stack.slice(1), newEnv);
          });
      })
      .catch(function(err) {
        logger.error('runTrampoline error at stage:', nextStageId, err);

        return enqueueExecutionStageState(pipelineId, nextStageId, { status: 'failed' })
          .catch(function() {})
          .then(function() {
            return enqueueExecutionEnvUpdated(pipelineId, currentEnv).catch(function() {});
          })
          .then(function() {
            err.diagnostic = err.diagnostic || {};
            err.diagnostic.pipelinestage = nextStageId;
            throw err;
          });
      });
  }

  var initialStack = env.executionStack
    ? env.executionStack.slice(0)
    : stages.map(function(s, idx) {
        return s.id || s.stagemeta.stageid || ('stage_' + idx);
      });

  if (!env.executionStack) logger.debug('pipeline booting fresh:', { pipelineId: pipelineId });
  else logger.debug('pipeline resuming:', { pipelineId: pipelineId, remainingStages: initialStack.length });

  return step(initialStack, env).then(function(finalEnv) {
    logger.debug('pipeline completed:', { pipelineId: pipelineId });
    return finalEnv;
  });
}

async function executeStage(descriptor, env, activation, eventPayload, options) {
  var logger = createBlockCompilerLogger(options);
  if (!descriptor) throw new Error('[executeStage] missing stage descriptor');
  if (!env || typeof env !== 'object') env = {};

  logger.debug('executeStage start:', descriptor.stageId, 'pipeline:', descriptor.pipelineId, 'activation:', activation);

  if (activation === 'trigger' && eventPayload) {
    env.eventtarget = eventPayload.target;
    if (descriptor.output != null) {
      env[descriptor.output] = deepcloneevent(eventPayload);
    }
  }

  var result = await executeChildren(
    descriptor.children,
    env,
    descriptor.stageId,
    descriptor.pipelineId,
    descriptor.stagePath,
    options
  );

  logger.debug('executeStage completed:', descriptor.stageId);
  return { env: result.env || env };
}

function createpipeline(stages, sinks, onprogress, options) {
  if (!Array.isArray(stages)) throw new Error('[PIPELINE] Stages must be an array.');
  var pipelineId = (options && options.pipelineId) || 'default_pipeline';
  var compilerOptions = (options && options.options) || options || {};
  var logger = createBlockCompilerLogger(compilerOptions);

  return async function(agent) {
    var env = agent.env;
    if (!env || typeof env !== 'object') throw new Error('[PIPELINE] agent.env is required');

    env.agentid = agent.id;
    env.pipelineid = pipelineId;
    env._rerunStages = function() {
      return runTrampoline(env, stages, pipelineId, compilerOptions);
    };

    logger.debug('createpipeline runner invoked for pipeline:', pipelineId);

    enqueueHypervisorSetEnv(pipelineId, env).catch(function(err) {
      logger.warn('hypervisor env save failed:', err);
    });

    return runTrampoline(env, stages, pipelineId, compilerOptions).then(function(finalEnv) {
      enqueueHypervisorUnregisterPipeline(pipelineId).catch(function(err) {
        logger.warn('hypervisor unregister failed:', err);
      });
      return finalEnv;
    });
  };
}

function buildResumeFromRoute(route) {
  if (!route) return null;
  return {
    path: Array.isArray(route.path) ? route.path : (route.stagePath || []),
    elementId: route.elementId || null,
    childIndex: typeof route.childIndex === 'number' ? route.childIndex : 0,
    loopIteration: typeof route.loopIteration === 'number' ? route.loopIteration : 0,
    triggerIndex: typeof route.triggerIndex === 'number' ? route.triggerIndex : 0
  };
}

function buildResumeStack(orderedStages, resumeFrom) {
  if (!resumeFrom || !resumeFrom.path || !resumeFrom.path.length) return null;
  var resumeStageId = resumeFrom.path[0];
  var startIndex = findIndex(orderedStages, function(s) {
    return (s.id || (s.stagemeta && s.stagemeta.stageid)) === resumeStageId;
  });
  if (startIndex === -1) return null;
  return orderedStages.slice(startIndex).map(function(s) {
    return s.id || (s.stagemeta && s.stagemeta.stageid);
  });
}

async function restorePipelineState(pipelineDefinition, pipelineId, options) {
  var logger = createBlockCompilerLogger(options);
  logger.info('restorePipelineState for pipeline:', pipelineId);

  var active = await enqueueHypervisorGetActivePipelines().catch(function() { return []; });
  if (active.indexOf(pipelineId) === -1) {
    logger.debug('pipeline not active, creating fresh compilation for:', pipelineId);
    var freshCompiled = await compilepipeline(pipelineDefinition, null, [], pipelineId, options);
    return freshCompiled.pipeline({ id: pipelineId, env: { pipelineid: pipelineId } });
  }

  var env = await enqueueHypervisorGetEnv(pipelineId).catch(function() { return null; });
  if (!env || typeof env !== 'object') env = { pipelineid: pipelineId };

  var renderHtml = await enqueueHypervisorGetRenderHtml().catch(function() { return ''; });
  if (renderHtml) {
    await enqueueRenderRestoreBodyHtml(renderHtml).catch(function(err) {
      logger.warn('render restore failed:', err);
    });
  }

  await enqueueExecutionRecover().catch(function(err) {
    logger.warn('execution recover failed:', err);
  });

  var route = await enqueueHypervisorGetRoute('pipeline:' + pipelineId).catch(function() { return null; });
  var resumeFrom = buildResumeFromRoute(route);

  var mergedOpts = cloneObject(options || {});
  mergedOpts.inheritedBriefcase = env.briefcase || {};
  mergedOpts.resumeFrom = resumeFrom;

  var compiled = await compilepipeline(
    pipelineDefinition,
    null,
    [],
    pipelineId,
    mergedOpts
  );

  var resumeStack = buildResumeStack(compiled.orderedStages, resumeFrom);
  if (resumeStack) {
    env.executionStack = resumeStack;
  }

  logger.debug('restorePipelineState resuming pipeline execution:', pipelineId);
  return compiled.pipeline({ id: pipelineId, env: env, resumeFrom: resumeFrom });
}

async function compilepipeline(pipeline, accessors, sinks, pipelineIdOverride, options) {
  if (pipelineIdOverride === undefined) pipelineIdOverride = null;
  if (options === undefined) options = {};
  if (!pipeline.elements) throw new Error('[compilepipeline] pipeline must have elements array');

  var pipelineId = pipelineIdOverride || pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline';

  var logger = createBlockCompilerLogger(options);
  logger.info('compilepipeline starting for pipeline:', pipelineId);
  logger.debug('compilepipeline elements count:', pipeline.elements.length, 'options:', options);

  var constants = createBlockCompilerConstants();
  var BLOCKTYPES = constants.BLOCKTYPES;
  var INHERITEDKEYS = constants.INHERITEDKEYS;
  var dnaConstants = createDnaSerializerConstants();
  var ANALYZERS = createBlockAnalyzers(BLOCKTYPES, dnaConstants);
  var COMPILERS = createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options);
  var compilerConstants = {
    BLOCKTYPES: BLOCKTYPES,
    INHERITEDKEYS: INHERITEDKEYS,
    ANALYZERS: ANALYZERS,
    COMPILERS: COMPILERS
  };
  var orderedStages = [];

  if (options.autorun === true) {
    var activePipelines = await enqueueHypervisorGetActivePipelines().catch(function() { return []; });
    if (activePipelines.indexOf(pipelineId) !== -1) {
      logger.debug('compilepipeline resuming active pipeline from state:', pipelineId);
      return restorePipelineState(pipeline, pipelineId, options);
    }
  }

  var pipelineBriefcase = Object.keys(pipeline.briefcase || {}).reduce(function(acc, key) {
    acc[key] = pipeline.briefcase[key];
    return acc;
  }, cloneObject(options.inheritedBriefcase || {}));

  var briefcaseErrors = validaterevivableobject(pipelineBriefcase, 'pipeline.briefcase', dnaConstants);
  if (briefcaseErrors.length > 0) {
    logger.error('compilepipeline briefcase revivability failed:', briefcaseErrors);
    throw new Error('[compilepipeline] briefcase revivability failed: ' + briefcaseErrors.join(', '));
  }

  await enqueueExecutionPipelineLoaded(pipelineId, {}).catch(function(err) { logger.warn('pipeline loaded failed:', err); });
  await enqueueHypervisorRegisterPipeline(pipelineId).catch(function(err) { logger.warn('hypervisor register failed:', err); });
  await enqueueExecutionRegisterPipeline(pipelineId, null, {}).catch(function(err) { logger.warn('register pipeline failed:', err); });

  var spawnBootstrapMap = {};
  var resumeFrom = options.resumeFrom || null;

  var stages = processPipeline(
    pipeline.elements,
    pipelineId,
    resumeFrom,
    [],
    pipelineBriefcase,
    compilerConstants,
    dnaConstants,
    orderedStages,
    options
  );

  var triggerRegistrations = orderedStages.filter(function(s) { return s.isTrigger; });

  for (var i = 0; i < triggerRegistrations.length; i++) {
    var compiledTrigger = triggerRegistrations[i];
    var reg = createTriggerRegistrationFromStage(compiledTrigger);

    logger.debug('registering trigger expectation for stage:', reg.stageId, 'source:', reg.sourceid, 'event:', reg.event);

    await callwithstack(
      EVALSTACK,
      'hypervisor-descriptor:' + reg.stageId,
      'async-await',
      function() {
        return enqueueHypervisorSetStageDescriptor(
          reg.pipelineId,
          reg.stageId,
          {
            stageId: reg.stageId,
            stagePath: reg.stagePath,
            pipelineId: reg.pipelineId,
            children: reg.children,
            control: reg.control,
            output: reg.output || null
          }
        );
      },
      [],
      { context: { env: {} }, capturecontinuation: true, errk: createerrorcontext('hypervisorDescriptor', 'trigger') }
    ).catch(function(err) {
      logger.warn('hypervisor stage descriptor failed:', err);
    });

    await callwithstack(
      EVALSTACK,
      'render-register:' + reg.stageId,
      'async-await',
      function() {
        return enqueueRenderRegisterTriggerExpectation(reg);
      },
      [],
      { context: { env: {} }, capturecontinuation: true, errk: createerrorcontext('renderRegister', 'trigger') }
    ).catch(function(err) {
      logger.warn('trigger registration failed:', err);
    });
  }

  var compiledpipeline = createpipeline(stages, sinks, undefined, { pipelineId: pipelineId, options: options });
  logger.debug('compilepipeline completed for pipeline:', pipelineId);

  return {
    pipeline: compiledpipeline,
    pipelineId: pipelineId,
    orderedStages: orderedStages,
    spawnBootstrapMap: spawnBootstrapMap,
    triggerRegistrations: triggerRegistrations
  };
}

// Explicit pipeline load function constructing orchestration messages to Hypervisor
export function loadPipeline(pipelineDefinition, pipelineId, options) {
  if (options === undefined) options = {};
  var logger = createBlockCompilerLogger(options);
  var id = pipelineId || pipelineDefinition.id || (pipelineDefinition.identity && pipelineDefinition.identity.id) || 'default_pipeline';
  logger.info('loadPipeline request for pipeline:', id);
  return enqueueHypervisorBootPipeline({
    pipeline: pipelineDefinition,
    accessors: options.accessors || null,
    sinks: options.sinks || [],
    pipelineId: id,
    options: {
      autorun: options.autorun !== false,
      baseEnv: options.baseEnv || {},
      updateworldmap: options.updateworldmap || null,
      verbosity: options.verbosity !== undefined ? options.verbosity : (options.verbosityLevel !== undefined ? options.verbosityLevel : undefined)
    }
  });
}

export function compileStage(stageDef, briefcase, pipelineId, stagePath, fullPipeline, options) {
  if (options === undefined) options = {};
  var logger = createBlockCompilerLogger(options);
  logger.debug('compileStage start for stage:', stageDef && stageDef.id, 'pipeline:', pipelineId);

  var constants = createBlockCompilerConstants();
  var BLOCKTYPES = constants.BLOCKTYPES;
  var INHERITEDKEYS = constants.INHERITEDKEYS;
  var dnaConstants = createDnaSerializerConstants();
  var ANALYZERS = createBlockAnalyzers(BLOCKTYPES, dnaConstants);
  var COMPILERS = createBlockCompilers(BLOCKTYPES, INHERITEDKEYS, options);
  var compilerConstants = {
    BLOCKTYPES: BLOCKTYPES,
    INHERITEDKEYS: INHERITEDKEYS,
    ANALYZERS: ANALYZERS,
    COMPILERS: COMPILERS
  };

  var compiledStage = processStage(stageDef, pipelineId, null, stagePath, briefcase, compilerConstants, dnaConstants, [], options);
  var nextStageMessage = null;
  var stageIndex = fullPipeline.elements.indexOf(stageDef);
  if (stageIndex !== -1 && stageIndex + 1 < fullPipeline.elements.length) {
    nextStageMessage = {
      type: 'compile_stage',
      pipeline: fullPipeline,
      pipelineId: pipelineId,
      stageIndex: stageIndex + 1,
      stagePath: stagePath,
      briefcase: briefcase,
      env: null,
      options: options
    };
  }
  var isAsync = stageDef && stageDef.async === true;
  logger.debug('compileStage completed for stage:', stageDef && stageDef.id, 'hasNextStage:', Boolean(nextStageMessage), 'isAsync:', isAsync);
  return { compiledStage: compiledStage, nextStageMessage: nextStageMessage, isAsync: isAsync };
}

function validatePipelineBriefcase(briefcase) {
  var dnaConstants = createDnaSerializerConstants();
  var errors = validaterevivableobject(briefcase || {}, 'pipeline.briefcase', dnaConstants);
  return { valid: errors.length === 0, errors: errors };
}

export {
  createBlockCompilerConstants,
  createBlockAnalyzers,
  createBlockCompilers,
  executeStage,
  restorePipelineState,
  createBlockCompilerLogger,
  validatePipelineBriefcase,
  createTriggerRegistrationFromStage
};
