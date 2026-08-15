import { enqueueapi } from '../actors/apiactor.js';
import { callwithstack } from './callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import {
  enqueuehtml, expectelement, enqueuegethtml, enqueuegetvalue,
  enqueuegetstyle, enqueuegetposition, enqueuesethtml, enqueuesetposition,
  enqueuesetstyle, enqueuesetvalue, enqueueproperty, enqueuegetlayout,
  enqueusetlayout, enqueuetoggleclass, DOMQUERYGETTERS, DOMQUERYSETTERS,
  DOMQUERYMESSAGES, RENDERACTOR, MESSAGETYPES, enqueuegetviewport,
  enqueuegetscreen, enqueuematchmedia, enqueueRenderGetBodyHtml,
  enqueueRenderRestoreBodyHtml
} from '../actors/renderactor.js';
import { logwarn, logdebug, loginfo } from '../verbosity.js';
import { registerTrigger, revalidateAll } from '../actors/trigerregistry.js';
import { validatestageflow } from '../typesystem.js';
import {
  enqueueExecutionPipelineLoaded, enqueueExecutionStageState,
  enqueueExecutionSubmit, enqueueExecutionSubmitStage, enqueueExecutionAwaitTask,
  enqueueExecutionEnvUpdated, enqueueExecutionRecover, enqueueExecutionGetStatus,
  enqueueExecutionStopStage, enqueueExecutionCancelStage, enqueueExecutionBreakStage,
  enqueueExecutionRestartStage, enqueueExecutionContinueStage, enqueueExecutionGetTasks,
  enqueueExecutionGetTaskStatus, enqueueExecutionCancelTask, enqueueExecutionStopTask,
  enqueueExecutionSpawnPipeline, enqueueGlobalSnapshot, enqueueExecutionRegisterPipeline
} from '../actors/executionactor.js';

const BLOCKTYPES = Object.freeze({
  FN: 'fn', API: 'api', FETCH: 'fetch', WRITER: 'writer',
  SPAWN: 'spawn', IO: 'io', DOMQUERY: 'domquery', CRYPTO: 'crypto',
  WAIT: 'wait', EXECUTIONQUERY: 'executionquery', STOREQUERY: 'storequery'
});

const INHERITEDKEYS = ['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents'];

// Pure path accessor without `new Function`
const compilepathaccessor = (pathstr) => {
  if (typeof pathstr !== 'string') return () => pathstr;
  const parts = pathstr.split('.').flatMap(p => p.split(/[\[\]]/).filter(Boolean).map(k => k.replace(/['"]/g, '')));
  return (env) => parts.reduce((curr, key) => (curr != null ? curr[key] : undefined), env);
};

const buildproperties = (merged) => {
  const result = {};
  for (const key of Object.keys(merged)) { if (key !== 'fn') result[key] = merged[key]; }
  return result;
};

// Canonical pure data sanitizer for DB / state persistence
const sanitizeEnv = (env, maxBytes = 128 * 1024) => {
  const out = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value === 'function') continue;
    if (typeof Node !== 'undefined' && value instanceof Node) continue;
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) continue;
    try {
      const json = JSON.stringify(value);
      out[key] = json.length > maxBytes ? '[large-value omitted]' : JSON.parse(json);
    } catch { out[key] = null; }
  }
  return out;
};

const createPersistentElementWrapper = (compiledElement, elementDef, stagePath, pipelineId) => {
  const elementId = elementDef.id || compiledElement.id || 'element_unknown';

  const wrapper = async (env) => {
    const path = [...stagePath, elementId];
    try {
      await enqueueExecutionEnvUpdated(pipelineId, sanitizeEnv(env));
    } catch (err) {
      console.warn('[BLOCKCOMPILER] pre-env checkpoint failed:', err);
    }

    const executor = async (executionContext) => {
      const execEnv = executionContext.env || env;
      return await compiledElement(execEnv);
    };

    const { taskid } = await enqueueExecutionSubmit({
      pipelineid: pipelineId,
      path,
      elementid: elementId,
      env,
      signature: { inputs: elementDef?.signature?.inputs || [], outputs: elementDef?.signature?.outputs || {} },
      executor,
      properties: elementDef || {}
    });

    return await enqueueExecutionAwaitTask(taskid);
  };

  wrapper.id = elementId;
  wrapper.kind = 'element';
  return wrapper;
};

const writeoutputs = (sig, env, result) => {
  const patch = {};
  const outputkeys = Object.keys(sig?.outputs || {});
  if (result === null || result === undefined) {
    if (outputkeys.length > 0) throw new Error(`block returned ${result} but outputs expected keys: ${outputkeys.join(', ')}`);
    return patch;
  }
  if (outputkeys.length === 1) {
    const key = outputkeys[0];
    const value = result[key] !== undefined ? result[key] : result;
    patch[key] = value; env[key] = value;
    return patch;
  }
  for (const key of outputkeys) {
    if (result[key] === undefined) throw new Error(`missing required output "${key}" from block result`);
    patch[key] = result[key]; env[key] = result[key];
  }
  return patch;
};

const createerrorcontext = (id, stagetype) => (err) => {
  err.diagnostic = err.diagnostic || {};
  err.diagnostic.blockid = id;
  err.diagnostic.stagetype = stagetype;
  throw err;
};

function createBlockAnalyzer(rules) {
  return (block) => {
    const errors = [];
    for (const rule of rules) {
      const value = block[rule.field];
      if (rule.required && (value === undefined || value === null)) errors.push(rule.message);
      else if (value !== undefined && value !== null) {
        if (rule.type && typeof value !== rule.type) errors.push(`${rule.message} (expected ${rule.type}, got ${typeof value})`);
        if (rule.custom && !rule.custom(value, block)) errors.push(rule.message);
      }
    }
    return { valid: errors.length === 0, errors, warnings: [], dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  };
}

function buildPayload(mappingobj, data) {
  const result = {};
  for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(data);
    else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
      result[fieldkey] = mappingdef.from !== undefined ? data[mappingdef.from] : buildPayload(mappingdef, data);
    } else result[fieldkey] = mappingdef;
  }
  return result;
}

