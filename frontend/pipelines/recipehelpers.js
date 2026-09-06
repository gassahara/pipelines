// recipehelpers.js
// Recipe-specific helper functions for frontend recipe pipeline.
// ES5, functional recursive, no regex, lowercase identifiers.

function buildscaffold() {
  return '<div id="reciperoot"><div id="recipeheader"><h2 id="recipetitle">Kitchen Recipe & Culinary Oracle</h2><p id="recipesubtitle">Enter dish concepts, ingredients, or culinary queries below.</p></div><div id="recipeinputgroup"><label for="recipeinput">Recipe Query</label><span><input id="recipeinput" type="text" placeholder="e.g. Braised pork belly..."></span></div><div id="recipebuttongroup"><button id="recipegobtn" aria-label="Search recipes">SEARCH RECIPES</button></div><div id="recipeloader" style="display:none">Searching culinary databases...</div><div id="recipecontent"><div id="recipetabs"><button id="tabnames" aria-label="Names tab">Names</button><button id="tabdescription" aria-label="Description tab">Description</button><button id="tabingredients" aria-label="Ingredients tab">Ingredients</button></div><div id="namespane" style="display:block;"></div><div id="descriptionpane" style="display:none;"></div><div id="ingredientspane" style="display:none;"></div></div></div>';
}

function insertscaffold(properties) {
  var frameworkfunctions = properties.inputs.frameworkfunctions;
  var themefunctions = properties.inputs.themefunctions;
  var scaffoldfunctions = properties.inputs.scaffoldfunctions;
  var theme = properties.inputs.selectedtheme;
  var vp = properties.inputs.currentviewport;
  var parser = frameworkfunctions.domparser;
  var themerefhtml = themefunctions.generatethemereference(theme || 'dark');
  var html = buildscaffold();
  html = scaffoldfunctions.applyscaffoldtheme(html, themerefhtml, parser);
  html = scaffoldfunctions.applyscaffoldlayout(html, themerefhtml, vp, parser);
  return { id: 'reciperoot', timeout: 5000, html: html || '' };
}

function preparenamesmd(data) {
  var raw = data && data.response ? data.response : '';
  var decoded;
  try { decoded = decodeURIComponent(raw); } catch (e) { decoded = raw; }
  return unescapenewlines(decoded);
}

function processrecipesteps(recipesteps) {
  var data = safejsonarrayjoin(recipesteps);
  data = stripmarkdownfences(data);
  data = data.replace('```', ' ');
  var ings = [];
  function scaneingredients(str, start) {
    var idx = str.indexOf('**Ingredients**', start);
    if (idx === -1) return ings;
    var endidx = str.indexOf('**', idx + 15);
    var block = endidx > -1 ? str.substring(idx, endidx) : str.substring(idx);
    splitlines(block).forEach(function(line) {
      if (line.indexOf(';') > -1) ings.push(line.substring(0, line.indexOf(';')).trim());
    });
    return scaneingredients(str, idx + 15);
  }
  scaneingredients(data, 0);
  return { recipestepsdata: data, ingredients: ings, inglen: ings.length };
}

function extractingredient(ingredients, inglen) {
  var newlen = inglen - 1;
  if (newlen < 0) newlen = 0;
  var ingredientr = [];
  if (ingredients && ingredients[newlen] !== undefined) {
    ingredientr.push(ingredients[newlen]);
  }
  return { ingredientr: ingredientr, inglen: newlen };
}

function preparerecipeingredient(ingredientr, ingextract, ingproperties) {
  var descingredient = safejsonarrayjoin(ingextract && ingextract.response ? ingextract.response : ingextract);
  descingredient = stripmarkdownfences(descingredient);
  descingredient = descingredient.replace('```', ' ');
  var propingredient = safejsonarrayjoin(ingproperties && ingproperties.response ? ingproperties.response : ingproperties);
  propingredient = stripmarkdownfences(propingredient);
  propingredient = propingredient.replace('```', ' ');
  return { descingredient: descingredient, propingredient: propingredient };
}

