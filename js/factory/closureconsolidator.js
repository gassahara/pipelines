// ---- OP-092: shared var/const line parser (from RUN 49) ----
function parsevardecl(line) {
  var trimmed = line.trim();
  if (trimmed.indexOf('var ') !== 0 && trimmed.indexOf('const ') !== 0) return null;
  var prefixlen = trimmed.indexOf('var ') === 0 ? 4 : 6;
  var rest = trimmed.slice(prefixlen);
  var eq = rest.indexOf('=');
  if (eq === -1) return null;
  var name = rest.slice(0, eq).trim();
  var literal = rest.slice(eq + 1).trim();
  var hassemi = false;
  if (literal.charAt(literal.length - 1) === ';') {
    literal = literal.slice(0, -1).trim();
    hassemi = true;
  }
  if (!name || !literal) return null;
  return { name: name, literal: literal, hassemi: hassemi };
}

// ---- OP-104 (P46): local structuralhash removed ----
// structuralhash is provided as a global by the bootloader manifest;
// closureconsolidator.js (manifest entry #8) loads after it. The export
// block below preserves the name via a fallback for standalone Node use.

function collectbindings(closuresource) {
  var bindings = [];
  var lines = String(closuresource || '').split('\n');

  lines.some(function(line) {
    var trimmed = line.trim();

    if (
      trimmed.indexOf('function') === 0 ||
      trimmed.indexOf('return') === 0 ||
      trimmed.indexOf('}') === 0
    ) {
      return true;
    }

    var parsed = parsevardecl(line);
    if (parsed) {
      bindings.push({ name: parsed.name, literal: parsed.literal });
    }
    return false;
  });

  return bindings;
}

function rewriteclosurewithshared(closuresource, sharedmap) {
  var lines = String(closuresource || '').split('\n');

  var out = lines.map(function(line) {
    var parsed = parsevardecl(line);
    if (parsed && sharedmap[parsed.literal] !== undefined) {
      return '  var ' + parsed.name + ' = ' + sharedmap[parsed.literal] + (parsed.hassemi ? ';' : '');
    }
    return line;
  });

  return out.join('\n');
}

function consolidateclosures(entries) {
  if (!entries || entries.length === 0) {
    return {
      programsource: '(function() {\n  return {};\n})();',
      programSource: '(function() {\n  return {};\n})();',
      elementmap: {},
      elementMap: {}
    };
  }

  var sharedvalues = {};
  var sharedorder = [];
  var sharedindex = 0;

  entries.forEach(function(entry) {
    var src = entry.closuresource || entry.closureSource;
    var bindings = collectbindings(src);

    bindings.forEach(function(binding) {
      if (!Object.prototype.hasOwnProperty.call(sharedvalues, binding.literal)) {
        var sharedname = 'shared' + sharedindex;
        sharedvalues[binding.literal] = sharedname;
        sharedorder.push({ name: sharedname, literal: binding.literal });
        sharedindex += 1;
      }
    });
  });

  var outerbindings = sharedorder.map(function(shared) {
    return '  var ' + shared.name + ' = ' + shared.literal + ';';
  }).join('\n');

  var inner = entries.map(function(entry) {
    var src = entry.closuresource || entry.closureSource;
    var elid = entry.elementid || entry.elementId;
    var rewritten = rewriteclosurewithshared(src, sharedvalues);
    return '    ' + JSON.stringify(elid) + ': function() {\n' + rewritten + '\n    }';
  }).join(',\n');

  var programsource = '(function() {\n' +
    (outerbindings ? outerbindings + '\n' : '') +
    '  return {\n' +
    inner +
    '\n  };\n})();';

  var elementmap = {};
  entries.forEach(function(entry) {
    var elid = entry.elementid || entry.elementId;
    elementmap[elid] = true;
  });

  return {
    programsource: programsource,
    programSource: programsource,
    elementmap: elementmap,
    elementMap: elementmap
  };
}