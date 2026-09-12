function safeshallowclone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) {
        var clone = {};
        var keys = Object.keys(obj);
        keys.forEach(function(key) {
            var val = obj[key];
            if (typeof val === 'function') clone[key] = '[FUNCTION]';
            else if (typeof HTMLElement !== 'undefined' && (val instanceof HTMLElement || val instanceof Node)) clone[key] = '[DOMNODE]';
            else if (typeof val === 'object' && val !== null) {
                try { JSON.stringify(val); clone[key] = safeshallowclone(val); }
                catch (e2) { clone[key] = '[NONSERIALIZABLE]'; }
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
                    var err = new Error('[CCC:TYPEVIOLATION] argument ' + ri + ' failed type check');
                    err.diagnostic = { TYPECHECK: 'arg', INDEX: ri, VALUE: args[ri], RULE: rule.name || 'custom' };
                    throw err;
                }
            });
        }
        var result = fn.apply(null, args);
        if (!resultrule) return result;
        var check = function(v) {
            if (!resultrule(v)) {
                var err2 = new Error('[CCC:TYPEVIOLATION] return value failed type check');
                err2.diagnostic = { TYPECHECK: 'result', VALUE: v, RULE: resultrule.name || 'custom' };
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
    var attachcontinuation = (options.attachcontinuation !== undefined ? options.attachcontinuation : options.attachContinuation) !== false;
    var typecheck = options.typecheck;
    var wrappedfn = applyccc(fn, typecheck);
    var captured = null;
    if (capturecontinuation) {
        var capturedoptions = {};
        var ckeys = Object.keys(options);
        ckeys.forEach(function(k) { capturedoptions[k] = options[k]; });
        capturedoptions.capturecontinuation = false;
        captured = {
            FN: wrappedfn,
            ARGS: args,
            LABEL: label,
            TYPE: type,
            OPTIONS: capturedoptions,
            PIPESTATESNAPSHOT: safeshallowclone(context && context.pipestate),
            ENVSNAPSHOT: safeshallowclone(context && context.env)
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
            if (captured && attachcontinuation && result && typeof result === 'object' && !Array.isArray(result)) {
                result.CONTINUATION = captured;
            }
            if (thenfn) thenfn(result, context);
            k(result);
        };
        var onfailure = function(err) {
            if (!err.diagnostic) err.diagnostic = {};
            if (!err.diagnostic.DEBUGTRACE) err.diagnostic.DEBUGTRACE = evalstack.snapshot();
            if (captured && !err.diagnostic.CONTINUATION) err.diagnostic.CONTINUATION = captured;
            evalstack.popframe();

            var sendinstfn = (typeof SENDINSTRUCTION === 'function') ? SENDINSTRUCTION : null;
            var gentagfn = (typeof GENERATETAG === 'function') ? GENERATETAG : function() { return 'tag'; };
            if (sendinstfn && typeof MESSAGETYPES !== 'undefined') {
                try {
                    sendinstfn('DEBUGACTOR', MESSAGETYPES.SHOW, {
                        error: err,
                        continuation: (err.diagnostic && err.diagnostic.CONTINUATION) || null
                    }, gentagfn(), 'callwithstack');
                } catch (notifyerr) {}
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
