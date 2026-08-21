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
  enqueuegetscreen, enqueuematchmedia, enqueueRenderRegisterTrigger,
  enqueueRenderRevalidateTriggers
} from '../actors/renderactor.js';
import { validatestageflow } from '../typesystem.js';
import {
  enqueueExecutionPipelineLoaded, enqueueExecutionStageState,
  enqueueExecutionSubmit, enqueueExecutionSubmitStage, enqueueExecutionAwaitTask,
  enqueueExecutionEnvUpdated, enqueueExecutionRecover, enqueueExecutionGetStatus,
  enqueueExecutionStopStage, enqueueExecutionCancelStage, enqueueExecutionBreakStage,
  enqueueExecutionRestartStage, enqueueExecutionContinueStage, enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus, enqueueExecutionCancelTask, enqueueExecutionStopTask,
  enqueueExecutionSpawnPipeline, enqueueExecutionRegisterPipeline
} from '../actors/executionactor.js';
import {
  enqueueHypervisorRegisterPipeline,
  enqueueHypervisorUnregisterPipeline,
  enqueueHypervisorSetEnv,
  enqueueHypervisorGetEnv,
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
      SPAWN: 'spawn', IO: 'io', DOMQUERY: 'domquery', CRYPTO: 'crypto',
      WAIT: 'wait', EXECUTIONQUERY: 'executionquery', STOREQUERY: 'storequery'
    }),
    INHERITEDKEYS: Object.freeze(['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents'])
  });
}

