function makelib(src, provides) {
  return { src: src, provides: provides };
}

function makeprogram(src, provides) {
  return { src: src, provides: provides };
}

function makestage(id, control) {
  return { element: 'STAGE', id: id, control: control, elements: [], token: GENERATETAG() };
}

// @proposal=P53 — reserved keys are authoritative.
function makeblock(id, type, behaviour, attrs) {
  var a = attrs || {};
  var b = {};
  Object.keys(a).forEach(function(k) { b[k] = a[k]; });
  b.element = 'BLOCK';
  b.id = id;
  b.type = type;
  b.token = GENERATETAG();
  if (behaviour !== null && behaviour !== undefined) b.behaviour = behaviour;
  return b;
}

// @proposal=P55 — regenerator-block constructor.
function makegenerator(type, wrapped, behaviour, attrs) {
  if (!wrapped || wrapped.element !== 'BLOCK') {
    throw new Error('[makegenerator] wrapped must be a block value');
  }
  if (typeof behaviour !== 'function') {
    throw new Error('[makegenerator] behaviour must be a function');
  }
  var a = attrs || {};
  var b = {};
  Object.keys(a).forEach(function(k) { b[k] = a[k]; });
  b.element = 'BLOCK';
  b.id = (wrapped.id || 'unknown') + type;
  b.type = type;
  b.token = GENERATETAG();
  b.behaviour = behaviour;
  b.wrapped = wrapped;
  return b;
}

function makepipelineelement(id, childstate, attrs) {
  var a = attrs || {};
  var b = { element: 'PIPELINE', id: id, childstate: childstate };
  Object.keys(a).forEach(function(k) { b[k] = a[k]; });
  return b;
}

// ============================================================
// B2 — Pipeline and stage manipulation
// ============================================================

// @proposal=P54 / @proposal=P56r2 — pipeline() uses makecompilerconstants.
function pipeline(type, name, options) {
  var opts = options || {};
  var dnaconstants = creatednaserializerconstants();
  var compilerconstants = makecompilerconstants(opts);
  return {
    type: type,
    name: name,
    libs: [],
    programs: [],
    elements: [],
    env: opts.baseenv || {},
    compileonly: opts.compileonly === true,
    pending: null,
    compilerconstants: compilerconstants,
    dnaconstants: dnaconstants,
    compileroptions: opts
  };
}

function pipelinewith(p, elements) {
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.elements = elements;
  return next;
}

function appendat(elements, level, i, child) {
  if (i >= level.length) return elements.concat([child]);
  var idx = level[i];
  var target = elements[idx];
  if (!target || !target.elements) {
    throw new Error('[append] path does not address a node with an elements array');
  }
  return elements.map(function(node, j) {
    if (j !== idx) return node;
    var extended = {};
    Object.keys(node).forEach(function(k) { extended[k] = node[k]; });
    extended.elements = appendat(node.elements, level, i + 1, child);
    return extended;
  });
}

function nodeat(p, path) {
  return nodeatat(p, path, 0);
}

function nodeatat(node, path, index) {
  if (index >= path.length) return node;
  return nodeatat(node.elements[path[index]], path, index + 1);
}

function appendstage() {
  if (arguments.length === 2) {
    var stage = arguments[0];
    var child = arguments[1];
    if (!stage || stage.element !== 'STAGE') {
      throw new Error('[appendstage] first argument must be a stage value');
    }
    if (!child || child.element !== 'STAGE') {
      throw new Error('[appendstage] second argument must be a stage value');
    }
    var next = {};
    Object.keys(stage).forEach(function(k) { next[k] = stage[k]; });
    next.elements = (stage.elements || []).concat([child]);
    return next;
  }
  if (arguments.length === 3) {
    return execappend(arguments[0], arguments[1], arguments[2]);
  }
  throw new Error('[appendstage] expects 2 or 3 arguments, received ' + arguments.length);
}

