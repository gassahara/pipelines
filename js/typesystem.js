import { DOMQUERYGETTERS, DOMQUERYSETTERS, DOMQUERYMESSAGES } from './actors/renderactor.js';

const extractstagesblocks = (pipeline) => {
    if (pipeline.elements) {
        const stages = [];
        const blocks = [];
        for (const el of pipeline.elements) {
            if (el.element === 'STAGE') {
                stages.push({ id: el.id, control: el.control || null, blocks: (el.elements || []).filter(e => e.element === 'BLOCK') });
            } else if (el.element === 'BLOCK') {
                blocks.push(el);
            }
        }
        return { stages, blocks };
    } else if (pipeline.stages) {
        return { stages: pipeline.stages, blocks: [] };
    }
    return { stages: [], blocks: [] };
};

export const TYPESCHEMA = {
  agent: { 
    dna: { type: 'object', required: true }, 
    pipeline: { type: 'function', required: true } 
  },
  oracledna: { 
    identity: { type: 'object', required: true }, 
    pipeline: { type: 'object', required: true }, 
    presentation: { type: 'object', required: false } 
  },
  layoutcomponent: { 
    key: { type: 'string', required: true }, 
    parent: { type: 'string', required: false }, 
    id: { type: 'string', required: false }, 
    datapath: { type: 'string', required: false } 
  },
  pipeline: {
    stages: { type: 'array', required: true }
  },
  stage: {
    id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    intent: { type: 'string', required: false },
    blocks: { type: 'array', required: false }
  },
  block: {
    id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    ref: { type: 'string', required: false },
    intent: { type: 'string', required: false },
    args: { type: 'array', required: false },
    output: { type: 'string', required: false },
    target: { type: 'string', required: false },
    datapath: { type: 'string', required: false },
    mappings: { type: 'object', required: false }
  },
  rewriterspec: {
    rewriter: { type: 'function', required: true },
    label: { type: 'string', required: true }
  },
  responseadapter: {
    functionname: { type: 'string', required: true },
    registerkey: { type: 'string', required: true },
    pipelinesource: { type: 'string', required: true },
    targetapiref: { type: 'string', required: true },
    validatedfields: { type: 'array', required: false }
  },
  paramadapter: {
    functionname: { type: 'string', required: true },
    registerkey: { type: 'string', required: true },
    pipelinesource: { type: 'string', required: true },
    targetapiref: { type: 'string', required: true },
    readkeys: { type: 'array', required: true }
  },
  blockcontract: {
    id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    reads: { type: 'array', required: false },
    ref: { type: 'string', required: false },
    schemaref: { type: 'string', required: false },
    responseadapterref: { type: 'string', required: false },
    paramsfrom: { type: 'string', required: false },
    resultto: { type: 'string', required: false },
    datalabel: { type: 'string', required: false },
    targetlabel: { type: 'string', required: false },
    stylizer: { type: 'function', required: false },
    output: { type: 'string', required: false }
  }
};

// =============== FC10: Unified field validator ===============

/**
 * Validates a value against a field specification object.
 * Returns an array of error strings (empty if valid).
 */
export function validateFields(value, fieldSpecs) {
    const errors = [];
    if (value === null || value === undefined) {
        errors.push('VALUE IS NULL OR UNDEFINED');
        return errors;
    }
    for (const [key, rules] of Object.entries(fieldSpecs)) {
        const propvalue = value[key];
        if (rules.required && (propvalue === undefined || propvalue === null)) {
            errors.push('REQUIRED PROPERTY "' + key + '" IS MISSING');
            continue;
        }
        if (propvalue !== undefined && propvalue !== null) {
            const actualtype = Array.isArray(propvalue) ? 'array' : typeof propvalue;
            if (rules.type && actualtype !== rules.type) {
                errors.push('PROPERTY "' + key + '" MUST BE OF TYPE ' + rules.type + ' (GOT ' + actualtype + ')');
            }
        }
    }
    return errors;
}

