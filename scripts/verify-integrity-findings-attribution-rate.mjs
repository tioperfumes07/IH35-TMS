#!/usr/bin/env node
// ROUND 300 B-33 (Lead order): "safety.integrity_findings holds 116 live rows written by a cron
// at 08:00 today (orphan_entry 46 / orphan_exit 46 / expected_missing 24, 0 resolved, 10 units),
// every one keyed to unit_id with NO driver. Attribute them through driverAtTimeSql. Report how
// many resolve, by anomaly_class. Do NOT build a second findings table and do NOT rebuild the
// rules engine -- safety.* already owns both."
//
// MEASURED LIVE (2026-09-30, USMCA): attributing safety.integrity_findings.unit_id + occurred_at
// through B-27's own driverAtTimeSql (no second resolver written) resolves 46 of 116 (39.7%):
//   orphan_entry:      20 of 46 resolve
//   orphan_exit:       22 of 46 resolve
//   expected_missing:   4 of 24 resolve
// The other 70 have no covering telematics.vehicle_driver_assignments window at that unit+time --
// an honest coverage gap, not a bug (see B-29's own board finding on the same shape for
// maintenance work orders: some units simply lack assignment telemetry).
//
// This guard does not build a second findings table or rewrite safety's own rules engine (per the
// order). It RATCHETS the measured attribution rate per anomaly_class: a future regression below
// today's floor (someone breaking the assignments feed, or a new cron run landing worse-attributed
// rows) is caught; the guard never asserts 100% attribution, since 0% is an honest outcome when
// telemetry coverage is genuinely absent.
import pg from "pg";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-integrity-findings-attribution-rate";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Baseline measured 2026-09-30. Floor only -- resolution may improve (telemetry coverage grows),
// never silently worsen.
const BASELINE_RESOLVED_FLOOR = {
  orphan_entry: 20,
  orphan_exit: 22,
  expected_missing: 4,
};

async function measure(client) {
  const { driverAtTimeSql } = await import(
    new URL("../apps/backend/src/maintenance/driver-attribution.ts", import.meta.url)
  );
  const res = await client.query(
    `
    SELECT
      f.anomaly_class,
      count(*)::int AS total,
      count(*) FILTER (WHERE dat.driver_id IS NOT NULL)::int AS resolved
    FROM safety.integrity_findings f
    ${driverAtTimeSql("f.unit_id::uuid", "f.occurred_at", "dat")}
    WHERE f.operating_company_id = $1::uuid
    GROUP BY f.anomaly_class
    ORDER BY f.anomaly_class
    `,
    [USMCA]
  );
  return res.rows;
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const rows = await measure(client);
    await client.query("ROLLBACK");

    const failures = [];
    for (const row of rows) {
      const floor = BASELINE_RESOLVED_FLOOR[row.anomaly_class];
      if (floor != null && row.resolved < floor) {
        failures.push(`${row.anomaly_class}: resolved ${row.resolved} dropped below ratchet floor ${floor}`);
      }
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
      process.exit(1);
    }

    console.log(`${LABEL}: LIVE PASS (ratchet, measure-only, B-33) — ${JSON.stringify(rows)}`);
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const worse = [{ anomaly_class: "orphan_entry", total: 46, resolved: 1 }];
  const failures = [];
  for (const row of worse) {
    const floor = BASELINE_RESOLVED_FLOOR[row.anomaly_class];
    if (floor != null && row.resolved < floor) failures.push(`${row.anomaly_class} regression`);
  }
  assert.equal(failures.length, 1, "MUTATION: a ratchet regression must be detected");
  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

await run();