function buildResponse(mappingobj, raw) {
  const result = {};
  for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
    if (typeof mappingdef === 'function') result[fieldkey] = mappingdef(raw);
    else if (typeof mappingdef === 'object' && mappingdef !== null && mappingdef.from !== undefined) result[fieldkey] = raw[mappingdef.from];
    else if (typeof mappingdef === 'object' && mappingdef !== null) result[fieldkey] = buildResponse(mappingdef, raw);
    else result[fieldkey] = raw[mappingdef];
  }
  return result;
}

const validaterevivablefunctionblock = (block) => {
  if (block.type !== BLOCKTYPES.FN && block.type !== BLOCKTYPES.WRITER) return [];
  const fn = block.type === BLOCKTYPES.FN ? block.fn : (block.fn || block.ref);
  if (typeof fn !== 'function') return [];

  const errors = [];
  const src = fn.toString();

  if (/\[native code\]/.test(src)) {
    errors.push(`[REVIVABILITY] block "${block.id}" contains a native function`);
  }

  if (fn.name === 'bound ') {
    errors.push(`[REVIVABILITY] block "${block.id}" contains a bound function`);
  }

  if (/\bthis\b/.test(src)) {
    errors.push(`[REVIVABILITY] block "${block.id}" uses "this"`);
  }

  const defaultFnKeys = ['length', 'name', 'prototype'];
  const customKeys = Object.getOwnPropertyNames(fn).filter(k => !defaultFnKeys.includes(k));
  if (customKeys.length > 0) {
    errors.push(`[REVIVABILITY] block "${block.id}" has custom function properties: ${customKeys.join(', ')}`);
  }

  return errors;
};

