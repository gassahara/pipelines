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
  gc.objects = Object.keys(gc.objects).reduce(function(acc, id) {
    if (gc.objects[id].status !== 'ENDED') {
      acc[id] = gc.objects[id];
    }
    return acc;
  }, {});
}

function listObjects(gc, status) {
  return Object.keys(gc.objects).filter(function(id) {
    return !status || gc.objects[id].status === status;
  }).map(function(id) {
    return gc.objects[id];
  });
}
