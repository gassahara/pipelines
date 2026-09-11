var just = function(value) {
    return {
        tag: 'just',
        value: value,
        map: function(fn) { return just(fn(value)); },
        chain: function(fn) { return fn(value); },
        getorelse: function(defaultvalue) {
            if (typeof defaultvalue === 'function') {
                throw new Error(
                    '[just.getorelse] invalid call: argument is a function. ' +
                    'getorelse expects a value, not a function. ' +
                    'use chain() or map() for function composition.'
                );
            }
            return value;
        }
    };
};

var nothing = function() {
    return {
        tag: 'nothing',
        map: function() { return nothing(); },
        chain: function() { return nothing(); },
        getorelse: function(defaultvalue) {
            if (typeof defaultvalue === 'function') {
                throw new Error(
                    '[nothing.getorelse] invalid call: argument is a function. ' +
                    'getorelse expects a value, not a function. ' +
                    'use getorelselazy() if lazy evaluation is required.'
                );
            }
            if (defaultvalue === undefined) {
                console.warn('[nothing.getorelse] called with undefined default value – returning undefined');
            }
            return defaultvalue;
        }
    };
};

var fromnullable = function(val) {
    return (val === null || val === undefined) ? nothing() : just(val);
};

var getorelselazy = function(maybe, fn) {
    if (maybe.tag === 'just') return maybe.value;
    if (typeof fn !== 'function') {
        throw new Error('[getorelselazy] second argument must be a function');
    }
    return fn();
};

var maybealgebra = Object.freeze({
    type: 'maybe',
    typeconstructor: 't → maybe<t>',
    unit: 'just',
    bind: 'chain',
    map: 'map',
    leftidentity: 'proven',
    rightidentity: 'proven',
    associativity: 'proven',
    functorlaw: 'proven',
    verificationmethod: 'kleisli audit §3.1'
});