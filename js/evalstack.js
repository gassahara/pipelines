export function createevalstack() {
    const stack = [];
    const identity = (v) => v;
    return {
        get frames() { return stack; },
        pushframe(fn, args, pipestate, k, meta = {}) {
            stack.push({ fn, args, pipestate: pipestate || null, cont: typeof k === 'function' ? k : identity, meta, ts: Date.now() });
        },
        popframe() { return stack.pop(); },
        peekframe() { return stack[stack.length - 1]; },
        snapshot() { return [...stack]; },
        restore(saved) { stack.length = 0; stack.push(...saved); },
        currentcontinuation() { return stack.length ? (stack[stack.length - 1].cont || identity) : identity; },
        chaincontinuations() {
            return stack.length === 0 ? identity : stack.slice().reverse().reduce((inner, f) => (v) => (f.cont || identity)(inner(v)), identity);
        },
        getcurrentcallerid() { return this.peekframe()?.meta?.callerid || 'system'; }
    };
}

export const EVALSTACK = createevalstack();
export const frames = EVALSTACK.frames;
export const pushframe = (fn, args, pipestate, cont, meta = {}) => EVALSTACK.pushframe(fn, args, pipestate, cont, meta);
export const popframe = () => EVALSTACK.popframe();
export const peekframe = () => EVALSTACK.peekframe();
export const snapshotstack = () => EVALSTACK.snapshot();
export const restorestack = (saved) => EVALSTACK.restore(saved);
export const currentcontinuation = () => EVALSTACK.currentcontinuation();
export const chaincontinuations = () => EVALSTACK.chaincontinuations();
