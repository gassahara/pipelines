// ============================================================
// UPDATED FILE: js/factory/closureconsolidator.js
// Change applied: ES5 syntax, functional loops (some/map), module.exports.
// NOTE: generated-source strings contain literal 'const ' text — that is
// DATA emitted into programSource, not ES6 syntax in this module.
// ============================================================

function structuralHash(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function collectBindings(closureSource) {
  var bindings = [];
  var lines = String(closureSource || '').split('\n');

  lines.some(function(line) {
    var trimmed = line.trim();

    if (trimmed.indexOf('const ') === 0) {
      var rest = trimmed.slice(6);
      var eq = rest.indexOf('=');

      if (eq !== -1) {
        var name = rest.slice(0, eq).trim();
        var literal = rest.slice(eq + 1).trim();

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

function rewriteClosureWithShared(closureSource, sharedMap) {
  var lines = String(closureSource || '').split('\n');

  var out = lines.map(function(line) {
    var trimmed = line.trim();

    if (trimmed.indexOf('const ') === 0) {
      var rest = trimmed.slice(6);
      var eq = rest.indexOf('=');

      if (eq !== -1) {
        var name = rest.slice(0, eq).trim();
        var literal = rest.slice(eq + 1).trim();

        if (sharedMap[literal] !== undefined) {
          return line.replace(literal, sharedMap[literal]);
        }
      }
    }

    return line;
  });

  return out.join('\n');
}

function consolidateClosures(entries) {
  if (!entries || entries.length === 0) {
    return {
      programSource: '(function() {\n  return {};\n})();',
      elementMap: {}
    };
  }

  var sharedValues = {};
  var sharedOrder = [];
  var sharedIndex = 0;

  entries.forEach(function(entry) {
    var bindings = collectBindings(entry.closureSource);

    bindings.forEach(function(binding) {
      if (!Object.prototype.hasOwnProperty.call(sharedValues, binding.literal)) {
        var sharedName = 'shared_' + sharedIndex;
        sharedValues[binding.literal] = sharedName;
        sharedOrder.push({ name: sharedName, literal: binding.literal });
        sharedIndex += 1;
      }
    });
  });

  var outerBindings = sharedOrder.map(function(shared) {
    return '  const ' + shared.name + ' = ' + shared.literal + ';';
  }).join('\n');

  var inner = entries.map(function(entry) {
    var rewritten = rewriteClosureWithShared(entry.closureSource, sharedValues);
    return '    ' + JSON.stringify(entry.elementId) + ': function() {\n' + rewritten + '\n    }';
  }).join(',\n');

  var programSource = '(function() {\n' +
    (outerBindings ? outerBindings + '\n' : '') +
    '  return {\n' +
    inner +
    '\n  };\n})();';

  var elementMap = {};
  entries.forEach(function(entry) {
    elementMap[entry.elementId] = true;
  });

  return {
    programSource: programSource,
    elementMap: elementMap
  };
}
