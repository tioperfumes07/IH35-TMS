#!/usr/bin/env -S npx tsx
/**
 * LIVE PROOF for ROUND 304: runs the real stop-odometer engine against production, read-only,
 * inside a rolled-back transaction. Writes nothing. Proves the TypeScript, not a SQL re-implementation.
 */
import pg from "pg";
import {
  detectStops,
  attachNearestOdometer,
  milesBetweenStops,
  unitFixesSql,
  STOP_MIN_DWELL_MINUTES,
  type PositionFix,
} from "../../apps/backend/src/telematics/stop-odometer-capture.service.js";
import { classifyFleetUnit, liveFleet, darkUnits, fleetUnitFactsSql } from "../../apps/backend/src/telematics/live-fleet.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    // The gate's readonly role (ih35_ci_readonly) carries BYPASSRLS natively and CANNOT SET ROLE
    // neondb_owner -- it is a read-only role by design. Setting the bypass GUC is harmless when the
    // caller is neondb_owner and unnecessary when it is the readonly role, so try it and move on.
    try {
      await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    } catch {
      /* readonly role already bypasses RLS */
    }

    const now = new Date();

    // --- 1. the live fleet, measured ---------------------------------------------------------
    const facts = await client.query(fleetUnitFactsSql(), [USMCA]);
    const classified = facts.rows.map((r: any) =>
      classifyFleetUnit(
        {
          unitId: r.unit_id,
          unitNumber: r.unit_number,
          isSampleData: r.is_sample_data,
          lastGpsAt: r.last_gps_at ? new Date(r.last_gps_at) : null,
          everHadOdometer: r.ever_had_odometer,
        },
        now
      )
    );
    const live = liveFleet(classified);
    const dark = darkUnits(classified);
    console.log(`FLEET: ${facts.rows.length} unit rows on USMCA`);
    console.log(`  REPORTING (the live fleet): ${live.length} -> ${live.map((u) => u.unitNumber).sort().join(" ")}`);
    console.log(`  DARK (real trucks, no recent GPS): ${dark.length} -> ${dark.map((u) => u.unitNumber).sort().join(" ")}`);
    console.log(`  sample rows: ${classified.filter((u) => u.fleetClass === "sample").length}`);
    console.log(`  no telemetry ever: ${classified.filter((u) => u.fleetClass === "no_telemetry_ever").length}`);

    // --- 2. stops + odometer + miles, per live unit ------------------------------------------
    const from = new Date(now.getTime() - 24 * 3600 * 1000);
    let totalStops = 0;
    let withOdo = 0;
    let withMiles = 0;
    const sample: string[] = [];

    for (const u of live) {
      const res = await client.query(unitFixesSql(), [u.unitId, from.toISOString(), now.toISOString()]);
      const fixes: PositionFix[] = res.rows.map((r: any) => ({
        capturedAt: new Date(r.captured_at),
        lat: r.lat === null ? null : Number(r.lat),
        lng: r.lng === null ? null : Number(r.lng),
        speedMph: r.speed_mph === null ? null : Number(r.speed_mph),
        engineState: r.engine_state,
        odometerMi: r.odometer_mi === null ? null : Number(r.odometer_mi),
        city: r.city,
        state: r.state,
      }));
      const odoCandidates = fixes.filter((f) => f.odometerMi !== null);
      const stops = detectStops(u.unitId, fixes).map((s) => attachNearestOdometer(s, odoCandidates));
      const withMilesArr = milesBetweenStops(stops);
      totalStops += stops.length;
      withOdo += stops.filter((s) => s.odometerMi !== null).length;
      for (const s of withMilesArr) {
        if (s.milesSincePreviousStop !== null && s.milesSincePreviousStop > 0) {
          withMiles++;
          if (sample.length < 8) {
            sample.push(
              `  ${u.unitNumber.padEnd(6)} ${s.startedAt.toISOString().slice(5, 16)}  ` +
                `dwell ${String(s.dwellMinutes).padStart(6)}m  ` +
                `${(s.city ?? "?") + ", " + (s.state ?? "?")}`.padEnd(24) +
                `odo ${s.odometerMi?.toFixed(1).padStart(10)}  ` +
                `MILES SINCE LAST STOP ${String(s.milesSincePreviousStop).padStart(7)}`
            );
          }
        }
      }
    }

    console.log(`\nSTOPS >= ${STOP_MIN_DWELL_MINUTES} min, last 24 h, live fleet only:`);
    console.log(`  stops detected          ${totalStops}`);
    console.log(`  with an odometer        ${withOdo}`);
    console.log(`  with miles since last   ${withMiles}`);
    console.log(`\nSAMPLE (real rows, engine output):`);
    for (const l of sample) console.log(l);

    await client.query("ROLLBACK");
    console.log("\nROLLED BACK — nothing written.");
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