function execappend(p, parentref, stage) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.elements)) {
    throw new Error('[execappend] first argument must be a pipeline value');
  }
  if (!stage || stage.element !== 'STAGE') {
    throw new Error('[execappend] third argument must be a stage value');
  }

  var attached;
  if (parentref === null || parentref === undefined) {
    var nextelements = (p.elements || []).concat([stage]);
    var nextp = {};
    Object.keys(p).forEach(function(k) { nextp[k] = p[k]; });
    nextp.elements = nextelements;
    attached = nextp;
  } else {
    if (!parentref.token) {
      throw new Error('[execappend] parentref must be a stage value carrying a token');
    }
    var rebuilt = insertchildbytoken(p, parentref.token, stage);
    if (rebuilt === p) {
      throw new Error('[execappend] parentref token not found in pipeline: ' + parentref.token);
    }
    attached = rebuilt;
  }

  return scheduleexecution(attached, stage);
}

function insertchildbytoken(node, parenttoken, child) {
  if (!node || typeof node !== 'object') return node;
  if (node.element === 'STAGE' && node.token === parenttoken) {
    var next = {};
    Object.keys(node).forEach(function(k) { next[k] = node[k]; });
    next.elements = (node.elements || []).concat([child]);
    return next;
  }
  var children = node.elements;
  if (!Array.isArray(children)) return node;
  var nextchildren = children.map(function(c) { return insertchildbytoken(c, parenttoken, child); });
  var haschange = nextchildren.some(function (c, idx) { return c !== children[idx]; });
  if (!haschange) return node;
  var nextnode = {};
  Object.keys(node).forEach(function(k) { nextnode[k] = node[k]; });
  nextnode.elements = nextchildren;
  return nextnode;
}

// @proposal=P51 — structural only.
function scheduleexecution(p, stage) {
  return p;
}

function appendblock(stage, block) {
  if (!stage || stage.element !== 'STAGE') {
    throw new Error('[appendblock] first argument must be a stage value');
  }
  if (!block || block.element !== 'BLOCK') {
    throw new Error('[appendblock] second argument must be a block value');
  }
  var next = {};
  Object.keys(stage).forEach(function(k) { next[k] = stage[k]; });
  next.elements = (stage.elements || []).concat([block]);
  return next;
}

function appendpipelineelement(p, level, child) {
  if (level.length === 0) {
    throw new Error('[appendpipelineelement] level must address a stage (not the pipeline root)');
  }
  if (child.element !== 'PIPELINE') {
    throw new Error('[appendpipelineelement] child must be a pipelineelement value');
  }
  return pipelinewith(p, appendat(p.elements, level, 0, child));
}

function appendlib(p, parent, child) {
  if (parent !== null) {
    throw new Error('[appendlib] libs attach only at pipeline level (parent must be null)');
  }
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.libs = p.libs.concat([child]);
  return next;
}

function appendprogram(p, parent, child) {
  if (parent !== null) {
    throw new Error('[appendprogram] programs attach only at pipeline level (parent must be null)');
  }
  var next = {};
  Object.keys(p).forEach(function(k) { next[k] = p[k]; });
  next.programs = p.programs.concat([child]);
  return next;
}

// ============================================================
// B4 — Path accessors and primitives
// ============================================================

function walkentries(source, acc, step) {
  var keys = Object.keys(source || {});
  for (var i = 0; i < keys.length; i++) {
    acc = step(acc, keys[i], source[keys[i]]);
  }
  return acc;
}

function cloneobject(obj) {
  return walkentries(obj || {}, {}, function(acc, k, v) { acc[k] = v; return acc; });
}

function stripquotes(str) {
  return str.split('').reduce(function(out, ch) {
    return ch !== '"' && ch !== "'" ? out + ch : out;
  }, '');
}

