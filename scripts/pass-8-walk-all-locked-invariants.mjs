#!/usr/bin/env node
import { PASS8_COUNTS, emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const rule = loadText(".cursor/rules/04-locked-invariants.mdc");
const locked = [...rule.matchAll(/^- \*\*|^- /gm)].length;
const wfLocked = [...rule.matchAll(/WF-\d{3}/g)].length;
const invariantMentions = [...rule.matchAll(/\binvariant/gi)].length;
const score = locked + wfLocked + invariantMentions;

const failures = [];
if (score < PASS8_COUNTS.locked_invariants) {
  failures.push(`expected locked invariant score >= ${PASS8_COUNTS.locked_invariants} but found ${score}`);
}

emitStepResult({
  area: "locked_invariants",
  expected: PASS8_COUNTS.locked_invariants,
  checked: score,
  pass_count: failures.length === 0 ? PASS8_COUNTS.locked_invariants : 0,
  fail_count: failures.length === 0 ? 0 : PASS8_COUNTS.locked_invariants,
  failures,
  status: statusFromFindings(failures),
});
