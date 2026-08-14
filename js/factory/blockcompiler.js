import { enqueueapi } from '../actors/apiactor.js';
import { createpipeline } from '../pipe.js';
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
  enqueuematchmedia
} from '../actors/renderactor.js';
import { logwarn, logdebug } from '../verbosity.js';
import { registerTrigger } from '../actors/trigerregistry.js';
import { validatestageflow } from '../typesystem.js';
import {
  enqueueExecutionStart,
  enqueueExecutionStop,
  enqueueExecutionRestart,
  enqueueExecutionContinue,
  enqueueExecutionSaveStatus,
  enqueueExecutionGet,
  enqueueExecutionSet
} from '../actors/executionactor.js';
import {
  enqueueDbStore,
  enqueueDbRestore
} from '../actors/dbactor.js';

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
  const mapKey = `pipeline:${pipelineId}:executionmap`;
  const htmlMapKey = `pipeline:${pipelineId}:htmlmap`;
  const outputKeys = Object.keys(elementDef?.signature?.outputs || {});

  const loadExecutionMap = async () => {
    try {
      const existing = await enqueueDbRestore(mapKey);
      if (existing && existing.stages) return existing;
    } catch (err) {
      console.warn('[PERSISTENCE] load execution map failed:', err);
    }
    return { pipelineId, stages: {} };
  };

  const captureOutputs = (env) => {
    const out = {};
    for (const key of outputKeys) {
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

  const storeElementState = async (status, extra = {}) => {
    try {
      const map = await loadExecutionMap();
      if (!map.stages[stageId]) {
        map.stages[stageId] = { elements: {} };
      }
      map.stages[stageId].elements[elementId] = {
        status,
        savedAt: Date.now(),
        ...extra
      };
      await enqueueDbStore(mapKey, map);
      return map.stages[stageId].elements[elementId];
    } catch (err) {
      console.warn('[PERSISTENCE] execution map store failed:', err);
      return null;
    }
  };

  const storeTargetHtml = async (targetId) => {
    if (!targetId || typeof document === 'undefined') return;

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    let htmlMap = { pipelineId, targets: {} };
    try {
      const existing = await enqueueDbRestore(htmlMapKey);
      if (existing && existing.targets) {
        htmlMap = existing;
      }
    } catch (err) {
      console.warn('[PERSISTENCE] load html map failed:', err);
    }

    htmlMap.targets[targetId] = targetEl.innerHTML;
    htmlMap.savedAt = Date.now();

    const htmlMapJson = JSON.stringify(htmlMap);
    if (htmlMapJson.length > 1024 * 1024) {
      console.warn('[PERSISTENCE] html map too large, skipping save:', htmlMapJson.length);
      return;
    }

    try {
      await enqueueDbStore(htmlMapKey, htmlMap);
    } catch (persistError) {
      console.warn('[PERSISTENCE] html map save failed:', persistError);
    }
  };

  return async (env) => {
    // Save pre-execution checkpoint BEFORE running element.
    await storeElementState('running', {
      startedAt: Date.now(),
      env: safeFullEnv(env)
    });

    try {
      const result = await compiledElement(env);

      const completedOutputs = captureOutputs(env);
      await storeElementState('completed', {
        completedAt: Date.now(),
        outputs: completedOutputs,
        env: safeFullEnv(env)
      });

      if (elementDef.type === 'writer') {
        const targetId = elementDef.targetlabel || env.approot;
        await storeTargetHtml(targetId);
      }

      try {
        await enqueueExecutionSaveStatus(elementId, 'completed', completedOutputs);
      } catch (persistError) {
        console.warn('[PERSISTENCE] execution actor save-status failed:', persistError);
      }

      return result;
    } catch (elementError) {
      // CCC handles failures. Do NOT persist failed state here.
      // Rethrow exact same error object.
      throw elementError;
    }
  };
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

// ---------- FC5: createBlockAnalyzer factory ----------
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

// ---------- FC6: Shared payload/response mapping helpers ----------
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
            logdebug({inputaccessors, inputdata, apiendpoint, payloadmapping});

            const payload = buildPayload(payloadmapping, inputdata);
            for (const field of Object.keys(sig.outputs)) {
                if (payload[field] === undefined && inputdata[field] !== undefined) {
                    payload[field] = inputdata[field];
                }
            }
            logdebug({payload});
            const rawresult = await callwithstack(
                EVALSTACK, label, 'async-await',
                async () => {
                    const endpoint = env[apiendpoint] || apiendpoint;
                    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' });
                    logdebug({apiendpoint, apiresolve, endpoint, enqueueapi}, merged.method, payload);
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
            if (responsemapping) {
                result = buildResponse(responsemapping, rawresult);
            }

            const patch = {};
            const apioutputkeys = Object.keys(sig.outputs);
            if (apioutputkeys.length === 1) {
                patch[apioutputkeys[0]] = result;
            } else if (typeof result === 'object') {
                for (const key of apioutputkeys) {
                    if (result[key] !== undefined) {
                        patch[key] = result[key];
                    }
                }
            }
            for (const [k, v] of Object.entries(patch)) {
                env[k] = v;
            }
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
            for (let i = 0; i < sig.inputs.length; i++) {
                inputdata[sig.inputs[i]] = inputaccessors[i](env);
            }
            const apiendpoint = merged.endpoint;
            const payloadmapping = merged.mapping?.payload || {};
            logdebug({inputaccessors, inputdata, apiendpoint, payloadmapping});

            const payload = buildPayload(payloadmapping, inputdata);
            for (const field of Object.keys(sig.outputs)) {
                if (payload[field] === undefined && inputdata[field] !== undefined) {
                    payload[field] = inputdata[field];
                }
            }
            logdebug({payload});
            const rawresult = await callwithstack(
                EVALSTACK, label, 'async-await',
                async () => {
                    const endpoint = env[apiendpoint] || apiendpoint;
                    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { textual: true, token: env.authsessionaccesstoken || '' });
                    logdebug({apiendpoint, apiresolve, endpoint, enqueueapi}, merged.method, payload);
                    return { status: apiresolve.status, data: apiresolve.data };
                },
                [],
                {
                    context: { env },
                    capturecontinuation: true,
                    errk: createerrorcontext(id, 'fetch:call')
                }
            );

            const responsemapping = merged.mapping?.response;
            let result = rawresult.data;
            if (responsemapping) {
                result = buildResponse(responsemapping, rawresult);
            }

            const patch = {};
            const apioutputkeys = Object.keys(sig.outputs);
            if (apioutputkeys.length === 1) {
                patch[apioutputkeys[0]] = result;
            } else if (typeof result === 'object') {
                for (const key of apioutputkeys) {
                    if (result[key] !== undefined) {
                        patch[key] = result[key];
                    }
                }
            }
            for (const [k, v] of Object.entries(patch)) {
                env[k] = v;
            }
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.WRITER]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing writer block:', id);
            let fn = merged.fn;
            if (!fn && typeof merged.ref === 'function') {
                fn = merged.ref;
            }
            if (!fn) {
                throw new Error('[WRITER] Block "' + id + '" failed property validation:\n' +
                                '  Property: fn or ref\n' +
                                '  Schema: { type: "function", required: true, description: "Writer function returning { id, timeout, html }" }\n' +
                                '  Received: fn=' + JSON.stringify(merged.fn) + ', ref=' + JSON.stringify(merged.ref) + '\n' +
                                '  Resolution: Provide "fn" (inline) or "ref" (label reference) in block definition');
            }

            const properties = buildproperties(merged);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputargs = inputaccessors.map(fn => fn(env));
            const fnargs = [properties].concat(inputargs);

            const result = await fn.apply(null, fnargs);

            if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined || result.timeout === undefined) {
                throw new Error('[WRITER] Block "' + id + '" returned invalid result:\n' +
                                '  Expected: { id: string|null, timeout: number, html: string }\n' +
                                '  Received: ' + JSON.stringify(result) + '\n' +
                                '  Missing fields: ' + [
                                    result.id === undefined ? 'id' : null,
                                    result.timeout === undefined ? 'timeout' : null,
                                    result.html === undefined ? 'html' : null
                                ].filter(Boolean).join(', '));
            }

            const html = result.html;
            const elementid = result.id;
            const timeout = result.timeout;

            let target = merged.targetlabel || env.approot;
            if (merged.targetlabel === null || merged.targetlabel === undefined) {
                if (env.approot === null || env.approot === undefined) {
                    throw new Error('[WRITER] Block "' + id + '" failed property validation:\n' +
                                    '  Property: targetlabel\n' +
                                    '  Schema: { type: "string", required: true, description: "Element ID to attach HTML output" }\n' +
                                    '  Received: ' + (merged.targetlabel === null ? 'null' : 'undefined') + '\n' +
                                    '  Fallback: env.approot = ' + (env.approot === null ? 'null' : env.approot === undefined ? 'undefined' : JSON.stringify(env.approot)) + '\n' +
                                    '  Resolution: Set "targetlabel" in block definition or provide "approot" in environment');
                }
                target = env.approot;
            } else {
                target = merged.targetlabel;
            }

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
            const label = 'spawn:' + (merged.ref || id);
            logdebug({merged});
            const containerrefraw = merged.container;
            if (containerrefraw === null || containerrefraw === undefined) {
                throw new Error('[SPAWN] Block "' + id + '" failed property validation:\n' +
                                '  Property: container\n' +
                                '  Schema: { type: "string", required: true, description: "Element ID for child agent root" }\n' +
                                '  Received: ' + (merged.container === null ? 'null' : merged.container === undefined ? 'undefined' : JSON.stringify(merged.container)) + '\n' +
                                '  Fallback chain:\n' +
                                '    1. merged.container = ' + (merged.container === null ? 'null' : merged.container === undefined ? 'undefined' : JSON.stringify(merged.container)) + '\n' +
                                '    2. env.approot = ' + (env.approot === null ? 'null' : env.approot === undefined ? 'undefined' : JSON.stringify(env.approot)) + '\n' +
                                '    3. sig.inputs[0] = ' + (sig.inputs.length > 0 ? JSON.stringify(env[sig.inputs[0]]) : 'undefined') + '\n' +
                                '  Resolution: Set "container" in block definition or provide "approot" in environment');
            }
            const result = await callwithstack(
                EVALSTACK, label, 'async-await',
                async (e) => {
                    let dna = merged.dna || null;
                    if (!dna && merged.dnaref) {
                        const dnapath = merged.dnaref;
                        if (dnapath.from === 'eventTarget') {
                            const target = env.eventtarget;
                            const el = dnapath.query ? target?.closest(dnapath.query) : target;
                            if (!el) return {};
                            const agentid = dnapath.key || el?.getAttribute(dnapath.attr);
                            const agents = env.agents || [];
                            const rituals = env.rituals || [];
                            const agentdef = agents.find(a => a.id === agentid);
                            dna = agentdef ? agentdef.pipeline : null;
                            if (!dna) {
                                const ritualdef = rituals.find(r => r.id === agentid);
                                dna = ritualdef ? ritualdef.pipeline : null;
                            }
                            if (!dna) return {};
                        }
                    }
                    if (!dna) {
                        throw new Error('[spawn] no dna provided. Use ' + 'dna' + ' property or ' + 'dnaref' + ' with from:eventtarget');
                    }
                    const inheritedenv = {};
                    if (merged.sharestack) {
                        for (const key of INHERITEDKEYS) {
                            if (env[key] !== undefined) inheritedenv[key] = env[key];
                        }
                    }
                    return { dna: dna, containerref: containerrefraw, inheritedenv: inheritedenv, outputkey: Object.keys(sig.outputs)[0] || null };
                },
                [env],
                {
                    context: { env },
                    capturecontinuation: true,
                    errk: createerrorcontext(id, 'spawn')
                }
            );
            return result;
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.IO]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing io block:', id);
            const label = 'io:' + (merged.ref || id);
            const io = typeof merged.ref === 'function' ? merged.ref : null;
            if (!io) throw new Error('io block "' + id + '" ref must be a function. Got: ' + typeof merged.ref);
            const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
            const inputdata = {};
            for (let i = 0; i < sig.inputs.length; i++) {
                inputdata[sig.inputs[i]] = inputaccessors[i](env);
            }
            const result = await callwithstack(
                EVALSTACK, label, 'async-await',
                async (e) => {
                    return await io(inputdata, e);
                },
                [env],
                {
                    context: { env },
                    capturecontinuation: true,
                    errk: createerrorcontext(id, 'io')
                }
            );
            return result;
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.DOMQUERY]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing domquery block:', id);
            const command = merged.command;
            if (!command || !command.COMMAND) {
                throw new Error('[DOMQUERY] Block "' + id + '" requires command with COMMAND property');
            }
            const messages = command.COMMAND;
            if (typeof messages !== 'string') {
                throw new Error('[DOMQUERY] Block "' + id + '" command.COMMAND must be a string');
            }
            const getters = DOMQUERYGETTERS;
            const setters = DOMQUERYSETTERS;
            const ALL_DOMQUERY_MESSAGES = DOMQUERYMESSAGES.concat(['getviewport', 'getscreen', 'matchmedia']);
            if (!ALL_DOMQUERY_MESSAGES.includes(messages)) {
                throw new Error('[DOMQUERY] Block "' + id + '" unknown COMMAND type: ' + messages);
            }
            const props = command.properties;

            if (messages === 'getviewport') {
                const result = await enqueuegetviewport();
                writeoutputs(sig, env, result);
                return;
            }
            if (messages === 'getscreen') {
                const result = await enqueuegetscreen();
                writeoutputs(sig, env, result);
                return;
            }
            if (messages === 'matchmedia') {
                if (!props || !props.query || typeof props.query !== 'string') {
                    throw new Error('[DOMQUERY] Block "' + id + '" matchmedia requires command.properties.query (string)');
                }
                const result = await enqueuematchmedia(props.query);
                writeoutputs(sig, env, result);
                return;
            }

            if (!props || !props.id || typeof props.id !== 'string') {
                throw new Error('[DOMQUERY] Block "' + id + '" command requires properties.id field (string)');
            }
            const commandid = props.id;

            if (setters.includes(messages)) {
                if (messages === 'toggleclass') {
                    if (!props || !props.classname || typeof props.classname !== 'string') {
                        throw new Error('[DOMQUERY] toggleclass requires properties.classname (string)');
                    }
                } else if (props.value === undefined) {
                    throw new Error('[DOMQUERY] setter COMMAND requires command.properties.value');
                }
            }

            const messagehandlers = {
                'gethtml': enqueuegethtml,
                'getvalue': enqueuegetvalue,
                'getstyle': enqueuegetstyle,
                'getposition': enqueuegetposition,
                'getlayout': enqueuegetlayout,
                'sethtml': enqueuesethtml,
                'setposition': enqueuesetposition,
                'setstyle': enqueuesetstyle,
                'setvalue': enqueuesetvalue,
                'setlayout': enqueusetlayout,
                'property': enqueueproperty,
                'toggleclass': enqueuetoggleclass
            };
            const handler = messagehandlers[messages];
            const result = await callwithstack(
                EVALSTACK, 'domquery:' + messages, 'async-await',
                async (e) => {
                    if (setters.includes(messages)) {
                        if (messages === 'toggleclass') {
                            const classname = props.classname;
                            const force = props.force;
                            if (sig.inputs && sig.inputs.length > 0) {
                                return await handler(commandid, compilepathaccessor(props.classname)(env), props.force);
                            }
                            return await handler(commandid, classname, force);
                        }
                        const resolvedvalue = props.value;
                        if (sig.inputs && sig.inputs.length > 0) {
                            return await handler(commandid, compilepathaccessor(props.value)(env));
                        }
                        return await handler(commandid, resolvedvalue);
                    }
                    return await handler(commandid);
                },
                [env],
                {
                    context: { env },
                    capturecontinuation: true,
                    errk: (err) => {
                        err.diagnostic = err.diagnostic || {};
                        err.diagnostic.blockid = id;
                        err.diagnostic.stagetype = 'domquery:' + messages;
                        if (setters.includes(messages) && err.message && err.message.indexOf('element not found:') === 0) {
                            return { ok: false, error: err.message };
                        }
                        throw err;
                    }
                }
            );
            writeoutputs(sig, env, result);
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.CRYPTO]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing crypto block:', id);
            const bytes = merged.bytes || 512;
            const timeout = merged.timeout || 10000;
            const outputkey = sig.outputs && Object.keys(sig.outputs).length > 0 ? Object.keys(sig.outputs)[0] : null;
            if (!outputkey) throw new Error('[crypto] block "' + id + '" must have signature.outputs[0]');
            const result = await new Promise(function(resolve, reject) {
                RENDERACTOR.send({ type: MESSAGETYPES.CRYPTO, bytes: bytes, resolve: resolve, reject: reject });
            });
            env[outputkey] = result;
            return {};
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.WAIT]: (merged, id, sig) => {
        const blockfn = async (env) => {
            logdebug('[BLOCK] Executing wait block:', id);
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
                    const result = await enqueueExecutionGet(args.stageid, args.key);
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'set': {
                    const result = await enqueueExecutionSet(args.stageid, args.key, args.value);
                    writeoutputs(sig, env, { result });
                    break;
                }
                case 'start': await enqueueExecutionStart(args.stageid, args.inputs || {}); break;
                case 'stop': await enqueueExecutionStop(args.stageid); break;
                case 'restart': await enqueueExecutionRestart(args.stageid, args.inputs || {}); break;
                case 'continue': await enqueueExecutionContinue(args.stageid); break;
                case 'save_status': await enqueueExecutionSaveStatus(args.stageid, args.status || 'completed', args.outputs || {}); break;
                default: throw new Error('[executionquery] unknown command: ' + command.COMMAND);
            }
        };
        blockfn.id = id;
        return blockfn;
    },
    [BLOCKTYPES.STOREQUERY]: (merged, id, sig) => {
        const blockfn = async (env) => {
            const command = merged.command;
            const args = command.args || {};
            switch (command.COMMAND) {
                case 'store': {
                    await enqueueDbStore(args.key, args.value);
                    writeoutputs(sig, env, { result: true });
                    break;
                }
                case 'restore': {
                    const restored = await enqueueDbRestore(args.key);
                    writeoutputs(sig, env, { restored });
                    break;
                }
                default: throw new Error('[storequery] unknown command: ' + command.COMMAND);
            }
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
        startIndex = (stage.elements || []).findIndex(el =>
            el.id === resumeFrom.elementId
        );
        if (startIndex < 0) startIndex = 0;
    }

    const fn = stageRunner(stage, children, startIndex);
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
        startElementId: resumeFrom && resumeFrom.stageId === stage.id
            ? resumeFrom.elementId
            : null,
        controlCommand: stage.control?.command || null
    };
    return fn;
};