function createBlockCompilerLogger() {
  var constants = createVerbosityConstants();
  var fns = createVerbosityFunctions(constants);
  var state = Object.freeze({ level: constants.DEBUG });
  return {
    debug: function() { fns.logdebug.apply(null, [state].concat(Array.prototype.slice.call(arguments))); },
    warn: function() { fns.logwarn.apply(null, [state].concat(Array.prototype.slice.call(arguments))); },
    info: function() { fns.loginfo.apply(null, [state].concat(Array.prototype.slice.call(arguments))); }
  };
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

function compilepathaccessor(pathstr) {
  if (typeof pathstr !== 'string') {
    return function() { return pathstr; };
  }
  var parts = pathstr.split('.').reduce(function(acc, p) {
    var sub = p.split(/[\[\]]/).filter(Boolean).map(function(k) { return k.replace(/['"]/g, ''); });
    return acc.concat(sub);
  }, []);
  return function(env) {
    return parts.reduce(function(curr, key) { return (curr != null ? curr[key] : undefined); }, env);
  };
}

function buildproperties(merged, inherited) {
  if (inherited === undefined) inherited = {};
  return Object.keys(merged).reduce(function(result, key) {
    if (key !== 'fn') result[key] = merged[key];
    return result;
  }, cloneObject(inherited));
}

function buildBlockProperties(merged, inherited, sig, env) {
  if (inherited === undefined) inherited = {};
  if (sig === undefined) sig = { inputs: [], outputs: {} };
  if (env === undefined) env = {};

  var properties = buildproperties(merged, inherited);
  var inputsObj = {};

  (sig.inputs || []).forEach(function(name) {
    inputsObj[name] = compilepathaccessor(name)(env);
  });

  properties.inputs = inputsObj;
  properties.outputs = sig.outputs || {};

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

function createPersistentElementWrapper(compiledElement, elementDef, stagePath, pipelineId) {
  var elementId = elementDef.id || compiledElement.id || 'element_unknown';

  function wrapper(env) {
    var path = stagePath.concat([elementId]);
    return enqueueExecutionEnvUpdated(pipelineId, sanitizeEnv(env)).catch(function(err) {
      console.warn('[BLOCKCOMPILER] pre-env checkpoint failed:', err);
    }).then(function() {
      var executor = function(executionContext) {
        var execEnv = executionContext.env || env;
        return compiledElement(execEnv);
      };

      var inputargs = (elementDef && elementDef.signature && elementDef.signature.inputs
        ? elementDef.signature.inputs
        : []
      ).map(function(inp) { return compilepathaccessor(inp)(env); });

      var closureSerialized = null;
      if (typeof compiledElement === 'function') {
        closureSerialized = serializeSelfContainedClosure(compiledElement, inputargs, env);
      }

      return enqueueExecutionSubmit({
        pipelineid: pipelineId,
        path: path,
        elementid: elementId,
        env: env,
        signature: {
          inputs: elementDef && elementDef.signature && elementDef.signature.inputs ? elementDef.signature.inputs : [],
          outputs: elementDef && elementDef.signature && elementDef.signature.outputs ? elementDef.signature.outputs : {}
        },
        executor: executor,
        properties: elementDef || {},
        serialized: closureSerialized,
        origin: compiledElement.origin || null,
        programRef: null,
        elementId: elementId
      }).then(function(submitted) {
        return enqueueExecutionAwaitTask(submitted.taskid);
      });
    });
  }

  wrapper.id = elementId;
  wrapper.kind = 'element';

  if (compiledElement.blockmeta) {
    wrapper.blockmeta = compiledElement.blockmeta;
  }

  return wrapper;
}

function writeoutputs(sig, env, result) {
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
      outputs: block.signature && block.signature.outputs ? block.signature.outputs : {},
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
      if (block.fn.toString().indexOf('document.') !== -1 || /\bstyle\s*[.]/i.test(block.fn.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors = errors.concat(validaterevivablefunctionblock(block, BLOCKTYPES, dnaConstants));
    }
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.signature && block.signature.outputs ? block.signature.outputs : {}, contracts: [] };
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
    return { valid: errors.length === 0, errors: errors, warnings: [], dependencies: [], outputs: block.signature && block.signature.outputs ? block.signature.outputs : {}, contracts: [] };
  };

  analyzers[BLOCKTYPES.SPAWN] = createBlockAnalyzer([
    { field: 'dna', required: false, message: 'spawn block must have dna or dnaref', custom: function(v, b) { return v !== undefined || b.dnaref !== undefined; } }
  ]);

  analyzers[BLOCKTYPES.IO] = createBlockAnalyzer([
    { field: 'ref', required: true, type: 'function', message: 'io block ref must be a function' }
  ]);

  analyzers[BLOCKTYPES.DOMQUERY] = function(block) {
    var valid = Boolean(block.command && block.command.COMMAND);
    return { valid: valid, errors: valid ? [] : ['domquery block requires command.COMMAND'], warnings: [], dependencies: [], outputs: block.signature && block.signature.outputs ? block.signature.outputs : {}, contracts: [] };
  };

  analyzers[BLOCKTYPES.CRYPTO] = createBlockAnalyzer([
    { field: 'outputs', required: true, message: 'crypto block must have signature.outputs', custom: function(v, b) { return Object.keys(b.signature && b.signature.outputs ? b.signature.outputs : {}).length > 0; } }
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

function compileHttpBlock(merged, id, sig, isTextual) {
  var blockfn = async function(env) {
    var label = (isTextual ? 'fetch' : 'api') + ':' + (merged.endpoint || id);
    var inputaccessors = (sig.inputs || []).map(compilepathaccessor);
    var inputdata = {};
    (sig.inputs || []).forEach(function(inp, idx) { inputdata[inp] = inputaccessors[idx](env); });

    var endpoint = merged.endpoint;
    if (typeof merged.endpoint === 'string' && /[\.\[\]]/.test(merged.endpoint)) {
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
    if (merged.mapping && merged.mapping.response) result = buildResponse(merged.mapping.response, rawresult);
    var outputkeys = Object.keys(sig.outputs || {});
    if (outputkeys.length === 1) env[outputkeys[0]] = result;
    else if (typeof result === 'object' && result) {
      outputkeys.forEach(function(key) { if (result[key] !== undefined) env[key] = result[key]; });
    }
  };
  blockfn.id = id;
  return blockfn;
}

function createBlockCompilers(BLOCKTYPES, INHERITEDKEYS) {
  var compilers = {};

  compilers[BLOCKTYPES.FN] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    var blockfn = async function(env) {
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
      writeoutputs(sig, env, result);
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.API] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, false); };
  compilers[BLOCKTYPES.FETCH] = function(merged, id, sig) { return compileHttpBlock(merged, id, sig, true); };

  compilers[BLOCKTYPES.WRITER] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    var blockfn = async function(env) {
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
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.SPAWN] = function(merged, id, sig, inheritedProperties) {
    if (inheritedProperties === undefined) inheritedProperties = {};
    var blockfn = async function(env) {
      if (!merged.container) throw new Error('[SPAWN] missing container');
      return await callwithstack(
        EVALSTACK, 'spawn:' + (merged.ref || id), 'async-await',
        async function() {
          var dna = merged.dna || null;
          if (!dna && merged.dnaref && merged.dnaref.from === 'eventTarget') {
            var el = merged.dnaref.query ? env.eventtarget && env.eventtarget.closest(merged.dnaref.query) : env.eventtarget;
            var agentid = merged.dnaref.key || (el && el.getAttribute(merged.dnaref.attr));
            var foundAgent = null;
            if (env.agents) {
              for (var i = 0; i < env.agents.length; i++) if (env.agents[i].id === agentid) { foundAgent = env.agents[i]; break; }
            }
            if (foundAgent && foundAgent.pipeline) dna = foundAgent.pipeline;
            else if (env.rituals) {
              for (var j = 0; j < env.rituals.length; j++) if (env.rituals[j].id === agentid && env.rituals[j].pipeline) { dna = env.rituals[j].pipeline; break; }
            }
          }
          if (!dna) throw new Error('[spawn] no dna');
          var inheritedenv = {};
          if (merged.sharestack) {
            INHERITEDKEYS.forEach(function(key) { if (env[key] !== undefined) inheritedenv[key] = env[key]; });
          }
          var inheritedbriefcase = merged.sharebriefcase ? inheritedProperties : {};
          return { dna: dna, containerref: merged.container, inheritedenv: inheritedenv, inheritedbriefcase: inheritedbriefcase, outputkey: Object.keys(sig.outputs || {})[0] || null };
        },
        [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'spawn') }
      );
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.IO] = function(merged, id, sig) {
    var blockfn = async function(env) {
      var io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      var inputdata = {};
      (sig.inputs || []).forEach(function(inp) { inputdata[inp] = compilepathaccessor(inp)(env); });
      return await callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', async function(e) { return await io(inputdata, e); }, [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.DOMQUERY] = function(merged, id, sig) {
    var blockfn = async function(env) {
      var cmd = merged.command && merged.command.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      var props = merged.command.properties || {};

      if (cmd === 'getviewport') return writeoutputs(sig, env, await enqueuegetviewport());
      if (cmd === 'getscreen') return writeoutputs(sig, env, await enqueuegetscreen());
      if (cmd === 'matchmedia') return writeoutputs(sig, env, await enqueuematchmedia(props.query));

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
            if (cmd === 'toggleclass') return await handler(props.id, props.classname != null ? props.classname : props.value, props.force);
            var val = sig.inputs && sig.inputs.length > 0 ? compilepathaccessor(props.value)(env) : props.value;
            return await handler(props.id, val);
          }
          return await handler(props.id);
        },
        [env], { context: { env: env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + cmd) }
      );
      writeoutputs(sig, env, result);
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
        case 'stop': await enqueueExecutionStopStage(args.pipelineid, args.stageid); return;
        case 'cancel': await enqueueExecutionCancelStage(args.pipelineid, args.stageid); return;
        case 'break': await enqueueExecutionBreakStage(args.pipelineid, args.stageid); return;
        case 'restart': await enqueueExecutionRestartStage(args.pipelineid, args.stageid, args.elementid || null); return;
        case 'continue': await enqueueExecutionContinueStage(args.pipelineid, args.stageid); return;
        case 'recover': result = await enqueueExecutionRecover(); break;
        default: throw new Error('[executionquery] unknown command: ' + COMMAND);
      }
      writeoutputs(sig, env, { result: result });
    };
    blockfn.id = id;
    return blockfn;
  };

  compilers[BLOCKTYPES.STOREQUERY] = function(merged, id, sig) {
    var blockfn = async function() {
      throw new Error('[STOREQUERY] Block "' + id + '" is not implemented; cannot execute storequery.');
    };
    blockfn.id = id;
    return blockfn;
  };

  return Object.freeze(compilers);
}

function compileblock(block, inheritedBriefcase, constants) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var compiler = constants.COMPILERS[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.ANALYZERS[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockfn = compiler(block, block.id, block.signature || { inputs: [], outputs: {} }, inheritedBriefcase);
  return blockfn;
}

function compileElement(el, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, triggerRegistry) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  if (el.element === 'BLOCK') {
    var fn = compileblock(el, inheritedBriefcase, constants);
    fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace };
    fn.kind = 'element';
    return fn;
  }
  if (el.element === 'STAGE') {
    return compileNormalStageElement(el, pipelineId, resumeFrom, stagePath, inheritedBriefcase, constants, dnaConstants, triggerRegistry);
  }
  throw new Error('unknown element type: ' + el.element);
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

function compileStageChild(el, pipelineId, resumeFrom, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry) {
  if (el.element === 'BLOCK') {
    return createPersistentElementWrapper(compileElement(el, pipelineId, resumeFrom, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry), el, stagePath, pipelineId);
  }
  if (el.element === 'STAGE') {
    if (el.control && el.control.command === 'TRIGGER') {
      return compileTriggerStageElement(el, pipelineId, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry);
    }
    return compileNormalStageElement(el, pipelineId, resumeFrom, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry);
  }
  throw new Error('unknown element type: ' + el.element);
}

function compileNormalStageElement(stage, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, triggerRegistry) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var stageBriefcase = cloneObject(inheritedBriefcase);
  Object.keys(stage.briefcase || {}).forEach(function(key) { stageBriefcase[key] = stage.briefcase[key]; });

  var briefcaseErrors = validaterevivableobject(stageBriefcase, 'stage.' + stage.id + '.briefcase', dnaConstants);
  if (briefcaseErrors.length > 0) {
    throw new Error('[compileNormalStageElement] briefcase revivability failed: ' + briefcaseErrors.join(', '));
  }

  var stagePath = parentPath.concat([stage.id]);
  var children = (stage.elements || []).map(function(el) {
    return compileStageChild(el, pipelineId, resumeFrom, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry);
  });

  var isResumeStage = resumeFrom && resumeFrom.path && resumeFrom.path[0] === stage.id;
  var startIndex = isResumeStage ? Math.max(0, findIndex(stage.elements || [], function(el) { return el.id === resumeFrom.path[resumeFrom.path.length - 1]; })) : 0;

  var fn = stageRunner(stage, children, startIndex, pipelineId, isResumeStage, stagePath, resumeFrom, triggerRegistry);
  fn.id = stage.id;
  fn.kind = 'stage';

  var reads = [], writes = [];
  (stage.elements || []).filter(function(e) { return e.element === 'BLOCK'; }).forEach(function(e) {
    (e.reads || []).forEach(function(k) { if (reads.indexOf(k) === -1) reads.push(k); });
    (e.writes || []).forEach(function(k) { if (writes.indexOf(k) === -1) writes.push(k); });
  });

  fn.stagemeta = {
    async: stage.async === true,
    stageid: stage.id,
    reads: reads,
    writes: writes,
    snapshotKey: 'stage:' + stage.id,
    recoverable: true,
    notifyOnDone: stage.notifyOnDone === true,
    controlCommand: stage.control && stage.control.command ? stage.control.command : null,
    path: stagePath
  };

  return fn;
}

function compileTriggerStageElement(stage, pipelineId, parentPath, inheritedBriefcase, constants, dnaConstants, triggerRegistry) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};
  var stageBriefcase = cloneObject(inheritedBriefcase);
  Object.keys(stage.briefcase || {}).forEach(function(key) { stageBriefcase[key] = stage.briefcase[key]; });

  var stagePath = parentPath.concat([stage.id]);
  var children = (stage.elements || []).map(function(el) {
    return compileStageChild(el, pipelineId, null, stagePath, stageBriefcase, constants, dnaConstants, triggerRegistry);
  });

  return createTriggerRegistration(stage, children, pipelineId, stagePath);
}

function findIndex(arr, predicate) {
  for (var i = 0; i < arr.length; i++) if (predicate(arr[i], i)) return i;
  return -1;
}

function stageRunner(stage, children, startIndex, pipelineId, resumeStage, stagePath, triggerRegistry) {
  var control = stage.control;
  var id = stage.id;
  if (!control || !control.command) return defaultRunner(id, children, startIndex, pipelineId, stagePath);
  if (control.command === 'LOOP') return loopRunner(id, control, children, startIndex, pipelineId, stagePath);
  throw new Error('unknown stage command: ' + control.command);
}

function defaultRunner(id, children, startIndex, pipelineId, stagePath) {
  return async function(env) {
    var stageExecutor = async function(execEnv) {
      await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(function() {});
      var result = await executeChildren(children.slice(startIndex), execEnv, id, pipelineId, stagePath);
      return result.env || execEnv;
    };
    var submitted = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: stageExecutor, env: env });
    await enqueueExecutionAwaitTask(submitted.taskid);
  };
}

