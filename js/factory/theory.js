// js/factory/theory.js — theory construction and selection.
//
// @proposal=P-16.1a — maketheoryfunction(name, fn)
// @proposal=P-16.1b — makewitness(name, weight, theoryfunction)
// @proposal=P-16.1c — maketheory(theoryid, witnesses, extractor)
// @proposal=P-16.1d — maketheoryblock()
// @proposal=P-16.2  — addtheoryfunction(block, theoryfunction)
// @proposal=P-16.3  — addtheory(block, theory)
// @proposal=P-16.4  — runtheories(block, leafast, deps)
//
// VALUES:
//   theoryfunction value: { name: string, fn: function }
//   witness value:        { name: string, weight: positive finite number,
//                           theoryfunction: theoryfunction value }
//   theory value:         { theoryid: string, witnesses: witness[],
//                           extractor: theoryfunction value }
//   block value:          { functions: theoryfunction[], theories: theory[] }
//
// All functions are pure (no mutation of arguments). All throw Error
// with err.diagnostic on contract violation. ES5 only. No regex.
// No `this`. No for/while — Array.prototype methods only. Lowercase
// identifiers.
//
// BOUNDARY:
//   The framework treats `leafast` and `deps` (in runtheories) as
//   opaque values. It never reads into them; it passes them through to
//   the frontend-provided `.fn` functions, which do their own inspection.
//   Likewise, `block`, `theoryfunction`, `witness`, `theory` values are
//   stored and passed through; the framework checks their structural
//   shape but does not execute or dissect their `.fn` members beyond
//   invoking them in runtheories.

function isvalidtheoryfunction(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.name === 'string'
        && value.name.length > 0
        && typeof value.fn === 'function';
}

function isvalidwitness(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.name === 'string'
        && value.name.length > 0
        && typeof value.weight === 'number'
        && isFinite(value.weight)
        && value.weight > 0
        && isvalidtheoryfunction(value.theoryfunction);
}

function isvalidtheory(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.theoryid === 'string'
        && value.theoryid.length > 0
        && Array.isArray(value.witnesses)
        && value.witnesses.length > 0
        && value.witnesses.every(isvalidwitness)
        && isvalidtheoryfunction(value.extractor);
}

function isvalidtheoryblock(value) {
    return value !== null
        && typeof value === 'object'
        && Array.isArray(value.functions)
        && Array.isArray(value.theories);
}

function failtheorycontract(kind, details) {
    var err = new Error('[theory] ' + kind);
    err.diagnostic = { KIND: kind, DETAILS: details === undefined ? null : details };
    throw err;
}

function maketheoryfunction(name, fn) {
    if (typeof name !== 'string' || name.length === 0) {
        failtheorycontract('invalid-theory-function',
            { FIELD: 'name', RECEIVED_TYPE: typeof name });
    }
    if (typeof fn !== 'function') {
        failtheorycontract('invalid-theory-function',
            { FIELD: 'fn', RECEIVED_TYPE: typeof fn });
    }
    return { name: name, fn: fn };
}

function makewitness(name, weight, theoryfunction) {
    if (typeof name !== 'string' || name.length === 0) {
        failtheorycontract('invalid-witness',
            { FIELD: 'name', RECEIVED_TYPE: typeof name });
    }
    if (typeof weight !== 'number' || !isFinite(weight) || weight <= 0) {
        failtheorycontract('invalid-witness',
            { FIELD: 'weight', RECEIVED_TYPE: typeof weight, RECEIVED_VALUE: weight });
    }
    if (!isvalidtheoryfunction(theoryfunction)) {
        failtheorycontract('invalid-witness',
            { FIELD: 'theoryfunction', RECEIVED_TYPE: typeof theoryfunction });
    }
    return { name: name, weight: weight, theoryfunction: theoryfunction };
}

function maketheory(theoryid, witnesses, extractor) {
    if (typeof theoryid !== 'string' || theoryid.length === 0) {
        failtheorycontract('invalid-theory',
            { FIELD: 'theoryid', RECEIVED_TYPE: typeof theoryid });
    }
    if (!Array.isArray(witnesses)) {
        failtheorycontract('invalid-theory',
            { FIELD: 'witnesses', RECEIVED_TYPE: typeof witnesses });
    }
    if (witnesses.length === 0) {
        failtheorycontract('invalid-theory',
            { FIELD: 'witnesses', LENGTH: 0 });
    }
    if (!witnesses.every(isvalidwitness)) {
        failtheorycontract('invalid-theory',
            { FIELD: 'witnesses', DETAIL: 'one or more entries are not witness values' });
    }
    if (!isvalidtheoryfunction(extractor)) {
        failtheorycontract('invalid-theory',
            { FIELD: 'extractor', RECEIVED_TYPE: typeof extractor });
    }
    return { theoryid: theoryid, witnesses: witnesses, extractor: extractor };
}

function maketheoryblock() {
    return { functions: [], theories: [] };
}

function addtheoryfunction(block, theoryfunction) {
    if (!isvalidtheoryblock(block)) {
        failtheorycontract('invalid-block',
            { FIELD: 'block', RECEIVED_TYPE: typeof block });
    }
    if (!isvalidtheoryfunction(theoryfunction)) {
        failtheorycontract('invalid-theory-function',
            { FIELD: 'theoryfunction', RECEIVED_TYPE: typeof theoryfunction });
    }
    return {
        functions: block.functions.concat([theoryfunction]),
        theories: block.theories
    };
}

function addtheory(block, theory) {
    if (!isvalidtheoryblock(block)) {
        failtheorycontract('invalid-block',
            { FIELD: 'block', RECEIVED_TYPE: typeof block });
    }
    if (!isvalidtheory(theory)) {
        failtheorycontract('invalid-theory',
            { FIELD: 'theory', RECEIVED_TYPE: typeof theory });
    }
    return {
        functions: block.functions,
        theories: block.theories.concat([theory])
    };
}

function runtheories(block, leafast, deps) {
    if (!isvalidtheoryblock(block)) {
        failtheorycontract('invalid-block',
            { FIELD: 'block', RECEIVED_TYPE: typeof block });
    }
    if (block.theories.length === 0) {
        failtheorycontract('no-theories', { LENGTH: 0 });
    }

    function scoretheory(theory) {
        return theory.witnesses.reduce(function (acc, witness) {
            var fired = witness.theoryfunction.fn(leafast, deps);
            if (fired) {
                return acc + witness.weight;
            }
            return acc;
        }, 0);
    }

    function pickbetter(current, candidate) {
        if (current === null) return candidate;
        if (candidate.score > current.score) return candidate;
        return current;
    }

    var scored = block.theories.map(function (theory) {
        return { theory: theory, score: scoretheory(theory) };
    });
    var winner = scored.reduce(pickbetter, null);
    var names = winner.theory.extractor.fn(leafast, deps);
    return {
        theoryname: winner.theory.theoryid,
        score: winner.score,
        names: names
    };
}
