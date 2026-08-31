// ============================================================
// UPDATED FILE: js/evalstack.js
// Change applied: ES5 syntax, no arrow functions, no const, module.exports
// ============================================================

function createevalstack() {
    var stack = [];
    var identity = function(v) { return v; };
    return {
        getframes: function() { return stack; },
        pushframe: function(fn, args, pipestate, k, meta) {
            if (meta === undefined) meta = {};
            stack.push({ fn: fn, args: args, pipestate: pipestate || null, cont: typeof k === 'function' ? k : identity, meta: meta, ts: Date.now() });
        },
        popframe: function() { return stack.pop(); },
        peekframe: function() { return stack[stack.length - 1]; },
        snapshot: function() { return stack.slice(); },
        restore: function(saved) { stack.length = 0; stack.push.apply(stack, saved); },
        currentcontinuation: function() { return stack.length ? (stack[stack.length - 1].cont || identity) : identity; },
        chaincontinuations: function() {
            if (stack.length === 0) return identity;
            return stack.slice().reverse().reduce(function(inner, f) {
                return function(v) { return (f.cont || identity)(inner(v)); };
            }, identity);
        },
        getcurrentcallerid: function() {
            var top = this.peekframe();
            return (top && top.meta && top.meta.callerid) || 'system';
        }
    };
}

var EVALSTACK = createevalstack();
var frames = EVALSTACK.getframes();
var pushframe = function(fn, args, pipestate, cont, meta) { return EVALSTACK.pushframe(fn, args, pipestate, cont, meta); };
var popframe = function() { return EVALSTACK.popframe(); };
var peekframe = function() { return EVALSTACK.peekframe(); };
var snapshotstack = function() { return EVALSTACK.snapshot(); };
var restorestack = function(saved) { return EVALSTACK.restore(saved); };
var currentcontinuation = function() { return EVALSTACK.currentcontinuation(); };
var chaincontinuations = function() { return EVALSTACK.chaincontinuations(); };
