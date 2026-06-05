#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { PASS8_COUNTS, emitStepResult, statusFromFindings } from "./pass-8-shared.mjs";

const checks = [
  ["verify:no-duplicate-routes", "route integrity"],
  ["verify:nav-integrity", "navigation integrity"],
  ["verify:tenant-scope-on-routes", "tenant scope"],
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
  area: "integration_health",
  expected: PASS8_COUNTS.integration_health,
  checked: checks.length,
  pass_count: failures.length === 0 ? 1 : 0,
  fail_count: failures.length === 0 ? 0 : 1,
  failures,
  status: statusFromFindings(failures),
});
