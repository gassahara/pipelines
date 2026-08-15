import { enqueueapi } from '../actors/apiactor.js';
import { callwithstack } from './callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import {
  enqueuehtml,
  expectelement,
  enqueuegethtml,
  enqueuegetvalue,
  enqueuegetstyle,
  enqueuegetposition,
  enqueuesethtml,
  enqueuesetposition,
  enqueuesetstyle,
  enqueuesetvalue,
  enqueueproperty,
  enqueuegetlayout,
  enqueusetlayout,
  enqueuetoggleclass,
  DOMQUERYGETTERS,
  DOMQUERYSETTERS,
  DOMQUERYMESSAGES,
  RENDERACTOR,
  MESSAGETYPES,
  enqueuegetviewport,
  enqueuegetscreen,
  enqueuematchmedia,
  enqueueRenderSnapshot
} from '../actors/renderactor.js';
import { logwarn, logdebug, loginfo } from '../verbosity.js';
import { registerTrigger } from '../actors/trigerregistry.js';
import { validatestageflow } from '../typesystem.js';
import {
  enqueueExecutionPipelineLoaded,
  enqueueExecutionStageState,
  enqueueExecutionSubmit,
  enqueueExecutionSubmitStage,
  enqueueExecutionAwaitTask,
  enqueueExecutionEnvUpdated,
  enqueueExecutionRecover,
  enqueueExecutionGetStatus,
  enqueueExecutionStopStage,
  enqueueExecutionCancelStage,
  enqueueExecutionBreakStage,
  enqueueExecutionRestartStage,
  enqueueExecutionContinueStage,
  enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus,
  enqueueExecutionCancelTask,
  enqueueExecutionStopTask,
  enqueueExecutionSpawnPipeline
} from '../actors/executionactor.js';

const BLOCKTYPES = Object.freeze({
  FN: 'fn',
  API: 'api',
  FETCH: 'fetch',
  WRITER: 'writer',
  SPAWN: 'spawn',
  IO: 'io',
  DOMQUERY: 'domquery',
  CRYPTO: 'crypto',
  WAIT: 'wait',
  EXECUTIONQUERY: 'executionquery',
  STOREQUERY: 'storequery'
});

const INHERITEDKEYS = [
  'authsessionaccesstoken',
  'currenttheme', 'themetokens', 'cssprefix',
  'agents'
];

const compilepathaccessor = (pathstr) => {
  const tokens = [];
  let current = '', inbracket = false;
  for (const ch of pathstr) {
    if (ch === '[') { if (current) { tokens.push(current); current = ''; } inbracket = true; }
    else if (ch === ']') { if (current) { tokens.push(current); current = ''; } inbracket = false; }
    else if (ch === '.' && !inbracket) { if (current) { tokens.push(current); current = ''; } }
    else current += ch;
  }
  if (current) tokens.push(current);
  let code = 'env';
  for (const t of tokens) code += /^\d+$/.test(t) ? '[' + t + ']' : '["' + t + '"]';
  return new Function('env', 'return ' + code + ';');
};

const buildproperties = (merged) => {
  const result = {};
  for (const key of Object.keys(merged)) {
    if (key !== 'fn') {
      result[key] = merged[key];
    }
  }
  return result;
};

const safeElementOutputs = (env, outputKeys = null) => {
  const out = {};
  const keys = outputKeys || Object.keys(env || {});
  for (const key of keys) {
    if (env[key] === undefined) continue;
    if (typeof env[key] === 'function') continue;
    if (typeof HTMLElement !== 'undefined' && env[key] instanceof HTMLElement) continue;
    if (typeof Node !== 'undefined' && env[key] instanceof Node) continue;
    if (typeof EventTarget !== 'undefined' && env[key] instanceof EventTarget) continue;
    try {
      const json = JSON.stringify(env[key]);
      if (json.length > 64 * 1024) {
        out[key] = '[large-value omitted]';
      } else {
        out[key] = JSON.parse(json);
      }
    } catch {
      out[key] = null;
    }
  }
  return out;
};

const safeFullEnv = (env) => {
  const out = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value === 'function') continue;
    if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) continue;
    if (typeof Node !== 'undefined' && value instanceof Node) continue;
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) continue;
    try {
      const json = JSON.stringify(value);
      if (json.length > 128 * 1024) {
        out[key] = '[large-value omitted]';
      } else {
        out[key] = JSON.parse(json);
      }
    } catch {
      out[key] = null;
    }
  }
  return out;
};

const createPersistentElementWrapper = (compiledElement, elementDef, stageId, pipelineId) => {
  const elementId = elementDef.id || compiledElement.id || 'element_unknown';
  const outputKeys = Object.keys(elementDef?.signature?.outputs || {});

  const wrapper = async (env) => {
    // Pre-execution env checkpoint.
    try {
      await enqueueExecutionEnvUpdated(pipelineId, safeFullEnv(env));
    } catch (err) {
      console.warn('[BLOCKCOMPILER] pre-env checkpoint failed:', err);
    }

    const executor = async (executionContext) => {
      const execEnv = executionContext.env || env;
      return await compiledElement(execEnv);
    };

    const { taskid } = await enqueueExecutionSubmit({
      pipelineid: pipelineId,
      stageid: stageId,
      elementid: elementId,
      env,
      signature: {
        inputs: elementDef?.signature?.inputs || [],
        outputs: elementDef?.signature?.outputs || {}
      },
      executor,
      properties: elementDef || {}
    });

    const result = await enqueueExecutionAwaitTask(taskid);

    if (elementDef.type === 'writer') {
      try {
        await enqueueRenderSnapshot();
      } catch (err) {
        console.warn('[BLOCKCOMPILER] render snapshot failed:', err);
      }
    }

    return result;
  };

  wrapper.id = elementId;
  return wrapper;
};

