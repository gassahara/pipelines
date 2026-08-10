import { enqueueapi } from '../actors/apiactor.js';
import { createpipeline } from '../pipe.js';
import { callwithstack } from './callwithstack.js';
import { EVALSTACK } from '../evalstack.js';
import { enqueuehtml, expectelement, enqueuegethtml, enqueuegetvalue, enqueuegetstyle, enqueuegetposition, enqueuesethtml, enqueuesetposition, enqueuesetstyle, enqueuesetvalue, enqueueproperty, enqueuegetlayout, enqueusetlayout, DOMQUERYGETTERS, DOMQUERYSETTERS, DOMQUERYMESSAGES, RENDERACTOR, MESSAGETYPES, enqueuegetviewport, enqueuegetscreen, enqueuematchmedia } from '../actors/renderactor.js';
import { logwarn, logdebug } from '../verbosity.js';
import { registerTrigger } from '../actors/trigerregistry.js';   // NEW IMPORT

const BLOCKTYPES = Object.freeze({
  FN: 'fn',
  API: 'api',
  FETCH: 'fetch',
  WRITER: 'writer',
  SPAWN: 'spawn',
  IO: 'io',
  DOMQUERY: 'domquery',
  CRYPTO: 'crypto',
  WAIT: 'wait'
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
  [BLOCKTYPES.API]: (block) => {
      const errors = [];
      const warnings = [];
      if (!block.endpoint) errors.push('api block must have an endpoint');
      if (!block.method) errors.push('api block must have a method field (GET or POST)');
      else if (block.method !== 'GET' && block.method !== 'POST') errors.push('api block method must be GET or POST');
      return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
    },
  [BLOCKTYPES.FETCH]: (block) => {
      const errors = [];
      const warnings = [];
      if (!block.endpoint) errors.push('api block must have an endpoint');
      if (!block.method) errors.push('api block must have a method field (GET or POST)');
      else if (block.method !== 'GET' && block.method !== 'POST') errors.push('api block method must be GET or POST');
      return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
    },
  [BLOCKTYPES.WRITER]: (block) => {
    const errors = [];
    const warnings = [];
    if (!block.fn && typeof block.ref !== 'function') errors.push('writer block must have fn or ref');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.SPAWN]: (block) => {
    const errors = [];
    const warnings = [];
    if (!block.dna && !block.dnaref) errors.push('spawn block must have dna or dnaref');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.IO]: (block) => {
    const errors = [];
    const warnings = [];
    if (typeof block.ref !== 'function') errors.push('io block ref must be a function');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.DOMQUERY]: (block) => {
    const errors = [];
    const warnings = [];
    if (!block.command || !block.command.COMMAND) errors.push('domquery block requires command with COMMAND');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.CRYPTO]: (block) => {
    const errors = [];
    const warnings = [];
    if (!Object.keys(block.signature?.outputs || {})[0]) errors.push('crypto block must have signature.outputs[0]');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  },
  [BLOCKTYPES.WAIT]: (block) => {
    const errors = [];
    const warnings = [];
    if (block.ms === undefined) errors.push('wait block must have ms');
    return { valid: errors.length === 0, errors, warnings, dependencies: [], outputs: block.signature?.outputs || {}, contracts: [] };
  }
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
	    console.log({inputaccessors, inputdata, apiendpoint, payloadmapping});

	    const buildpayload = (mappingobj, data) => {
		const result = {};
		for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
		    if (typeof mappingdef === 'function') {
			result[fieldkey] = mappingdef(data);
		    } else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
			if (mappingdef.from !== undefined) {
			    result[fieldkey] = data[mappingdef.from];
			} else {
			    result[fieldkey] = buildpayload(mappingdef, data);
			}
		    } else {
			result[fieldkey] = mappingdef;
		    }
		}
		return result;
	    };
	    const payload = buildpayload(payloadmapping, inputdata);
	    for (const field of Object.keys(sig.outputs)) {
		if (payload[field] === undefined && inputdata[field] !== undefined) {
		    payload[field] = inputdata[field];
		}
	    }
	    console.log({buildpayload, payload});
	    const rawresult = await callwithstack(
		EVALSTACK, label, 'async-await',
		async () => {
		    const endpoint = env[apiendpoint] || apiendpoint;
		    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { token: env.authsessionaccesstoken || '' });
		    console.log({apiendpoint, apiresolve,endpoint, enqueueapi}, merged.method, payload);
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
		const buildresponse = (mappingobj, raw) => {
		    const result = {};
		    for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
			if (typeof mappingdef === 'function') {
			    result[fieldkey] = mappingdef(raw);
			} else if (typeof mappingdef === 'object' && mappingdef !== null && mappingdef.from !== undefined) {
			    result[fieldkey] = raw[mappingdef.from];
			} else if (typeof mappingdef === 'object' && mappingdef !== null) {
			    result[fieldkey] = buildresponse(mappingdef, raw);
			} else {
			    result[fieldkey] = raw[mappingdef];
			}
		    }
		    return result;
		};
		result = buildresponse(responsemapping, rawresult);
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
	    logdebug('[BLOCK] Executing api block:', id);
	    const label = 'api:' + (merged.endpoint || id);
	    const inputaccessors = (sig.inputs || []).map(k => compilepathaccessor(k));
	    const inputdata = {};
	    for (let i = 0; i < sig.inputs.length; i++) {
		inputdata[sig.inputs[i]] = inputaccessors[i](env);
	    }
	    const apiendpoint = merged.endpoint;
	    const payloadmapping = merged.mapping?.payload || {};
	    console.log({inputaccessors, inputdata, apiendpoint, payloadmapping});

	    const buildpayload = (mappingobj, data) => {
		const result = {};
		for (const [fieldkey, mappingdef] of Object.entries(mappingobj)) {
		    if (typeof mappingdef === 'function') {
			result[fieldkey] = mappingdef(data);
		    } else if (typeof mappingdef === 'object' && mappingdef !== null && !Array.isArray(mappingdef)) {
			if (mappingdef.from !== undefined) {
			    result[fieldkey] = data[mappingdef.from];
			} else {
			    result[fieldkey] = buildpayload(mappingdef, data);
			}
		    } else {
			result[fieldkey] = mappingdef;
		    }
		}
		return result;
	    };
	    const payload = buildpayload(payloadmapping, inputdata);
	    for (const field of Object.keys(sig.outputs)) {
		if (payload[field] === undefined && inputdata[field] !== undefined) {
		    payload[field] = inputdata[field];
		}
	    }
	    console.log({buildpayload, payload});
	    const rawresult = await callwithstack(
		EVALSTACK, label, 'async-await',
		async () => {
		    const endpoint = env[apiendpoint] || apiendpoint;
		    const apiresolve = await enqueueapi(endpoint, merged.method, payload, { textual: true, token: env.authsessionaccesstoken || '' });
		    console.log({apiendpoint, apiresolve,endpoint, enqueueapi}, merged.method, payload);
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

	    const patch = {};
	    const apioutputkeys = Object.keys(sig.outputs);
	    if (apioutputkeys.length === 1) {
		patch[apioutputkeys[0]] = result;
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
	    console.log({merged});
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
			if (dnapath.from === 'eventtarget') {
			    const target = e.eventtarget;
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
	    // Extend local set of valid messages with viewport commands
	    const ALL_DOMQUERY_MESSAGES = DOMQUERYMESSAGES.concat(['getviewport', 'getscreen', 'matchmedia']);
	    if (!ALL_DOMQUERY_MESSAGES.includes(messages)) {
		throw new Error('[DOMQUERY] Block "' + id + '" unknown COMMAND type: ' + messages);
	    }
	    const props = command.properties;
	    // --- new viewport handlers (no id required) ---
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
	    // --- existing handlers ---
	    if (!props || !props.id || typeof props.id !== 'string') {
		throw new Error('[DOMQUERY] Block "' + id + '" command requires properties.id field (string)');
	    }
	    const commandid = props.id;
	    if (setters.includes(messages) && props.value === undefined) {
		throw new Error('[DOMQUERY] Block "' + id + '" setter COMMAND requires command.properties.value');
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
		'property': enqueueproperty
	    };
	    const handler = messagehandlers[messages];
	    const result = await callwithstack(
		EVALSTACK, 'domquery:' + messages, 'async-await',
		async (e) => {
		    if (setters.includes(messages)) {
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
    }
};

const compileElement = (el) => {
    if (el.element === 'BLOCK') return compileBlockElement(el);
    if (el.element === 'STAGE') return compileStageElement(el);
    throw new Error('unknown element type: ' + el.element + ' on element id "' + (el.id || 'unnamed') + '"');
};

const compileBlockElement = (block) => {
    const fn = compileblock(block);
    fn.blockmeta = { id: block.id, type: block.type, ref: block.ref, replace: block.replace };
    return fn;
};

const compileStageElement = (stage) => {
    const children = (stage.elements || []).map(compileElement);
    return stageRunner(stage, children);
};

const stageRunner = (stage, children) => {
    const control = stage.control;
    const id = stage.id;
    if (!control || control.command === undefined || control.command === null) {
	return defaultRunner(id, children);
    }
    if (control.command === 'TRIGGER') return triggerRunner(id, control, children, stage);
    if (control.command === 'LOOP') return loopRunner(id, control, children);
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

const loopRunner = (id, control, children) => {
    return async (env) => {
	const controlprops = {};
	for (const key of Object.keys(control)) {
	    if (key !== 'fn' && key !== 'inputs' && key !== 'command') {
		controlprops[key] = control[key];
	    }
	}
	const inputaccessors = (control.inputs || []).map(k => compilepathaccessor(k));
	while (true) {
	    if (!env.rngactive) break;
	    await executeChildren(children, env, id);
	    const inputargs = inputaccessors.map(fn => fn(env));
	    const fnargs = [controlprops].concat(inputargs);
	    const shouldcontinue = await control.fn(...fnargs);
	    if (!shouldcontinue) break;
	}
	return {};
    };
};

const defaultRunner = (id, children) => {
    return async (env) => {
	await executeChildren(children, env, id);
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

const compileElements = (elements) => elements.map(compileElement);

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
    const compiled = compileElements(pipeline.elements);
    const compiledpipeline = createpipeline(compiled, sinks);
    return { pipeline: compiledpipeline };
};
