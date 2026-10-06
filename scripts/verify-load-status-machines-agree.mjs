#!/usr/bin/env node
/**
 * CC-3 queue 2b (2026-10-02): the full-enum table MDATA_STATUS_TRANSITIONS (PATCH /mdata/loads/:id/status, the billing
 * lifecycle) and the canonical dispatch machine (PATCH /dispatch/loads/:id/transition, GPS auto-delivery) live in one
 * module and must agree on every cross-bucket edge. They had drifted 14 edges apart. Same-bucket granular steps and the
 * billing tail (invoiced / paid / closed) are the table's own. Static (runs the module through tsx), < 3 s.
 */
import { execFileSync } from "node:child_process";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_load_status_machines_agree(); }
async function selftest_verify_load_status_machines_agree() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_load_status_machines_agree", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}
const out = JSON.parse(execFileSync("npx", ["tsx", "scripts/lib/load-status-machines-diff.ts"], { encoding: "utf8" }));
if (out.length) { console.error(`verify-load-status-machines-agree: FAIL — ${out.length} disagreement(s):\n  ` + out.join("\n  ")); process.exit(1); }
console.log("verify-load-status-machines-agree: OK — MDATA_STATUS_TRANSITIONS agrees with the canonical dispatch machine on every cross-bucket edge");
