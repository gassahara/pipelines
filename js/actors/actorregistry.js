let renderActor = null;

export const setRenderActor = (actor) => {
    if (!actor || typeof actor !== 'object' || typeof actor.send !== 'function') {
        throw new Error('[actorregistry] setRenderActor: actor must implement send(message)');
    }
    renderActor = actor;
};

export const getRenderActor = () => {
    if (!renderActor) {
        throw new Error('[actorregistry] RENDERACTOR is not registered');
    }
    return renderActor;
};
