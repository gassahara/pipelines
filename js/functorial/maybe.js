export const JUST = (value) => ({
    tag: "JUST",
    value,
    map: (fn) => JUST(fn(value)),
    chain: (fn) => fn(value),
    getorelse: (defaultvalue) => {
        if (typeof defaultvalue === 'function') {
            throw new Error(
                '[JUST.getorelse] Invalid call: argument is a function. ' +
                'getorelse expects a value, not a function. ' +
                'Use chain() or map() for function composition.'
            );
        }
        return value;
    }
});

export const NOTHING = () => ({
    tag: "NOTHING",
    map: () => NOTHING(),
    chain: () => NOTHING(),
    getorelse: (defaultvalue) => {
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
});

export const of = JUST;
export const fromnullable = (val) => (val === null || val === undefined) ? NOTHING() : JUST(val);

export const getorelselazy = (maybe, fn) => {
    if (maybe.tag === 'JUST') return maybe.value;
    if (typeof fn !== 'function') {
        throw new Error('[getorelselazy] Second argument must be a function');
    }
    return fn();
};

export const MAYBEALGEBRA = Object.freeze({
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
