// js/factory/contract.js — framework contract constructor.
//
// @proposal=P-X-4a (BLUEPRINT-EXECUTION-CYCLE RUN 23/24, C-5).
//
// makecontract(assertions) — pure constructor.
// Returns a frozen value { element: 'CONTRACT', assertions: <frozen array> }.
// Each entry: { desc: <lowercase>, input: <path>, test: <fn>, fields: [<lowercase>] }.
// No registry. No name. No side effects.
//
// ES5. No regex. No `this`. Lowercase identifiers.

function makecontract(assertions) {
  if (!Array.isArray(assertions)) {
    var err = new Error('[makecontract] assertions must be an array');
    err.diagnostic = { KIND: 'makecontract-invalid-args', RECEIVED: typeof assertions };
    throw err;
  }
  var frozen = assertions.map(function (entry) {
    if (!entry || typeof entry !== 'object') {
      var e1 = new Error('[makecontract] entry must be an object');
      e1.diagnostic = { KIND: 'makecontract-invalid-entry', RECEIVED: typeof entry };
      throw e1;
    }
    if (typeof entry.desc !== 'string' || entry.desc.length === 0) {
      var e2 = new Error('[makecontract] entry.desc must be a non-empty lowercase string');
      e2.diagnostic = { KIND: 'makecontract-invalid-desc', RECEIVED: typeof entry.desc };
      throw e2;
    }
    if (typeof entry.input !== 'string' || entry.input.length === 0) {
      var e3 = new Error('[makecontract] entry.input must be a non-empty path string');
      e3.diagnostic = { KIND: 'makecontract-invalid-input', RECEIVED: typeof entry.input };
      throw e3;
    }
    if (typeof entry.test !== 'function') {
      var e4 = new Error('[makecontract] entry.test must be a function');
      e4.diagnostic = { KIND: 'makecontract-invalid-test', RECEIVED: typeof entry.test };
      throw e4;
    }
    if (!Array.isArray(entry.fields)) {
      var e5 = new Error('[makecontract] entry.fields must be an array');
      e5.diagnostic = { KIND: 'makecontract-invalid-fields', RECEIVED: typeof entry.fields };
      throw e5;
    }
    return Object.freeze({
      desc: entry.desc,
      input: entry.input,
      test: entry.test,
      fields: Object.freeze(entry.fields.slice())
    });
  });
  return Object.freeze({
    element: 'CONTRACT',
    assertions: Object.freeze(frozen)
  });
}
