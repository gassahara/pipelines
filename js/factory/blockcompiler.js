var blockcompilerstate = { level: createverbosityconstants().DEBUG };

var frontendbase = (typeof window !== 'undefined') ? window.location.origin + '/' : '';

var blockcompilertools = {
  parsesource: (typeof parsesource === 'function') ? parsesource :
    (typeof detectfreeidentifiers === 'function') ? function(src) {
      try {
        return { ok: true, identifiers: detectfreeidentifiers(src), errors: [] };
      } catch (e) {
        return { ok: false, identifiers: [], errors: [e && e.message ? e.message : String(e)] };
      }
    } : function() {
      return { ok: false, identifiers: [], errors: ['no free variable parser available'] };
    }
};

function createblockcompilerconstants() {
  return {
    blocktypes: {
      fn: 'fn', api: 'api', fetch: 'fetch', writer: 'writer',
      io: 'io', domquery: 'domquery', crypto: 'crypto',
      wait: 'wait', executionquery: 'executionquery',
      loader: 'loader',
      captureerror: 'captureerror'
    },
    inheritedkeys: ['authsessionaccesstoken', 'currenttheme', 'themetokens', 'cssprefix', 'agents']
  };
}

// ============================================================
// §2b — Dynamic block-compiler extensions (P56r2)
// ============================================================

var blockcompilerextensionsref = {
  current: Object.freeze({
    blocktypes: Object.freeze({}),
    compilers: Object.freeze({}),
    analyzers: Object.freeze({})
  })
};

function getblockcompilerextensions() {
  return blockcompilerextensionsref.current;
}

function registerblockcompilerextension(KIND, KEY, VALUE) {
  if (KIND !== 'blocktypes' && KIND !== 'compilers' && KIND !== 'analyzers') {
    throw new Error('[REGISTERBLOCKCOMPILEREXTENSION] KIND must be blocktypes, compilers, or analyzers');
  }
  if (typeof KEY !== 'string' || KEY.length === 0) {
    throw new Error('[REGISTERBLOCKCOMPILEREXTENSION] KEY must be a non-empty string');
  }
  var CURRENT = blockcompilerextensionsref.current;
  var NEXTKIND = {};
  Object.keys(CURRENT[KIND]).forEach(function (K) { NEXTKIND[K] = CURRENT[KIND][K]; });
  NEXTKIND[KEY] = VALUE;
  var NEXT = {
    blocktypes: KIND === 'blocktypes' ? Object.freeze(NEXTKIND) : CURRENT.blocktypes,
    compilers:  KIND === 'compilers'  ? Object.freeze(NEXTKIND) : CURRENT.compilers,
    analyzers:  KIND === 'analyzers'  ? Object.freeze(NEXTKIND) : CURRENT.analyzers
  };
  blockcompilerextensionsref.current = Object.freeze(NEXT);
  return VALUE;
}

function unregisterblockcompilerextension(KIND, KEY) {
  if (KIND !== 'blocktypes' && KIND !== 'compilers' && KIND !== 'analyzers') return false;
  if (typeof KEY !== 'string' || KEY.length === 0) return false;
  var CURRENT = blockcompilerextensionsref.current;
  if (CURRENT[KIND][KEY] === undefined) return false;
  var NEXTKIND = {};
  Object.keys(CURRENT[KIND]).forEach(function (K) {
    if (K !== KEY) NEXTKIND[K] = CURRENT[KIND][K];
  });
  var NEXT = {
    blocktypes: KIND === 'blocktypes' ? Object.freeze(NEXTKIND) : CURRENT.blocktypes,
    compilers:  KIND === 'compilers'  ? Object.freeze(NEXTKIND) : CURRENT.compilers,
    analyzers:  KIND === 'analyzers'  ? Object.freeze(NEXTKIND) : CURRENT.analyzers
  };
  blockcompilerextensionsref.current = Object.freeze(NEXT);
  return true;
}

// ============================================================
// B9 — Compiler-constants builder
// ============================================================

// @proposal=P54 / @proposal=P56r2 — one builder for the four-field
// compiler-constants object.
function makecompilerconstants(options) {
  var constants = createblockcompilerconstants();
  var dnaconstants = creatednaserializerconstants();
  var extensions = getblockcompilerextensions();

  var blocktypes = {};
  Object.keys(constants.blocktypes).forEach(function (K) { blocktypes[K] = constants.blocktypes[K]; });
  Object.keys(extensions.blocktypes).forEach(function (K) { blocktypes[K] = extensions.blocktypes[K]; });

  var analyzers = createblockanalyzers(blocktypes, dnaconstants);
  Object.keys(extensions.analyzers).forEach(function (K) { analyzers[K] = extensions.analyzers[K]; });

  var compilers = createblockcompilers(blocktypes, constants.inheritedkeys, options || {});
  Object.keys(extensions.compilers).forEach(function (K) { compilers[K] = extensions.compilers[K]; });

  return {
    blocktypes: blocktypes,
    inheritedkeys: constants.inheritedkeys,
    analyzers: analyzers,
    compilers: compilers
  };
}

// ============================================================
// B10 — Compile-block entry point
// ============================================================

function compileblock(block, inherited, constants, options) {
  if (inherited === undefined) inherited = {};
  if (options && options.tools) setblockcompilertools(options.tools);

  if (typeof block.behaviour !== 'function' && options && options.strictrefonly === true) {
    var hasbehaviour = typeof block.behaviour === 'function';
    var haslegacyfn = typeof block.fn === 'function';
    var hasref = block.ref && typeof block.ref === 'string';
    if (!hasbehaviour && (haslegacyfn || hasref)) {
      throw new Error('[compileblock] P5 violation: block "' + (block.id || 'unknown') +
        '" uses inline fn: or ref:; the target program model requires behaviour: <exposed function>');
    }
  }

  if (block.ref && typeof block.ref === 'string' && typeof block.behaviour !== 'function') {
    var refTarget = (typeof window !== 'undefined') ? window[block.ref] : (typeof globalThis !== 'undefined' ? globalThis[block.ref] : undefined);
    if (typeof refTarget === 'function') block.behaviour = refTarget;
  }

  var compiler = constants.compilers[block.type];
  if (!compiler) throw new Error('[compileblock] Unknown block type: ' + block.type);
  var analyzer = constants.analyzers[block.type];
  if (analyzer) {
    var check = analyzer(block);
    if (!check.valid) throw new Error('[compileblock] Analysis failed: ' + check.errors.join(', '));
  }
  var blockio = { inputs: block.inputs || [], outputs: block.outputs || {} };
  return compiler(block, block.id, blockio, inherited);
}
