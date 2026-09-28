// layoutdirectives.js — layout-directive concern.
//
// @proposal=P-V — the pre-P6 vestiges are removed.
// @proposal=P-AJ — a parser and emitter for the `flex` keyword are
// added. The pipeline programs emit `flex: dir=X, wrap=Y, gap=W`; the
// parser collects the key=value pairs; the emitter maps them to
// concrete CSS properties (display, flexDirection, flexWrap,
// justifyContent, alignItems, gap).

function hasobj(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// ---- OP-089: per-kind directive parsers ----
function dpedge(d, params) {
  d.target = params[0];
  if (params[1]) d.offset = parseFloat(params[1]);
  if (params[2]) d.unit = params[2];
}

function dpbetween(d, params) {
  if (!params[0] || params[0].indexOf('and') === -1) {
    d.invalid = true;
    return;
  }
  var targets = params[0].split('and').map(function(s) { return s.trim(); });
  d.target1 = targets[0];
  d.target2 = targets[1];
  if (params[1]) d.offset = parseFloat(params[1]);
  if (params[2]) d.unit = params[2];
}

function dpvaluewithcontainer(d, params) {
  d.value = params[0];
  if (params[1]) d.container = params[1];
}

function dpvalue(d, params) {
  d.value = params[0];
}

function dpanchor(d, params) {
  d.targetid = params[0];
  d.mycorner = params[1] || 'top-left';
  d.targetcorner = params[2] || 'top-left';
}

function dpzstack(d, params) {
  d.mode = params[0];
  if (params.length > 1) d.targetid = params[1];
}

function dpmode(d, params) {
  d.mode = params[0];
}

function dprespectmargins(d, params) {
  d.value = params[0] === 'true';
}

function dpoverflowmargins(d, params) {
  d.mode = params[0] || 'include';
}

function dpscreencorner(d, params) {
  d.corner = params[0];
}

// @proposal=P-AJ — parser for the `flex` keyword. Recognises the
// comma-separated `key=value` pairs (dir, wrap, justify, align, gap)
// and stores them in d.pairs. Unrecognised pairs are also stored so
// the emitter can decide whether to map them.
function dpflex(d, params) {
  d.pairs = params.reduce(function(acc, part) {
    var eq = part.indexOf('=');
    if (eq === -1) return acc;
    return acc.concat([{
      key: part.slice(0, eq).trim(),
      value: part.slice(eq + 1).trim()
    }]);
  }, []);
}

var directiveparsers = {
  'left-of': dpedge,
  'right-of': dpedge,
  'above': dpedge,
  'below': dpedge,
  'between': dpbetween,
  'align': dpvaluewithcontainer,
  'justify': dpvaluewithcontainer,
  'immerse': dpvaluewithcontainer,
  'position': dpvalue,
  'anchor': dpanchor,
  'z-stack': dpzstack,
  'overlap': dpmode,
  'overflow': dpmode,
  'respect-margins': dprespectmargins,
  'overflow-margins': dpoverflowmargins,
  'screen-corner': dpscreencorner,
  'flex': dpflex
};

// ---- OP-090: per-kind CSS emitters ----
function deleftof(acc, d, offsetstr) { acc.order = -1; acc.marginRight = offsetstr; return acc; }
function derightof(acc, d, offsetstr) { acc.order = 1; acc.marginLeft = offsetstr; return acc; }
function deabove(acc, d, offsetstr) { acc.marginBottom = offsetstr; return acc; }
function debelow(acc, d, offsetstr) { acc.marginTop = offsetstr; return acc; }

function dealign(acc, d) {
  acc.display = 'flex';
  acc.justifyContent = d.value;
  return acc;
}

function dejustify(acc, d) {
  acc.textAlign = d.value.replace('text-', '');
  return acc;
}

function deimmerse(acc, d) {
  acc.display = 'flex';
  acc.alignItems = 'center';
  acc.justifyContent = 'center';
  return acc;
}

function deposition(acc, d, offsetstr, positionmap) {
  if (positionmap[d.value]) {
    Object.keys(positionmap[d.value]).forEach(function(k) {
      if (hasobj(positionmap[d.value], k)) acc[k] = positionmap[d.value][k];
    });
  }
  return acc;
}

function deanchor(acc, d) {
  acc.position = 'absolute';
  acc.anchor = { targetid: d.targetid, mycorner: d.mycorner, targetcorner: d.targetcorner };
  return acc;
}

function dezstack(acc, d) {
  acc.zIndex = 'auto';
  if (d.mode === 'topmost') acc.zstacktopmost = true;
  else if (d.mode === 'bottommost') acc.zstackbottommost = true;
  else if (d.mode === 'above' && d.targetid) acc.zstackabove = d.targetid;
  else if (d.mode === 'below' && d.targetid) acc.zstackbelow = d.targetid;
  return acc;
}

function deoverlap(acc, d) {
  if (d.mode === 'prevent') {
    acc.position = 'static';
    acc.clear = 'both';
  }
  return acc;
}

function deoverflow(acc, d) {
  acc.overflow = d.mode;
  if (d.mode === 'auto' || d.mode === 'scroll') {
    acc.overflowWrap = 'break-word';
    acc.wordWrap = 'break-word';
  }
  return acc;
}

function derespectmargins(acc, d) {
  if (d.value && !acc.margin) acc.margin = '0.5rem';
  return acc;
}

function deoverflowmargins(acc, d) {
  if (d.mode === 'include') acc.overflow = 'visible';
  return acc;
}

function descreencorner(acc, d, offsetstr, positionmap, cornermap) {
  if (cornermap[d.corner]) {
    Object.keys(cornermap[d.corner]).forEach(function(k2) {
      if (hasobj(cornermap[d.corner], k2)) acc[k2] = cornermap[d.corner][k2];
    });
  }
  return acc;
}

// @proposal=P-AJ — emitter for the `flex` keyword. Each recognised
// key maps to a concrete CSS property; unrecognised keys are ignored.
function deflex(acc, d) {
  (d.pairs || []).forEach(function(pair) {
    if (pair.key === 'dir') {
      acc.display = 'flex';
      acc.flexDirection = pair.value;
    } else if (pair.key === 'wrap') {
      acc.flexWrap = pair.value;
    } else if (pair.key === 'justify') {
      acc.justifyContent = pair.value;
    } else if (pair.key === 'align') {
      acc.alignItems = pair.value;
    } else if (pair.key === 'gap') {
      acc.gap = pair.value;
    }
  });
  return acc;
}

var directiveemitters = {
  'left-of': deleftof,
  'right-of': derightof,
  'above': deabove,
  'below': debelow,
  'align': dealign,
  'justify': dejustify,
  'immerse': deimmerse,
  'position': deposition,
  'anchor': deanchor,
  'z-stack': dezstack,
  'overlap': deoverlap,
  'overflow': deoverflow,
  'respect-margins': derespectmargins,
  'overflow-margins': deoverflowmargins,
  'screen-corner': descreencorner,
  'flex': deflex
};

// P6: the layout-correction subsystem lives in renderactor.js.
// This file provides only layoutdirectivecore.
function createlayoutdirectives() {
  var layoutdirectivecore = {
    createlayoutconstants: function() {
      return Object.freeze({
        positionmap: Object.freeze({
          'top': { position: 'relative', top: '0' },
          'bottom': { position: 'relative', bottom: '0' },
          'left': { position: 'relative', left: '0' },
          'right': { position: 'relative', right: '0' },
          'middle': { position: 'relative', top: '50%', transform: 'translateY(-50%)' },
          'center': { maxWidth: '960px', margin: '0 auto' },
          'top-left': { position: 'relative', top: '0', left: '0' },
          'top-right': { position: 'relative', top: '0', right: '0' },
          'bottom-left': { position: 'relative', bottom: '0', left: '0' },
          'bottom-right': { position: 'relative', bottom: '0', right: '0' },
          'screen-top-left': { position: 'fixed', top: '0', left: '0' },
          'screen-top-right': { position: 'fixed', top: '0', right: '0' },
          'screen-bottom-left': { position: 'fixed', bottom: '0', left: '0' },
          'screen-bottom-right': { position: 'fixed', bottom: '0', right: '0' },
          'screen-center': { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }),
        cornermap: Object.freeze({
          'top-left': { position: 'fixed', top: '0', left: '0' },
          'top-right': { position: 'fixed', top: '0', right: '0' },
          'bottom-left': { position: 'fixed', bottom: '0', left: '0' },
          'bottom-right': { position: 'fixed', bottom: '0', right: '0' }
        })
      });
    },

    parsedirectives: function(str) {
      if (!str) return [];

      var parts = str.split(';').map(function(s) { return s.trim(); }).filter(Boolean);

      function parsepart(part, breakpoint) {
        var colonidx = part.indexOf(':');
        var type = colonidx > -1 ? part.substring(0, colonidx).trim() : part.trim();
        var rest = colonidx > -1 ? part.substring(colonidx + 1).trim() : '';
        var params = rest ? rest.split(',').map(function(p) { return p.trim(); }) : [];
        var directive = { type: type };
        if (breakpoint) directive.breakpoint = breakpoint;

        var parser = directiveparsers[type];
        if (parser) {
          parser(directive, params);
        } else {
          directive.raw = { property: type, value: rest };
        }

        return directive;
      }

      function parseparts(index, acc) {
        if (index >= parts.length) return acc.filter(function(d) { return !d.invalid; });
        var part = parts[index];
        var breakpoint = null;

        if (part.indexOf('@') === 0) {
          var colonidx = part.indexOf(':');
          if (colonidx > 1) {
            breakpoint = part.substring(1, colonidx);
            part = part.substring(colonidx + 1).trim();
          }
        }

        return parseparts(index + 1, acc.concat([parsepart(part, breakpoint)]));
      }

      return parseparts(0, []);
    },

    generatecssfromdirectives: function(elementid, directives, breakpointmap, layoutdirectivecore) {
      if (breakpointmap === undefined) breakpointmap = {};
      var constants = layoutdirectivecore.createlayoutconstants();
      var positionmap = constants.positionmap;
      var cornermap = constants.cornermap;

      var inlinestyles = directives
        .filter(function(d) { return !d.breakpoint; })
        .reduce(function(acc, d) {
          var offsetstr = (d.offset || 0) + (d.unit || 'px');

          var emitter = directiveemitters[d.type];
          if (emitter) {
            return emitter(acc, d, offsetstr, positionmap, cornermap);
          }
          if (d.raw) {
            acc[stylizercore.kebabcamel(d.raw.property)] = d.raw.value;
          }
          return acc;
        }, {});

      return { inline: inlinestyles };
    }
  };

  return {
    layoutdirectivecore: layoutdirectivecore
  };
}
