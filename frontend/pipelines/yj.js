var recipe = {
  identity: { id: 'recipe', type: 'oracle', name: 'RECIPE Recipe' },
  libs: [
    { src: 'factory/stylizerutilities.js', provides: ['StylizerCore', 'StylizerRewrite', 'StylizerVerify', 'stylizercore', 'stylizerrewrite', 'stylizerverify'] },
    { src: 'factory/layoutdirectives.js', provides: ['createLayoutDirectives', 'createlayoutdirectives'] },
    { src: 'factory/colorutils.js', provides: ['ColorCore', 'ColorHarmony', 'ColorContrast', 'colorcore', 'colorharmony', 'colorcontrast'] }
  ],
  programs: [
    { src: 'pipelines/sharedhelpers.js', provides: [
        'buildframeworkfunctions', 'buildthemefunctions', 'buildscaffoldfunctions',
        'buildnamesfunctions', 'builddescriptionfunctions', 'buildingredientsfunctions',
        'buildastfunctions', 'renderasthtml', 'extractnames', 'stripmarkdownfences',
        'unescapenewlines', 'splitlines', 'containsconfidenceabove50'
      ] },
    { src: 'pipelines/recipehelpers.js', provides: [
        'buildscaffold', 'insertscaffold', 'preparenamesmd', 'processrecipesteps',
        'extractingredient', 'preparerecipeingredient', 'pushingredientobject',
        'buildredientshtml', 'safejsonarrayjoin', 'writenames', 'writedescription',
        'writeingredients'
      ] },
    { src: 'pipelines/themes.js', provides: ['generatethemereference'] },
    { src: 'pipelines/ast.js', provides: ['astrender', 'astextract'] },
    { src: 'pipelines/scaffoldstylizer.js', provides: ['applyscaffoldtheme'] },
    { src: 'pipelines/scaffoldlayout.js', provides: ['applyscaffoldlayout'] },
    { src: 'pipelines/namestylizer.js', provides: ['applynamestheme'] },
    { src: 'pipelines/nameslayout.js', provides: ['applynameslayout'] },
    { src: 'pipelines/descriptionstylizer.js', provides: ['applydescriptiontheme'] },
    { src: 'pipelines/descriptionlayout.js', provides: ['applydescriptionlayout'] },
    { src: 'pipelines/ingredientstylizer.js', provides: ['applyingredientstheme'] },
    { src: 'pipelines/ingredientslayout.js', provides: ['applyingredientslayout'] }
  ],
  pipeline: {
    elements: [
      {
        element: 'STAGE',
        id: 'scaffoldui',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'buildimportedfunctions',
            type: 'fn',
            inputs: [],
            outputs: {
              frameworkfunctions: 'object',
              themefunctions: 'object',
              scaffoldfunctions: 'object',
              namesfunctions: 'object',
              descriptionfunctions: 'object',
              ingredientsfunctions: 'object',
              astfunctions: 'object'
            },
            deps: [
              'StylizerCore', 'StylizerRewrite', 'StylizerVerify',
              'createLayoutDirectives', 'ColorCore', 'ColorHarmony', 'ColorContrast',
              'generatethemereference', 'applyscaffoldtheme', 'applyscaffoldlayout',
              'applynamestheme', 'applynameslayout', 'applydescriptiontheme',
              'applydescriptionlayout', 'applyingredientstheme', 'applyingredientslayout',
              'astrender', 'astextract', 'DOMParser', 'buildframeworkfunctions',
              'buildthemefunctions', 'buildscaffoldfunctions', 'buildnamesfunctions',
              'builddescriptionfunctions', 'buildingredientsfunctions', 'buildastfunctions'
            ],
            fn: function(properties) {
              var deps = properties.deps || {};
              var buildframeworkfn = deps.buildframeworkfunctions || buildframeworkfunctions;
              var buildthemefn = deps.buildthemefunctions || buildthemefunctions;
              var buildscaffoldfn = deps.buildscaffoldfunctions || buildscaffoldfunctions;
              var buildnamesfn = deps.buildnamesfunctions || buildnamesfunctions;
              var builddescriptionfn = deps.builddescriptionfunctions || builddescriptionfunctions;
              var buildingredientsfn = deps.buildingredientsfunctions || buildingredientsfunctions;
              var buildastfn = deps.buildastfunctions || buildastfunctions;

              var frameworkfunctions = buildframeworkfn(deps);
              var themefunctions = buildthemefn(deps);
              var scaffoldfunctions = buildscaffoldfn(deps, frameworkfunctions);
              var namesfunctions = buildnamesfn(deps, frameworkfunctions);
              var descriptionfunctions = builddescriptionfn(deps, frameworkfunctions);
              var ingredientsfunctions = buildingredientsfn(deps, frameworkfunctions);
              var astfunctions = buildastfn(deps);

              return {
                frameworkfunctions: frameworkfunctions,
                themefunctions: themefunctions,
                scaffoldfunctions: scaffoldfunctions,
                namesfunctions: namesfunctions,
                descriptionfunctions: descriptionfunctions,
                ingredientsfunctions: ingredientsfunctions,
                astfunctions: astfunctions
              };
            }
          },
          {
            element: 'BLOCK',
            id: 'fetchviewport',
            type: 'domquery',
            command: { COMMAND: 'getviewport', properties: {} },
            inputs: [],
            outputs: { currentviewport: 'object' }
          },
          {
            element: 'BLOCK',
            id: 'insertscaffold',
            type: 'writer',
            targetlabel: 'workspaceyj',
            replace: true,
            deps: ['insertscaffold'],
            inputs: ['frameworkfunctions', 'themefunctions', 'scaffoldfunctions', 'selectedtheme', 'currentviewport'],
            outputs: {},
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.insertscaffold ? properties.deps.insertscaffold : insertscaffold;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'triggerquery',
        output: null,
        control: { command: 'EVENT', sourceid: 'recipegobtn', event: 'click' },
        elements: [
          {
            element: 'BLOCK',
            id: 'fetchviewportquery',
            type: 'domquery',
            command: { COMMAND: 'getviewport', properties: {} },
            inputs: [],
            outputs: { currentviewport: 'object' }
          },
          { element: 'BLOCK', id: 'getinputvalue', type: 'domquery', command: { COMMAND: 'getvalue', properties: { id: 'recipeinput' } }, inputs: [], outputs: { querytext: 'string' } },
          { element: 'BLOCK', id: 'showloader', type: 'domquery', command: { COMMAND: 'setstyle', properties: { id: 'recipeloader', value: { display: 'block' } } }, inputs: [], outputs: {} },
          { element: 'BLOCK', id: 'preparequery', type: 'fn', inputs: ['querytext'], outputs: { queryobject: 'object' }, fn: function(properties) { return { queryobject: { text: properties.inputs.querytext } }; } },
          { element: 'BLOCK', id: 'namerecipefn', type: 'api', method: 'POST', endpoint: 'kis-cooking/name_recipes', timeout: 30000, mapping: { payload: { text: { from: 'querytext' } } }, inputs: ['querytext'], outputs: { recipenames: 'object' } },
          { element: 'BLOCK', id: 'preparenamesmd', type: 'fn', deps: ['preparenamesmd'], inputs: ['recipenames'], outputs: { recipenamesmd: 'string' }, fn: function(properties) {
              var prepfn = properties.deps && properties.deps.preparenamesmd ? properties.deps.preparenamesmd : preparenamesmd;
              return { recipenamesmd: prepfn(properties.inputs.recipenames) };
          } },
          { element: 'BLOCK', id: 'namerecipeastfn', type: 'api', method: 'POST', endpoint: 'shared-mdparser/frommd', timeout: 30000, mapping: { payload: { format: 'ast', md: { from: 'recipenamesmd' } } }, inputs: ['recipenamesmd'], outputs: { recipenamesast: 'object' } },
          { element: 'BLOCK', id: 'namesredenrasthtml', type: 'fn', deps: ['renderasthtml'], inputs: ['astfunctions', 'recipenamesast'], outputs: { namesdicehtml: 'string' }, fn: function(properties) {
              var renderfn = properties.deps && properties.deps.renderasthtml ? properties.deps.renderasthtml : renderasthtml;
              return { namesdicehtml: renderfn(properties.inputs.recipenamesast, properties.inputs.astfunctions) };
          } },
          { element: 'BLOCK', id: 'extractrecipenames', type: 'fn', deps: ['extractnames'], inputs: ['astfunctions', 'recipenamesast'], outputs: { recipenamesnames: 'array', recipetext: 'string', bypasscache: 'number' }, fn: function(properties) {
              var extractfn = properties.deps && properties.deps.extractnames ? properties.deps.extractnames : extractnames;
              var recipes = extractfn(properties.inputs.recipenamesast, properties.inputs.astfunctions);
              return { recipenamesnames: recipes, recipetext: '', bypasscache: 0 };
          } },
          {
            element: 'STAGE',
            id: 'recipeloop',
            control: {
              command: 'LOOP',
              fn: function(properties, state, loopcount) {
                if (loopcount >= 5) return false;
                var splitlinesfn = properties && properties.deps && properties.deps.splitlines ? properties.deps.splitlines : splitlines;
                var confidencefn = properties && properties.deps && properties.deps.containsconfidenceabove50 ? properties.deps.containsconfidenceabove50 : containsconfidenceabove50;
                var lines = splitlinesfn(state && state.recipestepsdata || '');
                return lines.every(function(line) {
                  var idx = line.indexOf('Confidence');
                  if (idx === -1) return true;
                  return !confidencefn(line.slice(idx + 'Confidence'.length));
                });
              },
              inputs: ['recipestepsdata', 'loopcount']
            },
            elements: [
              { element: 'BLOCK', id: 'stepsrecipefn', type: 'api', method: 'POST', endpoint: 'kis-cooking/recipes', timeout: 30000, mapping: { payload: { bypassCache: { from: 'bypasscache' }, extractedRecipes: { from: 'recipenamesnames' } } }, inputs: ['recipenamesnames', 'bypasscache'], outputs: { recipesteps: 'object' } },
              { element: 'BLOCK', id: 'preparerecipesteps', type: 'fn', deps: ['processrecipesteps'], inputs: ['recipesteps', 'loopcount'], outputs: { recipestepsdata: 'string', ingredients: 'array', inglen: 'number', ingredientsobjects: 'array', bypasscache: 'number', loopcount: 'number' }, fn: function(properties) {
                  var processfn = properties.deps && properties.deps.processrecipesteps ? properties.deps.processrecipesteps : processrecipesteps;
                  var result = processfn(properties.inputs.recipesteps);
                  var currentloop = (properties.inputs.loopcount || 0) + 1;
                  return {
                    recipestepsdata: result.recipestepsdata,
                    ingredients: result.ingredients,
                    inglen: result.inglen,
                    ingredientsobjects: [],
                    bypasscache: 1,
                    loopcount: currentloop
                  };
              } }
            ]
          },
          { element: 'BLOCK', id: 'extractrecipeastfn', type: 'api', method: 'POST', endpoint: 'shared-mdparser/frommd', timeout: 30000, mapping: { payload: { format: 'ast', md: { from: 'recipestepsdata' } } }, inputs: ['recipestepsdata'], outputs: { recipestepsast: 'object' } },
          {
            element: 'STAGE',
            id: 'ingloop',
            control: {
              command: 'LOOP',
              fn: function(properties, state, loopcount) {
                var n = (state && state.inglen !== undefined) ? state.inglen : 0;
                return n > 0;
              },
              inputs: ['inglen']
            },
            elements: [
              { element: 'BLOCK', id: 'recipeingredientextract', type: 'fn', deps: ['extractingredient'], inputs: ['ingredients', 'inglen'], outputs: { ingredientr: 'array', inglen: 'number' }, fn: function(properties) {
                  var extractfn = properties.deps && properties.deps.extractingredient ? properties.deps.extractingredient : extractingredient;
                  return extractfn(properties.inputs.ingredients, properties.inputs.inglen);
              } },
              { element: 'BLOCK', id: 'ingredientsextract', type: 'api', method: 'POST', endpoint: 'kis-cooking/ingredients_extract', timeout: 30000, mapping: { payload: { extractedIngredients: { from: 'ingredientr' } } }, inputs: ['ingredientr'], outputs: { ingredientextract: 'object' } },
              { element: 'BLOCK', id: 'ingredients', type: 'api', method: 'POST', endpoint: 'kis-cooking/ingredients_properties', timeout: 30000, mapping: { payload: { extractedIngredients: { from: 'ingredientr' } } }, inputs: ['ingredientr'], outputs: { ingredientproperties: 'object' } },
              { element: 'BLOCK', id: 'ingredientsinfo', type: 'fn', deps: ['preparerecipeingredient'], inputs: ['ingredientr', 'ingredientextract', 'ingredientproperties'], outputs: { descingredient: 'string', propingredient: 'string' }, fn: function(properties) {
                  var prepfn = properties.deps && properties.deps.preparerecipeingredient ? properties.deps.preparerecipeingredient : preparerecipeingredient;
                  return prepfn(properties.inputs.ingredientr, properties.inputs.ingredientextract, properties.inputs.ingredientproperties);
              } },
              { element: 'BLOCK', id: 'extractingredientastfn', type: 'api', method: 'POST', endpoint: 'shared-mdparser/frommd', timeout: 30000, mapping: { payload: { format: 'ast', md: { from: 'descingredient' } } }, inputs: ['descingredient'], outputs: { ingredientdescast: 'object' } },
              { element: 'BLOCK', id: 'extractingredientpropastfn', type: 'api', method: 'POST', endpoint: 'shared-mdparser/frommd', timeout: 30000, mapping: { payload: { format: 'ast', md: { from: 'propingredient' } } }, inputs: ['propingredient'], outputs: { ingredientpropast: 'object' } },
              { element: 'BLOCK', id: 'ingredientdescredenrasthtml', type: 'fn', deps: ['renderasthtml'], inputs: ['astfunctions', 'ingredientdescast'], outputs: { ingredientdescasthtml: 'string' }, fn: function(properties) {
                  var renderfn = properties.deps && properties.deps.renderasthtml ? properties.deps.renderasthtml : renderasthtml;
                  return { ingredientdescasthtml: renderfn(properties.inputs.ingredientdescast, properties.inputs.astfunctions) };
              } },
              { element: 'BLOCK', id: 'ingredientpropredenrasthtml', type: 'fn', deps: ['renderasthtml'], inputs: ['astfunctions', 'ingredientpropast'], outputs: { ingredientpropasthtml: 'string' }, fn: function(properties) {
                  var renderfn = properties.deps && properties.deps.renderasthtml ? properties.deps.renderasthtml : renderasthtml;
                  return { ingredientpropasthtml: renderfn(properties.inputs.ingredientpropast, properties.inputs.astfunctions) };
              } },
              { element: 'BLOCK', id: 'ingredientsproc', type: 'fn', deps: ['pushingredientobject'], inputs: ['ingredientr', 'ingredientdescasthtml', 'ingredientpropasthtml', 'ingredientsobjects'], outputs: { ingredientsobjects: 'array' }, fn: function(properties) {
                  var pushfn = properties.deps && properties.deps.pushingredientobject ? properties.deps.pushingredientobject : pushingredientobject;
                  return pushfn(properties.inputs.ingredientr, properties.inputs.ingredientdescasthtml, properties.inputs.ingredientpropasthtml, properties.inputs.ingredientsobjects);
              } }
            ]
          },
          { element: 'BLOCK', id: 'reciperedenrasthtml', type: 'fn', deps: ['renderasthtml'], inputs: ['astfunctions', 'recipestepsast'], outputs: { stepsdicehtml: 'string' }, fn: function(properties) {
              var renderfn = properties.deps && properties.deps.renderasthtml ? properties.deps.renderasthtml : renderasthtml;
              return { stepsdicehtml: renderfn(properties.inputs.recipestepsast, properties.inputs.astfunctions) };
          } },
          { element: 'BLOCK', id: 'geningredientshtml', type: 'fn', deps: ['buildredientshtml'], inputs: ['ingredientsobjects'], outputs: { ingredientshtml: 'string' }, fn: function(properties) {
              var buildfn = properties.deps && properties.deps.buildredientshtml ? properties.deps.buildredientshtml : buildredientshtml;
              return { ingredientshtml: buildfn(properties.inputs.ingredientsobjects) };
          } }
        ]
      },
      {
        element: 'STAGE',
        id: 'writenamesstage',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'writenames',
            type: 'writer',
            targetlabel: 'namespane',
            replace: true,
            deps: ['writenames'],
            inputs: ['frameworkfunctions', 'themefunctions', 'namesfunctions', 'namesdicehtml', 'selectedtheme', 'currentviewport'],
            outputs: {},
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writenames ? properties.deps.writenames : writenames;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'writedescriptionstage',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'writedescription',
            type: 'writer',
            targetlabel: 'descriptionpane',
            replace: true,
            deps: ['writedescription'],
            inputs: ['frameworkfunctions', 'themefunctions', 'descriptionfunctions', 'stepsdicehtml', 'selectedtheme', 'currentviewport'],
            outputs: {},
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writedescription ? properties.deps.writedescription : writedescription;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'writeingredientsstage',
        control: null,
        elements: [
          {
            element: 'BLOCK',
            id: 'writeingredients',
            type: 'writer',
            targetlabel: 'ingredientspane',
            replace: true,
            deps: ['writeingredients'],
            inputs: ['frameworkfunctions', 'themefunctions', 'ingredientsfunctions', 'ingredientshtml', 'selectedtheme', 'currentviewport'],
            outputs: {},
            fn: function(properties) {
              var writefn = properties.deps && properties.deps.writeingredients ? properties.deps.writeingredients : writeingredients;
              return writefn(properties);
            }
          }
        ]
      },
      {
        element: 'STAGE',
        id: 'themechange',
        output: null,
        control: { command: 'EVENT', sourceid: 'themeselect', event: 'change' },
        elements: [
          { element: 'BLOCK', id: 'getthemevalue', type: 'domquery', command: { COMMAND: 'getvalue', properties: { id: 'themeselect' } }, inputs: [], outputs: { selectedtheme: 'string' } },
          { element: 'BLOCK', id: 'fetchviewporttheme', type: 'domquery', command: { COMMAND: 'getviewport', properties: {} }, inputs: [], outputs: { currentviewport: 'object' } },
          {
            element: 'STAGE', id: 'displaystage', control: null,
            elements: [
              { element: 'BLOCK', id: 'havenames', type: 'fn', inputs: ['namesdicehtml', 'stepsdicehtml', 'ingredientshtml'], outputs: { havenames: 'number' }, fn: function(properties) {
                  return { havenames: (properties.inputs.namesdicehtml || properties.inputs.stepsdicehtml || properties.inputs.ingredientshtml) ? 1 : 0 };
              } },
              { element: 'BLOCK', id: 'cleanscaffold', type: 'writer', targetlabel: 'workspaceyj', replace: true, inputs: [], outputs: {}, fn: function() {
                  return { id: 'reciperootblank', timeout: 5000, html: '<div id="reciperootblank"></div>' };
              } },
              { element: 'BLOCK', id: 'insertscaffoldagain', type: 'writer', targetlabel: 'workspaceyj', replace: true, deps: ['insertscaffold'], inputs: ['frameworkfunctions', 'themefunctions', 'scaffoldfunctions', 'selectedtheme', 'currentviewport'], outputs: {}, fn: function(properties) {
                  var writefn = properties.deps && properties.deps.insertscaffold ? properties.deps.insertscaffold : insertscaffold;
                  return writefn(properties);
              } },
              {
                element: 'STAGE',
                id: 'havenamescond',
                control: {
                  command: 'LOOP',
                  fn: function(properties, state, loopcount) {
                    var n = (state && state.havenames !== undefined) ? state.havenames : 0;
                    return n > 0;
                  },
                  inputs: ['havenames']
                },
                elements: [
                  { element: 'BLOCK', id: 'writenamesagain', type: 'writer', targetlabel: 'namespane', replace: true, deps: ['writenames'], inputs: ['frameworkfunctions', 'themefunctions', 'namesfunctions', 'namesdicehtml', 'selectedtheme', 'currentviewport'], outputs: {}, fn: function(properties) {
                      var writefn = properties.deps && properties.deps.writenames ? properties.deps.writenames : writenames;
                      return writefn(properties);
                  } },
                  { element: 'BLOCK', id: 'writedescriptionagain', type: 'writer', targetlabel: 'descriptionpane', replace: true, deps: ['writedescription'], inputs: ['frameworkfunctions', 'themefunctions', 'descriptionfunctions', 'stepsdicehtml', 'selectedtheme', 'currentviewport'], outputs: {}, fn: function(properties) {
                      var writefn = properties.deps && properties.deps.writedescription ? properties.deps.writedescription : writedescription;
                      return writefn(properties);
                  } },
                  { element: 'BLOCK', id: 'writeingredientsagain', type: 'writer', targetlabel: 'ingredientspane', replace: true, deps: ['writeingredients'], inputs: ['frameworkfunctions', 'themefunctions', 'ingredientsfunctions', 'ingredientshtml', 'selectedtheme', 'currentviewport'], outputs: {}, fn: function(properties) {
                      var writefn = properties.deps && properties.deps.writeingredients ? properties.deps.writeingredients : writeingredients;
                      return writefn(properties);
                  } },
                  { element: 'BLOCK', id: 'havenamesset', type: 'fn', inputs: [], outputs: { havenames: 'number' }, fn: function() { return { havenames: 0 }; } }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    recipe: recipe
  };
}

