function evalstackidentity(value) {
    return value;
}

function initialevalstack() {
    return [];
}

function pushframe(state, fn, args, pipestate, cont, meta) {
    var m = meta === undefined ? {} : meta;
    var k = typeof cont === 'function' ? cont : evalstackidentity;
    var frame = {
        fn: fn,
        args: args,
        pipestate: pipestate || null,
        cont: k,
        meta: m,
        ts: Date.now()
    };
    return state.concat([frame]);
}

function popframe(state) {
    if (state.length === 0) {
        return { state: state, frame: null };
    }
    var frame = state[state.length - 1];
    var next = state.slice(0, -1);
    return { state: next, frame: frame };
}

function peekframe(state) {
    return state.length ? state[state.length - 1] : null;
}

function snapshotstack(state) {
    return state.slice();
}

function restorestack(state, saved) {
    return saved.slice();
}

function currentcontinuation(state) {
    return state.length
        ? (state[state.length - 1].cont || evalstackidentity)
        : evalstackidentity;
}

function chaincontinuations(state) {
    if (state.length === 0) return evalstackidentity;
    return state.slice().reverse().reduce(function(inner, f) {
        return function(v) {
            return (f.cont || evalstackidentity)(inner(v));
        };
    }, evalstackidentity);
}

function getcurrentcallerid(state) {
    var top = peekframe(state);
    return (top && top.meta && top.meta.callerid) || 'system';
}

var evalstackstate = initialevalstack();
