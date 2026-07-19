export function createevalstack() {
    const stack = [];
    return {
        get frames() { return stack; },
        pushframe(fn, args, pipestate, k, meta = {}) {
            stack.push({
                fn, args,
                pipestate: pipestate || null,
                cont: typeof k === 'function' ? k : (v) => v,
                meta, ts: Date.now()
            });
        },
        popframe() { return stack.pop(); },
        peekframe() { return stack[stack.length - 1]; },
        snapshot() { return [...stack]; },
        restore(saved) {
            stack.length = 0;
            stack.push(...saved);
        },
        currentcontinuation() {
            if (stack.length === 0) return (v) => v;
            const frame = stack[stack.length - 1];
            return typeof frame.cont === 'function' ? frame.cont : (v) => v;
        },
        chaincontinuations() {
            if (stack.length === 0) return (v) => v;
            return stack.slice().reverse().reduce((inner, frame) => {
                const k = typeof frame.cont === 'function' ? frame.cont : (v) => v;
                return (v) => k(inner(v));
            }, (v) => v);
        },
        getcurrentcallerid() {
            const frame = this.peekframe();
            return frame?.meta?.callerid || 'system';
        }
    };
}

export const EVALSTACK = createevalstack();
export const frames = EVALSTACK.frames;

export function pushframe(fn, args, pipestate, cont, meta = {}) {
    EVALSTACK.pushframe(fn, args, pipestate, cont, meta);
}
export function popframe() { return EVALSTACK.popframe(); }
export function peekframe() { return EVALSTACK.peekframe(); }
export function snapshotstack() { return EVALSTACK.snapshot(); }
export function restorestack(saved) { EVALSTACK.restore(saved); }
export function currentcontinuation() { return EVALSTACK.currentcontinuation(); }
export function chaincontinuations() { return EVALSTACK.chaincontinuations(); }