const stageRunner = (stage, children, startIndex = 0) => {
    const control = stage.control;
    const id = stage.id;
    if (!control || control.command === undefined || control.command === null) {
        return defaultRunner(id, children, startIndex);
    }
    if (control.command === 'TRIGGER') return triggerRunner(id, control, children, stage);
    if (control.command === 'LOOP') return loopRunner(id, control, children, startIndex);
    throw new Error('unknown stage command: ' + control.command);
};

const triggerRunner = (id, control, children, stage) => {
    return async (env) => {
        const sourceref = env[control.sourceid];
        const eventtype = control.event;
        const rs = env.registersubscription;
        if (!control.sourceid || !eventtype || !rs) {
            logwarn('[control:TRIGGER] missing source/event/registersubscription for stage:', id);
            return {};
        }
        const handler = async (e) => {
            env.eventtarget = e.target;
            if (stage.output !== null && stage.output !== undefined) {
                env[stage.output] = deepcloneevent(e);
            }
            await executeChildren(children, env, id);
            if (control.rerunfrom !== undefined && typeof env._rerunStages === 'function') {
                await env._rerunStages(control.rerunfrom);
            }
        };
        rs(control.sourceid, eventtype, handler);
        registerTrigger(control.sourceid, eventtype, handler);
        return {};
    };
};

