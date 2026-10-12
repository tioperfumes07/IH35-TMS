#!/usr/bin/env node
// ROUND 280.14 (owner order, 2026-09-30) — "every status change must carry an audit event. A
// status with no audit row is a defect." Discovered live: loads 13625/13626 carry status values
// (completed_docs_received / dispatched, before the AUTH-140 revert) that were never recorded by
// ANY events.event_log row (event_type='load.status_changed', the dispatch spine's own audit
// mechanism -- apps/backend/src/dispatch/dispatch-spine-emit.ts) -- a real write with no
// attribution: no script, no audit row, no actor.
//
// THE PRECISE, HIGH-CONFIDENCE SIGNAL (live-verified, zero false positives across all 149 live
// USMCA loads): a load whose MOST RECENT lifecycle event (load.created / load.status_changed /
// load.cancelled / load.cancellation_approved) is 'load.cancelled' or
// 'load.cancellation_approved', but whose LIVE status is NOT 'cancelled'. A cancelled load can
// only leave the cancelled state through a real, audited load.status_changed event (recording
// to_status) -- if none exists, the live status was written by something outside the app's own
// spine, with no trace of who or why.
//
// Broader coverage (every status_changed event's own to_status vs live status) was tested and
// shows ZERO mismatches live -- the spine is reliable wherever it fires at all. This guard checks
// the one place it's provably NOT firing: post-cancellation resurrection with no event.
export const REQUIRES_LIVE_DB =
  "live-data invariant against events.event_log + mdata.loads; fails closed with no DATABASE_URL (ROUND 29.9-B)";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-load-status-has-audit-event";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "scripts/verify-load-status-has-audit-event.baseline.json");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const LIFECYCLE_EVENTS = ["load.created", "load.status_changed", "load.cancelled", "load.cancellation_approved"];
const CANCEL_EVENTS = ["load.cancelled", "load.cancellation_approved"];

/**
 * Row-level mirror of main()'s SQL: loads (not voided) whose MOST RECENT lifecycle event is a cancel but whose live status is
 * not 'cancelled' — a resurrection with no recorded transition.
 */
export function unauditedResurrections(loads, events) {
  const last = new Map();
  for (const e of events) {
    if (!LIFECYCLE_EVENTS.includes(e.event_type)) continue;
    const prev = last.get(e.load_id);
    if (!prev || e.occurred_at > prev.occurred_at) last.set(e.load_id, e);
  }
  return loads
    .filter((l) => !l.voided_at && l.status !== "cancelled" && CANCEL_EVENTS.includes(last.get(l.id)?.event_type))
    .map((l) => l.load_number);
}

/** Shrink-only ratchet verdict: a live violation not on the baseline is new rot. */
export function ratchetFailures(liveLoadNumbers, baseline) {
  const liveSet = new Set(liveLoadNumbers);
  if (baseline === null) {
    return liveSet.size > 0
      ? [`${BASELINE_FILE} missing and ${liveSet.size} live violation(s) found: ${[...liveSet].join(", ")} -- run with --write-baseline once to seed it`]
      : [];
  }
  const baselineSet = new Set(baseline);
  const newRot = [...liveSet].filter((ln) => !baselineSet.has(ln));
  return newRot.length > 0 ? [`new rot, not in baseline: ${newRot.join(", ")} -- a load left 'cancelled' with no load.status_changed event recorded`] : [];
}