function splitpathsegments(pathstr) {
  function scan(i, current, parts) {
    if (i >= pathstr.length) {
      if (current) parts.push(current);
      return parts;
    }
    var ch = pathstr.charAt(i);
    if (ch === '[' || ch === ']' || ch === '.') {
      if (current) parts.push(current);
      return scan(i + 1, '', parts);
    }
    return scan(i + 1, current + ch, parts);
  }
  return scan(0, '', []);
}

function containspathaccessorchars(str) {
  return str.split('').reduce(function(found, c) {
    return found || c === '.' || c === '[' || c === ']';
  }, false);
}

function compilepathaccessor(pathstr) {
  if (typeof pathstr !== 'string') {
    return function() { return pathstr; };
  }
  var segments = pathstr.split('.').reduce(function(acc, dotpart) {
    return acc.concat(splitpathsegments(dotpart).map(function(seg) { return stripquotes(seg); }));
  }, []);
  return function(env) {
    return segments.reduce(function(curr, key) { return (curr != null ? curr[key] : undefined); }, env);
  };
}

function setblockcompilertools(tools) {
  if (!tools || typeof tools !== 'object') return;
  if (typeof tools.parsesource === 'function') blockcompilertools.parsesource = tools.parsesource;
}

// ============================================================
// B12 — Persistent element wrapper
// ============================================================