function pushingredientobject(ingredientr, descasthtml, propasthtml, ingredientsobjects) {
  var newobj = {
    name: ingredientr,
    description: descasthtml,
    properties: propasthtml
  };
  return { ingredientsobjects: (ingredientsobjects || []).concat([newobj]) };
}

function buildredientshtml(ingredientsobjects) {
  return '<div id="ingredientslist">'
    + (ingredientsobjects || []).map(function(ing) {
        return '<div class="ingredient-card"><h1>' + ing.name + '</h1>' + ing.description + ' ' + ing.properties + '</div>';
      }).join('')
    + '</div>';
}

function safejsonarrayjoin(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return raw; }
  }
  if (Array.isArray(raw)) return raw.join('\n');
  if (raw && typeof raw === 'object') {
    if (raw.data && Array.isArray(raw.data)) return raw.data.join('\n');
    if (raw.response && Array.isArray(raw.response)) return raw.response.join('\n');
    return JSON.stringify(raw);
  }
  return String(raw);
}

function writenames(properties) {
  var frameworkfunctions = properties.inputs.frameworkfunctions;
  var themefunctions = properties.inputs.themefunctions;
  var namesfunctions = properties.inputs.namesfunctions;
  var html = properties.inputs.namesdicehtml;
  var theme = properties.inputs.selectedtheme;
  var vp = properties.inputs.currentviewport;
  var parser = frameworkfunctions.domparser;
  var themerefhtml = themefunctions.generatethemereference(theme || 'dark');
  html = namesfunctions.applynamestheme(html, themerefhtml, parser);
  html = namesfunctions.applynameslayout(html, themerefhtml, vp, parser);
  return { id: 'namespane', timeout: 5000, html: html || '' };
}

function writedescription(properties) {
  var frameworkfunctions = properties.inputs.frameworkfunctions;
  var themefunctions = properties.inputs.themefunctions;
  var descriptionfunctions = properties.inputs.descriptionfunctions;
  var html = properties.inputs.stepsdicehtml;
  var theme = properties.inputs.selectedtheme;
  var vp = properties.inputs.currentviewport;
  var parser = frameworkfunctions.domparser;
  var themerefhtml = themefunctions.generatethemereference(theme || 'dark');
  html = descriptionfunctions.applydescriptiontheme(html, themerefhtml, parser);
  html = descriptionfunctions.applydescriptionlayout(html, themerefhtml, vp, parser);
  return { id: 'descriptionpane', timeout: 5000, html: html || '' };
}

function writeingredients(properties) {
  var frameworkfunctions = properties.inputs.frameworkfunctions;
  var themefunctions = properties.inputs.themefunctions;
  var ingredientsfunctions = properties.inputs.ingredientsfunctions;
  var html = properties.inputs.ingredientshtml;
  var theme = properties.inputs.selectedtheme;
  var vp = properties.inputs.currentviewport;
  var parser = frameworkfunctions.domparser;
  var themerefhtml = themefunctions.generatethemereference(theme || 'dark');
  html = ingredientsfunctions.applyingredientstheme(html, themerefhtml, parser);
  html = ingredientsfunctions.applyingredientslayout(html, themerefhtml, vp, parser);
  return { id: 'ingredientspane', timeout: 5000, html: html || '' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildscaffold: buildscaffold,
    insertscaffold: insertscaffold,
    preparenamesmd: preparenamesmd,
    processrecipesteps: processrecipesteps,
    extractingredient: extractingredient,
    preparerecipeingredient: preparerecipeingredient,
    pushingredientobject: pushingredientobject,
    buildredientshtml: buildredientshtml,
    safejsonarrayjoin: safejsonarrayjoin,
    writenames: writenames,
    writedescription: writedescription,
    writeingredients: writeingredients
  };
}

