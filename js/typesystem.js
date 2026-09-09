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

var typeschema = {
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

function validatefields(value, fieldspecs) {
  if (value == null) return ['VALUE IS NULL OR UNDEFINED'];
  var keys = Object.keys(fieldspecs || {});
  return keys.reduce(function(errors, key) {
    var rules = fieldspecs[key];
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
  var schema = typeschema[schemaname];
  if (!schema) return { tag: 'success' };
  var errors = validatefields(value, schema);
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

// validateschema — ES5 promise-chain CPS.
function validateschemainner(value, schema, context, registry, strict) {
  var errors = [];
  var curr = typeof schema === 'string' ? registry[schema] : schema;
  if (curr && curr.schemaref) curr = registry[curr.schemaref];
  if (!curr) return Promise.resolve(errors);

  if (curr.type && curr.type !== 'any') {
    var actualtype = Array.isArray(value) ? 'array' : typeof value;
    if (actualtype !== curr.type && !(curr.type === 'integer' && actualtype === 'number' && Math.floor(value) === value)) {
      return Promise.resolve([context + ': TYPE MISMATCH. EXPECTED ' + curr.type + ', GOT ' + actualtype]);
    }
  }

  if (curr.oneof) {
    var branches = [];
    var oi = 0;
    var nextoneof = function() {
      if (oi >= curr.oneof.length) {
        var branchtext = branches.map(function(b) {
          return '  · ' + b.label + ': ' + b.errs.join('; ') + '\n';
        }).join('');
        return Promise.resolve([context + ': NO MATCHING VARIANT IN ONEOF.\n' + branchtext]);
      }
      var s = curr.oneof[oi];
      oi += 1;
      var label = s.required ? 'variant with keys [' + s.required.join(', ') + ']' : 'variant ' + (oi - 1);
      return validateschemainner(value, s, context + '<oneOf:' + (oi - 1) + '>', registry, strict).then(function(errs) {
        if (errs.length === 0) return [];
        branches.push({ label: label, errs: errs });
        return nextoneof();
      });
    };
    return nextoneof();
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (strict && curr.strict !== false) {
      var allowedmap = {};
      var required = curr.required || [];
      var optional = curr.optional || [];
      var propertykeys = Object.keys(curr.properties || {});
      required.forEach(function(r) { allowedmap[r] = true; });
      optional.forEach(function(o) { allowedmap[o] = true; });
      propertykeys.forEach(function(pk) { allowedmap[pk] = true; });

      var valuekeys = Object.keys(value);
      valuekeys.forEach(function(vk) {
        if (!allowedmap[vk]) errors.push(context + ': UNEXPECTED PROPERTY "' + vk + '"');
      });
    }

    var req = curr.required || [];
    req.forEach(function(r) {
      if (!(r in value)) errors.push(context + ': MISSING REQUIRED PROPERTY "' + r + '"');
    });

    if (curr.properties) {
      var keys = Object.keys(value);
      var ki = 0;
      var nextproperty = function() {
        if (ki >= keys.length) return Promise.resolve(errors);
        var k = keys[ki];
        ki += 1;
        if (curr.properties[k]) {
          return validateschemainner(value[k], curr.properties[k], context + '.' + k, registry, strict).then(function(childerrors) {
            childerrors.forEach(function(ce) { errors.push(ce); });
            return nextproperty();
          });
        }
        return nextproperty();
      };
      return nextproperty();
    }
  }

  if (curr.items && Array.isArray(value)) {
    var ii = 0;
    var nextitem = function() {
      if (ii >= value.length) return Promise.resolve(errors);
      var item = value[ii];
      ii += 1;
      return validateschemainner(item, curr.items, context + '[' + (ii - 1) + ']', registry, strict).then(function(itemerrors) {
        itemerrors.forEach(function(ie) { errors.push(ie); });
        return nextitem();
      });
    };
    return nextitem();
  }

  var validators = curr.validators || [];
  var vi2 = 0;
  var nextvalidator = function() {
    if (vi2 >= validators.length) return Promise.resolve(errors);
    var verrors = validators[vi2](value, context);
    vi2 += 1;
    verrors.forEach(function(ve) { errors.push(ve); });
    return nextvalidator();
  };
  return nextvalidator();
}

function validateschema(value, schema, context, registry, strict) {
  if (context === undefined) context = 'stream';
  if (registry === undefined) registry = {};
  if (strict === undefined) strict = false;
  return validateschemainner(value, schema, context, registry, strict);
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

  var ambientkeys = [
    'containerref', 'domlens', 'callapi', 'callwriter', 'callfn', 'registersubscription',
    'spawnagent', 'updateworldmap', 'getworldmap', 'openapischemas', 'validateschema',
    'schemaadapter', 'createnodefromtemplate', 'authsessionaccesstoken', 'agents', 'rituals'
  ];
  ambientkeys.forEach(function(k) {
    cumulativewrites[k] = true;
  });

  var contracts = stages.map(function(stage) {
    var stagereads = {};
    var stagewrites = {};
    var blocks = stage.blocks || [];

    blocks.forEach(function(b) {
      var inputs = b.inputs || [];
      inputs.forEach(function(inp) { stagereads[inp] = true; });

      var outputkeys = Object.keys(b.outputs || {});
      outputkeys.forEach(function(key) {
        stagewrites[key] = true;
        cumulativewrites[key] = true;
      });
    });

    var readkeys = Object.keys(stagereads);
    var missing = readkeys.filter(function(rk) {
      return !cumulativewrites[rk];
    });

    return {
      stageid: stage.id,
      stagereads: readkeys,
      stagewrites: Object.keys(stagewrites),
      cumulativereads: readkeys,
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
  var pcount = block.fn.length;
  var inputs = block.signature.inputs || [];
  if (pcount > 0 && pcount !== inputs.length) {
    return ['FN IO: block "' + block.id + '" fn expects ' + pcount + ' params but declares ' + inputs.length + ' inputs'];
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
  var all = domquerymessages.concat(['getviewport', 'getscreen', 'matchmedia']);
  if (all.indexOf(cmd) === -1) return ['DOMQUERY: block "' + block.id + '" unknown COMMAND: ' + cmd];
  var props = command.properties || {};
  if (['getviewport', 'getscreen', 'matchmedia'].indexOf(cmd) === -1 && (!props.id || typeof props.id !== 'string')) {
    return ['DOMQUERY: block "' + block.id + '" requires command.properties.id'];
  }
  if (domquerysetters.indexOf(cmd) !== -1) {
    if (cmd === 'toggleclass' && (!props.classname || typeof props.classname !== 'string')) return ['DOMQUERY: block "' + block.id + '" toggleclass requires classname'];
    if (cmd !== 'toggleclass' && props.value === undefined) return ['DOMQUERY: block "' + block.id + '" setter requires value'];
  }
  return [];
}

// P10: Align with actual compiler support (only six commands)
function validateexecutionqueryblock(block) {
  if (block.type !== 'executionquery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND || command.command;
  if (!cmd) return ['EXECUTIONQUERY: block "' + block.id + '" requires command.COMMAND'];
  var allowed = ['get', 'tasks', 'taskstatus', 'task_status', 'awaittask', 'await_task', 'canceltask', 'cancel_task', 'stoptask', 'stop_task'];
  if (allowed.indexOf(cmd) === -1) return ['EXECUTIONQUERY: block "' + block.id + '" unknown COMMAND: ' + cmd];
  return [];
}

function validatestorequeryblock(block) {
  if (block.type !== 'storequery') return [];
  var command = block.command || {};
  var cmd = command.COMMAND || command.command;
  if (!cmd || ['store', 'restore'].indexOf(cmd) === -1) return ['STOREQUERY: block "' + block.id + '" invalid command'];
  return [];
}

function validateblockproperties(block) {
  if (block.type === 'domquery' && (!block.command || !block.command.properties || typeof block.command.properties !== 'object')) {
    return ['DOMQUERY: block "' + block.id + '" requires object command.properties'];
  }
  return [];
}

// P36: EVENT stage validation
function validateeventstage(stage) {
  var errors = [];
  if (!stage.control || stage.control.command !== 'EVENT') return errors;
  if (!stage.control.sourceid || typeof stage.control.sourceid !== 'string' || stage.control.sourceid.trim() === '') {
    errors.push('EVENT stage "' + stage.id + '" requires control.sourceid (non-empty string)');
  }
  if (!stage.control.event || typeof stage.control.event !== 'string' || stage.control.event.trim() === '') {
    errors.push('EVENT stage "' + stage.id + '" requires control.event (non-empty string)');
  }
  return errors;
}

// ===== ADDED: explicit block input/output contract validation =====
function validateexplicitblockcontract(block) {
  var errors = [];
  if (!block || typeof block !== 'object') return ['EXPLICIT CONTRACT: block is not an object'];
  if (block.type === 'fn' || block.type === 'writer') {
    if (!Array.isArray(block.inputs)) {
      errors.push('EXPLICIT CONTRACT: block "' + (block.id || 'unknown') + '" must declare "inputs" as an array of strings');
    } else {
      block.inputs.forEach(function(input, idx) {
        if (typeof input !== 'string' || input.trim() === '') {
          errors.push('EXPLICIT CONTRACT: block "' + (block.id || 'unknown') + '" input at index ' + idx + ' must be a non-empty string');
        }
      });
    }
    if (block.deps !== undefined && !Array.isArray(block.deps)) {
      errors.push('EXPLICIT CONTRACT: block "' + (block.id || 'unknown') + '" must declare "deps" as an array of strings');
    }
    if (!block.outputs || typeof block.outputs !== 'object' || Array.isArray(block.outputs)) {
      errors.push('EXPLICIT CONTRACT: block "' + (block.id || 'unknown') + '" must declare "outputs" as an object');
    } else {
      Object.keys(block.outputs).forEach(function(key) {
        if (typeof key !== 'string' || key.trim() === '') {
          errors.push('EXPLICIT CONTRACT: block "' + (block.id || 'unknown') + '" output key must be a non-empty string');
        }
      });
    }
  }
  return errors;
}
// ===== END ADDED =====

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractstagesblocks: extractstagesblocks,
    typeschema: typeschema,
    validatefields: validatefields,
    validate: validate,
    validatecall: validatecall,
    validateschema: validateschema,
    validateformalblock: validateformalblock,
    validatestageflow: validatestageflow,
    validatemonadalgebra: validatemonadalgebra,
    validateblockio: validateblockio,
    validateblockfnio: validateblockfnio,
    validatecontainerrefs: validatecontainerrefs,
    validatespawncontracts: validatespawncontracts,
    validateblocktype: validateblocktype,
    validatedomqueryblock: validatedomqueryblock,
    validateexecutionqueryblock: validateexecutionqueryblock,
    validatestorequeryblock: validatestorequeryblock,
    validateblockproperties: validateblockproperties,
    validateeventstage: validateeventstage,
    validateexplicitblockcontract: validateexplicitblockcontract
  };
}