const writeoutputs = (sig, env, result) => {
  const patch = {};
  const outputkeys = Object.keys(sig.outputs);
  if (result === null || result === undefined) {
    for (const key of outputkeys) {
      throw new Error('block returned ' + result + ' but outputs expected keys: ' + outputkeys.join(', '));
    }
    return patch;
  }
  if (outputkeys.length === 1) {
    const key = outputkeys[0];
    const value = result[key] !== undefined ? result[key] : result;
    patch[key] = value;
    env[key] = value;
    return patch;
  }
  for (const key of outputkeys) {
    if (result[key] === undefined) {
      throw new Error('missing required output "' + key + '" from block result');
    }
    patch[key] = result[key];
    env[key] = result[key];
  }
  return patch;
};

const createerrorcontext = (id, stagetype) => {
  return (err) => {
    err.diagnostic = err.diagnostic || {};
    err.diagnostic.blockid = id;
    err.diagnostic.stagetype = stagetype;
    throw err;
  };
};

function createBlockAnalyzer(rules) {
    return (block) => {
        const errors = [];
        const warnings = [];
        for (const rule of rules) {
            const value = block[rule.field];
            if (rule.required && (value === undefined || value === null)) {
                errors.push(rule.message);
                continue;
            }
            if (value !== undefined && value !== null) {
                if (rule.type && typeof value !== rule.type) {
                    errors.push(rule.message + ' (expected ' + rule.type + ', got ' + typeof value + ')');
                }
                if (rule.custom && !rule.custom(value, block)) {
                    errors.push(rule.message);
                }
            }
        }
        return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
    };
}

function buildPayload(mappingobj, data) {
    const result = {};
    for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
        if (typeof mappingdef === 'function') {
            result[fieldkey] = mappingdef(data);
        } else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
            if (mappingdef.from !== undefined) {
                result[fieldkey] = data[mappingdef.from];
            } else {
                result[fieldkey] = buildPayload(mappingdef, data);
            }
        } else {
            result[fieldkey] = mappingdef;
        }
    }
    return result;
}

function buildResponse(mappingobj, raw) {
    const result = {};
    for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
        if (typeof mappingdef === 'function') {
            result[fieldkey] = mappingdef(raw);
        } else if (typeof mappingdef === 'object' && mappingdef !== null && mappingdef.from !== undefined) {
            result[fieldkey] = raw[mappingdef.from];
        } else if (typeof mappingdef === 'object' && mappingdef !== null) {
            result[fieldkey] = buildResponse(mappingdef, raw);
        } else {
            result[fieldkey] = raw[mappingdef];
        }
    }
    return result;
}

const BLOCKANALYZERS = {
  [BLOCKTYPES.FN]: (block) => {
    const errors = [];
    const warnings = [];
    if (!block.fn) errors.push('fn block must have a function');
    if (typeof block.fn === 'function') {
      const fnsrc = block.fn.toString();
      const DOMPATTERNS = /document\.(querySelector|getElementById|getElementsBy|createElement|innerHTML|classList|addEventListener|body|head|window)|\bstyle\s*[.]|window\.(document|location|navigator|addEventListener|inner|device)/i;
      if (DOMPATTERNS.test(fnsrc)) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
    }
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.API]: createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'api block must have an endpoint' },
    { field: 'method', required: true, message: 'api block must have a method field (GET or POST)', custom: (val) => val === 'GET' || val === 'POST' }
  ]),
  [BLOCKTYPES.FETCH]: createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'fetch block must have an endpoint' },
    { field: 'method', required: true, message: 'fetch block must have a method field (GET or POST)', custom: (val) => val === 'GET' || val === 'POST' }
  ]),
  [BLOCKTYPES.WRITER]: createBlockAnalyzer([
    { field: 'fn', required: false, message: 'writer block must have fn or ref', custom: (val, block) => typeof block.ref === 'function' || typeof val === 'function' }
  ]),
  [BLOCKTYPES.SPAWN]: createBlockAnalyzer([
    { field: 'dna', required: false, message: 'spawn block must have dna or dnaref', custom: (val, block) => val !== undefined || block.dnaref !== undefined }
  ]),
  [BLOCKTYPES.IO]: createBlockAnalyzer([
    { field: 'ref', required: true, type: 'function', message: 'io block ref must be a function' }
  ]),
  [BLOCKTYPES.DOMQUERY]: (block) => {
    const errors = [];
    const warnings = [];
    if (!block.command || !block.command.COMMAND) errors.push('domquery block requires command with COMMAND');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.CRYPTO]: createBlockAnalyzer([
    { field: 'outputs', required: true, message: 'crypto block must have signature.outputs[0]', custom: (val, block) => Object.keys(block.signature?.outputs || {}).length > 0 }
  ]),
  [BLOCKTYPES.WAIT]: createBlockAnalyzer([
    { field: 'ms', required: true, message: 'wait block must have ms' }
  ]),
  [BLOCKTYPES.EXECUTIONQUERY]: createBlockAnalyzer([
    { field: 'command', required: true, message: 'executionquery block must have command', custom: (val) => val && typeof val.COMMAND === 'string' }
  ]),
  [BLOCKTYPES.STOREQUERY]: createBlockAnalyzer([
    { field: 'command', required: true, message: 'storequery block must have command', custom: (val) => val && typeof val.COMMAND === 'string' }
  ])
};