const BLOCKANALYZERS = {
  [BLOCKTYPES.FN]: (block) => {
    const errors = [];
    if (!block.fn) errors.push('fn block must have a function');
    if (typeof block.fn === 'function') {
      if (/document\.(querySelector|getElementById|innerHTML)|\bstyle\s*[.]/i.test(block.fn.toString())) {
        errors.push('[KLEISLI VIOLATION] fn block accesses DOM directly');
      }
      errors.push(...validaterevivablefunctionblock(block));
    }
    return { valid: errors.length === 0, errors, warnings: [], dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.API]: createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'api block must have an endpoint' },
    { field: 'method', required: true, message: 'api block must have GET/POST method', custom: v => v === 'GET' || v === 'POST' }
  ]),
  [BLOCKTYPES.FETCH]: createBlockAnalyzer([
    { field: 'endpoint', required: true, message: 'fetch block must have an endpoint' },
    { field: 'method', required: true, message: 'fetch block must have GET/POST method', custom: v => v === 'GET' || v === 'POST' }
  ]),
  [BLOCKTYPES.WRITER]: (block) => {
    const errors = [];
    if (typeof block.fn !== 'function' && typeof block.ref !== 'function') {
      errors.push('writer block must have fn or ref');
    }
    if (typeof block.fn === 'function' || typeof block.ref === 'function') {
      errors.push(...validaterevivablefunctionblock(block));
    }
    return { valid: errors.length === 0, errors, warnings: [], dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.SPAWN]: createBlockAnalyzer([
    { field: 'dna', required: false, message: 'spawn block must have dna or dnaref', custom: (v, b) => v !== undefined || b.dnaref !== undefined }
  ]),
  [BLOCKTYPES.IO]: createBlockAnalyzer([
    { field: 'ref', required: true, type: 'function', message: 'io block ref must be a function' }
  ]),
  [BLOCKTYPES.DOMQUERY]: (block) => ({
    valid: Boolean(block.command?.COMMAND),
    errors: block.command?.COMMAND ? [] : ['domquery block requires command.COMMAND'],
    warnings: [], dependencies: [], outputs: block.signature?.outputs || {}, contracts: []
  }),
  [BLOCKTYPES.CRYPTO]: createBlockAnalyzer([
    { field: 'outputs', required: true, message: 'crypto block must have signature.outputs', custom: (v, b) => Object.keys(b.signature?.outputs || {}).length > 0 }
  ]),
  [BLOCKTYPES.WAIT]: createBlockAnalyzer([{ field: 'ms', required: true, message: 'wait block must have ms' }]),
  [BLOCKTYPES.EXECUTIONQUERY]: createBlockAnalyzer([{ field: 'command', required: true, message: 'executionquery requires command', custom: v => v && typeof v.COMMAND === 'string' }]),
  [BLOCKTYPES.STOREQUERY]: createBlockAnalyzer([{ field: 'command', required: true, message: 'storequery requires command', custom: v => v && typeof v.COMMAND === 'string' }])
};

// Parameterized HTTP Block (API / Fetch)
const compileHttpBlock = (merged, id, sig, isTextual = false) => {
  const blockfn = async (env) => {
    const label = `${isTextual ? 'fetch' : 'api'}:${merged.endpoint || id}`;
    const inputaccessors = (sig.inputs || []).map(compilepathaccessor);
    const inputdata = {};
    (sig.inputs || []).forEach((inp, idx) => { inputdata[inp] = inputaccessors[idx](env); });

    const endpoint = env[merged.endpoint] || merged.endpoint;
    const payload = buildPayload(merged.mapping?.payload || {}, inputdata);
    for (const field of Object.keys(sig.outputs || {})) if (payload[field] === undefined && inputdata[field] !== undefined) payload[field] = inputdata[field];

    const rawresult = await callwithstack(
      EVALSTACK, label, 'async-await',
      async () => {
        const apiresolve = await enqueueapi(endpoint, merged.method, payload, { textual: isTextual, token: env.authsessionaccesstoken || '' });
        return { status: apiresolve.status, data: apiresolve.data };
      },
      [], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, label) }
    );

    let result = rawresult.data;
    if (merged.mapping?.response) result = buildResponse(merged.mapping.response, rawresult);
    const outputkeys = Object.keys(sig.outputs || {});
    if (outputkeys.length === 1) env[outputkeys[0]] = result;
    else if (typeof result === 'object' && result) for (const key of outputkeys) if (result[key] !== undefined) env[key] = result[key];
  };
  blockfn.id = id;
  return blockfn;
};

