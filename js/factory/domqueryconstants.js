var domquerygetters = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
var domquerysetters = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
var domquerymessages = Object.freeze(domquerygetters.concat(domquerysetters));

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    domquerygetters: domquerygetters,
    domquerysetters: domquerysetters,
    domquerymessages: domquerymessages
  };
}
