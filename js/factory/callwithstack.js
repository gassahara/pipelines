function safeshallowclone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) {
        var clone = {};
        var keys = Object.keys(obj);
        keys.forEach(function(key) {
            var val = obj[key];
            if (typeof val === 'function') clone[key] = '[FUNCTION]';
            else if (typeof HTMLElement !== 'undefined' && (val instanceof HTMLElement || val instanceof Node)) clone[key] = '[DOM_NODE]';
            else if (typeof val === 'object' && val !== null) {
                try { JSON.stringify(val); clone[key] = safeshallowclone(val); }
                catch (e2) { clone[key] = '[NON_SERIALIZABLE]'; }
            } else clone[key] = val;
        });
        return clone;
    }
}

function applyccc(fn, typecheck) {
    if (!typecheck) return fn;
    var argrules = typecheck.argrules;
    var resultrule = typecheck.resultrule;
    return function() {
        var args = Array.prototype.slice.call(arguments);
        if (argrules) {
            argrules.forEach(function(rule, ri) {
                if (rule && !rule(args[ri])) {
                    var err = new Error('[CCC:TYPE_VIOLATION] argument ' + ri + ' failed type check');
                    err.diagnostic = { typecheck: 'arg', index: ri, value: args[ri], rule: rule.name || 'custom' };
                    throw err;
                }
            });
        }
        var result = fn.apply(null, args);
        if (!resultrule) return result;
        var check = function(v) {
            if (!resultrule(v)) {
                var err2 = new Error('[CCC:TYPE_VIOLATION] return value failed type check');
                err2.diagnostic = { typecheck: 'result', value: v, rule: resultrule.name || 'custom' };
                throw err2;
            }
            return v;
        };
        return result && typeof result.then === 'function' ? result.then(check) : check(result);
    };
}

function callwithstack(evalstack, label, type, fn, args, options) {
    if (options === undefined) options = {};
    if (label && label.indexOf('fn:') === 0 && !options.typecheck) {
        var merged = {};
        var optkeys = Object.keys(options);
        optkeys.forEach(function(k) { merged[k] = options[k]; });
        merged.typecheck = { resultrule: function(v) { return v != null && typeof v === 'object' && !Array.isArray(v); } };
        options = merged;
    }
    var thenfn = options.thenfn;
    var catchfn = options.catchfn;
    var errk = options.errk;
    var context = options.context;
    var capturecontinuation = options.capturecontinuation !== undefined ? options.capturecontinuation : true;
    var typecheck = options.typecheck;
    var wrappedfn = applyccc(fn, typecheck);
    var captured = null;
    if (capturecontinuation) {
        var capturedoptions = {};
        var ckeys = Object.keys(options);
        ckeys.forEach(function(k) { capturedoptions[k] = options[k]; });
        capturedoptions.capturecontinuation = false;
        captured = {
            fn: wrappedfn,
            args: args,
            label: label,
            type: type,
            options: capturedoptions,
            pipestatesnapshot: safeshallowclone(context && context.pipestate),
            envsnapshot: safeshallowclone(context && context.env)
        };
    }

    var k;
    var promise = new Promise(function(resolve, reject) {
        k = resolve;
        var meta = { label: label };
        if (context && context.callerid) meta.callerid = context.callerid;
        evalstack.pushframe(wrappedfn, args, context && context.pipestate, k, meta);

        var onsuccess = function(result) {
            evalstack.popframe();
            if (captured && result && typeof result === 'object' && !Array.isArray(result)) result.continuation = captured;
            if (thenfn) thenfn(result, context);
            k(result);
        };
        var onfailure = function(err) {
            if (!err.diagnostic) err.diagnostic = {};
            if (!err.diagnostic.debugtrace) err.diagnostic.debugtrace = evalstack.snapshot();
            if (captured && !err.diagnostic.continuation) err.diagnostic.continuation = captured;
            evalstack.popframe();

            // P35: Auto-invoke debug actor on error
            if (typeof sendInstruction === 'function' && typeof MESSAGETYPES !== 'undefined') {
                try {
                    sendInstruction('debugactor', MESSAGETYPES.SHOW, {
                        error: err,
                        continuation: (err.diagnostic && err.diagnostic.continuation) || null
                    }, generateTag(), 'callwithstack');
                } catch (notifyErr) {
                    // Avoid recursion if debugactor fails
                }
            }

            if (catchfn) catchfn(err, context);
            if (typeof errk === 'function') {
                try {
                    var r = errk(err);
                    if (r && typeof r.then === 'function') { r.then(k); return; }
                    k(r); return;
                } catch (e3) {}
            }
            reject(err);
        };

        try {
            if (type === 'sync') { onsuccess(wrappedfn.apply(null, args)); return; }
            var p = wrappedfn.apply(null, args);
            if (!p || typeof p.then !== 'function') { onsuccess(p); return; }
            p.then(onsuccess).catch(onfailure);
        } catch (err) { onfailure(err); }
    });
    promise.cont = k;
    return promise;
}

function runwithstack(p) { return p; }
