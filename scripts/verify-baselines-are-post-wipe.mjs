#!/usr/bin/env node
// POST-WIPE BASELINE FRESHNESS GATE — ROUND E11.3, owner order after the USMCA AUTH-001 wipe.
//
// A baseline file that measures USMCA's LIVE, in-database money/violation state (not a code-shape
// fact) goes silently wrong the moment the underlying rows it measured are destroyed by a wipe —
// it keeps reporting "N pre-existing violations, nothing new" against a ledger that no longer
// exists, exactly how the 333-vs-92 contamination happened once already this session. This guard
// is the forward-looking backstop: every baseline this file GOVERNS must carry a `measured_at`
// no earlier than the wipe's own completion, or it fails loud.
//
// Scope is an EXPLICIT registry, not a blanket "every *.baseline.json with a measured_at" scan —
// verify-no-unauthorized-production-write.baseline.json, for one, also carries `measured_at` but
// measures a CODE-SHAPE fact (which scripts/ops/ files lack an authorization check), not a
// database row count a data wipe could invalidate; auto-including it would be a false positive on
// every future wipe, and this repo's own convention (scripts/.guard-exempt.json,
// db/migrations/.held-migrations.json) is always an explicit, reviewed list, never inference from
// a field name. Add a new USMCA live-money baseline here the same way it was added to CI.
//
// WIPE_COMPLETED_AT is evidence-based, not assumed: audit.row_changes' own DELETE bursts for the
// wipe's audited tables (journal_entry_postings, transaction_source_links, journal_entries,
// invoices, invoice_lines, expenses, driver_settlements, factoring_advances, settlement_lines —
// mdata.load_stops carries no audit trigger at all, confirmed live, hence the separate frozen-
// entity forensic this same round required a snapshot restore rather than an audit-log read) all
// land between 2026-09-23T14:27Z and 2026-09-23T18:59:49Z live-queried against production. Set one
// hour past the latest observed burst as a conservative cutoff.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-baselines-are-post-wipe";

export const WIPE_COMPLETED_AT = "2026-09-23T20:00:00.000Z";

// Every USMCA live-money/violation baseline this guard governs. Add a new one here in the SAME PR
// that adds the baseline itself, with a one-line reason — an ungoverned live baseline is exactly
// how a wipe artifact slips through unnoticed.
export const GOVERNED_BASELINES = [
  "scripts/verify-fuel-transactions-per-load.baseline.json",
  "scripts/verify-void-is-whole.baseline.json",
  "scripts/verify-cancelled-load-leaves-no-live-money.baseline.json",
];

/**
 * Pure decision: given a baseline's raw `measured_at` string (or undefined/null if missing) and
 * the wipe cutoff, decide pass/fail. No filesystem, no Date.now() — testable directly.
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function assessBaselineFreshness(measuredAt, wipeCompletedAtIso) {
  if (!measuredAt) {
    return { ok: false, reason: "carries no measured_at at all — cannot prove it postdates the wipe" };
  }
  const measuredMs = Date.parse(measuredAt);
  if (Number.isNaN(measuredMs)) {
    return { ok: false, reason: `measured_at "${measuredAt}" does not parse as a date` };
  }
  const wipeMs = Date.parse(wipeCompletedAtIso);
  if (measuredMs < wipeMs) {
    return { ok: false, reason: `measured_at ${measuredAt} is BEFORE the wipe (${wipeCompletedAtIso}) — this baseline was measured against a ledger that no longer exists` };
  }
  return { ok: true, reason: null };
}

function selfTest() {
  const cases = [
    { name: "measured after wipe -> pass", measuredAt: "2026-09-23T21:35:00Z", want: true },
    { name: "measured exactly at wipe cutoff -> pass", measuredAt: "2026-09-23T20:00:00.000Z", want: true },
    { name: "measured before wipe -> fail", measuredAt: "2026-09-23T15:22:23.574Z", want: false },
    { name: "measured the OLD contaminated fuel baseline's date -> fail", measuredAt: "2026-09-23", want: false },
    { name: "missing measured_at -> fail", measuredAt: undefined, want: false },
    { name: "unparseable measured_at -> fail", measuredAt: "not-a-date", want: false },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = assessBaselineFreshness(c.measuredAt, WIPE_COMPLETED_AT).ok === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
  }
  // The three governed baseline FILES must themselves already be fresh, right now — a live,
  // no-DB-needed check against the actual repo state, exactly the pattern that would have caught
  // the original 589/$253,271.24 and 92-key contamination before it ever shipped.
  for (const rel of GOVERNED_BASELINES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.error(`${LABEL} SELFTEST FAIL — governed baseline missing: ${rel}`);
      process.exit(1);
    }
    const json = JSON.parse(fs.readFileSync(full, "utf8"));
    const result = assessBaselineFreshness(json.measured_at, WIPE_COMPLETED_AT);
    console.log(`${result.ok ? "ok  " : "FAIL"}  ${rel}: measured_at=${json.measured_at}`);
    if (!result.ok) failed++;
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed} check(s)`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selfTest();
    return;
  }
  const failures = [];
  for (const rel of GOVERNED_BASELINES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel}: file does not exist`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (err) {
      failures.push(`${rel}: does not parse as JSON (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    const result = assessBaselineFreshness(json.measured_at, WIPE_COMPLETED_AT);
    if (!result.ok) failures.push(`${rel}: ${result.reason}`);
  }
  if (failures.length) {
    console.error(`${LABEL} FAIL — ${failures.length} governed baseline(s) predate the wipe:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — all ${GOVERNED_BASELINES.length} governed baseline(s) measured on or after the wipe (${WIPE_COMPLETED_AT}).`);
}

main();
