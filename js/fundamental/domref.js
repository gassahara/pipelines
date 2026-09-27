// domref.js — DOM element reference concern.
//
// @proposal=P3 (Cycle 16) — the P3 sweep produced the lowercase
// `htmlelement` at the createdomref guard. That mangling broke the
// guard (the branch never fired).
//
// @proposal=P10 (Cycle P10-03, batch 10.3) — the canonical host
// builtin spelling `HTMLElement` is restored at all three sites.
// The guard is now live: createdomref throws when handed a value
// that is not a DOM element.

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
  if (!rawelement || (typeof HTMLElement !== 'undefined' && !(rawelement instanceof HTMLElement))) {
    if (typeof HTMLElement !== 'undefined') {
      throw new Error('[createdomref] invalid element');
    }
  }

  var getrenderactorfn = (typeof getrenderactor === 'function') ? getrenderactor : function() { return { send: function() {} }; };

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