function loopRunner(id, control, children, startIndex, pipelineId, stagePath) {
  return async function(env) {
    var stageExecutor = async function(execEnv) {
      await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(function() {});
      var controlprops = {};
      Object.keys(control).forEach(function(k) { if (k !== 'fn' && k !== 'inputs' && k !== 'command') controlprops[k] = control[k]; });
      var inputaccessors = (control.inputs || []).map(compilepathaccessor);

      function runLoop(iteration, currentEnv) {
        if (!currentEnv.rngactive) return Promise.resolve(currentEnv);
        var childSlice = iteration === 0 ? children.slice(startIndex) : children;
        return executeChildren(childSlice, currentEnv, id, pipelineId, stagePath).then(function(result) {
          var newEnv = result.env || currentEnv;
          var fnargs = [controlprops].concat(inputaccessors.map(function(fn) { return fn(newEnv); }));
          return Promise.resolve(control.fn.apply(null, fnargs)).then(function(shouldContinue) {
            if (!shouldContinue) return newEnv;
            return runLoop(iteration + 1, newEnv);
          });
        });
      }

      return runLoop(0, execEnv);
    };
    var submitted = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: stageExecutor, env: env });
    await enqueueExecutionAwaitTask(submitted.taskid);
  };
}

function deepcloneevent(e) {
  if (!e) return {};
  var c = {};
  for (var k in e) if (typeof e[k] !== 'function') c[k] = e[k];
  return c;
}

