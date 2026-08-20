function createProducerConsumerRegistry() {
  return {
    pending: {},
    active: {}
  };
}

function makePairKey(producer, consumer) {
  var producerKey = JSON.stringify(producer || {});
  var consumerKey = JSON.stringify(consumer || {});
  return producerKey + '|' + consumerKey;
}

function registerProducerConsumer(registry, producer, consumer, metadata) {
  if (!registry || !registry.pending || !registry.active) {
    throw new Error('[liveness] invalid registry');
  }

  var key = makePairKey(producer, consumer);

  registry.pending[key] = {
    producer: producer,
    consumer: consumer,
    metadata: metadata || {}
  };

  return key;
}

function runLivenessCycle(registry, isProducerLive, isConsumerLive, wire, unwire) {
  if (!registry || !isProducerLive || !isConsumerLive || !wire || !unwire) {
    throw new Error('[liveness] missing liveness cycle dependencies');
  }

  Object.keys(registry.pending).forEach(function(key) {
    var entry = registry.pending[key];

    if (isProducerLive(entry) && isConsumerLive(entry)) {
      wire(entry);
      registry.active[key] = entry;
      delete registry.pending[key];
    }
  });

  Object.keys(registry.active).forEach(function(key) {
    var entry = registry.active[key];

    if (!isProducerLive(entry) || !isConsumerLive(entry)) {
      unwire(entry);
      delete registry.active[key];
    }
  });
}

export {
  createProducerConsumerRegistry,
  registerProducerConsumer,
  runLivenessCycle
};