// @proposal=P-BLOCKCOMPILER-EXCHANGE-CONTRACT-002 — the contract of
// mailboxmessage at this site. `exchange` selects the channel from the
// `responsetype` argument: for a registered response type (any value of
// MAILBOXFILTERTYPES, including MESSAGETYPES.TASKRESULT) it takes the
// promise path and delivers the actor handler's RESPONSE directly. The
// delivered shape for EXECUTEELEMENT is the flat settlement payload
//   { TASKID, PIPELINEID, ELEMENTID, RESULT }
// where RESULT is the block's own return value. For an unregistered
// responsetype it takes the mailbox path and delivers a mailbox envelope
// whose PAYLOAD.RESULT carries the same settlement payload. The unwrap
// below reads both shapes; it discriminates on the presence of PAYLOAD.
function createpersistentelementwrapper(compiledelement, elementdef, stagepath, pipelinename, options) {
  var elementid = elementdef.id || compiledelement.id || 'elementunknown';
  function wrapper(env) {
    var path = stagepath;
    var execenv = env;
    var executor = function(executioncontext) {
      var effectiveenv = executioncontext.ENV || execenv;
      return compiledelement(effectiveenv);
    };
    var blockinputs = elementdef && elementdef.inputs ? elementdef.inputs : [];
    var blockoutputs = elementdef && elementdef.outputs ? elementdef.outputs : {};
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'submitting element:', elementid, 'pipeline:', pipelinename, 'stagepath:', JSON.stringify(stagepath));
    var tag = GENERATETAG();
    var descriptor = {
      PIPELINEID: pipelinename,
      PATH: path,
      ELEMENTID: elementid,
      ENV: execenv,
      SIGNATURE: { INPUTS: blockinputs, OUTPUTS: blockoutputs },
      EXECUTOR: executor,
      PROPERTIES: elementdef || {},
      ORIGIN: compiledelement.origin || null,
      TOKEN: elementdef.token || null
    };

    var waitduration = (elementdef && typeof elementdef.timeout === 'number' && elementdef.timeout > 0)
      ? elementdef.timeout
      : mailboxresolve('mailboxwaittimeout');
    var catchtimeout = (elementdef && elementdef.catchtimeout === true);

    return exchange('EXECUTIONACTOR', MESSAGETYPES.EXECUTEELEMENT, descriptor, waitduration, MESSAGETYPES.TASKRESULT, tag)
      .then(function(mailboxmessage) {
        // @proposal=P-BLOCKCOMPILER-EXCHANGE-SHAPE-001 — dual-shape unwrap.
        // Promise-path deliveries are flat RESPONSEPAYLOAD objects; mailbox-
        // path deliveries are envelopes with a PAYLOAD field. The
        // discriminator is the presence of PAYLOAD. In both shapes the
        // block's own return value is the final RESULT.
        var isEnvelope = (mailboxmessage && typeof mailboxmessage === 'object' && mailboxmessage.PAYLOAD && typeof mailboxmessage.PAYLOAD === 'object');
        var carrier = isEnvelope ? mailboxmessage.PAYLOAD : (mailboxmessage || {});
        var outer = (carrier.RESULT !== undefined) ? carrier.RESULT : ((carrier.result !== undefined) ? carrier.result : carrier);
        var result = (outer && typeof outer === 'object' && outer.RESULT !== undefined) ? outer.RESULT : ((outer && typeof outer === 'object' && outer.result !== undefined) ? outer.result : outer);
        if (result && typeof result === 'object' && result.ERROR !== undefined) {
          var failurediagnostic = (result.ERROR && typeof result.ERROR === 'object' && result.ERROR.DIAGNOSTIC)
            ? result.ERROR.DIAGNOSTIC
            : {};
          var failuremessage = (result.ERROR && typeof result.ERROR === 'object' && typeof result.ERROR.MESSAGE === 'string')
            ? result.ERROR.MESSAGE
            : (typeof result.ERROR === 'string'
                ? result.ERROR
                : (result.ERROR && typeof result.ERROR.message === 'string'
                    ? result.ERROR.message
                    : String(result.ERROR)));
          var failureError = new Error(failuremessage);
          failureError.diagnostic = failureError.diagnostic || {};
          failureError.diagnostic.BLOCKID = elementid;
          failureError.diagnostic.PIPELINEID = pipelinename;
          failureError.diagnostic.TASKID = result.TASKID || null;
          if (failurediagnostic.RETRYTOKEN !== undefined) failureError.diagnostic.RETRYTOKEN = failurediagnostic.RETRYTOKEN;
          if (failurediagnostic.CONTINUATION !== undefined) failureError.diagnostic.CONTINUATION = failurediagnostic.CONTINUATION;
          if (failurediagnostic.KIND !== undefined) failureError.diagnostic.KIND = failurediagnostic.KIND;
          throw failureError;
        }
        var outputkeys = Object.keys(blockoutputs || {});
        var mapped = mapoutputs(result, outputkeys);
        Object.keys(mapped).forEach(function(k) { execenv[k] = mapped[k]; });
        logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'element completed:', elementid, 'pipeline:', pipelinename);
        return result;
      })
      .catch(function(err) {
        if (err && typeof err === 'object') {
          if (!err.diagnostic || typeof err.diagnostic !== 'object') {
            err.diagnostic = {};
          }
          if (err.diagnostic.PIPELINEID === undefined) err.diagnostic.PIPELINEID = pipelinename;
          if (err.diagnostic.STAGEPATH === undefined) err.diagnostic.STAGEPATH = stagepath;
          if (err.diagnostic.ELEMENTID === undefined) err.diagnostic.ELEMENTID = elementid;
        }

        var istimeout = catchtimeout
          && err
          && err.diagnostic
          && err.diagnostic.KIND === 'mailbox-wait-timeout';
        if (!istimeout) throw err;
        var timeoutenv = { ERROR: 'timeout', TAG: tag, KIND: 'mailbox-wait-timeout' };
        var outputkeys2 = Object.keys(blockoutputs || {});
        outputkeys2.forEach(function(k) { execenv[k] = timeoutenv; });
        logwarn(blockcompilerstate, '[BLOCKCOMPILER]', 'element timed out (caught):', elementid, 'pipeline:', pipelinename);
        return timeoutenv;
      });
  }
  wrapper.id = elementid;
  wrapper.kind = 'element';
  if (compiledelement.blockmeta) wrapper.blockmeta = compiledelement.blockmeta;
  return wrapper;
}