const BLOCKCOMPILERS = {
  [BLOCKTYPES.FN]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const fn = merged.fn;
      if (!fn) throw new Error('fn block must have a function: ' + id);
      const properties = buildproperties(merged);
      const fnargs = [properties].concat((sig.inputs || []).map(compilepathaccessor).map(f => f(env)));
      const result = await callwithstack(
        EVALSTACK, 'fn:' + (merged.ref || id), 'async-await',
        async () => (await fn(...fnargs)) || {},
        [env],
        { context: { env, pipestate: env.pipestate }, capturecontinuation: true, errk: createerrorcontext(id, 'fn') }
      );
      writeoutputs(sig, env, result);
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.API]: (merged, id, sig) => compileHttpBlock(merged, id, sig, false),
  [BLOCKTYPES.FETCH]: (merged, id, sig) => compileHttpBlock(merged, id, sig, true),
  [BLOCKTYPES.WRITER]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const fn = typeof merged.fn === 'function' ? merged.fn : (typeof merged.ref === 'function' ? merged.ref : null);
      if (!fn) throw new Error('[WRITER] Block "' + id + '" failed validation');
      const properties = buildproperties(merged);
      const inputargs = (sig.inputs || []).map(compilepathaccessor).map(f => f(env));
      const result = await fn(properties, ...inputargs);
      if (!result || typeof result !== 'object' || result.html === undefined || result.id === undefined) {
        throw new Error('[WRITER] Block "' + id + '" returned invalid result');
      }
      const target = merged.targetlabel || env.approot;
      if (!target) throw new Error('[WRITER] missing targetlabel/approot');
      await enqueuehtml(target, result.html, !merged.replace);
      if (result.id && Object.keys(sig.outputs || {}).length > 0) {
        const domref = await expectelement(result.id, result.timeout || 5000);
        env[Object.keys(sig.outputs)[0]] = result;
        env[result.id] = domref;
      }
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.SPAWN]: (merged, id, sig) => {
    const blockfn = async (env) => {
      if (!merged.container) throw new Error('[SPAWN] missing container');
      return await callwithstack(
        EVALSTACK, 'spawn:' + (merged.ref || id), 'async-await',
        async () => {
          let dna = merged.dna || null;
          if (!dna && merged.dnaref?.from === 'eventTarget') {
            const el = merged.dnaref.query ? env.eventtarget?.closest(merged.dnaref.query) : env.eventtarget;
            const agentid = merged.dnaref.key || el?.getAttribute(merged.dnaref.attr);
            dna = (env.agents || []).find(a => a.id === agentid)?.pipeline || (env.rituals || []).find(r => r.id === agentid)?.pipeline || null;
          }
          if (!dna) throw new Error('[spawn] no dna');
          const inheritedenv = {};
          if (merged.sharestack) for (const key of INHERITEDKEYS) if (env[key] !== undefined) inheritedenv[key] = env[key];
          return { dna, containerref: merged.container, inheritedenv, outputkey: Object.keys(sig.outputs || {})[0] || null };
        },
        [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'spawn') }
      );
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.IO]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const io = typeof merged.ref === 'function' ? merged.ref : null;
      if (!io) throw new Error('io block "' + id + '" ref must be a function');
      const inputdata = {};
      (sig.inputs || []).forEach(inp => { inputdata[inp] = compilepathaccessor(inp)(env); });
      return await callwithstack(EVALSTACK, 'io:' + (merged.ref || id), 'async-await', async (e) => await io(inputdata, e), [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'io') });
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.DOMQUERY]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const cmd = merged.command?.COMMAND;
      if (!cmd) throw new Error('[DOMQUERY] requires COMMAND');
      const props = merged.command.properties || {};

      if (cmd === 'getviewport') return writeoutputs(sig, env, await enqueuegetviewport());
      if (cmd === 'getscreen') return writeoutputs(sig, env, await enqueuegetscreen());
      if (cmd === 'matchmedia') return writeoutputs(sig, env, await enqueuematchmedia(props.query));

      const handlerMap = {
        gethtml: enqueuegethtml, getvalue: enqueuegetvalue, getstyle: enqueuegetstyle,
        getposition: enqueuegetposition, getlayout: enqueuegetlayout, sethtml: enqueuesethtml,
        setposition: enqueuesetposition, setstyle: enqueuesetstyle, setvalue: enqueuesetvalue,
        setlayout: enqueusetlayout, toggleclass: enqueuetoggleclass, property: enqueueproperty
      };
      const handler = handlerMap[cmd];
      if (!handler) throw new Error('[DOMQUERY] unknown COMMAND: ' + cmd);

      const result = await callwithstack(
        EVALSTACK, 'domquery:' + cmd, 'async-await',
        async () => {
          if (DOMQUERYSETTERS.includes(cmd)) {
            if (cmd === 'toggleclass') return await handler(props.id, props.classname, props.force);
            const val = sig.inputs?.length > 0 ? compilepathaccessor(props.value)(env) : props.value;
            return await handler(props.id, val);
          }
          return await handler(props.id);
        },
        [env], { context: { env }, capturecontinuation: true, errk: createerrorcontext(id, 'domquery:' + cmd) }
      );
      writeoutputs(sig, env, result);
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.CRYPTO]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const outputkey = Object.keys(sig.outputs || {})[0];
      if (!outputkey) throw new Error('[crypto] requires outputs');
      const result = await new Promise((resolve, reject) => RENDERACTOR.send({ type: MESSAGETYPES.CRYPTO, bytes: merged.bytes || 512, resolve, reject }));
      env[outputkey] = result;
      return {};
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.WAIT]: (merged, id) => {
    const blockfn = async (env) => {
      const ms = typeof merged.ms === 'number' ? merged.ms : compilepathaccessor(merged.ms)(env);
      if (typeof ms !== 'number' || ms < 0) throw new Error('[wait] invalid ms');
      await new Promise(r => setTimeout(r, ms));
      return {};
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.EXECUTIONQUERY]: (merged, id, sig) => {
    const blockfn = async (env) => {
      const { COMMAND, args = {} } = merged.command || {};
      let result;
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
      writeoutputs(sig, env, { result });
    };
    blockfn.id = id;
    return blockfn;
  },
  [BLOCKTYPES.STOREQUERY]: (merged, id) => {
    const blockfn = async () => {};
    blockfn.id = id;
    return blockfn;
  }
};

