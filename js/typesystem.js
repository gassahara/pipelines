function extractstagesblocks(pipeline) {
  if (pipeline.elements) {
    var elements = pipeline.elements || [];
    var result = elements.reduce(function(acc, el) {
      if (el.element === 'STAGE') {
        acc.stages.push({
          id: el.id,
          control: el.control || null,
          blocks: (el.elements || []).filter(function(e) { return e.element === 'BLOCK'; })
        });
      } else if (el.element === 'BLOCK') {
        acc.blocks.push(el);
      }
      return acc;
    }, { stages: [], blocks: [] });
    return result;
  }
  return { stages: pipeline.stages || [], blocks: [] };
}

var TYPESCHEMA = {
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

function validateFields(value, fieldSpecs) {
  if (value == null) return ['VALUE IS NULL OR UNDEFINED'];
  var keys = Object.keys(fieldSpecs || {});
  return keys.reduce(function(errors, key) {
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
    return errors;
  }, []);
}

var validate = function(value, schemaname) {
  var schema = TYPESCHEMA[schemaname];
  if (!schema) return { tag: 'success' };
  var errors = validateFields(value, schema);
  return errors.length
    ? { tag: 'failure', message: 'VALIDATION FAILED FOR SCHEMA "' + schemaname + '": ' + errors.join('; ') }
    : { tag: 'success' };
};

var validatecall = function(schema, fn, functionname) {
  if (functionname === undefined) functionname = 'anonymous';
  return function() {
    var args = arguments;
    schema.forEach(function(rule, i) {
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
    });
    return fn.apply(null, args);
  };
};

// validateschema — ES5 promise-chain CPS (was async/await recursive).
function validateschemaInner(value, schema, context, registry, strict) {
  var errors = [];
  var curr = typeof schema === 'string' ? registry[schema] : schema;
  if (curr && curr.schemaref) curr = registry[curr.schemaref];
  if (!curr) return Promise.resolve(errors);

  if (curr.type && curr.type !== 'any') {
    var actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== curr.type && !(curr.type === 'integer' && actualType === 'number' && Math.floor(value) === value)) {
      return Promise.resolve([context + ': TYPE MISMATCH. EXPECTED ' + curr.type + ', GOT ' + actualType]);
    }
  }

  if (curr.oneof) {
    var branches = [];
    var oi = 0;
    var nextOneOf = function() {
      if (oi >= curr.oneof.length) {
        var branchText = branches.map(function(b) {
          return '  · ' + b.label + ': ' + b.errs.join('; ') + '\n';
        }).join('');
        return Promise.resolve([context + ': NO MATCHING VARIANT IN ONEOF.\n' + branchText]);
      }
      var s = curr.oneof[oi];
      oi += 1;
      var label = s.required ? 'variant with keys [' + s.required.join(', ') + ']' : 'variant ' + (oi - 1);
      return validateschemaInner(value, s, context + '<oneOf:' + (oi - 1) + '>', registry, strict).then(function(errs) {
        if (errs.length === 0) return [];
        branches.push({ label: label, errs: errs });
        return nextOneOf();
      });
    };
    return nextOneOf();
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (strict && curr.strict !== false) {
      var allowedMap = {};
      var required = curr.required || [];
      var optional = curr.optional || [];
      var propertyKeys = Object.keys(curr.properties || {});
      required.forEach(function(r) { allowedMap[r] = true; });
      optional.forEach(function(o) { allowedMap[o] = true; });
      propertyKeys.forEach(function(pk) { allowedMap[pk] = true; });

      var valueKeys = Object.keys(value);
      valueKeys.forEach(function(vk) {
        if (!allowedMap[vk]) errors.push(context + ': UNEXPECTED PROPERTY "' + vk + '"');
      });
    }

    var req = curr.required || [];
    req.forEach(function(r) {
      if (!(r in value)) errors.push(context + ': MISSING REQUIRED PROPERTY "' + r + '"');
    });

    if (curr.properties) {
      var keys = Object.keys(value);
      var ki = 0;
      var nextProperty = function() {
        if (ki >= keys.length) return Promise.resolve(errors);
        var k = keys[ki];
        ki += 1;
        if (curr.properties[k]) {
          return validateschemaInner(value[k], curr.properties[k], context + '.' + k, registry, strict).then(function(childErrors) {
            childErrors.forEach(function(ce) { errors.push(ce); });
            return nextProperty();
          });
        }
        return nextProperty();
      };
      return nextProperty();
    }
  }

  if (curr.items && Array.isArray(value)) {
    var ii = 0;
    var nextItem = function() {
      if (ii >= value.length) return Promise.resolve(errors);
      var item = value[ii];
      ii += 1;
      return validateschemaInner(item, curr.items, context + '[' + (ii - 1) + ']', registry, strict).then(function(itemErrors) {
        itemErrors.forEach(function(ie) { errors.push(ie); });
        return nextItem();
      });
    };
    return nextItem();
  }

  var validators = curr.validators || [];
  var vi2 = 0;
  var nextValidator = function() {
    if (vi2 >= validators.length) return Promise.resolve(errors);
    var verrors = validators[vi2](value, context);
    vi2 += 1;
    verrors.forEach(function(ve) { errors.push(ve); });
    return nextValidator();
  };
  return nextValidator();
}

