// sharedhelpers.js
// Common helper functions for frontend pipelines.
// ES5, functional recursive, no regex, lowercase identifiers.

function buildframeworkfunctions(deps) {
  var stylizerbundle = {
    stylizercore: deps.stylizercore,
    stylizerrewrite: deps.stylizerrewrite,
    stylizerverify: deps.stylizerverify
  };
  var layoutbundle = deps.createlayoutdirectives(stylizerbundle);
  return {
    stylizercore: deps.stylizercore,
    stylizerrewrite: deps.stylizerrewrite,
    stylizerverify: deps.stylizerverify,
    layoutcore: layoutbundle.layoutdirectivecore,
    layoutcorrection: layoutbundle.layoutcorrection,
    layoutfactory: deps.createlayoutdirectives,
    colorcore: deps.colorcore,
    colorharmony: deps.colorharmony,
    colorcontrast: deps.colorcontrast,
    domparser: deps.domparser || null
  };
}

function buildthemefunctions(deps) {
  return {
    generatethemereference: deps.generatethemereference
  };
}

function buildshellfunctions(deps, frameworkfunctions) {
  var shellfunctions = {};
  if (deps.applyshelltheme) {
    shellfunctions.applyshelltheme = function(html, themerefhtml, parser) {
      return deps.applyshelltheme(html, themerefhtml, frameworkfunctions, parser);
    };
  }
  if (deps.applyshelllayout) {
    shellfunctions.applyshelllayout = function(html, themerefhtml, viewport, parser) {
      return deps.applyshelllayout(html, themerefhtml, viewport, frameworkfunctions, parser);
    };
  }
  return shellfunctions;
}

function buildscaffoldfunctions(deps, frameworkfunctions) {
  var scaffoldfunctions = {};
  if (deps.applyscaffoldtheme) {
    scaffoldfunctions.applyscaffoldtheme = function(html, themerefhtml, parser) {
      return deps.applyscaffoldtheme(html, themerefhtml, frameworkfunctions, parser);
    };
  }
  if (deps.applyscaffoldlayout) {
    scaffoldfunctions.applyscaffoldlayout = function(html, themerefhtml, viewport, parser) {
      return deps.applyscaffoldlayout(html, themerefhtml, viewport, frameworkfunctions, parser);
    };
  }
  return scaffoldfunctions;
}

function buildnamesfunctions(deps, frameworkfunctions) {
  var namesfunctions = {};
  if (deps.applynamestheme) {
    namesfunctions.applynamestheme = function(html, themerefhtml, parser) {
      return deps.applynamestheme(html, themerefhtml, frameworkfunctions, parser);
    };
  }
  if (deps.applynameslayout) {
    namesfunctions.applynameslayout = function(html, themerefhtml, viewport, parser) {
      return deps.applynameslayout(html, themerefhtml, viewport, frameworkfunctions, parser);
    };
  }
  return namesfunctions;
}

function builddescriptionfunctions(deps, frameworkfunctions) {
  var descriptionfunctions = {};
  if (deps.applydescriptiontheme) {
    descriptionfunctions.applydescriptiontheme = function(html, themerefhtml, parser) {
      return deps.applydescriptiontheme(html, themerefhtml, frameworkfunctions, parser);
    };
  }
  if (deps.applydescriptionlayout) {
    descriptionfunctions.applydescriptionlayout = function(html, themerefhtml, viewport, parser) {
      return deps.applydescriptionlayout(html, themerefhtml, viewport, frameworkfunctions, parser);
    };
  }
  return descriptionfunctions;
}

function buildingredientsfunctions(deps, frameworkfunctions) {
  var ingredientsfunctions = {};
  if (deps.applyingredientstheme) {
    ingredientsfunctions.applyingredientstheme = function(html, themerefhtml, parser) {
      return deps.applyingredientstheme(html, themerefhtml, frameworkfunctions, parser);
    };
  }
  if (deps.applyingredientslayout) {
    ingredientsfunctions.applyingredientslayout = function(html, themerefhtml, viewport, parser) {
      return deps.applyingredientslayout(html, themerefhtml, viewport, frameworkfunctions, parser);
    };
  }
  return ingredientsfunctions;
}

function buildastfunctions(deps) {
  return {
    astrender: deps.astrender,
    astextract: deps.astextract
  };
}

function renderasthtml(astdata, astfunctions) {
  var data = astdata && astdata.data ? astdata.data : astdata;
  var html = data && data.html ? data.html : '';
  var ast = data && data.ast ? data.ast : null;
  if (ast && astfunctions.astrender) {
    html = astfunctions.astrender.asttodiv(ast, {}, astfunctions.astrender);
  }
  return html;
}

function extractnames(astdata, astfunctions) {
  var recipes = [];
  if (astfunctions.astextract) {
    try {
      recipes = astfunctions.astextract.extractkeyvalues(astdata, astfunctions.astextract);
    } catch (e) {
      recipes = [];
    }
  }
  return recipes;
}

function stripmarkdownfences(source) {
  if (typeof source !== 'string') return source;
  var lines = splitlines(source);
  function process(index, acc) {
    if (index >= lines.length) return acc.join('\n');
    var line = lines[index];
    if (line.indexOf('```') === 0) return process(index + 1, acc);
    acc.push(line);
    return process(index + 1, acc);
  }
  return process(0, []);
}

function unescapenewlines(source) {
  if (typeof source !== 'string') return source;
  function scan(i, acc) {
    if (i >= source.length) return acc;
    if (source.charAt(i) === '\\' && source.charAt(i + 1) === 'n') {
      return scan(i + 2, acc + '\n');
    }
    return scan(i + 1, acc + source.charAt(i));
  }
  return scan(0, '');
}

function splitlines(source) {
  if (typeof source !== 'string') return [];
  var parts = source.split('\n');
  return parts.map(function(line) {
    if (line.length && line.charAt(line.length - 1) === '\r') {
      return line.slice(0, -1);
    }
    return line;
  });
}

function containsconfidenceabove50(text) {
  if (typeof text !== 'string') return false;
  function scan(i) {
    if (i >= text.length) return false;
    var ch = text.charAt(i);
    if (ch >= '0' && ch <= '9') {
      return scannumber(i, '');
    }
    return scan(i + 1);
  }
  function scannumber(i, acc) {
    if (i >= text.length || !(text.charAt(i) >= '0' && text.charAt(i) <= '9')) {
      var num = parseInt(acc, 10);
      if (num > 50) return true;
      return scan(i);
    }
    return scannumber(i + 1, acc + text.charAt(i));
  }
  return scan(0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildframeworkfunctions: buildframeworkfunctions,
    buildthemefunctions: buildthemefunctions,
    buildshellfunctions: buildshellfunctions,
    buildscaffoldfunctions: buildscaffoldfunctions,
    buildnamesfunctions: buildnamesfunctions,
    builddescriptionfunctions: builddescriptionfunctions,
    buildingredientsfunctions: buildingredientsfunctions,
    buildastfunctions: buildastfunctions,
    renderasthtml: renderasthtml,
    extractnames: extractnames,
    stripmarkdownfences: stripmarkdownfences,
    unescapenewlines: unescapenewlines,
    splitlines: splitlines,
    containsconfidenceabove50: containsconfidenceabove50
  };
}