const compileblock = (block) => {
  const compiler = BLOCKCOMPILERS[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  const analyzer = BLOCKANALYZERS[block.type];
  if (analyzer) {
    const check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  return compiler(block, block.id, block.signature || { inputs: [], outputs: {} });
};

const compileElement = (el, pipelineId = 'default_pipeline', resumeFrom = null, stagePath = []) => {
  if (el.element === 'BLOCK') {
    const fn = compileblock(el);
    fn.blockmeta = { id: el.id, type: el.type, ref: el.ref, replace: el.replace };
    fn.kind = 'element';
    return fn;
  }
  if (el.element === 'STAGE') return compileStageElement(el, pipelineId, resumeFrom, stagePath);
  throw new Error('unknown element type: ' + el.element);
};

const mapOrderedChildren = (children) => children.map(ch => ({
  type: ch.kind === 'stage' ? 'stage' : 'element',
  id: ch.id,
  status: ch.kind === 'stage' ? 'awaiting' : 'WAITING',
  children: ch.kind === 'stage' ? [] : undefined,
  savedAt: ch.kind !== 'stage' ? Date.now() : undefined
}));

const compileStageElement = (stage, pipelineId = 'default_pipeline', resumeFrom = null, parentPath = []) => {
  const stagePath = [...parentPath, stage.id];
  const children = (stage.elements || []).map(el => {
    if (el.element === 'BLOCK') return createPersistentElementWrapper(compileElement(el, pipelineId, resumeFrom, stagePath), el, stagePath, pipelineId);
    if (el.element === 'STAGE') return compileStageElement(el, pipelineId, resumeFrom, stagePath);
    throw new Error('unknown element type: ' + el.element);
  });

  const isResumeStage = resumeFrom?.path?.[0] === stage.id;
  const startIndex = isResumeStage ? Math.max(0, (stage.elements || []).findIndex(el => el.id === resumeFrom.path[resumeFrom.path.length - 1])) : 0;
  const fn = stageRunner(stage, children, startIndex, pipelineId, isResumeStage, stagePath, resumeFrom);
  fn.id = stage.id;
  fn.kind = 'stage';

  const reads = new Set(), writes = new Set();
  (stage.elements || []).filter(e => e.element === 'BLOCK').forEach(e => {
    (e.reads || []).forEach(k => reads.add(k));
    (e.writes || []).forEach(k => writes.add(k));
  });

  fn.stagemeta = {
    async: stage.async === true, stageid: stage.id,
    reads: [...reads], writes: [...writes],
    snapshotKey: 'stage:' + stage.id, recoverable: true,
    notifyOnDone: stage.notifyOnDone === true,
    controlCommand: stage.control?.command || null, path: stagePath
  };
  return fn;
};

const stageRunner = (stage, children, startIndex, pipelineId, resumeStage, stagePath) => {
  const control = stage.control;
  const id = stage.id;
  if (!control?.command) return defaultRunner(id, children, startIndex, pipelineId, stagePath);
  if (control.command === 'TRIGGER') return triggerRunner(id, control, children, stage, pipelineId, startIndex, resumeStage, stagePath);
  if (control.command === 'LOOP') return loopRunner(id, control, children, startIndex, pipelineId, stagePath);
  throw new Error('unknown stage command: ' + control.command);
};

const defaultRunner = (id, children, startIndex, pipelineId, stagePath) => async (env) => {
  const stageExecutor = async (execEnv) => {
    await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(() => {});
    await executeChildren(children.slice(startIndex), execEnv, id);
  };
  const { taskid } = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor, env });
  await enqueueExecutionAwaitTask(taskid);
};

