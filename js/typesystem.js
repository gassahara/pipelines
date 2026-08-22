import { DOMQUERYMESSAGES, DOMQUERYSETTERS } from './actors/renderactor.js';

const extractstagesblocks = (pipeline) => {
  if (pipeline.elements) {
    const stages = [], blocks = [];
    pipeline.elements.forEach(el => {
      if (el.element === 'STAGE') stages.push({ id: el.id, control: el.control || null, blocks: (el.elements || []).filter(e => e.element === 'BLOCK') });
      else if (el.element === 'BLOCK') blocks.push(el);
    });
    return { stages, blocks };
  }
  return { stages: pipeline.stages || [], blocks: [] };
};

export const TYPESCHEMA = {
  agent: { dna: { type: 'object', required: true }, pipeline: { type: 'function', required: true } },
  oracledna: { identity: { type: 'object', required: true }, pipeline: { type: 'object', required: true }, presentation: { type: 'object', required: false } },
  layoutcomponent: { key: { type: 'string', required: true }, parent: { type: 'string' }, id: { type: 'string' }, datapath: { type: 'string' } },
  pipeline: { stages: { type: 'array', required: true }, briefcase: { type: 'object', required: false } },
  stage: { id: { type: 'string', required: true }, type: { type: 'string', required: true }, intent: { type: 'string' }, blocks: { type: 'array' }, async: { type: 'boolean' }, briefcase: { type: 'object', required: false } },
  block: { id: { type: 'string', required: true }, type: { type: 'string', required: true }, ref: { type: 'string' }, intent: { type: 'string' }, args: { type: 'array' }, output: { type: 'string' }, target: { type: 'string' }, datapath: { type: 'string' }, mappings: { type: 'object' }, inputs: { type: 'array' }, outputs: { type: 'object' } },
  rewriterspec: { rewriter: { type: 'function', required: true }, label: { type: 'string', required: true } },
  responseadapter: { functionname: { type: 'string', required: true }, registerkey: { type: 'string', required: true }, pipelinesource: { type: 'string', required: true }, targetapiref: { type: 'string', required: true }, validatedfields: { type: 'array' } },
  paramadapter: { functionname: { type: 'string', required: true }, registerkey: { type: 'string', required: true }, pipelinesource: { type: 'string', required: true }, targetapiref: { type: 'string', required: true }, readkeys: { type: 'array', required: true } },
  blockcontract: { id: { type: 'string', required: true }, type: { type: 'string', required: true }, reads: { type: 'array' }, ref: { type: 'string' }, schemaref: { type: 'string' }, responseadapterref: { type: 'string' }, paramsfrom: { type: 'string' }, resultto: { type: 'string' }, datalabel: { type: 'string' }, targetlabel: { type: 'string' }, stylizer: { type: 'function' }, output: { type: 'string' } }
};

export function validateFields(value, fieldSpecs) {
  if (value == null) return ['VALUE IS NULL OR UNDEFINED'];
  const errors = [];
  for (const [key, rules] of Object.entries(fieldSpecs)) {
    const propvalue = value[key];
    if (rules.required && propvalue == null) errors.push(`REQUIRED PROPERTY "${key}" IS MISSING`);
    else if (propvalue != null && rules.type) {
      const actual = Array.isArray(propvalue) ? 'array' : typeof propvalue;
      if (actual !== rules.type) errors.push(`PROPERTY "${key}" MUST BE OF TYPE ${rules.type} (GOT ${actual})`);
    }
  }
  return errors;
}

export const validate = (value, schemaname) => {
  const schema = TYPESCHEMA[schemaname];
  if (!schema) return { tag: 'success' };
  const errors = validateFields(value, schema);
  return errors.length ? { tag: 'failure', message: `VALIDATION FAILED FOR SCHEMA "${schemaname}": ${errors.join('; ')}` } : { tag: 'success' };
};

export const validatecall = (schema, fn, functionname = 'anonymous') => (...args) => {
  schema.forEach((rule, i) => {
    const arg = args[i];
    if (rule.required && arg == null) throw new Error(`[TYPESYSTEM] REQUIRED ARGUMENT "${rule.name}" IS MISSING IN ${functionname}.`);
    if (arg !== undefined && rule.type) {
      const actual = Array.isArray(arg) ? 'array' : typeof arg;
      if (actual !== rule.type) throw new Error(`[TYPESYSTEM] ARGUMENT "${rule.name}" IN ${functionname} MUST BE OF TYPE ${rule.type} (GOT ${actual}).`);
    }
  });
  return fn(...args);
};

