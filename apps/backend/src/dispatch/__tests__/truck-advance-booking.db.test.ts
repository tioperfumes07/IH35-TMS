/**
 * LEAD 443.244 (owner 2026-10-22 2:10 PM CT: "yes it should. remember we might book a load in advance etc.") — real Postgres.
 * A truck holds ONE load in motion plus any number of advance bookings. On main the app gate and both DB backstops refused an
 * assigned_not_dispatched load on a truck already in motion (13693 behind 13690 on T177). Branch:
 *   1. in motion + advance booking (assigned_not_dispatched) -> allowed in both layers;
 *   2. two loads in motion -> refused;
 *   3. the advance load moved to dispatched while the current one is still in motion -> refused at COMMIT; allowed once the
 *      current one is delivered.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { assertUnitNotActiveOnAnotherLoad } from "../unit-active-load-guard.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("truck — one load in motion plus advance bookings (443.244, real Postgres)", () => {
  it("allows an advance booking behind the load in motion; refuses a second load in motion", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "ADV", legalNamePrefix: "443.244 advance booking" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `ADV${Date.now().toString(36).toUpperCase()}`;
    const one = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
    const begin = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    };
    let customer = ""; let trailerType: string | null = null; let unit = "";
    const book = async (n: string, status: string, pu: string, del: string) => {
      const id = await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::mdata.load_status_enum) RETURNING id::text AS id`,
        [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unit, status]);
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, scheduled_arrival_at, appointment_start_at)
         VALUES ($1::uuid, 1, 'pickup', ($2::timestamp AT TIME ZONE '${TZ}'), ($2::timestamp AT TIME ZONE '${TZ}')),
                ($1::uuid, 2, 'delivery', ($3::timestamp AT TIME ZONE '${TZ}'), ($3::timestamp AT TIME ZONE '${TZ}'))`,
        [id, pu, del]);
      await db.query(`UPDATE mdata.loads SET trip_type = 'NB'::mdata.trip_type_enum, tour_id = $1::uuid WHERE id = $2::uuid`, [randomUUID(), id]);
      return id;
    };
    try {
      await begin();
      trailerType = await prepareCompanyForLoadInserts(db, opco);
      customer = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`]);
      unit = await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`T${String(900000 + Math.floor(Math.random() * 99999))}`, `${tag}VIN00000000`.slice(0, 17), opco]);
      const current = await book("A", "in_transit", "2026-10-22", "2026-10-24"); // 13690 on T177
      await db.query("COMMIT");

      // 1. the advance booking (overlapping dates on purpose: 13693's app dates overlap 13690's) — app gate + both triggers.
      await begin();
      await expect(assertUnitNotActiveOnAnotherLoad(db, { operating_company_id: opco, unit_id: unit })).rejects.toThrow(/already active/);
      const advance = await book("B", "assigned_not_dispatched", "2026-10-23", "2026-10-26"); // 13693
      await db.query("COMMIT");

      // 2. a second load IN MOTION on the truck is refused.
      await begin();
      await book("C", "dispatched", "2026-10-25", "2026-10-27");
      await expect(db.query("COMMIT")).rejects.toThrow(/unit_already_active_on_load|unit already on active load/);
      await db.query("ROLLBACK").catch(() => undefined);

      // 3. dispatching the advance load while the current one is still in motion is refused...
      await begin();
      await expect((async () => {
        await db.query(`UPDATE mdata.loads SET status = 'dispatched' WHERE id = $1::uuid`, [advance]);
        await db.query("COMMIT");
      })()).rejects.toThrow(/unit_already_active_on_load|unit already on active load/);
      await db.query("ROLLBACK").catch(() => undefined);

      // ...and allowed once the current one is delivered.
      await begin();
      await db.query(`UPDATE mdata.loads SET status = 'delivered' WHERE id = $1::uuid`, [current]);
      await db.query(`UPDATE mdata.loads SET status = 'dispatched' WHERE id = $1::uuid`, [advance]);
      await db.query("COMMIT");
      const st = (await db.query<{ status: string }>(`SELECT status::text FROM mdata.loads WHERE id = $1::uuid`, [advance])).rows[0]!.status;
      expect(st).toBe("dispatched");
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