const loopRunner = (id, control, children, startIndex, pipelineId, stagePath) => async (env) => {
  const stageExecutor = async (execEnv) => {
    await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(() => {});
    const controlprops = {};
    for (const k of Object.keys(control)) if (k !== 'fn' && k !== 'inputs' && k !== 'command') controlprops[k] = control[k];
    const inputaccessors = (control.inputs || []).map(compilepathaccessor);
    let first = true;
    while (execEnv.rngactive) {
      await executeChildren(first ? children.slice(startIndex) : children, execEnv, id);
      first = false;
      const fnargs = [controlprops].concat(inputaccessors.map(fn => fn(execEnv)));
      if (!(await control.fn(...fnargs))) break;
    }
  };
  const { taskid } = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor, env });
  await enqueueExecutionAwaitTask(taskid);
};

const triggerRunner = (id, control, children, stage, pipelineId, startIndex, resumeStage, stagePath) => async (env) => {
  const rs = env.registersubscription;
  if (!control.sourceid || !control.event || !rs) {
    logwarn('[control:TRIGGER] missing source/event/registersubscription for stage:', id);
    return {};
  }

  const runTrigger = async (execEnv, slice) => {
    await enqueueExecutionStageState(pipelineId, id, { status: 'running', children: mapOrderedChildren(children) }).catch(() => {});
    await executeChildren(slice, execEnv, id);
  };

  const handler = async (e) => {
    env.eventtarget = e.target;
    if (stage.output != null) env[stage.output] = deepcloneevent(e);
    const { taskid } = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: (execEnv) => runTrigger(execEnv, children), env });
    await enqueueExecutionAwaitTask(taskid);
    if (control.rerunfrom !== undefined && typeof env._rerunStages === 'function') await env._rerunStages(control.rerunfrom);
  };

  rs(control.sourceid, control.event, handler);
  registerTrigger(control.sourceid, control.event, handler);

  if (resumeStage) {
    const { taskid } = await enqueueExecutionSubmitStage({ pipelineid: pipelineId, path: stagePath, stageid: id, stageExecutor: (execEnv) => runTrigger(execEnv, startIndex > 0 ? children.slice(startIndex) : children), env });
    await enqueueExecutionAwaitTask(taskid);
  }
  return {};
};

const deepcloneevent = (e) => {
  if (!e) return {};
  const c = {};
  for (const k in e) if (typeof e[k] !== 'function') c[k] = e[k];
  return c;
};

const executeChildren = async (children, env, stageid) => {
  const spawnOutputs = [];
  for (const child of children) {
    try {
      const result = await child(env);
      if (child.blockmeta?.type === 'spawn' && result?.dna) {
        spawnOutputs.push({ dna: result.dna, containerref: result.containerref, inheritedenv: result.inheritedenv });
      }
    } catch (err) {
      err.message = `child ${stageid || 'unnamed'}/${child.id || 'unnamed'}: ${err.message}`;
      logdebug('[CHILD_ERROR]', stageid, child.id, err.message);
      throw err;
    }
  }

  if (env.stack?.agentspawned === stageid) return spawnOutputs;

  for (const so of spawnOutputs) {
    const childPipelineId = so.dna?.identity?.id || so.containerref || 'child_pipeline';
    const childRunner = async (agent) => {
      const childCompiled = await compilepipeline(so.dna.pipeline, null, [], childPipelineId);
      await childCompiled.pipeline(agent);
    };

    const { taskid } = await enqueueExecutionSpawnPipeline({
      parentPipelineId: env.pipelineid || env.agentid || 'unknown',
      childPipelineId, childRunner,
      childEnv: { ...so.inheritedenv, containerid: so.containerref, rngactive: true, stack: {}, registersubscription: env.registersubscription, updateworldmap: env.updateworldmap, pipelineid: childPipelineId },
      containerref: so.containerref
    });
    await enqueueExecutionAwaitTask(taskid);
  }

  if (env.stack) env.stack.agentspawned = stageid;
  return spawnOutputs;
};

