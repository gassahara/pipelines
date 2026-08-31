// ============================================================
// UPDATED FILE: js/factory/domqueryconstants.js
// Change applied: leaf interface module (ES5). Extracted from
// renderactor.js so interfaces (typesystem) never import an actor.
// ============================================================

var DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
var DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
var DOMQUERYMESSAGES = Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS));
