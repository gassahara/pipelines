import { createactor } from './actorkernel.js';

const UPDATE    = 'update';
const OBSERVE   = 'observe';
const UNOBSERVE = 'unobserve';

const deepmerge = (target, patch) => {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
    if (target === null || typeof target !== 'object' || Array.isArray(target)) return patch;
    return Object.keys(patch).reduce((acc, key) => {
        const targetval = acc[key];
        const patchval  = patch[key];
        const bothobjects = (
            patchval  !== null && typeof patchval  === 'object' && !Array.isArray(patchval) &&
            targetval !== null && typeof targetval === 'object' && !Array.isArray(targetval)
        );
        return { ...acc, [key]: bothobjects ? deepmerge(targetval, patchval) : patchval };
    }, target);
};

const worldmapbehavior = (state, message) => {
    if (message.type === UPDATE) {
        const nextworldmap = deepmerge(state.worldmap, message.patch);
        state.observers.forEach(observer => observer(nextworldmap));
        return { worldmap: nextworldmap, observers: state.observers };
    }
    if (message.type === OBSERVE) {
        return { ...state, observers: [...state.observers, message.observer] };
    }
    if (message.type === UNOBSERVE) {
        return { ...state, observers: state.observers.filter(obs => obs !== message.observer) };
    }
    return state;
};

const WORLDMAPACTOR = createactor(worldmapbehavior, { worldmap: {}, observers: [] });

export const updateworldmap = (patch) => WORLDMAPACTOR.send({ type: UPDATE, patch });
export const observeworldmap = (observer) => WORLDMAPACTOR.send({ type: OBSERVE, observer });
export const unobserveworldmap = (observer) => WORLDMAPACTOR.send({ type: UNOBSERVE, observer });
export const getworldmap = () => WORLDMAPACTOR.getstate().worldmap;