const compileElements = (elements, pipelineId = 'default_pipeline', resumeFrom = null, parentPath = []) =>
  elements.map(el => compileElement(el, pipelineId, resumeFrom, parentPath));

const buildSpawnBootstrapMap = (pipeline) => {
  const map = {};
  for (const stage of pipeline.elements || []) {
    if (stage.element === 'STAGE') {
      for (const el of stage.elements || []) {
        if (el.element === 'BLOCK' && el.type === 'spawn' && el.dna) {
          const childId = el.dna.identity?.id || el.container || 'child_pipeline';
          map[childId] = { dna: el.dna, containerref: el.container, stageid: stage.id };
        }
      }
    }
  }
  return map;
};

// ==================== TRAMPOLINE RUNNER ====================

const runTrampoline = async (env, stages, pipelineId) => {
  if (!env.executionStack) {
    env.executionStack = stages.map((s, idx) => s.id || s.stagemeta?.stageid || ('stage_' + idx));
    logdebug('[RESTORE] pipeline-booting-fresh', { pipelineId });
  } else {
    logdebug('[RESTORE] pipeline-resuming', { pipelineId, remainingStages: env.executionStack.length });
  }

  while (env.executionStack.length > 0) {
    const nextStageId = env.executionStack[0];
    const stageIndex = stages.findIndex((s, idx) => (s.id || s.stagemeta?.stageid || ('stage_' + idx)) === nextStageId);

    if (stageIndex === -1) {
      logdebug('[PIPELINE] Stage not found, skipping:', nextStageId);
      env.executionStack.shift();
      continue;
    }

    const stage = stages[stageIndex];
    if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP' && stage.control.fn) {
      if (!(await stage.control.fn(env))) {
        logdebug('[PIPELINE] Skipping stage:', nextStageId, 'control condition false');
        env.executionStack.shift();
        continue;
      }
    }

    logdebug('[PIPELINE] Executing stage:', nextStageId);

    try {
      await enqueueExecutionStageState(pipelineId, nextStageId, { status: 'running' }).catch(() => {});
      const patch = await stage(env);

      if (patch && typeof patch === "object") {
        if (env.updateworldmap) env.updateworldmap(patch);
        else Object.assign(env, patch);
      }

      env.executionStack.shift();
      await enqueueExecutionStageState(pipelineId, nextStageId, { status: 'completed' }).catch(() => {});
      await enqueueExecutionEnvUpdated(pipelineId, env).catch(() => {});

      try {
        const currentHtml = await enqueueRenderGetBodyHtml();
        if (typeof currentHtml === 'string') await enqueueGlobalSnapshot(currentHtml);
      } catch (snapErr) {
        logdebug('[SNAPSHOT] stage snapshot persist warning:', snapErr);
      }
    } catch (err) {
      loginfo('[PIPELINE] Error at stage:', nextStageId);
      await enqueueExecutionStageState(pipelineId, nextStageId, { status: 'failed' }).catch(() => {});
      await enqueueExecutionEnvUpdated(pipelineId, env).catch(() => {});

      try {
        const currentHtml = await enqueueRenderGetBodyHtml();
        if (typeof currentHtml === 'string') await enqueueGlobalSnapshot(currentHtml);
      } catch (snapErr) {}

      err.diagnostic = err.diagnostic || {};
      err.diagnostic.pipelinestage = nextStageId;
      throw err;
    }
  }

  logdebug('[RESTORE] pipeline-completed', { pipelineId });
  return env;
};

const createpipeline = (stages, sinks = [], onprogress, options = {}) => {
  if (!Array.isArray(stages)) throw new Error('[PIPELINE] Stages must be an array.');
  const pipelineId = options.pipelineId || 'default_pipeline';

  return async (agent) => {
    const env = agent.env;
    if (!env || typeof env !== 'object') throw new Error('[PIPELINE] agent.env is required');
    env.agentid = agent.id;
    env._rerunStages = () => runTrampoline(env, stages, pipelineId);
    await runTrampoline(env, stages, pipelineId);
    return env;
  };
};

