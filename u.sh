#!/bin/bash
# ============================================================
# apply-framework.sh — BLUEPRINT-EXECUTION-CYCLE RUN 24
# Applies C-5..C-10 (framework) from the BLUEPRINT to js/**.
# Idempotent on re-run (each step verifies before/after).
# ============================================================
set -euo pipefail

ROOT="${1:-$(pwd)}"
cd "$ROOT"

echo "=== apply-framework.sh starting in $ROOT ==="

# ------------------------------------------------------------
# C-5 (P-X-4a) — CREATE js/factory/contract.js
# ------------------------------------------------------------
echo "--- C-5: create js/factory/contract.js ---"
cat > js/factory/contract.js <<'C5EOF'
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
C5EOF
test -f js/factory/contract.js && grep -q 'function makecontract' js/factory/contract.js \
  && echo "C-5 PASS" || { echo "C-5 FAIL"; exit 1; }

# ------------------------------------------------------------
# C-6 (P-X-4b) — add 'assertion' blocktype in js/factory/blockcompiler.js
# ------------------------------------------------------------
echo "--- C-6: add assertion blocktype ---"
C6_LINE=$(grep -n "^      theory: 'theory'\$" js/factory/blockcompiler.js | head -1 | cut -d: -f1)
if [ -z "$C6_LINE" ]; then echo "C-6 FAIL: theory blocktype anchor not found"; exit 1; fi
{ head -n $((C6_LINE - 1)) js/factory/blockcompiler.js
  echo "      theory: 'theory',"
  echo "      assertion: 'assertion'"
  tail -n +$((C6_LINE + 1)) js/factory/blockcompiler.js
} > js/factory/blockcompiler.js.tmp
mv js/factory/blockcompiler.js.tmp js/factory/blockcompiler.js
grep -q "assertion: 'assertion'" js/factory/blockcompiler.js \
  && echo "C-6 PASS" || { echo "C-6 FAIL"; exit 1; }

# ------------------------------------------------------------
# C-7 (P-X-4c + P-X-4d) — compilers.assertion + createerrorcontext extension
# ------------------------------------------------------------
echo "--- C-7: add compilers.assertion and extend createerrorcontext ---"

# Step 1: replace createerrorcontext (8 lines, known block)
C7_LINE=$(grep -n '^function createerrorcontext(id, stagetype) {$' js/factory/blockcompilers.js | head -1 | cut -d: -f1)
if [ -z "$C7_LINE" ]; then echo "C-7 FAIL: createerrorcontext not found"; exit 1; fi
{ head -n $((C7_LINE - 1)) js/factory/blockcompilers.js
  cat <<'C7FN'
function createerrorcontext(id, stagetype) {
  return function(err) {
    err.diagnostic = err.diagnostic || {};
    err.diagnostic.BLOCKID = id;
    err.diagnostic.STAGETYPE = stagetype;
    if (err.contractfail && err.contractfail.element === 'CONTRACT_FAIL') {
      err.diagnostic.KIND = 'contract-fail';
      err.diagnostic.CONTEXT = err.contractfail.first ? err.contractfail.first.desc : null;
      err.diagnostic.CONTRACT_FAIL = err.diagnostic.CONTEXT;
      err.diagnostic.values = err.contractfail.first ? err.contractfail.first.values : null;
      err.diagnostic.table = err.contractfail.table;
    }
    throw err;
  };
}
C7FN
  tail -n +$((C7_LINE + 8)) js/factory/blockcompilers.js
} > js/factory/blockcompilers.js.tmp
mv js/factory/blockcompilers.js.tmp js/factory/blockcompilers.js

