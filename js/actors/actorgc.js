function createGarbageCollector() {
  return {
    objects: {},
    nextId: 0
  };
}

function registerObject(gc, obj) {
  if (!obj.id) {
    gc.nextId += 1;
    obj.id = 'gc_' + gc.nextId;
  }
  obj.status = obj.status || 'EXPECTING';
  obj.sentCount = obj.sentCount || 0;
  obj.receivedCount = obj.receivedCount || 0;
  gc.objects[obj.id] = obj;
  return obj;
}

function updateStatus(gc, id, status) {
  if (gc.objects[id]) {
    gc.objects[id].status = status;
  }
}

function incrementSent(gc, id, count) {
  if (gc.objects[id]) {
    gc.objects[id].sentCount += (count || 1);
  }
}

function incrementReceived(gc, id, count) {
  if (gc.objects[id]) {
    gc.objects[id].receivedCount += (count || 1);
  }
}

function collectEnded(gc) {
  Object.keys(gc.objects).forEach(function(id) {
    if (gc.objects[id].status === 'ENDED') {
      delete gc.objects[id];
    }
  });
}

function listObjects(gc, status) {
  return Object.keys(gc.objects).filter(function(id) {
    return !status || gc.objects[id].status === status;
  }).map(function(id) {
    return gc.objects[id];
  });
}

export {
  createGarbageCollector,
  registerObject,
  updateStatus,
  incrementSent,
  incrementReceived,
  collectEnded,
  listObjects
};
