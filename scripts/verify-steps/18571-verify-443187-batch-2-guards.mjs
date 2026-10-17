#!/usr/bin/env node
/**
 * LEAD ROUND 443.187 (2026-10-17) — batch 2 of the never-run guards (rows 13-24 of
 * 2026-10-17-CC3-443-184-NEVER-RUN-GUARDS-RED-OR-DB.tsv, sorted by name). Each was RED on origin/main because the code
 * it locks MOVED or the owner later changed the shape; each was repointed to the current truth with the SAME rule (the
 * commit is quoted in each guard) and its --selftest extended so the rule still bites. None needs a database.
 *
 * This step wires them into verify:pre-commit: it runs every guard AND its --selftest, and fails on any non-zero exit.
 *   --selftest  proves this runner fails when a listed guard fails (planted missing guard path).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BATCH_2_GUARDS = [
  "scripts/verify-d1-load-stop-source-attribution.mjs",
  "scripts/verify-detention-board-complete-range.mjs",
  "scripts/verify-detention-bridge-scoped-checks.mjs",
  "scripts/verify-disp-s08-border-crossing-surface.mjs",
  "scripts/verify-disp-s27-s31-planners-pack.mjs",
  "scripts/verify-disp-s33-s36-surface.mjs",
  "scripts/verify-disp-wire-07-departure-evidence.mjs",
  "scripts/verify-disp-wire-07-stamp-defaults-now.mjs",
  "scripts/verify-dispatch-board-live-history.mjs",
  "scripts/verify-dispatch-kanban-row-alignment.mjs",
  "scripts/verify-dispatch-round-trips-read-recovery.mjs",
  "scripts/verify-dispatch-units-live-location.mjs",
];

export function runGuards(guards) {
  const failures = [];
  for (const rel of guards) {
    if (!existsSync(resolve(ROOT, rel))) {
      failures.push(`${rel}: missing`);
      continue;
    }
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [resolve(ROOT, rel), ...args], { cwd: ROOT, encoding: "utf8" });
      if (r.status !== 0) {
        const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-2).join(" | ");
        failures.push(`${rel}${args.length ? " --selftest" : ""}: exit ${r.status} — ${tail}`);
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const planted = runGuards(["scripts/verify-443187-planted-missing-guard.mjs"]);
  if (planted.length === 0) {
    console.error("18571 SELFTEST FAIL: a missing / failing guard was not reported");
    process.exit(1);
  }
  console.log("18571 SELFTEST PASS: a missing guard fails the batch");
  process.exit(0);
}

const failures = runGuards(BATCH_2_GUARDS);
if (failures.length) {
  console.error(`18571 verify-443187-batch-2-guards FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`18571 verify-443187-batch-2-guards PASS: ${BATCH_2_GUARDS.length} guards + their selftests green`);
