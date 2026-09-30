#!/usr/bin/env node
// ROUND 166 JOB 1(e), SCOPE CORRECTED BY ROUND 168 (owner P0, 2026-09-28): USMCA's Samsara feed
// (integrations.samsara_config.is_enabled) was FALSE from creation (2026-08-21) until this same
// session flipped it TRUE at 2026-09-28T10:00:08Z. That gap was real and worth this alarm. IT WAS
// NOT, however, the reason stop stamps read zero on the 16 currently-dispatched loads -- ROUND 168
// retracted that specific causal claim with live evidence (telematics.vehicle_latest_position: 84
// rows, newest ~4 minutes old, all 14 dispatched units reporting real city/state; geo.geofence_
// events and geo.geofence_vehicle_state both actively writing today) and identified the REAL chain:
// mdata.load_stops has no lat/lng (geocode_failure_reason='provider_unavailable' on every failing
// row), so the geofence engine -- which IS running and DOES receive live positions -- has no
// coordinates to compare a position against. See verify-stops-are-geocoded.mjs and
// verify-geocode-provider-is-reachable.mjs for that actual root cause and its own guards.
//
// This guard stays, scoped honestly to what it actually proves: the Samsara position feed itself
// (not stop-stamping, not geofencing) is alive. It fails when no USMCA unit has a position newer
// than N minutes during operating hours, so if the feed itself dies again (as it did for 5 weeks,
// silently, before this round), that specific failure is caught within one CI run.
//
// "Operating hours" is deliberately generous (06:00-22:00 America/Chicago, matching the fleet's
// real dispatch window elsewhere in this codebase) rather than 24/7 -- a quiet feed at 3 AM Central
// is not evidence of an outage, and a guard that pages on that noise gets ignored, which is worse
// than not having it.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-telematics invariant by design, no static-only path";

const LABEL = "verify-telematics-feed-is-live";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const STALE_MINUTES = 20;
const OPERATING_HOURS_START = 6; // 06:00 America/Chicago
const OPERATING_HOURS_END = 22; // 22:00 America/Chicago

export function isWithinOperatingHours(nowUtc) {
  // America/Chicago is UTC-5 (CDT) or UTC-6 (CST) -- this repo's fleet operates in Texas/Central
  // time year-round for this purpose; a fixed UTC-5 offset is close enough for an operating-hours
  // gate (never off by more than the DST hour, which only narrows the window, never widens it into
  // a false negative).
  const centralHour = (nowUtc.getUTCHours() - 5 + 24) % 24;
  return centralHour >= OPERATING_HOURS_START && centralHour < OPERATING_HOURS_END;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("noon UTC (7am Central) is within operating hours", isWithinOperatingHours(new Date("2026-09-28T12:00:00Z")) === true);
  t("3am UTC (10pm Central prior day) is NOT within operating hours", isWithinOperatingHours(new Date("2026-09-28T03:00:00Z")) === false);
  t("8am UTC (3am Central) is NOT within operating hours", isWithinOperatingHours(new Date("2026-09-28T08:00:00Z")) === false);
  t("20:00 UTC (3pm Central) is within operating hours", isWithinOperatingHours(new Date("2026-09-28T20:00:00Z")) === true);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 4 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const now = new Date();
  if (!isWithinOperatingHours(now)) {
    console.log(`${LABEL}: SKIP — outside operating hours (06:00-22:00 America/Chicago); a quiet feed overnight is not an outage.`);
    process.exit(0);
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    // SET LOCAL ROLE neondb_owner removed 2026-09-28: a read-only CI credential can set the
    // app.bypass_rls GUC (every calling role can) but cannot escalate role membership
    // ("permission denied to set role") -- app.bypass_rls alone already does the job this line
    // was for, matching the other 329+ guards in this repo that never used role escalation.
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const enabledRes = await client.query(
      `SELECT is_enabled, last_health_status, last_error FROM integrations.samsara_config WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const config = enabledRes.rows[0];
    if (!config || !config.is_enabled) {
      await client.query("ROLLBACK");
      console.error(`${LABEL}: FAIL — integrations.samsara_config.is_enabled is not true for USMCA. This is exactly the ROUND 166 defect recurring.`);
      process.exit(1);
    }

    const posRes = await client.query(
      `SELECT max(captured_at)::text AS latest, count(DISTINCT unit_id)::int AS fresh_units
         FROM telematics.vehicle_latest_position
        WHERE operating_company_id = $1::uuid
          AND captured_at > now() - ($2 || ' minutes')::interval`,
      [USMCA, STALE_MINUTES]
    );
    const row = posRes.rows[0];
    await client.query("ROLLBACK");

    if (!row.latest || Number(row.fresh_units) === 0) {
      console.error(`${LABEL}: FAIL — no USMCA unit has a telematics position newer than ${STALE_MINUTES} minutes during operating hours. is_enabled=${config.is_enabled}, last_health_status=${config.last_health_status}, last_error=${config.last_error ?? "none"}.`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — ${row.fresh_units} unit(s) with a position newer than ${STALE_MINUTES} minutes, latest ${row.latest}.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
