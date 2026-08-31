function createActorRegistry() {
  return Object.freeze({ renderActor: null });
}

function setRenderActor(registry, actor) {
  if (!actor || typeof actor !== 'object' || typeof actor.send !== 'function') {
    throw new Error('[actorregistry] setRenderActor: actor must implement send(message)');
  }
  return Object.freeze({ renderActor: actor });
}

function getRenderActor(registry) {
  if (!registry || !registry.renderActor) {
    throw new Error('[actorregistry] RENDERACTOR is not registered');
  }
  return registry.renderActor;
}
