#!/usr/bin/env tsx
// ROUND 210 (CC-3 handoff, 2026-09-28): 13 of 16 live USMCA loads had mdata.loads.miles_deadhead
// IS NULL (13624, 13625, 13626, 13627, 13628, 13630, 13631, 13632, 13633, 13634, 13636, 13638,
// 13639). CC-3 confirmed the display side already renders this honestly (dash, never a fabricated
// zero) and that the gap is the source data itself -- no code fix, a real backfill using the app's
// own sanctioned deadhead producer.
//
// Uses the EXACT SAME mechanism book-load.service.ts / loads.routes.ts's own
// /api/v1/dispatch/deadhead-from-chain endpoint uses at booking time --
// computeChainDeadheadMiles() (GO-23 owner ruling 2026-09-02: deadhead is a TRIP property, the
// SAME unit's most recent prior delivery to this load's pickup, never a lane average, never
// invented). before_iso is each load's OWN pickup time, so only genuinely PRIOR deliveries count.
// Writes only through the sanctioned allocator, updateDispatchLoad() -- never a direct UPDATE on
// mdata.loads -- because miles_deadhead is a LOAD_EDIT_LOCK_MONEY_FIELD_KEYS field (it drives
// driver deadhead pay) and that function is the only writer with the real
// audit/lock/override logic.
//
// Any load for which computeChainDeadheadMiles returns "blank" (no prior delivery for this unit,
// or a location that can't be geocoded) is left NULL, exactly as designed -- 0 would be a false
// statement that pays the driver nothing for real empty miles.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { register } from "tsx/esm/api";
register();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
if (APPLY) {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required (ROUND 133 P0)");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

const { computeChainDeadheadMiles } = await import("../../apps/backend/src/dispatch/deadhead/chain-deadhead.service.ts");
const { updateDispatchLoad } = await import("../../apps/backend/src/dispatch/update-load.service.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = [
  "13624", "13625", "13626", "13627", "13628", "13630", "13631",
  "13632", "13633", "13634", "13636", "13638", "13639",
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const results: Array<{ load_number: string; deadhead_miles: number | null; reason: string }> = [];

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const loadsRes = await client.query<{
      load_number: string;
      id: string;
      assigned_unit_id: string | null;
      pickup_city: string | null;
      pickup_state: string | null;
      pickup_lat: number | null;
      pickup_lng: number | null;
      pickup_at: string | null;
    }>(
      `
      SELECT l.load_number, l.id, l.assigned_unit_id,
        s.city AS pickup_city, s.state AS pickup_state,
        s.latitude::float8 AS pickup_lat, s.longitude::float8 AS pickup_lng,
        COALESCE(s.scheduled_arrival_at, s.actual_arrival_at) AS pickup_at
      FROM mdata.loads l
      JOIN LATERAL (
        SELECT ls.city, ls.state, ls.latitude, ls.longitude, ls.scheduled_arrival_at, ls.actual_arrival_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id AND ls.stop_type = 'pickup' AND ls.soft_deleted_at IS NULL
        ORDER BY ls.sequence_number ASC LIMIT 1
      ) s ON true
      WHERE l.load_number = ANY($1) AND l.operating_company_id = $2::uuid AND l.miles_deadhead IS NULL
      ORDER BY l.load_number
      `,
      [LOAD_NUMBERS, USMCA]
    );

    await client.query("ROLLBACK"); // release the read txn before each write gets its own

    for (const row of loadsRes.rows) {
      if (!row.assigned_unit_id) {
        results.push({ load_number: row.load_number, deadhead_miles: null, reason: "no_assigned_unit" });
        continue;
      }
      const chain = await computeChainDeadheadMiles(OWNER, {
        unit_uuid: row.assigned_unit_id,
        pickup_city: row.pickup_city ?? "",
        pickup_state: row.pickup_state ?? "",
        pickup_latitude: row.pickup_lat,
        pickup_longitude: row.pickup_lng,
        before_iso: row.pickup_at,
      });

      if (chain.source === "blank") {
        results.push({ load_number: row.load_number, deadhead_miles: null, reason: chain.reason });
        continue;
      }

      const resultEntry = { load_number: row.load_number, deadhead_miles: chain.deadhead_miles as number | null, reason: "chain" };
      results.push(resultEntry);

      if (!APPLY) continue;

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      try {
        await updateDispatchLoad(client as any, {
          loadId: row.id,
          operatingCompanyId: USMCA,
          requestingUserUuid: OWNER,
          requestingUserRole: "Owner",
          override_reason: `ROUND 210 deadhead backfill: computeChainDeadheadMiles found prior delivery ${chain.prior_load_number ?? "?"} in ${chain.prior_delivery_city}, ${chain.prior_delivery_state} at ${chain.prior_delivered_at}; ${chain.deadhead_miles} mi to this load's pickup.`,
          fields: { miles_deadhead: chain.deadhead_miles },
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        // A load bookended by an open settlement correctly refuses a money-field edit (WORM) --
        // that is the system protecting itself, not a bug in this script. Report it and move on
        // to the rest of the batch rather than aborting loads that have nothing to do with it.
        const isLockError = err instanceof Error && err.constructor.name === "LoadEditLockedError";
        if (isLockError) {
          resultEntry.deadhead_miles = null;
          resultEntry.reason = `locked: ${(err as any).lock?.reason ?? "unknown"} (${(err as any).lock?.reference_display_id ?? "?"})`;
          continue;
        }
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  console.log(APPLY ? "APPLIED:" : "DRY RUN (pass --apply to write):");
  for (const r of results) {
    console.log(`  ${r.load_number}: ${r.deadhead_miles == null ? "NULL (" + r.reason + ")" : r.deadhead_miles + " mi"}`);
  }
  const resolved = results.filter((r) => r.deadhead_miles != null).length;
  console.log(`\n${resolved} of ${results.length} resolved via chain-deadhead; ${results.length - resolved} genuinely have no locatable prior delivery for their unit and stay NULL.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
