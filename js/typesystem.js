import { DOMQUERYMESSAGES, DOMQUERYSETTERS } from './actors/renderactor.js';

function extractstagesblocks(pipeline) {
  if (pipeline.elements) {
    var stages = [];
    var blocks = [];
    var elements = pipeline.elements || [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.element === 'STAGE') {
        stages.push({
          id: el.id,
          control: el.control || null,
          blocks: (el.elements || []).filter(function(e) { return e.element === 'BLOCK'; })
        });
      } else if (el.element === 'BLOCK') {
        blocks.push(el);
      }
    }
    return { stages: stages, blocks: blocks };
  }
  return { stages: pipeline.stages || [], blocks: [] };
}

export var TYPESCHEMA = {
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
  var errors = [];
  var keys = Object.keys(fieldSpecs || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var rules = fieldSpecs[key];
    var propvalue = value[key];
    if (rules.required && propvalue == null) {
      errors.push('REQUIRED PROPERTY "' + key + '" IS MISSING');
    } else if (propvalue != null && rules.type) {
      var actual = Array.isArray(propvalue) ? 'array' : typeof propvalue;
      if (actual !== rules.type) {
        errors.push('PROPERTY "' + key + '" MUST BE OF TYPE ' + rules.type + ' (GOT ' + actual + ')');
      }
    }
  }
  return errors;
}

export var validate = function(value, schemaname) {
  var schema = TYPESCHEMA[schemaname];
  if (!schema) return { tag: 'success' };
  var errors = validateFields(value, schema);
  return errors.length
    ? { tag: 'failure', message: 'VALIDATION FAILED FOR SCHEMA "' + schemaname + '": ' + errors.join('; ') }
    : { tag: 'success' };
};

export var validatecall = function(schema, fn, functionname) {
  if (functionname === undefined) functionname = 'anonymous';
  return function() {
    var args = arguments;
    for (var i = 0; i < schema.length; i++) {
      var rule = schema[i];
      var arg = args[i];
      if (rule.required && arg == null) {
        throw new Error('[TYPESYSTEM] REQUIRED ARGUMENT "' + rule.name + '" IS MISSING IN ' + functionname + '.');
      }
      if (arg !== undefined && rule.type) {
        var actual = Array.isArray(arg) ? 'array' : typeof arg;
        if (actual !== rule.type) {
          throw new Error('[TYPESYSTEM] ARGUMENT "' + rule.name + '" IN ' + functionname + ' MUST BE OF TYPE ' + rule.type + ' (GOT ' + actual + ').');
        }
      }
    }
    return fn.apply(null, args);
  };
};

export async function validateschema(value, schema, context, registry, strict) {
  if (context === undefined) context = 'stream';
  if (registry === undefined) registry = new Map();
  if (strict === undefined) strict = false;

  var errors = [];
  var curr = typeof schema === 'string' ? registry.get(schema) : schema;
  if (curr && curr.schemaref) curr = registry.get(curr.schemaref);
  if (!curr) return errors;

  if (curr.type && curr.type !== 'any') {
    var actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== curr.type && !(curr.type === 'integer' && actualType === 'number' && Number.isInteger(value))) {
      return [context + ': TYPE MISMATCH. EXPECTED ' + curr.type + ', GOT ' + actualType];
    }
  }

  if (curr.oneof) {
    var branches = [];
    for (var oi = 0; oi < curr.oneof.length; oi++) {
      var s = curr.oneof[oi];
      var label = s.required ? 'variant with keys [' + s.required.join(', ') + ']' : 'variant ' + oi;
      var errs = await validateschema(value, s, context + '<oneOf:' + oi + '>', registry, strict);
      branches.push({ label: label, errs: errs });
    }
    for (var bi = 0; bi < branches.length; bi++) {
      if (branches[bi].errs.length === 0) return [];
    }
    var branchText = '';
    for (var bj = 0; bj < branches.length; bj++) {
      branchText += '  · ' + branches[bj].label + ': ' + branches[bj].errs.join('; ') + '\n';
    }
    return [context + ': NO MATCHING VARIANT IN ONEOF.\n' + branchText];
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (strict && curr.strict !== false) {
      var allowedMap = {};
      var required = curr.required || [];
      var optional = curr.optional || [];
      var propertyKeys = Object.keys(curr.properties || {});
      for (var ai = 0; ai < required.length; ai++) allowedMap[required[ai]] = true;
      for (var oi2 = 0; oi2 < optional.length; oi2++) allowedMap[optional[oi2]] = true;
      for (var pi = 0; pi < propertyKeys.length; pi++) allowedMap[propertyKeys[pi]] = true;

      var valueKeys = Object.keys(value);
      for (var vi = 0; vi < valueKeys.length; vi++) {
        if (!allowedMap[valueKeys[vi]]) errors.push(context + ': UNEXPECTED PROPERTY "' + valueKeys[vi] + '"');
      }
    }

    var req = curr.required || [];
    for (var ri = 0; ri < req.length; ri++) {
      if (!(req[ri] in value)) errors.push(context + ': MISSING REQUIRED PROPERTY "' + req[ri] + '"');
    }

    if (curr.properties) {
      var keys = Object.keys(value);
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (curr.properties[k]) {
          var childErrors = await validateschema(value[k], curr.properties[k], context + '.' + k, registry, strict);
          for (var ci = 0; ci < childErrors.length; ci++) errors.push(childErrors[ci]);
        }
      }
    }
  }

  if (curr.items && Array.isArray(value)) {
    for (var ii = 0; ii < value.length; ii++) {
      var itemErrors = await validateschema(value[ii], curr.items, context + '[' + ii + ']', registry, strict);
      for (var ie = 0; ie < itemErrors.length; ie++) errors.push(itemErrors[ie]);
    }
  }

  var validators = curr.validators || [];
  for (var vi2 = 0; vi2 < validators.length; vi2++) {
    var verrors = validators[vi2](value, context);
    for (var ve = 0; ve < verrors.length; ve++) errors.push(verrors[ve]);
  }

  return errors;
}