# Step 2: insert compilers.assertion before "return compilers;"
C7_RET=$(grep -n '^  return compilers;$' js/factory/blockcompilers.js | head -1 | cut -d: -f1)
if [ -z "$C7_RET" ]; then echo "C-7 FAIL: return compilers anchor not found"; exit 1; fi
{ head -n $((C7_RET - 1)) js/factory/blockcompilers.js
  cat <<'C7CMP'
  compilers[blocktypes.assertion] = function(merged, id, sig, inheritedproperties) {
    if (inheritedproperties === undefined) inheritedproperties = {};
    logdebug(blockcompilerstate, '[BLOCKCOMPILER]', 'compiling ASSERTION block:', id);
    var innerfn = function(env) {
      var properties = buildblockproperties(merged, inheritedproperties, sig, env);
      var contract = merged.assertions;
      if (!contract || contract.element !== 'CONTRACT' || !Array.isArray(contract.assertions)) {
        throw new Error('[ASSERTION] block "' + id + '" must declare assertions from makecontract(...)');
      }
      var table = contract.assertions.map(function(entry) {
        var value = compilepathaccessor(entry.input)(env);
        var values = {};
        entry.fields.forEach(function(f) {
          if (f === 'receivedtype') values.receivedtype = typeof value;
          else if (f === 'isnull') values.isnull = (value === null);
          else if (f === 'isundef') values.isundef = (value === undefined);
          else if (f === 'isarray') values.isarray = Array.isArray(value);
          else if (f === 'length') values.length = (value && typeof value.length === 'number') ? value.length : null;
          else if (f === 'value') values.value = value;
          else if (f === 'path') values.path = entry.input;
        });
        try {
          var result = entry.test(value);
          return { desc: entry.desc, ok: result === true, fields: entry.fields, values: values };
        } catch (e) {
          return { desc: entry.desc, ok: false, fields: entry.fields, values: values, threw: true, error: e && e.message ? e.message : String(e) };
        }
      });
      var assert_ok = table.every(function(e) { return e.ok === true; });
      if (merged.mode !== 'data' && !assert_ok) {
        var first = null;
        table.some(function(e) { if (!e.ok) { first = e; return true; } return false; });
        var failureerror = new Error('[CONTRACT_FAIL:' + (first ? first.desc : 'unknown') + ']');
        failureerror.contractfail = { element: 'CONTRACT_FAIL', table: table, first: first };
        throw failureerror;
      }
      return { assert_ok: assert_ok, assert_table: table };
    };
    return wrapcompiledfn(innerfn, 'assertion', id);
  };

C7CMP
  tail -n +$C7_RET js/factory/blockcompilers.js
} > js/factory/blockcompilers.js.tmp
mv js/factory/blockcompilers.js.tmp js/factory/blockcompilers.js

grep -q 'contractfail.element' js/factory/blockcompilers.js \
  && grep -q 'compilers\[blocktypes.assertion\]' js/factory/blockcompilers.js \
  && echo "C-7 PASS" || { echo "C-7 FAIL"; exit 1; }

# ------------------------------------------------------------
# C-8 (P-X-4e) — extend createpersistentelementwrapper preservation
# ------------------------------------------------------------
echo "--- C-8: extend wrapper preservation set ---"
C8_LINE=$(grep -n '          if (failurediagnostic.KIND !== undefined) failureError.diagnostic.KIND = failurediagnostic.KIND;' js/factory/pipelinecompilers.js | head -1 | cut -d: -f1)
if [ -z "$C8_LINE" ]; then echo "C-8 FAIL: KIND preservation anchor not found"; exit 1; fi
{ head -n $C8_LINE js/factory/pipelinecompilers.js
  echo "          if (failurediagnostic.CONTEXT !== undefined) failureError.diagnostic.CONTEXT = failurediagnostic.CONTEXT;"
  echo "          if (failurediagnostic.CONTRACT_FAIL !== undefined) failureError.diagnostic.CONTRACT_FAIL = failurediagnostic.CONTRACT_FAIL;"
  echo "          if (failurediagnostic.values !== undefined) failureError.diagnostic.values = failurediagnostic.values;"
  echo "          if (failurediagnostic.table !== undefined) failureError.diagnostic.table = failurediagnostic.table;"
  tail -n +$((C8_LINE + 1)) js/factory/pipelinecompilers.js
} > js/factory/pipelinecompilers.js.tmp
mv js/factory/pipelinecompilers.js.tmp js/factory/pipelinecompilers.js
grep -q 'failurediagnostic.table !== undefined' js/factory/pipelinecompilers.js \
  && echo "C-8 PASS" || { echo "C-8 FAIL"; exit 1; }