function executeChildren(children, env, stageid, pipelineId, stagePath) {
  function collect(index, outputs) {
    if (index >= children.length) {
      if (env.stack && env.stack.agentspawned === stageid) {
        return Promise.resolve({ env: env, spawnOutputs: outputs });
      }
      return spawnAll(outputs, env, stageid);
    }
    var child = children[index];
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
      var nextOutputs = outputs;
      if (child.blockmeta && child.blockmeta.type === 'spawn' && result && result.dna) {
        nextOutputs = outputs.concat([{ dna: result.dna, containerref: result.containerref, inheritedenv: result.inheritedenv, inheritedbriefcase: result.inheritedbriefcase || {} }]);
      }
      return collect(index + 1, nextOutputs);
    }).catch(function(err) {
      err.message = 'child ' + (stageid || 'unnamed') + '/' + (child.id || 'unnamed') + ': ' + err.message;
      throw err;
    });
  }

  function spawnAll(outputs, currentEnv, stageId) {
    function spawnNext(i, currentOutputs, currentEnv) {
      if (i >= currentOutputs.length) {
        var newEnv = currentEnv;
        if (newEnv.stack) {
          var newStack = cloneObject(newEnv.stack);
          newStack.agentspawned = stageId;
          newEnv = cloneObject(newEnv);
          newEnv.stack = newStack;
        }
        return Promise.resolve({ env: newEnv, spawnOutputs: currentOutputs });
      }
      var so = currentOutputs[i];
      var childPipelineId = so.dna && so.dna.identity && so.dna.identity.id ? so.dna.identity.id : (so.containerref || 'child_pipeline');
      var childRunner = async function(agent) {
        var childCompiled = await compilepipeline(so.dna.pipeline, null, [], childPipelineId, { inheritedBriefcase: so.inheritedbriefcase || {} });
        await childCompiled.pipeline(agent);
      };
      var childEnv = cloneObject(so.inheritedenv || {});
      childEnv.containerid = so.containerref;
      childEnv.rngactive = true;
      childEnv.stack = {};
      childEnv.registersubscription = currentEnv.registersubscription;
      childEnv.updateworldmap = currentEnv.updateworldmap;
      childEnv.pipelineid = childPipelineId;
      return enqueueExecutionSpawnPipeline({
        parentPipelineId: currentEnv.pipelineid || currentEnv.agentid || 'unknown',
        childPipelineId: childPipelineId,
        childRunner: childRunner,
        childEnv: childEnv,
        containerref: so.containerref
      }).then(function(submitted) {
        return enqueueExecutionAwaitTask(submitted.taskid);
      }).then(function() {
        return spawnNext(i + 1, currentOutputs, currentEnv);
      });
    }
    return spawnNext(0, outputs, currentEnv);
  }

  return collect(0, []);
}