export function validateformalblock(block) {
  var errors = [];
  if (!Array.isArray(block.reads)) errors.push('FORMAL: block "' + block.id + '" missing reads[]');
  if (!Array.isArray(block.writes)) errors.push('FORMAL: block "' + block.id + '" missing writes[]');
  if (block.type === 'api' && (!block.schemaref || !block.paramsfrom || !block.resultto)) {
    errors.push('FORMAL: api block "' + block.id + '" missing schemaref/paramsfrom/resultto');
  }
  return errors;
}

export function validatestageflow(stages) {
  var contracts = [];
  var cumulativewrites = {};

  var ambientKeys = [
    'containerref', 'domlens', 'callapi', 'callwriter', 'callfn', 'registersubscription',
    'spawnagent', 'updateworldmap', 'getworldmap', 'openapischemas', 'validateschema',
    'schemaadapter', 'createnodefromtemplate', 'authsessionaccesstoken', 'agents', 'rituals'
  ];
  for (var ai = 0; ai < ambientKeys.length; ai++) {
    cumulativewrites[ambientKeys[ai]] = true;
  }

  for (var si = 0; si < stages.length; si++) {
    var stage = stages[si];
    var stagereads = {};
    var stagewrites = {};
    var blocks = stage.blocks || [];

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];

      var inputs = b.inputs || [];
      for (var ii = 0; ii < inputs.length; ii++) {
        stagereads[inputs[ii]] = true;
      }

      var outputKeys = Object.keys(b.outputs || {});
      for (var oi = 0; oi < outputKeys.length; oi++) {
        var key = outputKeys[oi];
        stagewrites[key] = true;
        cumulativewrites[key] = true;
      }
    }

    var readKeys = Object.keys(stagereads);
    var missing = [];
    for (var ri = 0; ri < readKeys.length; ri++) {
      if (!cumulativewrites[readKeys[ri]]) missing.push(readKeys[ri]);
    }

    contracts.push({
      stageid: stage.id,
      stagereads: readKeys,
      stagewrites: Object.keys(stagewrites),
      cumulativereads: readKeys,
      cumulativewrites: Object.keys(cumulativewrites),
      missingkeys: missing,
      resolved: missing.length === 0
    });
  }

  return contracts;
}

export var validatemonadalgebra = function(name, impl) {
  return {
    type: name,
    hasunit: typeof impl.of === 'function' || typeof impl.pure === 'function' || typeof impl.JUST === 'function',
    hasbind: typeof impl.chain === 'function' || typeof impl.bind === 'function',
    hasmap: typeof impl.map === 'function',
    lawstatus: 'ASSUMED'
  };
};

export function validateblockio(block, cumulativewrites) {
  var reads = block.reads || [];
  var errors = [];
  for (var i = 0; i < reads.length; i++) {
    if (!cumulativewrites[reads[i]]) {
      errors.push('BLOCK IO: block "' + block.id + '" reads "' + reads[i] + '" but it has not been written yet');
    }
  }
  return errors;
}

export function validateblockfnio(block) {
  if (block.type !== 'fn' || !block.fn || !block.signature) return [];
  var pCount = block.fn.length;
  var inputs = block.signature.inputs || [];
  if (pCount > 0 && pCount !== inputs.length) {
    return ['FN IO: block "' + block.id + '" fn expects ' + pCount + ' params but declares ' + inputs.length + ' inputs'];
  }
  return [];
}

