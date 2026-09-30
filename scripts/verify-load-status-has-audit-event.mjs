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

function selftest() {
  console.log(`${LABEL} selftest OK — pure live-data invariant, no static logic to unit test`);
}

if (process.argv.includes("--selftest")) {
  selftest();
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
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(
      `
      WITH last_ev AS (
        SELECT DISTINCT ON (source_reference_id) source_reference_id, event_type, occurred_at
          FROM events.event_log
         WHERE source_table = 'mdata.loads'
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

  if (baseline === null) {
    if (liveSet.size > 0) {
      failures.push(`${BASELINE_FILE} missing and ${liveSet.size} live violation(s) found: ${[...liveSet].join(", ")} -- run with --write-baseline once to seed it`);
    }
  } else {
    const baselineSet = new Set(baseline);
    const newRot = [...liveSet].filter((ln) => !baselineSet.has(ln));
    if (newRot.length > 0) {
      failures.push(`new rot, not in baseline: ${newRot.join(", ")} -- a load left 'cancelled' with no load.status_changed event recorded`);
    }
  }

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
