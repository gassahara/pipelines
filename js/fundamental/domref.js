var rawmap = [];

var domrefidcounter = 0;

function generatedomrefid() {
  domrefidcounter += 1;
  return 'domref' + Date.now() + domrefidcounter;
}

function setrawelement(ref, element) {
  rawmap.push({ ref: ref, element: element });
}

function getrawelement(ref) {
  var found = rawmap.filter(function(entry) { return entry.ref === ref; });
  return found.length > 0 ? found[0].element : null;
}

function removerawelementref(ref) {
  rawmap = rawmap.filter(function(entry) { return entry.ref !== ref; });
}

function createdomref(rawelement, actorregistry) {
  if (!rawelement || (typeof HTMLELEMENT !== 'undefined' && !(rawelement instanceof HTMLELEMENT))) {
    if (typeof HTMLELEMENT !== 'undefined') {
      throw new Error('[createdomref] invalid element');
    }
  }

  var getrenderactorfn = (typeof GETRENDERACTOR === 'function') ? GETRENDERACTOR : (typeof GETRENDERACTOR === 'function' ? GETRENDERACTOR : function() { return { send: function() {} }; });

  var ref = {
    project: function(renderer, data, env) {
      var actor = getrenderactorfn(actorregistry);
      actor.send({
        type: 'render',
        id: generatedomrefid(),
        renderer: renderer,
        data: data,
        env: env || {}
      });
    },
    appendchild: function(childref) {
      var actor = getrenderactorfn(actorregistry);
      actor.send({
        type: 'render',
        id: generatedomrefid(),
        renderer: function() {
          var parent = getrawelement(ref);
          var child = getrawelement(childref);
          if (parent && child) parent.appendChild(child);
        },
        data: {}
      });
    },
    remove: function() {
      var actor = getrenderactorfn(actorregistry);
      actor.send({
        type: 'render',
        id: generatedomrefid(),
        renderer: function() {
          var el = getrawelement(ref);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        },
        data: {}
      });
      removerawelementref(ref);
    }
  };

  setrawelement(ref, rawelement);
  return ref;
}

function removeref(ref) {
  removerawelementref(ref);
}

function isvaliddomref(ref) {
  return ref && typeof ref === 'object' && typeof ref.project === 'function';
}

// UPPERCASE aliases for actor files
var CREATEDOMREF = createdomref;
var GETRAWELEMENT = getrawelement;
var REMOVEREF = removeref;
var ISVALIDDOMREF = isvaliddomref;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    rawmap: rawmap,
    generatedomrefid: generatedomrefid,
    setrawelement: setrawelement,
    getrawelement: getrawelement,
    removerawelementref: removerawelementref,
    createdomref: createdomref,
    removeref: removeref,
    isvaliddomref: isvaliddomref,
    CREATEDOMREF: CREATEDOMREF,
    GETRAWELEMENT: GETRAWELEMENT,
    REMOVEREF: REMOVEREF,
    ISVALIDDOMREF: ISVALIDDOMREF
  };
}
