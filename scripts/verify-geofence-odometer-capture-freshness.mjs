#!/usr/bin/env node
// T-21 (owner order, 2026-09-30): "record each vehicle's mileage automatically in every Loves
// geofence, in DOTs, and for every pickup and delivery, every time we leave the yards... the
// source is ALWAYS labelled and NEVER inferred." This is the guard: (a) a freshness alarm so the
// capture engine cannot go dark the way telematics.load_odometer_segments's own materializer did
// for 35 days without anyone noticing, and (b) an honesty check that every capture's
// odometer_source matches whether it actually carries an odometer_mi value.
//
// STALE_HOURS = 6: geo.geofence_events arrives in near-real-time (the cron runs every 10
// minutes); a 6-hour gap between an event existing and it having a capture row means the
// capture cron itself has stopped, not that a truck went quiet.
//
// LEAD 11-03: "existing" means ARRIVED (ge.created_at), never ge.occurred_at. Measured 11-03 14:00–16:40Z: a Samsara
// history replay inserted 2,064 events whose occurred_at reaches back to 2026-08-07; the 10-minute cron captured every
// one on its next tick (missing = 0 at 16:40Z), but a guard aged on occurred_at read 325 just-arrived events as
// "6h+ stale" and turned required-live-load-guard red on every open PR. Age is measured from arrival.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "live-data invariant; fails closed with no DATABASE_URL (ROUND 29.9-B)";

const LABEL = "verify-geofence-odometer-capture-freshness";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const STALE_HOURS = 6;
const VALID_SOURCES = ["real_obd", "interpolated", "absent"];

/** The freshness query. Age = time since the event ARRIVED (created_at); occurred_at is reported, never aged. */
export const STALE_SQL = `
        SELECT ge.id::text, ge.occurred_at::text, ge.created_at::text AS arrived_at, u.unit_number,
               EXTRACT(EPOCH FROM (now() - ge.created_at)) / 3600 AS hours_stale
        FROM geo.geofence_events ge
        JOIN mdata.units u ON u.id = ge.unit_id
        WHERE ge.operating_company_id = $1::uuid
          AND EXTRACT(EPOCH FROM (now() - ge.created_at)) / 3600 > $2
          AND NOT EXISTS (
            SELECT 1 FROM telematics.geofence_odometer_captures c WHERE c.geofence_event_id = ge.id
          )
        ORDER BY hours_stale DESC
        LIMIT 20
      `;

/** Pure: does this capture row honestly pair its source label with its odometer_mi value? */
export function findSourceLabelViolations(rows) {
  const problems = [];
  for (const r of rows) {
    if (!VALID_SOURCES.includes(r.odometer_source)) {
      problems.push(`capture ${r.id}: odometer_source "${r.odometer_source}" is not one of ${VALID_SOURCES.join("/")}`);
      continue;
    }
    if (r.odometer_source === "absent" && r.odometer_mi !== null) {
      problems.push(`capture ${r.id}: odometer_source="absent" but odometer_mi is ${r.odometer_mi} -- absent must carry no number`);
    }
    if (r.odometer_source !== "absent" && r.odometer_mi === null) {
      problems.push(`capture ${r.id}: odometer_source="${r.odometer_source}" claims a real reading but odometer_mi is NULL`);
    }
  }
  return problems;
}

function selftest() {
  const checks = [];
  checks.push(["clean real_obd row -> 0 violations", findSourceLabelViolations([{ id: "a", odometer_source: "real_obd", odometer_mi: 100 }]).length === 0]);
  checks.push(["clean absent row -> 0 violations", findSourceLabelViolations([{ id: "b", odometer_source: "absent", odometer_mi: null }]).length === 0]);
  checks.push(["absent row WITH a number -> violation", findSourceLabelViolations([{ id: "c", odometer_source: "absent", odometer_mi: 55 }]).length === 1]);
  checks.push(["real_obd row with NO number -> violation", findSourceLabelViolations([{ id: "d", odometer_source: "real_obd", odometer_mi: null }]).length === 1]);
  checks.push(["staleness is aged from arrival (created_at), never occurred_at (replays of old history are not 'dark')",
    /now\(\) - ge\.created_at/.test(STALE_SQL) && !/now\(\) - ge\.occurred_at/.test(STALE_SQL)]);
  checks.push(["unlabelled/invalid source -> violation", findSourceLabelViolations([{ id: "e", odometer_source: "guessed", odometer_mi: 10 }]).length === 1]);
  let bad = 0;
  for (const [name, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); }
  if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const staleRes = await client.query(
      STALE_SQL,
      [USMCA, STALE_HOURS]
    );

    const labelRes = await client.query(
      `SELECT id::text, odometer_source, odometer_mi
       FROM telematics.geofence_odometer_captures
       WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    await client.query("COMMIT");

    const labelProblems = findSourceLabelViolations(labelRes.rows);
    let failed = false;

    if (staleRes.rows.length > 0) {
      failed = true;
      console.error(`${LABEL}: FAIL — ${staleRes.rows.length} geofence event(s) arrived more than ${STALE_HOURS}h ago and have no capture row (the engine has gone dark):`);
      for (const r of staleRes.rows) {
        console.error(`  event ${r.id} unit ${r.unit_number}: ${Number(r.hours_stale).toFixed(1)}h since arrival (arrived ${r.arrived_at}, occurred ${r.occurred_at})`);
      }
    }
    if (labelProblems.length > 0) {
      failed = true;
      console.error(`${LABEL}: FAIL — ${labelProblems.length} capture row(s) mislabel their odometer source:`);
      for (const p of labelProblems.slice(0, 20)) console.error(`  ${p}`);
    }
    if (failed) {
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: PASS — no event arrived more than ${STALE_HOURS}h ago without a capture, ${labelRes.rows.length} capture(s) all honestly source-labelled.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