export const validate = (value, schemaname) => {
    const schema = TYPESCHEMA[schemaname];
    if (!schema) return { tag: 'success' };
    const errors = validateFields(value, schema);
    if (errors.length > 0) {
        return { tag: 'failure', message: 'VALIDATION FAILED FOR SCHEMA "' + schemaname + '": ' + errors.join('; ') };
    }
    return { tag: 'success' };
};

export const validatecall = (schema, fn, functionname = 'anonymous') => {
  return (...args) => {
    for (let i = 0; i < schema.length; i++) {
      const arg = args[i];
      const rule = schema[i];
      if (rule.required && (arg === undefined || arg === null)) {
        throw new Error('[TYPESYSTEM] REQUIRED ARGUMENT "' + rule.name + '" IS MISSING IN ' + functionname + '.');
      }
      if (arg !== undefined && rule.type) {
        const actualtype = Array.isArray(arg) ? 'array' : typeof arg;
        if (actualtype !== rule.type) {
          throw new Error('[TYPESYSTEM] ARGUMENT "' + rule.name + '" IN ' + functionname + ' MUST BE OF TYPE ' + rule.type + ' (GOT ' + actualtype + ').');
        }
      }
    }
    return fn(...args);
  };
};

export async function validateschema(value, schema, context = 'stream', registry = new Map(), strict = false) {
    const errors = [];
    
    let currentschema = typeof schema === 'string' ? registry.get(schema) : schema;
    if (currentschema?.schemaref) currentschema = registry.get(currentschema.schemaref);
    
    if (!currentschema) return errors;

    if (currentschema.type && currentschema.type !== 'any') {
      const actualtype = Array.isArray(value) ? 'array' : typeof value;
      if (actualtype !== currentschema.type) {
        if (currentschema.type === 'integer' && actualtype === 'number' && Number.isInteger(value)) {
        } else {
          errors.push(context + ': TYPE MISMATCH. EXPECTED ' + currentschema.type + ', GOT ' + actualtype);
          return errors;
        }
      }
    }

    if (currentschema.oneof) {
      const branchresults = await Promise.all(
        currentschema.oneof.map(async (s, i) => {
          const label = s.required ? 'variant with keys [' + s.required.join(', ') + ']' : 'variant ' + i;
          const errs = await validateschema(value, s, context + '<oneOf:' + i + '>', registry, strict);
          return { label, errs };
        })
      );
      
      const winner = branchresults.find(b => b.errs.length === 0);
      if (winner) return [];

      const branchreport = branchresults.map(b => '  · ' + b.label + ': ' + b.errs.join('; ')).join('\\n');
      errors.push(context + ': NO MATCHING VARIANT IN ONEOF.\\n' + branchreport);
      return errors;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (strict && currentschema.strict !== false) {
        const allowed = new Set([
          ...(currentschema.required || []), 
          ...(currentschema.optional || []),
          ...Object.keys(currentschema.properties || {})
        ]);
        for (const key of Object.keys(value)) {
          if (!allowed.has(key)) {
            errors.push(context + ': UNEXPECTED PROPERTY "' + key + '"');
          }
        }
      }

      if (currentschema.required) {
        for (const reqkey of currentschema.required) {
          if (!(reqkey in value)) {
            errors.push(context + ': MISSING REQUIRED PROPERTY "' + reqkey + '"');
          }
        }
      }

      if (currentschema.properties) {
        for (const [key, propvalue] of Object.entries(value)) {
          const propschema = currentschema.properties[key];
          if (propschema) {
            const properrors = await validateschema(propvalue, propschema, context + '.' + key, registry, strict);
            errors.push(...properrors);
          }
        }
      }
    }

    if (currentschema.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const itemerrors = await validateschema(value[i], currentschema.items, context + '[' + i + ']', registry, strict);
        errors.push(...itemerrors);
      }
    }

    if (currentschema.validators) {
      for (const validator of currentschema.validators) {
        errors.push(...validator(value, context));
      }
    }

    return errors;
}

