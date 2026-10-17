#!/usr/bin/env node
/**
 * LEAD ROUND 443.187 batch 4/4 (CC-2) — never-run guards, now fixed or repointed and WIRED. verify:pre-commit auto-runs
 * this step; it runs each static guard and its --selftest and fails on any non-zero exit.
 *
 * Live read-only DB guards of this batch run in ci.yml's required live-load job (run-required-guards.mjs with
 * PROD_READONLY_DATABASE_URL): verify-event-log-spine, verify-faro-default-interest-accrues-from-day-35,
 * verify-faro-no-accrued-reserve-release, verify-faro-no-purchased-account-past-repurchase-deadline,
 * verify-faro-partial-payment-leaves-account-open.
 *
 * --selftest: a planted missing guard path must fail the step.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GUARDS = [
  "scripts/verify-fact-s02-submit-surface.mjs",
  "scripts/verify-featureflags-users-human-labels.mjs",
  "scripts/verify-fuel-card-overage-approval-company-lifecycle.mjs",
  "scripts/verify-fuel-create-async-lifecycle.mjs",
];

export function runAll(guards) {
  const failures = [];
  for (const g of guards) {
    if (!existsSync(resolve(ROOT, g))) {
      failures.push(`${g}: missing`);
      continue;
    }
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [resolve(ROOT, g), ...args], { cwd: ROOT, encoding: "utf8" });
      if (r.status !== 0) failures.push(`${g}${args.length ? " --selftest" : ""}: exit ${r.status} — ${(r.stderr || r.stdout).trim().split("\n").slice(-2).join(" | ")}`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (runAll(["scripts/verify-does-not-exist-443187.mjs"]).length === 0) {
    console.error("18579 SELFTEST FAIL: a missing guard path was not caught");
    process.exit(1);
  }
  console.log("18579 SELFTEST PASS: a missing guard fails the step");
  process.exit(0);
}

const failures = runAll(GUARDS);
if (failures.length) {
  console.error(`18579-verify-443187-batch-4-guards FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`18579-verify-443187-batch-4-guards PASS: ${GUARDS.length} guards + their selftests`);