function validateschema(value, schema, context, registry, strict) {
  if (context === undefined) context = 'stream';
  if (registry === undefined) registry = {};
  if (strict === undefined) strict = false;
  return validateschemaInner(value, schema, context, registry, strict);
}

function validateformalblock(block) {
  var errors = [];
  if (!Array.isArray(block.reads)) errors.push('FORMAL: block "' + block.id + '" missing reads[]');
  if (!Array.isArray(block.writes)) errors.push('FORMAL: block "' + block.id + '" missing writes[]');
  if (block.type === 'api' && (!block.schemaref || !block.paramsfrom || !block.resultto)) {
    errors.push('FORMAL: api block "' + block.id + '" missing schemaref/paramsfrom/resultto');
  }
  return errors;
}

function validatestageflow(stages) {
  var cumulativewrites = {};

  var ambientKeys = [
    'containerref', 'domlens', 'callapi', 'callwriter', 'callfn', 'registersubscription',
    'spawnagent', 'updateworldmap', 'getworldmap', 'openapischemas', 'validateschema',
    'schemaadapter', 'createnodefromtemplate', 'authsessionaccesstoken', 'agents', 'rituals'
  ];
  ambientKeys.forEach(function(k) {
    cumulativewrites[k] = true;
  });

  var contracts = stages.map(function(stage) {
    var stagereads = {};
    var stagewrites = {};
    var blocks = stage.blocks || [];

    blocks.forEach(function(b) {
      var inputs = b.inputs || [];
      inputs.forEach(function(inp) { stagereads[inp] = true; });

      var outputKeys = Object.keys(b.outputs || {});
      outputKeys.forEach(function(key) {
        stagewrites[key] = true;
        cumulativewrites[key] = true;
      });
    });

    var readKeys = Object.keys(stagereads);
    var missing = readKeys.filter(function(rk) {
      return !cumulativewrites[rk];
    });

    return {
      stageid: stage.id,
      stagereads: readKeys,
      stagewrites: Object.keys(stagewrites),
      cumulativereads: readKeys,
      cumulativewrites: Object.keys(cumulativewrites),
      missingkeys: missing,
      resolved: missing.length === 0
    };
  });

  return contracts;
}

var validatemonadalgebra = function(name, impl) {
  return {
    type: name,
    hasunit: typeof impl.of === 'function' || typeof impl.pure === 'function' || typeof impl.JUST === 'function',
    hasbind: typeof impl.chain === 'function' || typeof impl.bind === 'function',
    hasmap: typeof impl.map === 'function',
    lawstatus: 'ASSUMED'
  };
};

function validateblockio(block, cumulativewrites) {
  var reads = block.reads || [];
  return reads.reduce(function(errors, readkey) {
    if (!cumulativewrites[readkey]) {
      errors.push('BLOCK IO: block "' + block.id + '" reads "' + readkey + '" but it has not been written yet');
    }
    return errors;
  }, []);
}

