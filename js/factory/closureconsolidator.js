function structuralhash(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function collectbindings(closuresource) {
  var bindings = [];
  var lines = String(closuresource || '').split('\n');

  lines.some(function(line) {
    var trimmed = line.trim();

    if (trimmed.indexOf('var ') === 0 || trimmed.indexOf('const ') === 0) {
      var prefixlen = trimmed.indexOf('var ') === 0 ? 4 : 6;
      var rest = trimmed.slice(prefixlen);
      var eq = rest.indexOf('=');

      if (eq !== -1) {
        var name = rest.slice(0, eq).trim();
        var literal = rest.slice(eq + 1).trim();
        if (literal.charAt(literal.length - 1) === ';') {
          literal = literal.slice(0, -1).trim();
        }

        if (name && literal) {
          bindings.push({ name: name, literal: literal });
        }
      }
      return false;
    }

    if (
      trimmed.indexOf('function') === 0 ||
      trimmed.indexOf('return') === 0 ||
      trimmed.indexOf('}') === 0
    ) {
      return true;
    }
    return false;
  });

  return bindings;
}

function rewriteclosurewithshared(closuresource, sharedmap) {
  var lines = String(closuresource || '').split('\n');

  var out = lines.map(function(line) {
    var trimmed = line.trim();

    if (trimmed.indexOf('var ') === 0 || trimmed.indexOf('const ') === 0) {
      var prefixlen = trimmed.indexOf('var ') === 0 ? 4 : 6;
      var rest = trimmed.slice(prefixlen);
      var eq = rest.indexOf('=');

      if (eq !== -1) {
        var name = rest.slice(0, eq).trim();
        var literal = rest.slice(eq + 1).trim();
        var hassemi = false;
        if (literal.charAt(literal.length - 1) === ';') {
          literal = literal.slice(0, -1).trim();
          hassemi = true;
        }

        if (sharedmap[literal] !== undefined) {
          return '  var ' + name + ' = ' + sharedmap[literal] + (hassemi ? ';' : '');
        }
      }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    structuralhash: structuralhash,
    collectbindings: collectbindings,
    rewriteclosurewithshared: rewriteclosurewithshared,
    consolidateclosures: consolidateclosures
  };
}
