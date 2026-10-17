#!/usr/bin/env node
/**
 * LEAD 443.187 (CC-2) batch 3 of 4 — never-run guards (rows 25-36 of
 * ~/IH35-LEAD-CHANNEL/2026-10-17-CC3-443-184-NEVER-RUN-GUARDS-RED-OR-DB.tsv) now fixed / repointed and WIRED here, so
 * verify:pre-commit runs them on every PR. All twelve are static (no DB). Each is spawned; any non-zero exit fails.
 *
 *   --selftest  plants a failing guard path and asserts the runner goes red; the real list must pass.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GUARDS = [
  "scripts/verify-driver-activation-lifecycle-truth.mjs",
  "scripts/verify-driver-column-names-real.mjs",
  "scripts/verify-driver-escrow-balances-available-count-matches-nonzero.mjs",
  "scripts/verify-driver-pay-preview-not-customer-total.mjs",
  "scripts/verify-driver-pay-tab-generic-error-has-retry.mjs",
  "scripts/verify-driver-reassign-runs-qualification.mjs",
  "scripts/verify-driver-retention-failure-exclusion.mjs",
  "scripts/verify-driver-roster-status-filter-combobox.mjs",
  "scripts/verify-edit-trailer-record-lifecycle.mjs",
  "scripts/verify-edit-unit-action-company-lifecycle.mjs",
  "scripts/verify-edit-vehicle-record-lifecycle.mjs",
  "scripts/verify-entity-audit-history-exact-pager.mjs",
];

export function runAll(guards) {
  const failures = [];
  for (const rel of guards) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      failures.push(`${rel}: missing`);
      continue;
    }
    const r = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) failures.push(`${rel}: exit ${r.status} — ${(r.stderr || r.stdout).trim().split("\n").slice(0, 3).join(" | ")}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const base = runAll(GUARDS);
  if (base.length) {
    console.error("SELFTEST FAIL: a wired batch-3 guard is red", base);
    process.exit(1);
  }
  const planted = runAll([...GUARDS, "scripts/verify-443187-batch-3-planted-missing.mjs"]);
  if (planted.length !== 1) {
    console.error("SELFTEST FAIL: a missing / failing guard path was not caught");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${GUARDS.length} guards green; planted failing path caught`);
  process.exit(0);
}

const failures = runAll(GUARDS);
if (failures.length) {
  console.error(`verify-443187-batch-3-guards FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-443187-batch-3-guards PASS: ${GUARDS.length} previously never-run guards green`);
