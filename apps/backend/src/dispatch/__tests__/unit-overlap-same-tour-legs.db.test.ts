/**
 * LEAD 443.209 (20:32Z ruling, moved from Codex) — real Postgres: one unit rule in BOTH layers.
 * 13694 (T148, Avenel NJ pickup 10-20, TR) is the next leg of 13688's tour (T148, delivers Swedesboro NJ 10-19, still
 * dispatched in AlwaysTrack). On main: the app gate refuses it ("unit already active on 13688") and a fresh database's
 * uq_loads_one_active_unit index refuses it too. Branch: the same-tour sequential leg books in both layers; a second
 * active load on the unit that is NOT that leg is still refused — by the app gate and at COMMIT by the DB.
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

describeIntegration("unit overlap — same-tour sequential legs (443.209, real Postgres)", () => {
  it("books the next leg of the same tour in both layers; refuses any other second active load", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "OVL", legalNamePrefix: "443.209 tour overlap" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `OVL${Date.now().toString(36).toUpperCase()}`;
    const one = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
    const begin = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    };
    let customer = ""; let trailerType: string | null = null; let unit = "";
    const tour = randomUUID();
    // one load in one transaction: row -> stops -> trip pairing (the Book Load order), committed at the end.
    const book = async (n: string, tourId: string, trip: "NB" | "TR", pu: string, del: string) => {
      const id = await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'dispatched') RETURNING id::text AS id`,
        [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unit]);
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, appointment_start_at, appointment_end_at)
         VALUES ($1::uuid, 1, 'pickup', ($2::timestamp AT TIME ZONE '${TZ}'), ($2::timestamp AT TIME ZONE '${TZ}') + interval '23 hours 59 minutes'),
                ($1::uuid, 2, 'delivery', ($3::timestamp AT TIME ZONE '${TZ}'), ($3::timestamp AT TIME ZONE '${TZ}') + interval '23 hours 59 minutes')`,
        [id, pu, del]);
      await db.query(`UPDATE mdata.loads SET trip_type = $1::mdata.trip_type_enum, tour_id = $2::uuid WHERE id = $3::uuid`, [trip, tourId, id]);
      return id;
    };
    try {
      await begin();
      trailerType = await prepareCompanyForLoadInserts(db, opco);
      customer = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`]);
      unit = await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`T${String(900000 + Math.floor(Math.random() * 99999))}`, `${tag}VIN00000000`.slice(0, 17), opco]);
      await book("A", tour, "NB", "2026-10-16", "2026-10-19"); // 13688
      await db.query("COMMIT");

      // app layer: the next leg of the same tour picks up 10-20 00:00 CT, after 13688's 10-19 window.
      await begin();
      const pickup = (await db.query<{ t: string }>(`SELECT ('2026-10-20'::timestamp AT TIME ZONE '${TZ}')::text AS t`)).rows[0]!.t;
      await expect(assertUnitNotActiveOnAnotherLoad(db, { operating_company_id: opco, unit_id: unit })).rejects.toThrow(/already active/);
      await expect(assertUnitNotActiveOnAnotherLoad(db, { operating_company_id: opco, unit_id: unit, same_tour_next_leg: { tour_id: tour, pickup_at: pickup } })).resolves.toBeUndefined();
      await expect(assertUnitNotActiveOnAnotherLoad(db, { operating_company_id: opco, unit_id: unit, same_tour_next_leg: { tour_id: randomUUID(), pickup_at: pickup } })).rejects.toThrow(/already active/);
      // DB layer: the same-tour next leg commits (main: uq_loads_one_active_unit refuses it).
      await book("B", tour, "TR", "2026-10-20", "2026-10-23"); // 13694
      await db.query("COMMIT");

      // a second active load on the unit that is NOT a same-tour sequential leg is refused at COMMIT.
      await begin();
      await book("C", randomUUID(), "NB", "2026-10-21", "2026-10-22");
      await expect(db.query("COMMIT")).rejects.toThrow(/unit_already_active_on_load|uq_loads_one_active_unit/);
      await db.query("ROLLBACK").catch(() => undefined);

      // same tour but overlapping windows is refused at COMMIT too.
      await begin();
      await book("D", tour, "TR", "2026-10-22", "2026-10-24");
      await expect(db.query("COMMIT")).rejects.toThrow(/unit_already_active_on_load|uq_loads_one_active_unit/);
      await db.query("ROLLBACK").catch(() => undefined);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