function selftest() {
  const failures = [];
  const ev = (load_id, event_type, occurred_at) => ({ load_id, event_type, occurred_at });
  const loads = [
    { id: "a", load_number: "13700", status: "dispatched", voided_at: null }, // cancelled, then resurrected with no event -> violation
    { id: "b", load_number: "13701", status: "dispatched", voided_at: null }, // cancelled, then an audited status_changed -> clean
    { id: "c", load_number: "13702", status: "cancelled", voided_at: null }, // cancelled and still cancelled -> clean
    { id: "d", load_number: "13703", status: "booked", voided_at: "2026-10-01" }, // voided -> out of scope
    { id: "e", load_number: "13704", status: "booked", voided_at: null }, // approval cancel, resurrected -> violation
  ];
  const events = [
    ev("a", "load.created", "2026-10-01T01"), ev("a", "load.cancelled", "2026-10-01T02"),
    ev("b", "load.cancelled", "2026-10-01T02"), ev("b", "load.status_changed", "2026-10-01T03"),
    ev("c", "load.cancelled", "2026-10-01T02"),
    ev("d", "load.cancelled", "2026-10-01T02"),
    ev("e", "load.cancellation_approved", "2026-10-01T02"), ev("e", "load.note_added", "2026-10-01T05"),
  ];
  const found = unauditedResurrections(loads, events);
  if (found.join(",") !== "13700,13704") failures.push(`row mirror found [${found}] — expected [13700,13704]`);
  const plants = [
    ["a new resurrection not on the baseline", ratchetFailures(["13625", "13999"], ["13625"])],
    ["violations with no baseline file", ratchetFailures(["13999"], null)],
  ];
  let caught = 0;
  for (const [name, f] of plants) {
    if (f.length) caught += 1;
    else failures.push(`planted violation escaped: ${name}`);
  }
  if (ratchetFailures(["13625"], ["13625", "13627"]).length || ratchetFailures([], null).length) failures.push("clean measurement rejected");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: ${caught + 2}/${plants.length + 2} planted violations caught (2 row-level resurrections + 2 ratchet plants)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (process.argv.includes("--static")) {
  console.log(`${LABEL}: NO STATIC ASSERTION — live audit check required in CI, not measured locally`);
  process.exit(0);
}

function loadBaseline() {
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    return data.load_numbers ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  let liveLoadNumbers = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(
      `
      WITH last_ev AS (
        SELECT DISTINCT ON (source_reference_id) source_reference_id, event_type, occurred_at
          FROM events.event_log
         WHERE source_table = 'mdata.loads'
           AND source_reference_id IN (SELECT id FROM mdata.loads WHERE operating_company_id=$1::uuid)
           AND event_type IN ('load.created', 'load.status_changed', 'load.cancelled', 'load.cancellation_approved')
         ORDER BY source_reference_id, occurred_at DESC
      )
      SELECT l.load_number
        FROM mdata.loads l
        JOIN last_ev le ON le.source_reference_id = l.id
       WHERE l.operating_company_id = $1::uuid
         AND l.voided_at IS NULL
         AND le.event_type IN ('load.cancelled', 'load.cancellation_approved')
         AND l.status::text <> 'cancelled'
       ORDER BY l.load_number::int`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    liveLoadNumbers = res.rows.map((r) => r.load_number);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  const baseline = loadBaseline();
  const liveSet = new Set(liveLoadNumbers);

  failures.push(...ratchetFailures(liveLoadNumbers, baseline));

  console.log(`${LABEL}: ${liveSet.size} load(s) live with a 'cancelled' lifecycle event but a non-cancelled status and no recorded transition (baseline ${baseline ? baseline.length : "none"})`);

  if (process.argv.includes("--write-baseline")) {
    fs.writeFileSync(
      BASELINE_FILE,
      JSON.stringify(
        {
          _comment:
            "Shrink-only ceiling for loads whose most recent lifecycle event (events.event_log) is " +
            "load.cancelled/load.cancellation_approved but whose live mdata.loads.status is not " +
            "'cancelled', with no load.status_changed event ever recording the actual transition -- " +
            "ROUND 280.14 (owner order 2026-09-30): a real write with no script, no audit row, no " +
            "actor. Discovered live: 13625, 13627, 13638 (13626 has the same underlying defect -- a " +
            "status change with zero events.event_log rows -- but never carried a cancelled event, " +
            "so it isn't caught by this precise, zero-false-positive check; filed separately). This " +
            "ratchet only guards against NEW occurrences from here forward.",
          baseline_established: "2026-09-30",
          load_numbers: liveLoadNumbers,
          measured_at: new Date().toISOString(),
        },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL}: baseline written (${liveLoadNumbers.length})`);
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

main().catch((err) => {
  console.error(`${LABEL}: FAILED — ${err.message}`);
  process.exit(1);
});