export function validatecontainerrefs(pipeline) {
  var errors = [];
  var refsproduced = {};
  var extracted = extractstagesblocks(pipeline);

  for (var si = 0; si < extracted.stages.length; si++) {
    var blocks = extracted.stages[si].blocks || [];
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.type === 'writer' || b.type === 'fn') {
        var outputs = Object.keys((b.signature && b.signature.outputs) || {});
        for (var oi = 0; oi < outputs.length; oi++) refsproduced[outputs[oi]] = true;
      }
    }
  }

  for (var sj = 0; sj < extracted.stages.length; sj++) {
    var blocks2 = extracted.stages[sj].blocks || [];
    for (var bj = 0; bj < blocks2.length; bj++) {
      var block = blocks2[bj];
      if (block.type === 'spawn') {
        if (block.container && !refsproduced[block.container]) errors.push('SPAWN: block "' + block.id + '" references unproduced container "' + block.container + '"');
        if (!block.dna && !block.dnaref) errors.push('SPAWN: block "' + block.id + '" must have dna or dnaref');
        if (block.dnaref && block.dnaref.from === 'eventTarget' && !block.dnaref.attr && !block.dnaref.key) {
          errors.push('SPAWN: block "' + block.id + '" eventTarget dnaref requires attr or key');
        }
      }
    }
  }
  return errors;
}

export function validatespawncontracts(pipeline) {
  var errors = [];
  var extracted = extractstagesblocks(pipeline);
  for (var si = 0; si < extracted.stages.length; si++) {
    var blocks = extracted.stages[si].blocks || [];
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.type === 'spawn') {
        if (!b.dna && !b.dnaref) errors.push('SPAWN CONTRACT: block "' + b.id + '" requires dna or dnaref');
        if (b.dna && b.dnaref) errors.push('SPAWN CONTRACT: block "' + b.id + '" has both dna and dnaref');
        if (b.container && typeof b.container !== 'string') errors.push('SPAWN CONTRACT: block "' + b.id + '" container must be a string');
      }
    }
  }
  return errors;
}

// P17: Align with blockcompiler supported types. Remove 'spawn' from valid list.
export function validateblocktype(block) {
  var valid = ['fn', 'api', 'fetch', 'writer', 'domquery', 'io', 'crypto', 'wait', 'executionquery', 'storequery'];
  if (!block.type || valid.indexOf(block.type) === -1) {
    return ['BLOCK TYPE: block "' + block.id + '" invalid type: ' + block.type];
  }
  return [];
}

export function validatedomqueryblock(block) {
  if (block.type !== 'domquery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND;
  if (!cmd) return ['DOMQUERY: block "' + block.id + '" requires command.COMMAND'];
  var all = DOMQUERYMESSAGES.concat(['getviewport', 'getscreen', 'matchmedia']);
  if (all.indexOf(cmd) === -1) return ['DOMQUERY: block "' + block.id + '" unknown COMMAND: ' + cmd];
  var props = command.properties || {};
  if (['getviewport', 'getscreen', 'matchmedia'].indexOf(cmd) === -1 && (!props.id || typeof props.id !== 'string')) {
    return ['DOMQUERY: block "' + block.id + '" requires command.properties.id'];
  }
  if (DOMQUERYSETTERS.indexOf(cmd) !== -1) {
    if (cmd === 'toggleclass' && (!props.classname || typeof props.classname !== 'string')) return ['DOMQUERY: block "' + block.id + '" toggleclass requires classname'];
    if (cmd !== 'toggleclass' && props.value === undefined) return ['DOMQUERY: block "' + block.id + '" setter requires value'];
  }
  return [];
}

export function validateexecutionqueryblock(block) {
  if (block.type !== 'executionquery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND;
  if (!cmd) return ['EXECUTIONQUERY: block "' + block.id + '" requires command.COMMAND'];
  var allowed = ['get', 'set', 'start', 'stop', 'restart', 'continue', 'save_status', 'tasks', 'task_status', 'await_task', 'cancel_task', 'stop_task', 'recover'];
  if (allowed.indexOf(cmd) === -1) return ['EXECUTIONQUERY: block "' + block.id + '" unknown COMMAND: ' + cmd];
  return [];
}

export function validatestorequeryblock(block) {
  if (block.type !== 'storequery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND;
  if (!cmd || ['store', 'restore'].indexOf(cmd) === -1) return ['STOREQUERY: block "' + block.id + '" invalid command'];
  return [];
}

export function validateblockproperties(block) {
  if (block.type === 'domquery' && (!block.command || !block.command.properties || typeof block.command.properties !== 'object')) {
    return ['DOMQUERY: block "' + block.id + '" requires object command.properties'];
  }
  return [];
}