function validateblockfnio(block) {
  if (block.type !== 'fn' || !block.fn || !block.signature) return [];
  var pCount = block.fn.length;
  var inputs = block.signature.inputs || [];
  if (pCount > 0 && pCount !== inputs.length) {
    return ['FN IO: block "' + block.id + '" fn expects ' + pCount + ' params but declares ' + inputs.length + ' inputs'];
  }
  return [];
}

function validatecontainerrefs(pipeline) {
  var errors = [];
  var refsproduced = {};
  var extracted = extractstagesblocks(pipeline);

  extracted.stages.forEach(function(stage) {
    var blocks = stage.blocks || [];
    blocks.forEach(function(b) {
      if (b.type === 'writer' || b.type === 'fn') {
        var outputs = Object.keys((b.signature && b.signature.outputs) || {});
        outputs.forEach(function(o) { refsproduced[o] = true; });
      }
    });
  });

  extracted.stages.forEach(function(stage) {
    var blocks2 = stage.blocks || [];
    blocks2.forEach(function(block) {
      if (block.type === 'spawn') {
        if (block.container && !refsproduced[block.container]) errors.push('SPAWN: block "' + block.id + '" references unproduced container "' + block.container + '"');
        if (!block.dna && !block.dnaref) errors.push('SPAWN: block "' + block.id + '" must have dna or dnaref');
        if (block.dnaref && block.dnaref.from === 'eventTarget' && !block.dnaref.attr && !block.dnaref.key) {
          errors.push('SPAWN: block "' + block.id + '" eventTarget dnaref requires attr or key');
        }
      }
    });
  });
  return errors;
}

function validatespawncontracts(pipeline) {
  var extracted = extractstagesblocks(pipeline);
  var errors = extracted.stages.reduce(function(acc, stage) {
    var blocks = stage.blocks || [];
    blocks.forEach(function(b) {
      if (b.type === 'spawn') {
        if (!b.dna && !b.dnaref) acc.push('SPAWN CONTRACT: block "' + b.id + '" requires dna or dnaref');
        if (b.dna && b.dnaref) acc.push('SPAWN CONTRACT: block "' + b.id + '" has both dna and dnaref');
        if (b.container && typeof b.container !== 'string') acc.push('SPAWN CONTRACT: block "' + b.id + '" container must be a string');
      }
    });
    return acc;
  }, []);
  return errors;
}

// P17: Align with blockcompiler supported types. Remove 'spawn' from valid list.
function validateblocktype(block) {
  var valid = ['fn', 'api', 'fetch', 'writer', 'domquery', 'io', 'crypto', 'wait', 'executionquery', 'storequery'];
  if (!block.type || valid.indexOf(block.type) === -1) {
    return ['BLOCK TYPE: block "' + block.id + '" invalid type: ' + block.type];
  }
  return [];
}

function validatedomqueryblock(block) {
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

// P10: Align with actual compiler support (only six commands)
function validateexecutionqueryblock(block) {
  if (block.type !== 'executionquery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND;
  if (!cmd) return ['EXECUTIONQUERY: block "' + block.id + '" requires command.COMMAND'];
  var allowed = ['get', 'tasks', 'task_status', 'await_task', 'cancel_task', 'stop_task'];
  if (allowed.indexOf(cmd) === -1) return ['EXECUTIONQUERY: block "' + block.id + '" unknown COMMAND: ' + cmd];
  return [];
}

function validatestorequeryblock(block) {
  if (block.type !== 'storequery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND;
  if (!cmd || ['store', 'restore'].indexOf(cmd) === -1) return ['STOREQUERY: block "' + block.id + '" invalid command'];
  return [];
}

function validateblockproperties(block) {
  if (block.type === 'domquery' && (!block.command || !block.command.properties || typeof block.command.properties !== 'object')) {
    return ['DOMQUERY: block "' + block.id + '" requires object command.properties'];
  }
  return [];
}