export function validateformalblock(block, registries = {}) {
    const errors = [];
    if (!Array.isArray(block.reads)) errors.push('FORMAL: block "' + block.id + '" missing reads[]');
    if (!Array.isArray(block.writes)) errors.push('FORMAL: block "' + block.id + '" missing writes[]');
    if (block.type === 'api') {
        if (!block.schemaref) errors.push('FORMAL: api block "' + block.id + '" missing schemaref');
        if (!block.paramsfrom) errors.push('FORMAL: api block "' + block.id + '" missing paramsfrom');
        if (!block.resultto) errors.push('FORMAL: api block "' + block.id + '" missing resultto');
    }

    if (block.contract) {
        if (block.contract.inputschema && typeof block.contract.inputschema !== 'object') errors.push('FORMAL: block "' + block.id + '" contract.inputschema must be an object');
        if (block.contract.outputschema && typeof block.contract.outputschema !== 'object') errors.push('FORMAL: block "' + block.id + '" contract.outputschema must be an object');
    }
    return errors;
}

export function validatestageflow(stages) {
  const contracts = [];
  const cumulativewrites = new Set();
  const injectedservices = new Set([
    'containerref', 'domlens', 'callapi', 'callwriter', 'callfn',
    'registersubscription', 'spawnagent', 'updateworldmap', 'getworldmap',
    'openapischemas', 'validateschema', 'schemaadapter',
    'createnodefromtemplate', 'authsessionaccesstoken', 'agents', 'rituals',
  ]);
  injectedservices.forEach(s => cumulativewrites.add(s));

  for (const stage of stages) {
    const stagereads = new Set();
    const stagewrites = new Set();
    for (const block of (stage.blocks || [])) {
      (block.reads || []).forEach(k => { stagereads.add(k); });
      (block.writes || []).forEach(k => { stagewrites.add(k); cumulativewrites.add(k); });
    }
    const missing = [...stagereads].filter(k => !cumulativewrites.has(k));
    contracts.push({
      stageid: stage.id,
      stagereads: [...stagereads],
      stagewrites: [...stagewrites],
      cumulativereads: [...stagereads],
      cumulativewrites: [...cumulativewrites],
      missingkeys: missing,
      resolved: missing.length === 0
    });
  }
  return contracts;
}

export function validatemonadalgebra(name, impl) {
  return {
    type: name,
    hasunit: typeof impl.of === 'function' || typeof impl.pure === 'function' || typeof impl.JUST === 'function',
    hasbind: typeof impl.chain === 'function' || typeof impl.bind === 'function',
    hasmap: typeof impl.map === 'function',
    lawstatus: 'ASSUMED'
  };
}

export function validateblockio(block, cumulativewrites) {
    const errors = [];
    const reads = block.reads || [];
    for (const key of reads) {
        if (!cumulativewrites.has(key)) {
            errors.push('BLOCK IO: block "' + block.id + '" reads "' + key + '" but it has not been written yet');
        }
    }
    return errors;
}

export function validateblockfnio(block) {
    const errors = [];
    if (block.type !== 'fn') return errors;
    const sig = block.signature;
    if (!sig) return errors;
    const fn = block.fn;
    if (!fn) return errors;
    const paramcount = fn.length;
    const inputcount = (sig.inputs || []).length;
    const outputcount = (sig.outputs || []).length;
    if (paramcount > 0 && paramcount !== inputcount) {
        errors.push('FN IO: block "' + block.id + '" fn expects ' + paramcount + ' params but signature declares ' + inputcount + ' inputs');
    }
    if (inputcount === 0 && paramcount > 0) {
        errors.push('FN IO: block "' + block.id + '" has 0 inputs but fn expects ' + paramcount + ' params');
    }
    return errors;
}

