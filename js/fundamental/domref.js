import { getRenderActor } from '../actors/actorregistry.js';

const RAWMAP = new WeakMap();

export function GETRAWELEMENT(ref) {
  if (!ref || typeof ref !== 'object' || !RAWMAP.has(ref)) {
    throw new Error('[GETRAWELEMENT] Invalid domref');
  }
  return RAWMAP.get(ref);
}

export function CREATEDOMREF(rawelement) {
  if (!rawelement || !(rawelement instanceof HTMLElement)) {
    throw new Error('[CREATEDOMREF] Invalid element');
  }
  const ref = {
    project: (renderer, data, env) => {
      const actor = getRenderActor();
      actor.send({ type: 'render', id: null, renderer: renderer, data: data, env: env || {} });
    },
    appendchild: (childref) => {
      const actor = getRenderActor();
      actor.send({ type: 'render', id: null, renderer: () => {
        const parent = GETRAWELEMENT(ref);
        const child = GETRAWELEMENT(childref);
        if (parent && child) parent.appendChild(child);
      }, data: {} });
    },
    remove: () => {
      const actor = getRenderActor();
      actor.send({ type: 'render', id: null, renderer: () => {
        const el = GETRAWELEMENT(ref);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, data: {} });
    }
  };
  RAWMAP.set(ref, rawelement);
  return ref;
}

export function ISVALIDDOMREF(ref) {
  return ref && typeof ref === 'object' && typeof ref.project === 'function';
}
