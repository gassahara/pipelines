function buildframeworkfunctions(deps) {
  var stylizercore = deps.stylizercore || deps.StylizerCore;
  var stylizerrewrite = deps.stylizerrewrite || deps.StylizerRewrite;
  var stylizerverify = deps.stylizerverify || deps.StylizerVerify;
  var createlayoutdirectives = deps.createlayoutdirectives || deps.createLayoutDirectives;
  var stylizerbundle = {
    StylizerCore: stylizercore,
    StylizerRewrite: stylizerrewrite,
    StylizerVerify: stylizerverify,
    stylizercore: stylizercore,
    stylizerrewrite: stylizerrewrite,
    stylizerverify: stylizerverify
  };

  var layoutbundle = createlayoutdirectives ? createlayoutdirectives(stylizerbundle) : {};

  return {
    stylizercore: stylizercore,
    stylizerrewrite: stylizerrewrite,
    stylizerverify: stylizerverify,
    layoutcore: layoutbundle.layoutdirectivecore || layoutbundle.LayoutDirectiveCore,
    layoutcorrection: layoutbundle.layoutcorrection || layoutbundle.LayoutCorrection,
    layoutfactory: createlayoutdirectives,
    colorcore: deps.colorcore || deps.ColorCore,
    colorharmony: deps.colorharmony || deps.ColorHarmony,
    colorcontrast: deps.colorcontrast || deps.ColorContrast,
    domparser: deps.domparser || deps.DOMParser || null
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildframeworkfunctions: buildframeworkfunctions,
    buildthemefunctions: buildthemefunctions,
    buildshellfunctions: buildshellfunctions,
    buildscaffoldfunctions: buildscaffoldfunctions,
    buildnamesfunctions: buildnamesfunctions,
    builddescriptionfunctions: builddescriptionfunctions,
    buildingredientsfunctions: buildingredientsfunctions,
    buildastfunctions: buildastfunctions
  };
}

