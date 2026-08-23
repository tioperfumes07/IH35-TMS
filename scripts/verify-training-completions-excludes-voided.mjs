#!/usr/bin/env node
/**
 * verify-training-completions-excludes-voided.mjs  (SAFETY-F1)
 *
 * Root cause: GET /api/v1/safety/training/completions (safety.routes.ts) queries
 * safety.training_records but never filtered `voided_at IS NULL`, unlike every other
 * void-aware query in the same file (drug_test, medical_cards, background_checks, etc. --
 * all correctly filter it) and unlike the reminders cron (reminders.cron.ts), which does too.
 * Live-reproduced 2026-08-23: the Safety module's Training Programs/Training Records tabs
 * showed a leftover "TEST BOX4 Reverse Link Training 2026-08-18" fixture row from an earlier
 * agent's 2026-08-18 testing session -- the table HAS a void mechanism (voided_at/voided_reason)
 * but this one list route ignored it, so voiding the row alone would not have hidden it.
 *
 * This guard makes the regression impossible to re-ship: the training/completions query's
 * WHERE clause must include `tr.voided_at IS NULL`.
 *
 * Usage:
 *   node scripts/verify-training-completions-excludes-voided.mjs            # scan
 *   node scripts/verify-training-completions-excludes-voided.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/safety/safety.routes.ts";

const FROM_MARKER = "FROM safety.training_records tr";
const VOID_FILTER = /tr\.voided_at\s+IS\s+NULL/;

export function checkExcludesVoided(src) {
  const offenders = [];
  const fromIdx = src.indexOf(FROM_MARKER);
  if (fromIdx === -1) {
    offenders.push(`${ROUTES_FILE}: "${FROM_MARKER}" marker not found — has the training/completions query moved or been rewritten? Re-verify this guard still applies.`);
    return offenders;
  }
  // The WHERE clause for this query sits within a few hundred chars after the FROM/JOIN block.
  const window = src.slice(fromIdx, fromIdx + 700);
  if (!VOID_FILTER.test(window)) {
    offenders.push(
      `${ROUTES_FILE}: the training/completions query (FROM safety.training_records tr) does not filter tr.voided_at IS NULL — SAFETY-F1 regression shape (a voided/test-fixture training record would still render in the Training Programs/Training Records UI)`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkExcludesVoided(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    FROM safety.training_records tr
    LEFT JOIN mdata.drivers d ON d.id = tr.driver_id
    WHERE tr.operating_company_id = $1::uuid
      \${driverFilter}
    ORDER BY tr.completed_at DESC
  `;
  const fixed = `
    FROM safety.training_records tr
    LEFT JOIN mdata.drivers d ON d.id = tr.driver_id
    WHERE tr.operating_company_id = $1::uuid
      AND tr.voided_at IS NULL
      \${driverFilter}
    ORDER BY tr.completed_at DESC
  `;

  const buggyFails = checkExcludesVoided(buggy).length > 0;
  const fixedPasses = checkExcludesVoided(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:training-completions-excludes-voided selftest OK");
    process.exit(0);
  }
  console.error("verify:training-completions-excludes-voided selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:training-completions-excludes-voided FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:training-completions-excludes-voided OK — training/completions filters voided_at IS NULL, matching every sibling query in the file");
}
