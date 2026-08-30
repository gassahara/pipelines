function createTriggerRegistry() {
  return Object.freeze({ map: Object.freeze({}) });
}

function cloneRegistryMap(map) {
  var out = {};
  Object.keys(map).forEach(function(id) {
    var events = map[id];
    var newEvents = {};
    Object.keys(events).forEach(function(event) {
      newEvents[event] = events[event];
    });
    out[id] = newEvents;
  });
  return out;
}

function registerTrigger(registry, id, event, handler) {
  if (!registry || !registry.map) {
    throw new Error('[registerTrigger] registry is null or missing map');
  }

  var newMap = cloneRegistryMap(registry.map);
  var events = newMap[id] || {};
  var newEvents = {};
  Object.keys(events).forEach(function(k) { newEvents[k] = events[k]; });
  newEvents[event] = handler;
  newMap[id] = newEvents;
  return Object.freeze({ map: Object.freeze(newMap) });
}

function unregisterTrigger(registry, id, event) {
  var newMap = cloneRegistryMap(registry.map);
  if (event === undefined || event === null) {
    delete newMap[id];
  } else if (newMap[id]) {
    var newEvents = {};
    Object.keys(newMap[id]).forEach(function(k) {
      if (k !== event) newEvents[k] = newMap[id][k];
    });
    if (Object.keys(newEvents).length > 0) newMap[id] = newEvents;
    else delete newMap[id];
  }
  return Object.freeze({ map: Object.freeze(newMap) });
}

// P11: Inject DOM dependency; optional doc parameter defaults to global document
function revalidateAll(registry, doc) {
  var documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    throw new Error('[revalidateAll] Document object not available; provide a valid DOM document.');
  }

  var map = registry.map;
  Object.keys(map).forEach(function(id) {
    var el = documentRef.getElementById(id);
    if (el) {
      var events = map[id];
      Object.keys(events).forEach(function(event) {
        el.removeEventListener(event, events[event]);
        el.addEventListener(event, events[event]);
      });
    }
  });
}

function getTriggerMap(registry) {
  return registry.map;
}

export {
  createTriggerRegistry,
  registerTrigger,
  unregisterTrigger,
  revalidateAll,
  getTriggerMap
};
