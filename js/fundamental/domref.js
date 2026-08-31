// ============================================================
// UPDATED FILE: js/fundamental/domref.js
// Change applied: ES5 syntax, functional-recursive, require/module.exports
// ============================================================


var RAWMAP = [];

var domrefidcounter = 0;

function generateDomRefId() {
  domrefidcounter += 1;
  return 'domref_' + Date.now() + '_' + domrefidcounter;
}

function setRawElement(ref, element) {
  RAWMAP.push({ ref: ref, element: element });
}

function getRawElement(ref) {
  var found = RAWMAP.filter(function(entry) { return entry.ref === ref; });
  return found.length > 0 ? found[0].element : null;
}

function removeRawElementRef(ref) {
  RAWMAP = RAWMAP.filter(function(entry) { return entry.ref !== ref; });
}

function GETRAWELEMENT(ref) {
  if (!ref || typeof ref !== 'object') {
    throw new Error('[GETRAWELEMENT] Invalid domref');
  }
  var raw = getRawElement(ref);
  if (!raw) throw new Error('[GETRAWELEMENT] Invalid domref');
  return raw;
}

function CREATEDOMREF(rawelement, actorRegistry) {
  if (!rawelement || !(rawelement instanceof HTMLElement)) {
    throw new Error('[CREATEDOMREF] Invalid element');
  }

  var ref = {
    project: function(renderer, data, env) {
      var actor = getRenderActor(actorRegistry);
      actor.send({
        type: 'render',
        id: generateDomRefId(),
        renderer: renderer,
        data: data,
        env: env || {}
      });
    },
    appendchild: function(childref) {
      var actor = getRenderActor(actorRegistry);
      actor.send({
        type: 'render',
        id: generateDomRefId(),
        renderer: function() {
          var parent = GETRAWELEMENT(ref);
          var child = GETRAWELEMENT(childref);
          if (parent && child) parent.appendChild(child);
        },
        data: {}
      });
    },
    remove: function() {
      var actor = getRenderActor(actorRegistry);
      actor.send({
        type: 'render',
        id: generateDomRefId(),
        renderer: function() {
          var el = GETRAWELEMENT(ref);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        },
        data: {}
      });
      // Clean up raw element reference after removal request
      removeRawElementRef(ref);
    }
  };

  setRawElement(ref, rawelement);
  return ref;
}

function REMOVEREF(ref) {
  removeRawElementRef(ref);
}

function ISVALIDDOMREF(ref) {
  return ref && typeof ref === 'object' && typeof ref.project === 'function';
}