export async function validateschema(value, schema, context = 'stream', registry = new Map(), strict = false) {
  const errors = [];
  let curr = typeof schema === 'string' ? registry.get(schema) : schema;
  if (curr?.schemaref) curr = registry.get(curr.schemaref);
  if (!curr) return errors;

  if (curr.type && curr.type !== 'any') {
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== curr.type && !(curr.type === 'integer' && actual === 'number' && Number.isInteger(value))) {
      return [`${context}: TYPE MISMATCH. EXPECTED ${curr.type}, GOT ${actual}`];
    }
  }

  if (curr.oneof) {
    const branches = await Promise.all(curr.oneof.map(async (s, i) => ({
      label: s.required ? `variant with keys [${s.required.join(', ')}]` : `variant ${i}`,
      errs: await validateschema(value, s, `${context}<oneOf:${i}>`, registry, strict)
    })));
    if (branches.some(b => b.errs.length === 0)) return [];
    return [`${context}: NO MATCHING VARIANT IN ONEOF.\n${branches.map(b => `  · ${b.label}: ${b.errs.join('; ')}`).join('\n')}`];
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (strict && curr.strict !== false) {
      const allowed = new Set([...(curr.required || []), ...(curr.optional || []), ...Object.keys(curr.properties || {})]);
      Object.keys(value).filter(k => !allowed.has(k)).forEach(k => errors.push(`${context}: UNEXPECTED PROPERTY "${k}"`));
    }
    (curr.required || []).filter(k => !(k in value)).forEach(k => errors.push(`${context}: MISSING REQUIRED PROPERTY "${k}"`));
    if (curr.properties) {
      for (const [k, pval] of Object.entries(value)) {
        if (curr.properties[k]) errors.push(...await validateschema(pval, curr.properties[k], `${context}.${k}`, registry, strict));
      }
    }
  }

  if (curr.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...await validateschema(value[i], curr.items, `${context}[${i}]`, registry, strict));
    }
  }

  (curr.validators || []).forEach(v => errors.push(...v(value, context)));
  return errors;
}

export function validateformalblock(block) {
  const errors = [];
  if (!Array.isArray(block.reads)) errors.push(`FORMAL: block "${block.id}" missing reads[]`);
  if (!Array.isArray(block.writes)) errors.push(`FORMAL: block "${block.id}" missing writes[]`);
  if (block.type === 'api' && (!block.schemaref || !block.paramsfrom || !block.resultto)) {
    errors.push(`FORMAL: api block "${block.id}" missing schemaref/paramsfrom/resultto`);
  }
  return errors;
}

export function validatestageflow(stages) {
  const contracts = [], cumulativewrites = new Set([
    'containerref', 'domlens', 'callapi', 'callwriter', 'callfn', 'registersubscription',
    'spawnagent', 'updateworldmap', 'getworldmap', 'openapischemas', 'validateschema',
    'schemaadapter', 'createnodefromtemplate', 'authsessionaccesstoken', 'agents', 'rituals'
  ]);

  for (const stage of stages) {
    const stagereads = new Set(), stagewrites = new Set();
    (stage.blocks || []).forEach(b => {
      (b.reads || []).forEach(k => stagereads.add(k));
      (b.writes || []).forEach(k => { stagewrites.add(k); cumulativewrites.add(k); });
    });
    const missing = [...stagereads].filter(k => !cumulativewrites.has(k));
    contracts.push({
      stageid: stage.id, stagereads: [...stagereads], stagewrites: [...stagewrites],
      cumulativereads: [...stagereads], cumulativewrites: [...cumulativewrites],
      missingkeys: missing, resolved: missing.length === 0
    });
  }
  return contracts;
}

export const validatemonadalgebra = (name, impl) => ({
  type: name,
  hasunit: typeof impl.of === 'function' || typeof impl.pure === 'function' || typeof impl.JUST === 'function',
  hasbind: typeof impl.chain === 'function' || typeof impl.bind === 'function',
  hasmap: typeof impl.map === 'function',
  lawstatus: 'ASSUMED'
});

export function validateblockio(block, cumulativewrites) {
  return (block.reads || [])
    .filter(k => !cumulativewrites.has(k))
    .map(k => `BLOCK IO: block "${block.id}" reads "${k}" but it has not been written yet`);
}

