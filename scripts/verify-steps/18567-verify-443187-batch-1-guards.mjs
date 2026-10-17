#!/usr/bin/env node
/**
 * LEAD ROUND 443.187 batch 1 — never-run guards (rows 1-12 of 2026-10-17-CC3-443-184-NEVER-RUN-GUARDS-RED-OR-DB.tsv),
 * each fixed at the root or repointed to the current truth, now WIRED: this step runs every one (and its --selftest)
 * on every verify:pre-commit, so none can sit unexecuted again.
 *
 * Not here (by design): verify-assignment-coverage-excludes-test-units.mjs needs the prod read-only DB — wired in
 * .github/workflows/ci.yml required-live-load-guard (run-required-guards.mjs); verify-bus-diet-outbox-cap.mjs stays
 * exempt-and-RED (15 docs/bus files over the BUS-DIET caps — a Lead-run rotation, not code).
 *
 * --selftest: plants a missing guard path and asserts the step fails.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GUARDS = [
  "scripts/verify-aria-combobox-no-name.mjs",
  "scripts/verify-audit-actor-and-noop-guard.mjs",
  "scripts/verify-audit-geofence-human-labels.mjs",
  "scripts/verify-cash-flow-overview-no-fake-zero.mjs",
  "scripts/verify-company-violations-error-messages.mjs",
  "scripts/verify-create-modal-stack-order.mjs",
  "scripts/verify-cu09-banking-recon.mjs",
  "scripts/verify-cu09-optional-message.mjs",
  "scripts/verify-customer-relationship-health-fails-honestly.mjs",
  "scripts/verify-customers-quality-segment-pager-total.mjs",
];

export function runGuards(list) {
  const failures = [];
  for (const g of list) {
    if (!existsSync(resolve(ROOT, g))) {
      failures.push(`${g}: missing`);
      continue;
    }
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [resolve(ROOT, g), ...args], { cwd: ROOT, encoding: "utf8" });
      if (r.status !== 0) {
        const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ");
        failures.push(`${g}${args.length ? " --selftest" : ""}: exit ${r.status} — ${tail}`);
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const planted = runGuards(["scripts/verify-does-not-exist-443187.mjs"]);
  if (planted.length === 0) {
    console.error("SELFTEST FAIL: a missing guard path was not caught");
    process.exit(1);
  }
  console.log("SELFTEST PASS: a missing guard path is caught");
  process.exit(0);
}

const failures = runGuards(GUARDS);
if (failures.length) {
  console.error(`verify-443187-batch-1-guards FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-443187-batch-1-guards PASS: ${GUARDS.length} guards + their --selftest`);
