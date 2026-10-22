/**
 * LEAD 443.214 — real Postgres: WEX 99368 (T176, Mosheim TN, 10-17 18:44 CT) was linked to 13600 (an earlier load)
 * while T176 was running 13685. The resolver takes the provider's pump moment + the station, finds the truck Samsara
 * put at the pump, and names the load that truck was running → 13685-like. A fill with no provider moment is HELD.
 * On main there is no resolver: the fill keeps the hand-typed load.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { resolveFillTruckAndLoad } from "../fill-truck-and-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("fill-truck-and-load resolver (443.214, real Postgres)", () => {
  it("places the fill on the load the GPS truck was running at the provider moment", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "FTL", legalNamePrefix: "443.214 fuel truck" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `FTL${Date.now().toString(36).toUpperCase()}`;
    const one = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql, p)).rows[0]!.id;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`]);
      const unit = await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`T${String(900000 + Math.floor(Math.random() * 99999))}`, `${tag}VIN00000000`.slice(0, 17), opco]);
      const load = async (n: string, pu: string, del: string) => {
        const id = await one(`INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, status)
                              VALUES ($1, $2, $3, $4, $5, $6, 'delivered') RETURNING id::text AS id`, [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unit]);
        await db.query(`INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at) VALUES
          ($1::uuid, 1, 'pickup', ($2::timestamp AT TIME ZONE '${TZ}'), ($2::timestamp AT TIME ZONE '${TZ}') + interval '1 hour'),
          ($1::uuid, 2, 'delivery', ($3::timestamp AT TIME ZONE '${TZ}'), ($3::timestamp AT TIME ZONE '${TZ}') + interval '1 hour')`, [id, pu, del]);
        return id;
      };
      const old13600 = await load("A", "2026-10-08 10:00", "2026-10-11 09:00");
      const run13685 = await load("B", "2026-10-15 08:00", "2026-10-19 16:00");
      // Mosheim TN Love's #787 (station coords) and T176's GPS 4 min after the pump moment, 60 m away
      const moment = "2026-10-17 18:44";
      await db.query(`INSERT INTO telematics.vehicle_locations (operating_company_id, unit_id, samsara_vehicle_id, raw_samsara_event_id, captured_at, lat, lng, speed_mph)
                      VALUES ($1, $2, $4, $4, ($3::timestamp AT TIME ZONE '${TZ}') + interval '4 minutes', 36.18910, -82.98460, 0)`, [opco, unit, moment, `${tag}-samsara`]);
      const fill = await one(`INSERT INTO fuel.fuel_transactions (operating_company_id, transaction_at, unit_id, load_id, fuel_type, gallons, total_cost, source,
                               fill_moment_at, fill_moment_source, station_lat, station_lng, location_city, location_state, source_row_hash)
                              VALUES ($1, '2026-10-17 12:00Z', $2, $3, 'diesel', 101.51, 557.74, 'manual',
                                      ($4::timestamp AT TIME ZONE '${TZ}'), 'wex_statement', 36.18900, -82.98500, 'MOSHEIM', 'TN', $5) RETURNING id::text AS id`,
        [opco, unit, old13600, moment, `${tag}-a`]);
      const r = await resolveFillTruckAndLoad(db as never, opco, fill);
      expect(r?.truck_unit_id).toBe(unit);
      expect(r?.truck_resolution).toBe("gps");
      expect(r?.engine_load_id).toBe(run13685);
      expect(r?.load_id).toBe(old13600);
      expect(r?.load_resolution).toBe("running");

      // a settlement-typed date with no provider moment is HELD, never matched on the 07:00 placeholder
      const typed = await one(`INSERT INTO fuel.fuel_transactions (operating_company_id, transaction_at, unit_id, load_id, fuel_type, gallons, total_cost, source, location_city, source_row_hash)
                               VALUES ($1, '2026-10-17 12:00Z', $2, $3, 'diesel', 10, 50, 'manual', 'LOVES #787 TRAVEL STOP MOSHEIM, TN', $4) RETURNING id::text AS id`, [opco, unit, old13600, `${tag}-b`]);
      const h = await resolveFillTruckAndLoad(db as never, opco, typed);
      expect(h?.truck_resolution).toBe("held_time_unknown");
      expect(h?.engine_load_id).toBeNull();
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
