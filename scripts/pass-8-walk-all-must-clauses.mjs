#!/usr/bin/env node
import { PASS8_COUNTS, emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const sources = [
  "docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md",
  "docs/specs/IH35_CURSOR_BUILD_SPEC_V3.md",
  "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
];

const mustCount = sources
  .map((p) => [...loadText(p).matchAll(/\bMUST\b/g)].length)
  .reduce((sum, n) => sum + n, 0);

const failures = [];
if (mustCount < PASS8_COUNTS.must_clauses) {
  failures.push(`expected at least ${PASS8_COUNTS.must_clauses} MUST clauses but found ${mustCount}`);
}

emitStepResult({
  area: "must_clauses",
  expected: PASS8_COUNTS.must_clauses,
  checked: mustCount,
  pass_count: failures.length === 0 ? PASS8_COUNTS.must_clauses : 0,
  fail_count: failures.length === 0 ? 0 : PASS8_COUNTS.must_clauses,
  failures,
  status: statusFromFindings(failures),
});
