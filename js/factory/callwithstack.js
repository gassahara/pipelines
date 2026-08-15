function safeshallowclone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    try { return JSON.parse(JSON.stringify(obj)); }
    catch {
        const clone = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'function') clone[key] = '[FUNCTION]';
            else if (typeof HTMLElement !== 'undefined' && (val instanceof HTMLElement || val instanceof Node)) clone[key] = '[DOM_NODE]';
            else if (typeof val === 'object' && val !== null) {
                try { JSON.stringify(val); clone[key] = safeshallowclone(val); }
                catch { clone[key] = '[NON_SERIALIZABLE]'; }
            } else clone[key] = val;
        }
        return clone;
    }
}

function applyccc(fn, typecheck) {
    if (!typecheck) return fn;
    const { argrules, resultrule } = typecheck;
    return (...args) => {
        if (argrules) argrules.forEach((rule, i) => {
            if (rule && !rule(args[i])) {
                const err = new Error(`[CCC:TYPE_VIOLATION] argument ${i} failed type check`);
                err.diagnostic = { typecheck: 'arg', index: i, value: args[i], rule: rule.name || 'custom' };
                throw err;
            }
        });
        const result = fn(...args);
        if (!resultrule) return result;
        const check = (v) => {
            if (!resultrule(v)) {
                const err = new Error('[CCC:TYPE_VIOLATION] return value failed type check');
                err.diagnostic = { typecheck: 'result', value: v, rule: resultrule.name || 'custom' };
                throw err;
            }
            return v;
        };
        return result && typeof result.then === 'function' ? result.then(check) : check(result);
    };
}

export function callwithstack(evalstack, label, type, fn, args, options = {}) {
    if (label?.startsWith('fn:') && !options.typecheck) {
        options = { ...options, typecheck: { resultrule: (v) => v != null && typeof v === 'object' && !Array.isArray(v) } };
    }
    const { thenfn, catchfn, errk, context, capturecontinuation = true, typecheck } = options;
    const wrappedfn = applyccc(fn, typecheck);
    const captured = capturecontinuation
        ? { fn: wrappedfn, args, label, type, options: { ...options, capturecontinuation: false }, pipestatesnapshot: safeshallowclone(context?.pipestate), envsnapshot: safeshallowclone(context?.env) }
        : null;

    let k;
    const promise = new Promise((resolve, reject) => {
        k = resolve;
        const meta = { label };
        if (context?.callerid) meta.callerid = context.callerid;
        evalstack.pushframe(wrappedfn, args, context?.pipestate, k, meta);

        const onsuccess = (result) => {
            evalstack.popframe();
            if (captured && result && typeof result === 'object' && !Array.isArray(result)) result.continuation = captured;
            if (thenfn) thenfn(result, context);
            k(result);
        };
        const onfailure = (err) => {
            if (!err.diagnostic) err.diagnostic = {};
            if (!err.diagnostic.debugtrace) err.diagnostic.debugtrace = evalstack.snapshot();
            if (captured && !err.diagnostic.continuation) err.diagnostic.continuation = captured;
            evalstack.popframe();
            if (catchfn) catchfn(err, context);
            if (typeof errk === 'function') {
                try {
                    const r = errk(err);
                    if (r && typeof r.then === 'function') { r.then(k); return; }
                    k(r); return;
                } catch {}
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