export function validateblockfnio(block) {
  if (block.type !== 'fn' || !block.fn || !block.signature) return [];
  const pCount = block.fn.length, inCount = (block.signature.inputs || []).length;
  if (pCount > 0 && pCount !== inCount) return [`FN IO: block "${block.id}" fn expects ${pCount} params but declares ${inCount} inputs`];
  return [];
}

export function validatecontainerrefs(pipeline) {
  const errors = [], refsproduced = new Set();
  const { stages } = extractstagesblocks(pipeline);
  stages.forEach(s => (s.blocks || []).forEach(b => {
    if (['writer', 'fn'].includes(b.type)) (b.signature?.outputs || []).forEach(k => refsproduced.add(k));
  }));
  stages.forEach(s => (s.blocks || []).forEach(b => {
    if (b.type === 'spawn') {
      if (b.container && !refsproduced.has(b.container)) errors.push(`SPAWN: block "${b.id}" references unproduced container "${b.container}"`);
      if (!b.dna && !b.dnaref) errors.push(`SPAWN: block "${b.id}" must have dna or dnaref`);
      if (b.dnaref?.from === 'eventTarget' && !b.dnaref.attr && !b.dnaref.key) errors.push(`SPAWN: block "${b.id}" eventTarget dnaref requires attr or key`);
    }
  }));
  return errors;
}

export function validatespawncontracts(pipeline) {
  const errors = [];
  const { stages } = extractstagesblocks(pipeline);
  stages.forEach(s => (s.blocks || []).filter(b => b.type === 'spawn').forEach(b => {
    if (!b.dna && !b.dnaref) errors.push(`SPAWN CONTRACT: block "${b.id}" requires dna or dnaref`);
    if (b.dna && b.dnaref) errors.push(`SPAWN CONTRACT: block "${b.id}" has both dna and dnaref`);
    if (b.container && typeof b.container !== 'string') errors.push(`SPAWN CONTRACT: block "${b.id}" container must be a string`);
  }));
  return errors;
}

export function validateblocktype(block) {
  const valid = ['fn', 'api', 'fetch', 'writer', 'domquery', 'spawn', 'io', 'crypto', 'wait', 'executionquery', 'storequery'];
  return (!block.type || !valid.includes(block.type)) ? [`BLOCK TYPE: block "${block.id}" invalid type: ${block.type}`] : [];
}

export function validatedomqueryblock(block) {
  if (block.type !== 'domquery') return [];
  const cmd = block.command?.COMMAND;
  if (!cmd) return [`DOMQUERY: block "${block.id}" requires command.COMMAND`];
  const all = DOMQUERYMESSAGES.concat(['getviewport', 'getscreen', 'matchmedia']);
  if (!all.includes(cmd)) return [`DOMQUERY: block "${block.id}" unknown COMMAND: ${cmd}`];
  const props = block.command.properties;
  if (!['getviewport', 'getscreen', 'matchmedia'].includes(cmd) && (!props?.id || typeof props.id !== 'string')) {
    return [`DOMQUERY: block "${block.id}" requires command.properties.id`];
  }
  if (DOMQUERYSETTERS.includes(cmd)) {
    if (cmd === 'toggleclass' && (!props?.classname || typeof props.classname !== 'string')) return [`DOMQUERY: block "${block.id}" toggleclass requires classname`];
    if (cmd !== 'toggleclass' && props?.value === undefined) return [`DOMQUERY: block "${block.id}" setter requires value`];
  }
  return [];
}

export function validateexecutionqueryblock(block) {
  if (block.type !== 'executionquery') return [];
  const cmd = block.command?.COMMAND;
  if (!cmd) return [`EXECUTIONQUERY: block "${block.id}" requires command.COMMAND`];
  const allowed = ['get', 'set', 'start', 'stop', 'restart', 'continue', 'save_status', 'tasks', 'task_status', 'await_task', 'cancel_task', 'stop_task', 'recover'];
  if (!allowed.includes(cmd)) return [`EXECUTIONQUERY: block "${block.id}" unknown COMMAND: ${cmd}`];
  return [];
}

export function validatestorequeryblock(block) {
  if (block.type !== 'storequery') return [];
  const cmd = block.command?.COMMAND;
  if (!cmd || !['store', 'restore'].includes(cmd)) return [`STOREQUERY: block "${block.id}" invalid command`];
  return [];
}

export function validateblockproperties(block) {
  if (block.type === 'domquery' && (!block.command?.properties || typeof block.command.properties !== 'object')) {
    return [`DOMQUERY: block "${block.id}" requires object command.properties`];
  }
  return [];
}