export function validatecontainerrefs(pipeline) {
    const errors = [];
    const refsproduced = new Set();
    const { stages } = extractstagesblocks(pipeline);
    for (const stage of stages) {
        for (const block of (stage.blocks || [])) {
            if (block.type === 'writer' || block.type === 'fn') {
                const outputs = block.signature ? (block.signature.outputs || []) : [];
                outputs.forEach(k => refsproduced.add(k));
            }
        }
    }
    for (const stage of stages) {
        for (const block of (stage.blocks || [])) {
            if (block.type === 'spawn') {
                const containerkey = block.container;
                if (containerkey && !refsproduced.has(containerkey)) {
                    errors.push('SPAWN: block "' + block.id + '" references container "' + containerkey + '" which is not produced by any preceding stage');
                }
                if (!block.dna && !block.dnaref) {
                    errors.push('SPAWN: block "' + block.id + '" must have either \'dna\' or \'dnaref\' property');
                }
                if (block.dnaref && block.dnaref.from === 'eventTarget' && !block.dnaref.attr && !block.dnaref.key) {
                    errors.push('SPAWN: block "' + block.id + '" dnaref with from:eventTarget must specify attr or key');
                }
            }
        }
    }
    return errors;
}

export function validatespawncontracts(pipeline) {
    const errors = [];
    const { stages } = extractstagesblocks(pipeline);
    for (const stage of stages) {
        for (const block of (stage.blocks || [])) {
            if (block.type !== 'spawn') continue;
            const hasdna = !!block.dna;
            const hasdnaref = !!block.dnaref;
            if (!hasdna && !hasdnaref) {
                errors.push('SPAWN CONTRACT: block "' + block.id + '" requires dna or dnaref');
            }
            if (hasdna && hasdnaref) {
                errors.push('SPAWN CONTRACT: block "' + block.id + '" has both dna and dnaref; use one');
            }
            if (block.container && typeof block.container !== 'string') {
                errors.push('SPAWN CONTRACT: block "' + block.id + '" container must be a string (env key)');
            }
        }
    }
    return errors;
}

export function validateblocktype(block) {
    const errors = [];
    const validtypes = ['fn', 'api', 'writer', 'domquery', 'spawn', 'io', 'crypto', 'wait'];
    if (!block.type || !validtypes.includes(block.type)) {
        errors.push('BLOCK TYPE: block "' + block.id + '" has invalid type: ' + block.type + '. Valid types: ' + validtypes.join(', '));
    }
    return errors;
}

export function validatedomqueryblock(block) {
    const errors = [];
    if (block.type !== 'domquery') return errors;
    if (!block.command || !block.command.COMMAND) {
        errors.push('DOMQUERY: block "' + block.id + '" requires command with COMMAND');
        return errors;
    }
    const getters = DOMQUERYGETTERS;
    const setters = DOMQUERYSETTERS;
    if (!DOMQUERYMESSAGES.includes(block.command.COMMAND)) {
        errors.push('DOMQUERY: block "' + block.id + '" unknown COMMAND: ' + block.command.COMMAND);
    }
    const cmdprops = block.command.properties;
    if (!cmdprops || !cmdprops.id || typeof cmdprops.id !== 'string') {
        errors.push('DOMQUERY: block "' + block.id + '" command requires properties.id (string)');
    }
    if (setters.includes(block.command.COMMAND) && cmdprops && cmdprops.value === undefined) {
        errors.push('DOMQUERY: block "' + block.id + '" setter requires command.properties.value');
    }
    return errors;
}

export function validateblockproperties(block) {
    const errors = [];
    if (block.type === 'domquery') {
        const cmdprops = block.command && block.command.properties;
        if (!cmdprops) {
            errors.push('DOMQUERY: block "' + block.id + '" requires command.properties block');
        } else if (typeof cmdprops !== 'object') {
            errors.push('DOMQUERY: block "' + block.id + '" command.properties must be an object');
        }
    }
    return errors;
}