function compilePipelineElements(elements, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, triggerRegistry) {
  if (inheritedBriefcase === undefined) inheritedBriefcase = {};

  function loop(index, normalStages, triggerRegistrations) {
    if (index >= elements.length) {
      return { normalStages: normalStages, triggerRegistrations: triggerRegistrations };
    }

    var el = elements[index];
    if (el.element === 'STAGE' && el.control && el.control.command === 'TRIGGER') {
      triggerRegistrations.push(compileTriggerStageElement(el, pipelineId, parentPath, inheritedBriefcase, constants, dnaConstants, triggerRegistry));
    } else {
      normalStages.push(compileElement(el, pipelineId, resumeFrom, parentPath, inheritedBriefcase, constants, dnaConstants, triggerRegistry));
    }

    return loop(index + 1, normalStages, triggerRegistrations);
  }

  return loop(0, [], []);
}

function buildSpawnBootstrapMap(pipeline) {
  return (pipeline.elements || []).reduce(function(map, stage) {
    if (stage.element !== 'STAGE') return map;
    return (stage.elements || []).reduce(function(innerMap, el) {
      if (el.element === 'BLOCK' && el.type === 'spawn' && el.dna) {
        var childId = el.dna.identity && el.dna.identity.id ? el.dna.identity.id : (el.container || 'child_pipeline');
        innerMap[childId] = { dna: el.dna, containerref: el.container, stageid: stage.id };
      }
      return innerMap;
    }, map);
  }, {});
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

function runTrampoline(env, stages, pipelineId) {
  var logger = createBlockCompilerLogger();

  async function step(stack, currentEnv) {
    await waitForBootReady();

    if (stack.length === 0) return currentEnv;

    var nextStageId = stack[0];
    var stageIndex = findIndex(stages, function(s, idx) {
      return (s.id || s.stagemeta.stageid || ('stage_' + idx)) === nextStageId;
    });

    if (stageIndex === -1) {
      logger.debug('[PIPELINE] Stage not found, skipping:', nextStageId);
      return step(stack.slice(1), currentEnv);
    }

    var stage = stages[stageIndex];

    function continueWithStage() {
      return executeStageStep(stage, nextStageId, stack, currentEnv, pipelineId);
    }

    if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP' && stage.control.fn) {
      return Promise.resolve(stage.control.fn(currentEnv)).then(function(condition) {
        if (!condition) {
          logger.debug('[PIPELINE] Skipping stage:', nextStageId, 'control condition false');
          return step(stack.slice(1), currentEnv);
        }
        return continueWithStage();
      });
    }

    return continueWithStage();
  }

  async function executeStageStep(stage, nextStageId, stack, currentEnv, pipelineId) {
    await waitForBootReady();

    logger.debug('[PIPELINE] Executing stage:', nextStageId);

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
            return step(stack.slice(1), newEnv);
          });
      })
      .catch(function(err) {
        logger.info('[PIPELINE] Error at stage:', nextStageId);

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

  if (!env.executionStack) logger.debug('[RESTORE] pipeline-booting-fresh', { pipelineId: pipelineId });
  else logger.debug('[RESTORE] pipeline-resuming', { pipelineId: pipelineId, remainingStages: initialStack.length });

  return step(initialStack, env).then(function(finalEnv) {
    logger.debug('[RESTORE] pipeline-completed', { pipelineId: pipelineId });
    return finalEnv;
  });
}

async function executeStage(descriptor, env, activation, eventPayload) {
  if (!descriptor) throw new Error('[executeStage] missing stage descriptor');
  if (!env || typeof env !== 'object') env = {};

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
    descriptor.stagePath
  );

  return { env: result.env || env };
}

