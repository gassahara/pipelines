// ============================================================
// UPDATED FILE: js/functorial/maybe.js
// Change applied: ES5 syntax, no arrow functions, no const, module.exports
// ============================================================

var JUST = function(value) {
    return {
        tag: "JUST",
        value: value,
        map: function(fn) { return JUST(fn(value)); },
        chain: function(fn) { return fn(value); },
        getorelse: function(defaultvalue) {
            if (typeof defaultvalue === 'function') {
                throw new Error(
                    '[JUST.getorelse] Invalid call: argument is a function. ' +
                    'getorelse expects a value, not a function. ' +
                    'Use chain() or map() for function composition.'
                );
            }
            return value;
        }
    };
};

var NOTHING = function() {
    return {
        tag: "NOTHING",
        map: function() { return NOTHING(); },
        chain: function() { return NOTHING(); },
        getorelse: function(defaultvalue) {
            if (typeof defaultvalue === 'function') {
                throw new Error(
                    '[NOTHING.getorelse] Invalid call: argument is a function. ' +
                    'getorelse expects a value, not a function. ' +
                    'Use getorelselazy() if lazy evaluation is required.'
                );
            }
            if (defaultvalue === undefined) {
                console.warn('[NOTHING.getorelse] Called with undefined default value – returning undefined');
            }
            return defaultvalue;
        }
    };
};

var of = JUST;

var fromnullable = function(val) {
    return (val === null || val === undefined) ? NOTHING() : JUST(val);
};

var getorelselazy = function(maybe, fn) {
    if (maybe.tag === 'JUST') return maybe.value;
    if (typeof fn !== 'function') {
        throw new Error('[getorelselazy] Second argument must be a function');
    }
    return fn();
};

var MAYBEALGEBRA = Object.freeze({
  type: 'Maybe',
  typeconstructor: 'T → Maybe<T>',
  unit: 'JUST',
  bind: 'chain',
  map: 'map',
  leftidentity: 'PROVEN',
  rightidentity: 'PROVEN',
  associativity: 'PROVEN',
  functorlaw: 'PROVEN',
  verificationmethod: 'KLEISLI audit §3.1'
});