// BLOCKCOMPILERS are unchanged from prior run except they now execute as element
// executors. They still produce async (env) => result closures.
const BLOCKCOMPILERS = {
    [BLOCKTYPES.FN]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing fn block:', id);
            const fn = merged.fn;
            if (!fn) throw new Error('fn block must have a function: ' + id);
            const label = 'fn:' + (merged.ref || id);
            const properties = buildproperties(merged);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const fnargs = [properties].concat(inputaccessors.map(fn => fn(env)));
            const result = await callwithstack(
                EVALSTACK, label, 'async-await',
                async (e) => {
                    const fnresult = await fn(...fnargs);
                    return fnresult || {};
                },
                [env],
                {
                    context: { env, pipestate: env.pipestate },
                    capturecontinuation: true,
                    errk: createerrorcontext(id, 'fn')
                }
            );
            writeoutputs(sig, env, result);
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.API]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing api block:', id);
            const label = 'api:' + (merged.endpoint || id);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputdata = {};
            for (let i = 0; i < sig.inputs.length; i++) {
                inputdata[sig.inputs[i]] = inputaccessors[i](env);
            }
            const apiendpoint = merged.endpoint;
            const payloadmapping = merged.mapping?.payload || {};
            const payload = buildPayload(payloadmapping, inputdata);
            for (const field of Object.keys(sig.outputs)) {
                if (payload[field] === undefined && inputdata[field] !== undefined) {
                    payload[field] = inputdata[field];
                }
            }
            const rawresult = await callwithstack(
                EVALSTACK, label, 'async-await',
                async () => {
                    const endpoint = env[apiendpoint] || apiendpoint;
                    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' });
                    return { status: apiresolve.status, data: apiresolve.data };
                },
                [],
                {
                    context: { env },
                    capturecontinuation: true,
                    errk: createerrorcontext(id, 'api:call')
                }
            );
            const responsemapping = merged.mapping?.response;
            let result = rawresult.data;
            if (responsemapping) result = buildResponse(responsemapping, rawresult);
            const patch = {};
            const apioutputkeys = Object.keys(sig.outputs);
            if (apioutputkeys.length === 1) patch[apioutputkeys[0]] = result;
            else if (typeof result === 'object') {
                for (const key of apioutputkeys) if (result[key] !== undefined) patch[key] = result[key];
            }
            for (const [k, v] of Object.entries(patch)) env[k] = v;
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.FETCH]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing fetch block:', id);
            const label = 'fetch:' + (merged.endpoint || id);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputdata = {};
            for (let i = 0; i < sig.inputs.length; i++) inputdata[sig.inputs[i]] = inputaccessors[i](env);
            const apiendpoint = merged.endpoint;
            const payloadmapping = merged.mapping?.payload || {};
            const payload = buildPayload(payloadmapping, inputdata);
            for (const field of Object.keys(sig.outputs)) if (payload[field] === undefined && inputdata[field] !== undefined) payload[field] = inputdata[field];
            const rawresult = await callwithstack(
                EVALSTACK, label, 'async-await',
                async () => {
                    const endpoint = env[apiendpoint] || apiendpoint;
                    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { textual: true, token: env.authsessionaccesstoken || '' });
                    return { status: apiresolve.status, data: apiresolve.data };
                },
                [], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'fetch:call') }
            );
            const responsemapping = merged.mapping?.response;
            let result = rawresult.data;
            if (responsemapping) result = buildResponse(responsemapping, rawresult);
            const patch = {};
            const apioutputkeys = Object.keys(sig.outputs);
            if (apioutputkeys.length === 1) patch[apioutputkeys[0]] = result;
            else if (typeof result === 'object') for (const key of apioutputkeys) if (result[key] !== undefined) patch[key] = result[key];
            for (const [k, v] of Object.entries(patch)) env[k] = v;
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.WRITER]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing writer block:', id);
            let fn = merged.fn;
            if (!fn && typeof merged.ref === 'function') fn = merged.ref;
            if (!fn) throw new Error('[WRITER] Block "' + id + '" failed property validation');
            const properties = buildproperties(merged);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputargs = inputaccessors.map(fn => fn(env));
            const result = await fn.apply(null, [properties].concat(inputargs));
            if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined || result.timeout === undefined) {
                throw new Error('[WRITER] Block "' + id + '" returned invalid result');
            }
            const html = result.html, elementid = result.id, timeout = result.timeout;
            let target = merged.targetlabel || env.approot;
            if (merged.targetlabel === null || merged.targetlabel === undefined) {
                if (env.approot === null || env.approot === undefined) throw new Error('[WRITER] missing targetlabel/approot');
                target = env.approot;
            } else target = merged.targetlabel;
            await enqueuehtml(target, html, !merged.replace);
            if (elementid && Object.keys(sig.outputs).length > 0) {
                const domref = await expectelement(elementid, timeout || 5000);
                env[Object.keys(sig.outputs)[0]] = result;
                env[elementid] = domref;
            }
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.SPAWN]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing spawn block:', id);
            const containerrefraw = merged.container;
            if (containerrefraw === null || containerrefraw === undefined) {
                throw new Error('[SPAWN] missing container');
            }
            const result = await callwithstack(
                EVALSTACK, 'spawn:' + (merged.ref || id), 'async-await',
                async (e) => {
                    let dna = merged.dna || null;
                    if (!dna && merged.dnaref) {
                        const dnapath = merged.dnaref;
                        if (dnapath.from === 'eventTarget') {
                            const target = env.eventtarget;
                            const el = dnapath.query ? target?.closest(dnapath.query) : target;
                            if (!el) return {};
                            const agentid = dnapath.key || el?.getAttribute(dnapath.attr);
                            const agents = env.agents || [], rituals = env.rituals || [];
                            const agentdef = agents.find(a => a.id === agentid);
                            dna = agentdef ? agentdef.pipeline : null;
                            if (!dna) {
                                const ritualdef = rituals.find(r => r.id === agentid);
                                dna = ritualdef ? ritualdef.pipeline : null;
                            }
                            if (!dna) return {};
                        }
                    }
                    if (!dna) throw new Error('[spawn] no dna');
                    const inheritedenv = {};
                    if (merged.sharestack) {
                        for (const key of INHERITEDKEYS) if (env[key] !== undefined) inheritedenv[key] = env[key];
                    }
                    return { dna, containerref: containerrefraw, inheritedenv, outputkey: Object.keys(sig.outputs)[0] || null };
                },
                [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'spawn') }
            );
            return result;
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.IO]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const io = typeof merged.ref === 'function' ? merged.ref : null;
            if (!io) throw new Error('io block "' + id + '" ref must be a function');
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputdata = {};
            for (let i = 0; i < sig.inputs.length; i++) inputdata[sig.inputs[i]] = inputaccessors[i](env);
            return await callwithstack(
                EVALSTACK, 'io:' + (merged.ref || id), 'async-await',
                async (e) => await io(inputdata, e),
                [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') }
            );
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.DOMQUERY]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const command = merged.command;
            if (!command || !command.COMMAND) throw new Error('[DOMQUERY] requires COMMAND');
            const messages = command.COMMAND;
            const getters = DOMQUERYGETTERS, setters = DOMQUERYSETTERS;
            const ALL = DOMQUERYMESSAGES.concat(['getviewport','getscreen','matchmedia']);
            if (!ALL.includes(messages)) throw new Error('[DOMQUERY] unknown COMMAND: ' + messages);
            const props = command.properties || {};
            if (messages === 'getviewport') { writeoutputs(sig, env, await enqueuegetviewport()); return; }
            if (messages === 'getscreen') { writeoutputs(sig, env, await enqueuegetscreen()); return; }
            if (messages === 'matchmedia') {
                if (!props.query) throw new Error('[DOMQUERY] matchmedia requires query');
                writeoutputs(sig, env, await enqueuematchmedia(props.query));
                return;
            }
            if (!props.id || typeof props.id !== 'string') throw new Error('[DOMQUERY] requires properties.id');
            const commandid = props.id;
            if (setters.includes(messages) && messages !== 'toggleclass' && props.value === undefined) {
                throw new Error('[DOMQUERY] setter requires value');
            }
            if (messages === 'toggleclass' && !props.classname) throw new Error('[DOMQUERY] toggleclass requires classname');
            const handlerMap = {
                gethtml: enqueuegethtml, getvalue: enqueuegetvalue, getstyle: enqueuegetstyle,
                getposition: enqueuegetposition, getlayout: enqueuegetlayout,
                sethtml: enqueuesethtml, setposition: enqueuesetposition, setstyle: enqueuesetstyle,
                setvalue: enqueuesetvalue, setlayout: enqueusetlayout, toggleclass: enqueuetoggleclass,
                property: enqueueproperty
            };
            const handler = handlerMap[messages];
            const result = await callwithstack(
                EVALSTACK, 'domquery:' + messages, 'async-await',
                async (e) => {
                    if (setters.includes(messages)) {
                        if (messages === 'toggleclass') return await handler(commandid, props.classname, props.force);
                        const resolvedvalue = props.value;
                        if (sig.inputs && sig.inputs.length > 0) return await handler(commandid, compilepathaccessor(props.value)(env));
                        return await handler(commandid, resolvedvalue);
                    }
                    return await handler(commandid);
                },
                [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + messages) }
            );
            writeoutputs(sig, env, result);
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.CRYPTO]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const bytes = merged.bytes || 512;
            const outputkey = Object.keys(sig.outputs)[0];
            if (!outputkey) throw new Error('[crypto] requires outputs');
            const result = await new Promise((resolve, reject) => {
                RENDERACTOR.send({ type: MESSAGETYPES.CRYPTO, bytes, resolve, reject });
            });
            env[outputkey] = result;
            return {};
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.WAIT]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
            if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
            await new Promise(resolve => setTimeout(resolve, ms));
            return {};
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.EXECUTIONQUERY]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const command = merged.command;
            const args = command.args || {};
            switch (command.COMMAND) {
                case 'get': {
                    const result = await enqueueExecutionGetStatus(args.pipelineid || env.pipelineid || null);
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'tasks': {
                    const result = await enqueueExecutionGetTasks({
                        pipelineid: args.pipelineid,
                        stageid: args.stageid,
                        elementid: args.elementid,
                        kind: args.kind
                    });
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'task_status': {
                    const result = await enqueueExecutionGetTaskStatus(args.taskid);
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'await_task': {
                    const result = await enqueueExecutionAwaitTask(args.taskid);
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'cancel_task': {
                    await enqueueExecutionCancelTask(args.taskid);
                    break;
                }
                case 'stop_task': {
                    await enqueueExecutionStopTask(args.taskid);
                    break;
                }
                case 'stop': await enqueueExecutionStopStage(args.pipelineid, args.stageid); break;
                case 'cancel': await enqueueExecutionCancelStage(args.pipelineid, args.stageid); break;
                case 'break': await enqueueExecutionBreakStage(args.pipelineid, args.stageid); break;
                case 'restart': await enqueueExecutionRestartStage(args.pipelineid, args.stageid, args.elementid || null); break;
                case 'continue': await enqueueExecutionContinueStage(args.pipelineid, args.stageid); break;
                case 'recover': {
                    const result = await enqueueExecutionRecover(args.pipelineid || env.pipelineid || null);
                    writeoutputs(sig, env, { result });
                    break;
                }
                default: throw new Error('[executionquery] unknown command: ' + command.COMMAND);
            }
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.STOREQUERY]: (merged, id, sig) => {
        const blockfn = async (env) => {
            // Future custom store blocks. Framework state is actor-owned.
        };
        blockfn.id = id;
        return blockfn;
    }
};

const compileElement = (el, pipelineId = 'default_pipeline', resumeFrom = null) => {
    if (el.element === 'BLOCK') return compileBlockElement(el);
    if (el.element === 'STAGE') return compileStageElement(el, pipelineId, resumeFrom);
    throw new Error('unknown element type: ' + el.element + ' on element id "' + (el.id || 'unnamed') + '"');
};

const compileBlockElement = (block) => {
    const fn = compileblock(block);
    fn.blockmeta = { id: block.id, type: block.type, ref: block.ref, replace: block.replace };
    return fn;
};

const compileStageElement = (stage, pipelineId = 'default_pipeline', resumeFrom = null) => {
    const children = (stage.elements || []).map(el => {
        const compiled = compileElement(el, pipelineId, resumeFrom);
        return createPersistentElementWrapper(compiled, el, stage.id, pipelineId);
    });

    let startIndex = 0;
    if (resumeFrom && resumeFrom.stageId === stage.id) {
        startIndex = (stage.elements || []).findIndex(el => el.id === resumeFrom.elementId);
        if (startIndex < 0) startIndex = 0;
    }

    const isResumeStage = resumeFrom && resumeFrom.stageId === stage.id;
    const fn = stageRunner(stage, children, startIndex, pipelineId, isResumeStage);
    fn.id = stage.id;

    const reads = new Set();
    const writes = new Set();
    for (const el of stage.elements || []) {
        if (el.element === 'BLOCK') {
            (el.reads || []).forEach(k => reads.add(k));
            (el.writes || []).forEach(k => writes.add(k));
        }
    }

    fn.stagemeta = {
        async: stage.async === true,
        stageid: stage.id,
        reads: [...reads],
        writes: [...writes],
        snapshotKey: 'stage:' + stage.id,
        recoverable: true,
        notifyOnDone: stage.notifyOnDone === true,
        startElementId: isResumeStage ? resumeFrom.elementId : null,
        controlCommand: stage.control?.command || null
    };
    return fn;
};

const stageRunner = (stage, children, startIndex = 0, pipelineId = 'default_pipeline', resumeStage = false) => {
    const control = stage.control;
    const id = stage.id;
    if (!control || control.command === undefined || control.command === null) {
        return defaultRunner(id, children, startIndex, pipelineId);
    }
    if (control.command === 'TRIGGER') {
        return triggerRunner(id, control, children, stage, pipelineId, startIndex, resumeStage);
    }
    if (control.command === 'LOOP') {
        return loopRunner(id, control, children, startIndex, pipelineId);
    }
    throw new Error('unknown stage command: ' + control.command);
};

const defaultRunner = (id, children, startIndex = 0, pipelineId = 'default_pipeline') => {
    return async (env) => {
        const stageExecutor = async (execEnv) => {
            const elementIds = children.map(ch => ch.id || 'unknown');
            const elements = {};
            for (const elementId of elementIds) elements[elementId] = { status: 'WAITING', savedAt: Date.now() };

            try {
                await enqueueExecutionStageState(pipelineId, id, { status: 'running', elements });
            } catch (err) {
                console.warn('[DEFAULT] stage state failed:', err);
            }

            await executeChildren(children.slice(startIndex), execEnv, id);
        };

        const { taskid } = await enqueueExecutionSubmitStage({
            pipelineid: pipelineId,
            stageid: id,
            stageExecutor,
            env
        });

        await enqueueExecutionAwaitTask(taskid);
    };
};

const loopRunner = (id, control, children, startIndex = 0, pipelineId = 'default_pipeline') => {
    return async (env) => {
        const stageExecutor = async (execEnv) => {
            const elementIds = children.map(ch => ch.id || 'unknown');
            const elements = {};
            for (const elementId of elementIds) elements[elementId] = { status: 'WAITING', savedAt: Date.now() };

            try {
                await enqueueExecutionStageState(pipelineId, id, { status: 'running', elements });
            } catch (err) {
                console.warn('[LOOP] stage state failed:', err);
            }

            const controlprops = {};
            for (const key of Object.keys(control)) {
                if (key !== 'fn' && key !== 'inputs' && key !== 'command') controlprops[key] = control[key];
            }
            const inputaccessors = (control.inputs || []).map(k => compilepathaccessor(k));
            let first = true;
            while (true) {
                if (!execEnv.rngactive) break;
                const slice = first ? children.slice(startIndex) : children;
                await executeChildren(slice, execEnv, id);
                first = false;
                const inputargs = inputaccessors.map(fn => fn(execEnv));
                const fnargs = [controlprops].concat(inputargs);
                const shouldcontinue = await control.fn(...fnargs);
                if (!shouldcontinue) break;
            }
        };

        const { taskid } = await enqueueExecutionSubmitStage({
            pipelineid: pipelineId,
            stageid: id,
            stageExecutor,
            env
        });

        await enqueueExecutionAwaitTask(taskid);
    };
};

const triggerRunner = (id, control, children, stage, pipelineId, startIndex = 0, resumeStage = false) => {
    return async (env) => {
        const sourceref = env[control.sourceid];
        const eventtype = control.event;
        const rs = env.registersubscription;
        if (!control.sourceid || !eventtype || !rs) {
            logwarn('[control:TRIGGER] missing source/event/registersubscription for stage:', id);
            return {};
        }

        const runTriggerStage = async (execEnv, slice) => {
            const elementIds = children.map(ch => ch.id || 'unknown');
            const elements = {};
            for (const elementId of elementIds) elements[elementId] = { status: 'WAITING', savedAt: Date.now() };

            try {
                await enqueueExecutionStageState(pipelineId, id, { status: 'running', elements });
            } catch (err) {
                console.warn('[TRIGGER] stage state failed:', err);
            }

            await executeChildren(slice, execEnv, id);
        };

        const handler = async (e) => {
            env.eventtarget = e.target;
            if (stage.output !== null && stage.output !== undefined) {
                env[stage.output] = deepcloneevent(e);
            }

            const { taskid } = await enqueueExecutionSubmitStage({
                pipelineid: pipelineId,
                stageid: id,
                stageExecutor: (execEnv) => runTriggerStage(execEnv, children),
                env
            });
            await enqueueExecutionAwaitTask(taskid);

            if (control.rerunfrom !== undefined && typeof env._rerunStages === 'function') {
                await env._rerunStages(control.rerunfrom);
            }
        };

        rs(control.sourceid, eventtype, handler);
        registerTrigger(control.sourceid, eventtype, handler);

        // If this trigger stage is the interrupted resume target, finish it now.
        if (resumeStage) {
            const remaining = startIndex > 0 ? children.slice(startIndex) : children;
            const { taskid } = await enqueueExecutionSubmitStage({
                pipelineid: pipelineId,
                stageid: id,
                stageExecutor: (execEnv) => runTriggerStage(execEnv, remaining),
                env
            });
            await enqueueExecutionAwaitTask(taskid);
        }

        return {};
    };
};

const executeChildren = async (children, env, stageid) => {
    const spawnOutputs = [];
    for (const child of children) {
        try {
            const result = await child(env);
            if (result && result.dna) {
                spawnOutputs.push({
                    dna: result.dna,
                    containerref: result.containerref,
                    inheritedenv: result.inheritedenv
                });
            }
        } catch (err) {
            err.message = 'child ' + (stageid || 'unnamed') + '/' + (child.id || 'unnamed') + ': ' + err.message;
            throw err;
        }
    }

    if (env.stack && env.stack.agentspawned === stageid) return spawnOutputs;

    for (const so of spawnOutputs) {
        const childPipelineId = so.dna?.identity?.id || so.containerref || 'child_pipeline';

        const childRunner = async (agent) => {
            const childCompiled = await compilepipeline(so.dna.pipeline, null, [], childPipelineId);
            await childCompiled.pipeline(agent);
        };

        const { taskid } = await enqueueExecutionSpawnPipeline({
            parentPipelineId: env.pipelineid || env.agentid || 'unknown',
            childPipelineId,
            childRunner,
            childEnv: {
                ...so.inheritedenv,
                containerid: so.containerref,
                rngactive: true,
                stack: {},
                registersubscription: env.registersubscription,
                updateworldmap: env.updateworldmap,
                pipelineid: childPipelineId
            },
            containerref: so.containerref
        });

        await enqueueExecutionAwaitTask(taskid);
    }

    if (env.stack) env.stack.agentspawned = stageid;
    return spawnOutputs;
};

const compileElements = (elements, pipelineId = 'default_pipeline', resumeFrom = null) =>
    elements.map(el => compileElement(el, pipelineId, resumeFrom));

const compileblock = (merged) => {
    const id = merged.id || 'unnamed';
    const sig = merged.signature;
    if (!sig || !Array.isArray(sig.inputs)) {
        throw new Error('[SIGNATURE] Block "' + id + '" is missing required signature');
    }
    if (Array.isArray(sig.outputs)) {
        sig.outputs = sig.outputs.reduce((acc, k) => { acc[k] = 'any'; return acc; }, {});
    } else if (!sig.outputs || typeof sig.outputs !== 'object') {
        throw new Error('[SIGNATURE] Block "' + id + '" is missing required outputs');
    }
    const analyzer = BLOCKANALYZERS[merged.type];
    if (!analyzer) throw new Error('unknown block type: ' + merged.type + ' in block ' + id);
    const analysis = analyzer(merged);
    if (!analysis.valid) throw new Error(analysis.errors.join(', '));
    const compiler = BLOCKCOMPILERS[merged.type];
    return compiler(merged, id, sig);
};

const deepcloneevent = (e) => {
    if (!e) return null;
    return {
        type: e.type,
        timestamp: e.timeStamp,
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        defaultprevented: e.defaultPrevented,
        istrusted: e.isTrusted,
        eventphase: e.eventPhase,
        target: e.target ? {
            tagname: e.target.tagName,
            id: e.target.id,
            classname: e.target.className,
            name: e.target.name,
            value: e.target.value,
            type: e.target.type,
            checked: e.target.checked,
            href: e.target.href,
            src: e.target.src
        } : null,
        clientx: e.clientX,
        clienty: e.clientY,
        screenx: e.screenX,
        screeny: e.screenY,
        pagex: e.pageX,
        pagey: e.pageY,
        offsetx: e.offsetX,
        offsety: e.offsetY,
        movementx: e.movementX,
        movementy: e.movementY,
        button: e.button,
        buttons: e.buttons,
        key: e.key,
        code: e.code,
        location: e.location,
        repeat: e.repeat,
        iscomposing: e.isComposing,
        altkey: e.altKey,
        ctrlkey: e.ctrlKey,
        metakey: e.metaKey,
        shiftkey: e.shiftKey,
        data: e.data,
        inputtype: e.inputType,
        deltax: e.deltaX,
        deltay: e.deltaY,
        deltamode: e.deltaMode,
        touchescount: e.touches ? e.touches.length : 0
    };
};

const buildSpawnBootstrapMap = (pipeline) => {
    const map = {};
    for (const stage of pipeline.elements || []) {
        if (stage.element !== 'STAGE') continue;
        for (const el of stage.elements || []) {
            if (el.element === 'BLOCK' && el.type === 'spawn' && el.dna) {
                const childPipelineId = el.dna.identity?.id || el.container || 'child_pipeline';
                map[childPipelineId] = { dna: el.dna, containerref: el.container || null };
            }
        }
    }
    return map;
};

// Local pipeline runner — replaces deleted pipe.js.
const createpipeline = (stages, sinks = [], onprogress, options = {}) => {
  if (!Array.isArray(stages)) throw new Error('[PIPELINE] Stages must be an array.');

  const {
    resumeFrom = null,
    pipelineId = 'default_pipeline',
    restoredEnv = null
  } = options;

  const stageStack = [];

  const awaitPendingForReads = async (reads) => {
    const pending = stageStack.filter(entry =>
      entry.writes.some(k => reads.includes(k))
    );
    if (pending.length) {
      await Promise.all(pending.map(p => p.promise));
      for (const p of pending) {
        const idx = stageStack.indexOf(p);
        if (idx !== -1) stageStack.splice(idx, 1);
      }
    }
  };

  const runStage = async (stage, env, callerid, stageid) => {
    const meta = stage.stagemeta || {};
    const isAsync = meta.async === true;

    const reads = meta.reads || [];
    const writes = meta.writes || [];

    if (!isAsync) {
      try {
        await callwithstack(
          EVALSTACK,
          'stage-' + stageid + ':' + (stage.intent || 'unnamed'),
          'asyncawait',
          async () => {
            const patch = await stage(env);
            if (patch && typeof patch === 'object') {
              const updateworldmap = env.updateworldmap;
              if (updateworldmap) updateworldmap(patch);
            }
            return env;
          },
          [],
          {
            context: { env, pipestate: env.pipestate, callerid },
            errk: (err) => {
              err.diagnostic = err.diagnostic || {};
              err.diagnostic.pipelinestage = stageid;
              throw err;
            }
          }
        );
      } catch (err) {
        throw err;
      }
      return;
    }

    const promise = callwithstack(
      EVALSTACK,
      'stage-async-' + stageid + ':' + (stage.intent || 'unnamed'),
      'asyncawait',
      async () => {
        const patch = await stage(env);
        if (patch && typeof patch === 'object') {
          const updateworldmap = env.updateworldmap;
          if (updateworldmap) updateworldmap(patch);
        }
        return env;
      },
      [],
      {
        context: { env, pipestate: env.pipestate, callerid },
        errk: (err) => {
          err.diagnostic = err.diagnostic || {};
          err.diagnostic.pipelinestage = stageid;
          throw err;
        }
      }
    );

    stageStack.push({ promise, reads, writes, stageid });
  };

  const runAll = async (env, fromIndex = 0) => {
    if (restoredEnv && typeof restoredEnv === 'object') {
      for (const [key, value] of Object.entries(restoredEnv)) {
        if (!(key in env) || env[key] === undefined) env[key] = value;
      }
    }

    let resumeIndex = -1;
    if (resumeFrom && resumeFrom.stageId) {
      resumeIndex = stages.findIndex(s => (s.id || s.stagemeta?.stageid) === resumeFrom.stageId);
    }

    try {
      for (let idx = fromIndex; idx < stages.length; idx++) {
        const stage = stages[idx];
        const stageid = stage.id || stage.stagemeta?.stageid || ('stage_' + idx);

        if (resumeIndex !== -1 && idx < resumeIndex) continue;

        let pipelineStatus = null;
        try {
          pipelineStatus = await enqueueExecutionGetStatus(pipelineId);
        } catch (err) {}

        const savedStageStatus = pipelineStatus?.stages?.[stageid]?.status || null;
        if (savedStageStatus === 'cancelled') continue;
        if (savedStageStatus === 'stopped') continue;

        const callerid = env.agentid + ':' + stageid;
        const reads = stage.stagemeta?.reads || [];
        await awaitPendingForReads(reads);

        if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP') {
          if (stage.control.fn) {
            const shouldexecute = await stage.control.fn(env);
            if (!shouldexecute) continue;
          }
        }

        await runStage(stage, env, callerid, stageid);
      }

      if (stageStack.length) {
        await Promise.all(stageStack.map(p => p.promise));
        stageStack.length = 0;
      }
    } catch (err) {
      throw err;
    }
  };

  return async (agent) => {
    const env = agent.env;
    if (!env || typeof env !== 'object') throw new Error('[PIPELINE] agent.env is required');
    env.agentid = agent.id;
    env._rerunStages = (fromIndex) => runAll(env, fromIndex);
    await runAll(env);
    return env;
  };
};

export const compilepipeline = async (
  pipeline,
  accessors,
  sinks,
  pipelineIdOverride = null
) => {
  if (!pipeline.elements) throw new Error('[compilepipeline] pipeline must have elements array');

  const pipelineId = pipelineIdOverride || pipeline.id || pipeline.identity?.id || 'default_pipeline';

  const rawStages = [];
  for (const el of pipeline.elements) {
    if (el.element === 'STAGE') {
      rawStages.push({
        id: el.id,
        control: el.control || null,
        blocks: (el.elements || []).filter(e => e.element === 'BLOCK')
      });
    }
  }

  const contracts = validatestageflow(rawStages);
  const unresolved = contracts.filter(c => !c.resolved);
  if (unresolved.length > 0) {
    throw new Error('[compilepipeline] Unresolved stage key dependencies: ' +
      unresolved.map(c => c.stageid + ': missing ' + c.missingkeys.join(', ')).join('; '));
  }

  try {
    await enqueueExecutionPipelineLoaded(pipelineId, {});
  } catch (err) {
    console.warn('[compilepipeline] pipeline loaded event failed:', err);
  }

  let savedState = null;
  try {
    savedState = await enqueueExecutionRecover(pipelineId);
  } catch (err) {
    console.warn('[compilepipeline] execution recover failed:', err);
  }

  let resumeFrom = null;
  let restoredEnv = savedState?.env || null;

  if (savedState && savedState.stages) {
    outer:
    for (const stage of pipeline.elements) {
      if (stage.element !== 'STAGE') continue;
      const stageRecord = savedState.stages[stage.id];
      if (!stageRecord) continue;
      for (const el of stage.elements || []) {
        if (el.element !== 'BLOCK') continue;
        const elementState = stageRecord.elements?.[el.id];
        if (elementState && elementState.status === 'RUNNING') {
          resumeFrom = { stageId: stage.id, elementId: el.id };
          break outer;
        }
      }
    }
  }

  const spawnBootstrapMap = buildSpawnBootstrapMap(pipeline);

  const compiled = compileElements(pipeline.elements, pipelineId, resumeFrom);
  const compiledpipeline = createpipeline(compiled, sinks, undefined, {
    resumeFrom,
    pipelineId,
    restoredEnv
  });

  return {
    pipeline: compiledpipeline,
    resumeFrom,
    restoredEnv,
    pipelineId,
    spawnBootstrapMap
  };
};