function createpipeline(stages, sinks, onprogress, options) {
  if (!Array.isArray(stages)) throw new Error('[PIPELINE] Stages must be an array.');
  var pipelineId = options.pipelineId || 'default_pipeline';

  return async function(agent) {
    var env = agent.env;
    if (!env || typeof env !== 'object') throw new Error('[PIPELINE] agent.env is required');

    env.agentid = agent.id;
    env.pipelineid = pipelineId;
    env._rerunStages = function() {
      return runTrampoline(env, stages, pipelineId);
    };

    enqueueHypervisorSetEnv(pipelineId, env).catch(function(err) {
      console.warn('[BLOCKCOMPILER] hypervisor env save failed:', err);
    });

    return runTrampoline(env, stages, pipelineId).then(function(finalEnv) {
      enqueueHypervisorUnregisterPipeline(pipelineId).catch(function(err) {
        console.warn('[BLOCKCOMPILER] hypervisor unregister failed:', err);
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

async function restorePipelineState(pipelineDefinition, pipelineId) {
  var active = await enqueueHypervisorGetActivePipelines().catch(function() { return []; });
  if (active.indexOf(pipelineId) === -1) {
    var freshCompiled = await compilepipeline(pipelineDefinition, null, [], pipelineId);
    return freshCompiled.pipeline({ id: pipelineId, env: { pipelineid: pipelineId } });
  }

  var env = await enqueueHypervisorGetEnv(pipelineId).catch(function() { return null; });
  if (!env || typeof env !== 'object') env = { pipelineid: pipelineId };

  var renderHtml = await enqueueHypervisorGetRenderHtml().catch(function() { return ''; });
  if (renderHtml) {
    await enqueueRenderRestoreBodyHtml(renderHtml).catch(function(err) {
      console.warn('[BLOCKCOMPILER] render restore failed:', err);
    });
  }

  await enqueueExecutionRecover().catch(function(err) {
    console.warn('[BLOCKCOMPILER] execution recover failed:', err);
  });

  var route = await enqueueHypervisorGetRoute('pipeline:' + pipelineId).catch(function() { return null; });
  var resumeFrom = buildResumeFromRoute(route);

  var compiled = await compilepipeline(
    pipelineDefinition,
    null,
    [],
    pipelineId,
    { inheritedBriefcase: env.briefcase || {}, resumeFrom: resumeFrom }
  );

  return compiled.pipeline({ id: pipelineId, env: env, resumeFrom: resumeFrom });
}

function attachPipelineListeners(pipelineId, triggerRegistrations) {
  console.log('[BLOCKCOMPILER] listeners attached for pipeline:', pipelineId, triggerRegistrations.length || 0);
}

async function compilepipeline(pipeline, accessors, sinks, pipelineIdOverride, options) {
  if (pipelineIdOverride === undefined) pipelineIdOverride = null;
  if (options === undefined) options = {};
  if (!pipeline.elements) throw new Error('[compilepipeline] pipeline must have elements array');

  var constants = createBlockCompilerConstants();
  var BLOCKTYPES = constants.BLOCKTYPES;
  var INHERITEDKEYS = constants.INHERITEDKEYS;
  var dnaConstants = createDnaSerializerConstants();
  var ANALYZERS = createBlockAnalyzers(BLOCKTYPES, dnaConstants);
  var COMPILERS = createBlockCompilers(BLOCKTYPES, INHERITEDKEYS);
  var compilerConstants = {
    BLOCKTYPES: BLOCKTYPES,
    INHERITEDKEYS: INHERITEDKEYS,
    ANALYZERS: ANALYZERS,
    COMPILERS: COMPILERS
  };
  var triggerRegistry = null;

  var pipelineId = pipelineIdOverride || pipeline.id || (pipeline.identity && pipeline.identity.id) || 'default_pipeline';

  var pipelineBriefcase = Object.keys(pipeline.briefcase || {}).reduce(function(acc, key) {
    acc[key] = pipeline.briefcase[key];
    return acc;
  }, cloneObject(options.inheritedBriefcase || {}));

  var briefcaseErrors = validaterevivableobject(pipelineBriefcase, 'pipeline.briefcase', dnaConstants);
  if (briefcaseErrors.length > 0) {
    throw new Error('[compilepipeline] briefcase revivability failed: ' + briefcaseErrors.join(', '));
  }

  var rawStages = (pipeline.elements || []).filter(function(el) { return el.element === 'STAGE'; }).map(function(el) {
    return { id: el.id, control: el.control || null, blocks: (el.elements || []).filter(function(e) { return e.element === 'BLOCK'; }) };
  });

  var contracts = validatestageflow(rawStages);
  var unresolved = contracts.filter(function(c) { return !c.resolved; });
  if (unresolved.length > 0) {
    throw new Error('[compilepipeline] Unresolved stage dependencies: ' + unresolved.map(function(c) { return c.stageid + ': missing ' + c.missingkeys.join(', '); }).join('; '));
  }

  var logger = createBlockCompilerLogger();

  await enqueueExecutionPipelineLoaded(pipelineId, {}).catch(function(err) { logger.warn('[compilepipeline] pipeline loaded failed:', err); });
  await enqueueHypervisorRegisterPipeline(pipelineId).catch(function(err) { logger.warn('[compilepipeline] hypervisor register failed:', err); });
  await enqueueExecutionRegisterPipeline(pipelineId, null, {}).catch(function(err) { logger.warn('[compilepipeline] register pipeline failed:', err); });

  var spawnBootstrapMap = buildSpawnBootstrapMap(pipeline);
  var resumeFrom = options.resumeFrom || null;

  var split = compilePipelineElements(
    pipeline.elements,
    pipelineId,
    resumeFrom,
    [],
    pipelineBriefcase,
    compilerConstants,
    dnaConstants,
    triggerRegistry
  );

  var normalStages = split.normalStages;
  var triggerRegistrations = split.triggerRegistrations;

  for (var i = 0; i < triggerRegistrations.length; i++) {
    var reg = triggerRegistrations[i];

    logger.debug('[compilepipeline] registering trigger', reg.stageId, reg.sourceid, reg.event);

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
      logger.warn('[compilepipeline] hypervisor stage descriptor failed:', err);
    });

    await callwithstack(
      EVALSTACK,
      'render-register:' + reg.stageId,
      'async-await',
      function() {
        return enqueueRenderRegisterTrigger(reg);
      },
      [],
      { context: { env: {} }, capturecontinuation: true, errk: createerrorcontext('renderRegister', 'trigger') }
    ).catch(function(err) {
      logger.warn('[compilepipeline] trigger registration failed:', err);
    });
  }

  var compiledpipeline = createpipeline(normalStages, sinks, undefined, { pipelineId: pipelineId });

  return {
    pipeline: compiledpipeline,
    pipelineId: pipelineId,
    spawnBootstrapMap: spawnBootstrapMap,
    triggerRegistrations: triggerRegistrations
  };
}

export {
  compilepipeline,
  createBlockCompilerConstants,
  createBlockAnalyzers,
  createBlockCompilers,
  executeStage,
  restorePipelineState,
  attachPipelineListeners
};
