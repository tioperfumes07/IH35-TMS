#!/usr/bin/env node
import { PASS8_COUNTS, emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const trace = loadText("docs/specs/IH35_REQUIREMENT_TRACE_MATRIX_V3.csv");
const codeMatches = [...trace.matchAll(/E_[A-Z0-9_]+|E_[A-Z0-9]+|E-[A-Z0-9_]+|E_[A-Z]+|E_[A-Z_]+/g)].map((m) =>
  m[0].replace(/[-]/g, "_")
);
const unique = [...new Set(codeMatches)].sort();

const failures = [];
if (unique.length < PASS8_COUNTS.error_codes) {
  failures.push(`expected at least ${PASS8_COUNTS.error_codes} error codes but found ${unique.length}`);
}

emitStepResult({
  area: "error_codes",
  expected: PASS8_COUNTS.error_codes,
  checked: unique.length,
  pass_count: failures.length === 0 ? PASS8_COUNTS.error_codes : 0,
  fail_count: failures.length === 0 ? 0 : PASS8_COUNTS.error_codes,
  failures,
  status: statusFromFindings(failures),
});