const loopRunner = (id, control, children, startIndex = 0) => {
    return async (env) => {
        const controlprops = {};
        for (const key of Object.keys(control)) {
            if (key !== 'fn' && key !== 'inputs' && key !== 'command') {
                controlprops[key] = control[key];
            }
        }
        const inputaccessors = (control.inputs || []).map(k => compilepathaccessor(k));
        let first = true;
        while (true) {
            if (!env.rngactive) break;
            const slice = first ? children.slice(startIndex) : children;
            await executeChildren(slice, env, id);
            first = false;
            const inputargs = inputaccessors.map(fn => fn(env));
            const fnargs = [controlprops].concat(inputargs);
            const shouldcontinue = await control.fn(...fnargs);
            if (!shouldcontinue) break;
        }
        return {};
    };
};

const defaultRunner = (id, children, startIndex = 0) => {
    return async (env) => {
        await executeChildren(children.slice(startIndex), env, id);
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
        var run = await compilepipeline(so.dna.pipeline, null, []);
        await run.pipeline({ id: so.dna.identity.id, env: { ...so.inheritedenv, containerid: so.containerref, rngactive: true, stack: {}, registersubscription: env.registersubscription, updateworldmap: env.updateworldmap } });
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

export const compilepipeline = async (pipeline, accessors, sinks) => {
    if (!pipeline.elements) {
        throw new Error('[compilepipeline] pipeline must have elements array');
    }

    const pipelineId = pipeline.id || pipeline.identity?.id || 'default_pipeline';

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

    // Compile-time recovery from persisted execution map.
    let resumeFrom = null;
    let lastCheckpointEnv = null;
    try {
        const mapKey = `pipeline:${pipelineId}:executionmap`;
        const executionMap = await enqueueDbRestore(mapKey);
        if (executionMap && executionMap.stages) {
            for (const stage of pipeline.elements) {
                if (stage.element !== 'STAGE') continue;
                const stageRecord = executionMap.stages[stage.id];
                if (!stageRecord) continue;
                for (const el of stage.elements || []) {
                    if (el.element !== 'BLOCK') continue;
                    const elementState = stageRecord.elements?.[el.id];

                    if (elementState?.env) {
                        lastCheckpointEnv = elementState.env;
                    }

                    if (!elementState || elementState.status !== 'completed') {
                        resumeFrom = { stageId: stage.id, elementId: el.id };
                        break;
                    }
                }
                if (resumeFrom) break;
            }
        }
    } catch (err) {
        console.warn('[compilepipeline] recovery check failed:', err);
    }

    const compiled = compileElements(pipeline.elements, pipelineId, resumeFrom);
    const compiledpipeline = createpipeline(compiled, sinks, undefined, {
        resumeFrom,
        pipelineId,
        restoredEnv: lastCheckpointEnv
    });
    return { pipeline: compiledpipeline, resumeFrom, restoredEnv: lastCheckpointEnv, pipelineId };
};
