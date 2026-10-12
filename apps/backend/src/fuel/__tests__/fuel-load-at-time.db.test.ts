/**
 * LEAD 443.110 G7 — real Postgres: resolveFuelLoadAtTime is the ONE fuel-to-load rule (fuel-card import + Relay post).
 * Every fixture lives in ONE transaction that is rolled back.
 *
 *  - actual stop stamps: the load the unit was running at the fill time;
 *  - date-only stamps (local midnight, how historical Creator loads are stamped): a fill later on the delivery DAY
 *    still belongs to that load (the old rule read the load as finished at midnight);
 *  - NB / SB on one truck: the trip under way (latest pickup at or before the fill), before any pickup the earliest
 *    upcoming one — never created_at;
 *  - driver fallback when the unit runs nothing; nothing -> null, never a guess;
 *  - the fill carries the load's company trailer (the one trailer rule).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { resolveFuelLoadAtTime } from "../fuel-load-at-time.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("one fuel-to-load rule (443.110 G7, real Postgres)", () => {
  it("actual stamps / date-only / NB-SB / driver fallback / none / trailer", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `FLT${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(
        `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [`${tag}A`, `Fuel load-at-time test ${tag}`]
      )).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'FLT customer') RETURNING id::text AS id`, [opco])).id;
      const unit = async (n: string) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
          [`${tag}-${n}`, `1FLT${tag.slice(-6)}${n}`.padEnd(17, "0").slice(0, 17), opco])).id;
      const driver = async (n: string) =>
        (await one(`INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id) VALUES ($1, 'Fuel', '5550000000', $2, $3::uuid) RETURNING id::text AS id`,
          [`${tag}${n}`, `${tag.toLowerCase()}${n}@example.test`, opco])).id;
      const load = async (n: string, unitId: string | null, driverId: string | null) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unitId, driverId]
        )).id;
      // Stops with ACTUAL stamps given as local wall-clock text (America/Chicago).
      const stops = async (loadId: string, pickup: string, delivery: string) =>
        db.query(
          `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
           VALUES ($1::uuid, 1, 'pickup', ($2::timestamp AT TIME ZONE '${TZ}'), ($2::timestamp AT TIME ZONE '${TZ}')),
                  ($1::uuid, 2, 'delivery', ($3::timestamp AT TIME ZONE '${TZ}'), ($3::timestamp AT TIME ZONE '${TZ}'))`,
          [loadId, pickup, delivery]
        );
      const at = async (local: string) => (await one<{ t: string }>(`SELECT ($1::timestamp AT TIME ZONE '${TZ}')::text AS t`, [local])).t;
      const resolve = async (unitId: string | null, driverId: string | null, local: string) =>
        resolveFuelLoadAtTime(db as never, { operatingCompanyId: opco, unitId, driverId, at: await at(local) });

      // 1. actual stamps
      const u1 = await unit("U1");
      const lActual = await load("1", u1, null);
      await stops(lActual, "2026-08-10 10:00", "2026-08-12 15:00");
      const trailer = (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-T1`, opco])).id;
      await db.query(`INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id, trailer_id) VALUES ($1, current_date, 500, $2, $3, $4)`,
        [opco, 200_000 + (Date.now() % 700_000), lActual, trailer]);
      const hit1 = await resolve(u1, null, "2026-08-11 08:00");
      expect(hit1).toMatchObject({ load_id: lActual, matched_by: "unit", trailer_id: trailer });
      expect(await resolve(u1, null, "2026-08-13 08:00")).toBeNull(); // after the real delivery: not this load

      // 2. date-only stamps (local midnight): a fill at 18:00 on the delivery DAY still belongs to the load
      const u2 = await unit("U2");
      const lDateOnly = await load("2", u2, null);
      await stops(lDateOnly, "2026-08-20 00:00", "2026-08-22 00:00");
      expect((await resolve(u2, null, "2026-08-22 18:00"))?.load_id).toBe(lDateOnly);
      expect(await resolve(u2, null, "2026-08-23 09:00")).toBeNull();

      // 3. NB / SB on one truck (SB booked while NB still rolling)
      const u3 = await unit("U3");
      const lNb = await load("3", u3, null);
      await stops(lNb, "2026-09-01 08:00", "2026-09-03 12:00");
      const lSb = await load("4", u3, null);
      await stops(lSb, "2026-09-03 16:00", "2026-09-05 12:00");
      expect((await resolve(u3, null, "2026-09-02 10:00"))?.load_id).toBe(lNb);
      expect((await resolve(u3, null, "2026-09-04 10:00"))?.load_id).toBe(lSb);
      expect((await resolve(u3, null, "2026-08-31 10:00"))?.load_id).toBe(lNb); // before any pickup: earliest upcoming

      // 4. driver fallback: the fill's unit runs nothing, its driver is on a load in another truck
      const u4 = await unit("U4");
      const u5 = await unit("U5");
      const d1 = await driver("D1");
      const lDriver = await load("5", u5, d1);
      await stops(lDriver, "2026-09-10 08:00", "2026-09-12 12:00");
      expect(await resolve(u4, d1, "2026-09-11 10:00")).toMatchObject({ load_id: lDriver, matched_by: "driver" });
      // the unit's own load wins over the driver's
      const lU4 = await load("6", u4, null);
      await stops(lU4, "2026-09-10 09:00", "2026-09-12 09:00");
      expect(await resolve(u4, d1, "2026-09-11 10:00")).toMatchObject({ load_id: lU4, matched_by: "unit" });

      // 5. nothing -> null, never a guess
      const u6 = await unit("U6");
      const d2 = await driver("D2");
      expect(await resolve(u6, d2, "2026-09-11 10:00")).toBeNull();
      expect(await resolve(null, null, "2026-09-11 10:00")).toBeNull();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
