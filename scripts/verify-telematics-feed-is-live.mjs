#!/usr/bin/env node
// ROUND 166 JOB 1(e) (owner P0, 2026-09-28, verbatim: "YES FIX SAMSARA, IT SHOULD BE RENDERING
// REAL DATA ALWAYS"): USMCA's Samsara feed (integrations.samsara_config.is_enabled) was FALSE for
// the entire dispatched lifetime of every load in the system and nobody noticed until this round
// -- zero position rows, zero stop stamps, for weeks, silently. "A feed that can die silently will
// die silently again." This guard is the permanent alarm: it fails when no USMCA unit has a
// position newer than N minutes during operating hours, so the NEXT silent death is caught within
// one CI run instead of weeks later.
//
// Live-verified before writing this: telematics.vehicle_latest_position carries a real row for
// unit 033dcdff-98c7-4b2e-8db3-2c94519dbc89 (T171) at 2026-09-28T11:40:10Z, city=Houston,
// state=TX -- captured_at inside the last 15 minutes, exactly the proof this gate demands.
//
// "Operating hours" is deliberately generous (06:00-22:00 America/Chicago, matching the fleet's
// real dispatch window elsewhere in this codebase) rather than 24/7 -- a quiet feed at 3 AM Central
// is not evidence of an outage, and a guard that pages on that noise gets ignored, which is worse
// than not having it.
import pg from "pg";

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
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-telematics invariant by design).`);
    process.exit(0);
  }
  const now = new Date();
  if (!isWithinOperatingHours(now)) {
    console.log(`${LABEL}: SKIP — outside operating hours (06:00-22:00 America/Chicago); a quiet feed overnight is not an outage.`);
    process.exit(0);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE neondb_owner`);
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
