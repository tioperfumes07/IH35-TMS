#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { PASS8_COUNTS, emitStepResult, statusFromFindings } from "./pass-8-shared.mjs";

const checks = [
  ["verify:posting-engine-mvp-contract", "posting engine contract"],
  ["verify:trial-balance-contract", "trial balance contract"],
  ["verify:qbo-sync-drift-acceptable", "qbo drift guard"],
];

const failures = [];
for (const [script, label] of checks) {
  const res = spawnSync("npm", ["run", script], { encoding: "utf8", env: process.env });
  if (res.status !== 0) {
    const tail = `${res.stdout || ""}\n${res.stderr || ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
    failures.push(`${label} failed: ${tail}`);
  }
}

emitStepResult({
  area: "financial_integrity",
  expected: PASS8_COUNTS.financial_integrity,
  checked: checks.length,
  pass_count: failures.length === 0 ? 1 : 0,
  fail_count: failures.length === 0 ? 0 : 1,
  failures,
  status: statusFromFindings(failures),
});
