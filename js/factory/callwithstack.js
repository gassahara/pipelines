function safeshallowclone(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        const clone = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof HTMLElement !== 'undefined' && (val instanceof HTMLElement || val instanceof EventTarget || val instanceof Node)) {
                clone[key] = '[DOM_NODE]';
            } else if (typeof val === 'function') {
                clone[key] = '[FUNCTION]';
            } else if (typeof val === 'object' && val !== null) {
                try {
                    JSON.stringify(val);
                    clone[key] = safeshallowclone(val);
                } catch {
                    clone[key] = '[NON_SERIALIZABLE]';
                }
            } else {
                clone[key] = val;
            }
        }
        return clone;
    }
}

function attachdiagnostics(err, evalstack, captured) {
    if (!err.diagnostic) err.diagnostic = {};
    if (!err.diagnostic.debugtrace) err.diagnostic.debugtrace = evalstack.snapshot();
    if (captured && !err.diagnostic.continuation) err.diagnostic.continuation = captured;
}

function applyccc(fn, typecheck) {
    if (!typecheck) return fn;
    const { argrules, resultrule } = typecheck;
    return function(...args) {
        if (argrules) {
            for (let i = 0; i < argrules.length; i++) {
                const rule = argrules[i];
                if (rule && !rule(args[i])) {
                    const err = new Error('[CCC:TYPE_VIOLATION] argument ' + i + ' failed type check');
                    err.diagnostic = { typecheck: 'arg', index: i, value: args[i], rule: rule.name || 'custom' };
                    throw err;
                }
            }
        }
        const result = fn(...args);
        if (resultrule && result && typeof result.then === 'function') {
            return result.then(resolved => {
                if (!resultrule(resolved)) {
                    const err = new Error('[CCC:TYPE_VIOLATION] return value failed type check');
                    err.diagnostic = { typecheck: 'result', value: resolved, rule: resultrule.name || 'custom' };
                    throw err;
                }
                return resolved;
            });
        }
        if (resultrule && !(result && typeof result.then === 'function')) {
            if (!resultrule(result)) {
                const err = new Error('[CCC:TYPE_VIOLATION] return value failed type check');
                err.diagnostic = { typecheck: 'result', value: result, rule: resultrule.name || 'custom' };
                throw err;
            }
        }
        return result;
    };
}

export function callwithstack(evalstack, label, type, fn, args, options = {}) {
    if (label && label.startsWith('fn:') && !options.typecheck) {
        options = { ...options, typecheck: {
            resultrule: (v) => v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)
        }};
    }
    const { thenfn, catchfn, errk, context, capturecontinuation = true, typecheck } = options;
    const wrappedfn = applyccc(fn, typecheck);
    const captured = capturecontinuation ? { fn: wrappedfn, args, label, type, options: { ...options, capturecontinuation: false }, pipestatesnapshot: context?.pipestate ? safeshallowclone(context.pipestate) : null, envsnapshot: context?.env ? safeshallowclone(context.env) : null } : null;
    const framecontext = { pipestate: context?.pipestate, env: context?.env };
    let k;
    const promise = new Promise((resolve, reject) => {
        k = resolve;
        const meta = { label };
        if (context?.callerid) meta.callerid = context.callerid;
        evalstack.pushframe(wrappedfn, args, framecontext.pipestate, k, meta);
        const onsuccess = (result) => {
            evalstack.popframe();
            if (captured && result && typeof result === 'object' && !Array.isArray(result)) {
                result.continuation = captured;
            }
            if (thenfn) thenfn(result, context);
            k(result);
        };
        const onfailure = (err) => {
            attachdiagnostics(err, evalstack, captured);
            evalstack.popframe();
            if (catchfn) catchfn(err, context);
            if (typeof errk === 'function') {
                try {
                    const errkresult = errk(err);
                    if (errkresult && typeof errkresult.then === 'function') {
                        errkresult.then(function(val) { k(val); });
                        return;
                    }
                    k(errkresult);
                    return;
                } catch (e) { }
            }
            reject(err);
        };
        try {
            if (type === 'sync') { onsuccess(wrappedfn(...args)); return; }
            const p = wrappedfn(...args);
            if (!p || typeof p.then !== 'function') { onsuccess(p); return; }
            p.then(onsuccess).catch(onfailure);
        } catch (err) { onfailure(err); }
    });
    promise.cont = k;
    return promise;
}
export function runwithstack(p) { return p; }