export const compilepipeline = async (pipeline, accessors, sinks, pipelineIdOverride = null) => {
  if (!pipeline.elements) throw new Error('[compilepipeline] pipeline must have elements array');
  const pipelineId = pipelineIdOverride || pipeline.id || pipeline.identity?.id || 'default_pipeline';

  const rawStages = (pipeline.elements || []).filter(el => el.element === 'STAGE').map(el => ({
    id: el.id, control: el.control || null, blocks: (el.elements || []).filter(e => e.element === 'BLOCK')
  }));

  const contracts = validatestageflow(rawStages);
  const unresolved = contracts.filter(c => !c.resolved);
  if (unresolved.length > 0) {
    throw new Error('[compilepipeline] Unresolved stage dependencies: ' + unresolved.map(c => `${c.stageid}: missing ${c.missingkeys.join(', ')}`).join('; '));
  }

  await enqueueExecutionPipelineLoaded(pipelineId, {}).catch(err => console.warn('[compilepipeline] pipeline loaded failed:', err));
  await enqueueExecutionRegisterPipeline(pipelineId, pipelineId, {}).catch(err => console.warn('[compilepipeline] register pipeline failed:', err));

  const spawnBootstrapMap = buildSpawnBootstrapMap(pipeline);
  const compiled = compileElements(pipeline.elements, pipelineId, null, []);
  const compiledpipeline = createpipeline(compiled, sinks, undefined, { pipelineId });

  return { pipeline: compiledpipeline, pipelineId, spawnBootstrapMap };
};

export const bootGlobalSnapshot = async (dnaResolvers = {}) => {
  try {
    const recoveryData = await enqueueExecutionRecover();
    if (!recoveryData || typeof recoveryData !== 'object') {
      return { recovered: false, pipelineCount: 0, htmlRestored: false };
    }

    const { pipelines, htmlSnapshot } = recoveryData;
    const pipelineEntries = Object.entries(pipelines || {});

    // FIRST-RUN / EMPTY-DB GUARD
    if (pipelineEntries.length === 0) {
      logdebug('[BOOTLOADER] No persisted pipelines found. First run or empty snapshot.');
      return { recovered: false, pipelineCount: 0, htmlRestored: false };
    }

    // Phase 1: Rehydrate pipelines only; do not touch DOM.
    let rehydratedCount = 0;
    const rehydratedPipelines = [];
    for (const [pid, pdata] of pipelineEntries) {
      if (pdata.status !== 'running') continue;
      const resolver = dnaResolvers[pdata.dnaRef] || dnaResolvers[pid];
      if (typeof resolver !== 'function') {
        logwarn('[BOOTLOADER] No DNA resolver for pipeline:', pid);
        continue;
      }
      try {
        const dna = await resolver(pid);
        const compiled = await compilepipeline(dna, null, [], pid);
        rehydratedPipelines.push({ pid, compiled, env: pdata.env || {} });
        rehydratedCount++;
      } catch (pipeErr) {
        logwarn('[BOOTLOADER] Failed to re-compile pipeline:', pid, pipeErr);
      }
    }

    // Phase 2: Restore HTML only if at least one pipeline was rehydrated.
    let htmlRestored = false;
    if (rehydratedCount > 0 && typeof htmlSnapshot === 'string' && htmlSnapshot.length > 0) {
      await enqueueRenderRestoreBodyHtml(htmlSnapshot);
      revalidateAll();
      htmlRestored = true;
      logdebug('[BOOTLOADER] Global HTML snapshot restored');
    }

    // Phase 3: Run rehydrated pipelines; if HTML was restored, they will operate on it.
    for (const { pid, compiled, env } of rehydratedPipelines) {
      compiled.pipeline({ id: pid, env }).catch(err => logwarn('[BOOTLOADER] Pipeline resume failed:', pid, err));
    }

    logdebug('[BOOTLOADER] Global recovery complete. Rehydrated pipelines:', rehydratedCount);
    return {
      recovered: rehydratedCount > 0,
      pipelineCount: rehydratedCount,
      htmlRestored
    };
  } catch (err) {
    logwarn('[BOOTLOADER] Global Snapshot recovery failed:', err);
    return { recovered: false, pipelineCount: 0, htmlRestored: false };
  }
};