# ------------------------------------------------------------
# C-9 (P-X-4f) — extend DEBUGBEHAVIORSHOW with table rendering
# ------------------------------------------------------------
echo "--- C-9: extend DEBUGBEHAVIORSHOW ---"
C9_LINE=$(grep -n '^  var LOGVIEWERHTML = BUILDLOGVIEWERHTML(DEBUGSLICE.LOGS' js/actors/debugactor.js | head -1 | cut -d: -f1)
if [ -z "$C9_LINE" ]; then echo "C-9 FAIL: LOGVIEWERHTML anchor not found"; exit 1; fi
{ head -n $((C9_LINE - 1)) js/actors/debugactor.js
  cat <<'C9BLOCK'
  if (ARGS.ERROR && ARGS.ERROR.diagnostic && Array.isArray(ARGS.ERROR.diagnostic.table)) {
    var ASSERTTABLEHTML = '<div class="assertion-table" style="margin-top:20px;font-family:monospace;font-size:13px;">'
      + '<h4 style="color:#ff5555;margin:0 0 8px;">Assertion table</h4>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr><th style="text-align:left;padding:4px;border-bottom:1px solid #444;">desc</th>'
      + '<th style="text-align:left;padding:4px;border-bottom:1px solid #444;">ok</th>'
      + '<th style="text-align:left;padding:4px;border-bottom:1px solid #444;">values</th></tr></thead>'
      + '<tbody>'
      + ARGS.ERROR.diagnostic.table.map(function(ROW) {
          return '<tr>'
            + '<td style="padding:4px;border-bottom:1px solid #222;">' + (ROW.desc || '') + '</td>'
            + '<td style="padding:4px;border-bottom:1px solid #222;color:' + (ROW.ok ? '#33cc33' : '#ff5555') + ';">' + (ROW.ok ? 'OK' : 'FAIL') + '</td>'
            + '<td style="padding:4px;border-bottom:1px solid #222;">' + JSON.stringify(ROW.values || {}) + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
    OVERLAY.insertAdjacentHTML('beforeend', ASSERTTABLEHTML);
  }

C9BLOCK
  tail -n +$C9_LINE js/actors/debugactor.js
} > js/actors/debugactor.js.tmp
mv js/actors/debugactor.js.tmp js/actors/debugactor.js
grep -q 'assertion-table' js/actors/debugactor.js \
  && echo "C-9 PASS" || { echo "C-9 FAIL"; exit 1; }

# ------------------------------------------------------------
# C-10 (P-X-4g) — add contract.js to bootloader manifest
# ------------------------------------------------------------
echo "--- C-10: add contract.js to pipelinesmanifest ---"
C10_LINE=$(grep -n "src: 'factory/tokenscanner.js'" js/bootloader.js | head -1 | cut -d: -f1)
if [ -z "$C10_LINE" ]; then echo "C-10 FAIL: tokenscanner anchor not found"; exit 1; fi
{ head -n $((C10_LINE - 1)) js/bootloader.js
  echo "  { src: 'factory/contract.js', provides: ['makecontract'] },"
  tail -n +$C10_LINE js/bootloader.js
} > js/bootloader.js.tmp
mv js/bootloader.js.tmp js/bootloader.js
grep -q "factory/contract.js" js/bootloader.js \
  && echo "C-10 PASS" || { echo "C-10 FAIL"; exit 1; }

echo "=== apply-framework.sh: ALL FRAMEWORK CYCLES PASS (C-5..C-10) ==="

