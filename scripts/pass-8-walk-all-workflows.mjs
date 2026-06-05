#!/usr/bin/env node
import { PASS8_COUNTS, emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const spec = loadText("docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md");
const wfMatches = [...spec.matchAll(/WF-\d{3}/g)].map((m) => m[0]);
const unique = [...new Set(wfMatches)].sort();

const failures = [];
if (unique.length !== PASS8_COUNTS.workflows) {
  failures.push(`expected ${PASS8_COUNTS.workflows} unique workflows but found ${unique.length}`);
}

emitStepResult({
  area: "workflows",
  expected: PASS8_COUNTS.workflows,
  checked: unique.length,
  pass_count: failures.length === 0 ? PASS8_COUNTS.workflows : 0,
  fail_count: failures.length === 0 ? 0 : PASS8_COUNTS.workflows,
  failures,
  status: statusFromFindings(failures),
});
