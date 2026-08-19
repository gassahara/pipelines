import { getRenderActor } from '../actors/actorregistry.js';

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
  for (var i = 0; i < RAWMAP.length; i++) {
    if (RAWMAP[i].ref === ref) return RAWMAP[i].element;
  }
  return null;
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
    }
  };

  setRawElement(ref, rawelement);
  return ref;
}

function ISVALIDDOMREF(ref) {
  return ref && typeof ref === 'object' && typeof ref.project === 'function';
}

export {
  GETRAWELEMENT,
  CREATEDOMREF,
  ISVALIDDOMREF
};
