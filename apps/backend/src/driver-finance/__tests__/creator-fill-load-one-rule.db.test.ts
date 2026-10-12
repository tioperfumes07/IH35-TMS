/**
 * LEAD 443.113 BCF-04 + BCF-05 — real Postgres: a Settlement Creator fuel fill / paid company expense finds its load
 * through THE one fuel-to-load rule (fuel/fuel-load-at-time.ts, the same rule as the fuel-card import and the Relay
 * post), only ever one of THIS settlement's loads, and carries that LOAD's driver + unit (never the draft's
 * independently). One transaction, rolled back.
 *   - overlapping NB / SB document windows: decided by the one rule (the old date-window rule refused it as ambiguous);
 *   - a typed load that is a company load but NOT on this settlement: refused (old: accepted any company load);
 *   - a typed settlement load on another truck: the fill carries THAT load's unit (old: the draft's unit);
 *   - a settlement load with no truck of this company: refused.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { creatorFillLoad } from "../settlement-creator.service.js";
import { resolveFuelLoadAtTime } from "../../fuel/fuel-load-at-time.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const TZ = "America/Chicago";

describeIntegration("Creator fill load = the one fuel-to-load rule (443.113 BCF-04/05, real Postgres)", () => {
  it("one rule, settlement loads only, driver + unit from the load", async () => {
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
      const tag = `CFL${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const company = async (c: string) => (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [`${tag}${c}`, `Creator fill load test ${tag}${c}`])).id;
      const opco = await company("A");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'CFL customer') RETURNING id::text AS id`, [opco])).id;
      const unit = async (n: string, owner: string) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
          [`${tag}-${n}`, `1CFL${tag.slice(-6)}${n}`.padEnd(17, "0").slice(0, 17), owner])).id;
      const driver = async (n: string) =>
        (await one(`INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id) VALUES ($1, 'Fill', '5550000000', $2, $3::uuid) RETURNING id::text AS id`,
          [`${tag}${n}`, `${tag.toLowerCase()}${n}@example.test`, opco])).id;
      const load = async (n: string, unitId: string | null, driverId: string) => {
        const id = (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType, unitId, driverId])).id;
        return { id, load_number: `${tag}${n}` };
      };
      // Date-only stamps (local midnight), exactly how Creator loads are stamped from the signed document.
      const stops = async (loadId: string, pickup: string, delivery: string) =>
        db.query(
          `INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_arrival_at, actual_departure_at)
           VALUES ($1::uuid, 1, 'pickup', ($2::timestamp AT TIME ZONE '${TZ}'), ($2::timestamp AT TIME ZONE '${TZ}')),
                  ($1::uuid, 2, 'delivery', ($3::timestamp AT TIME ZONE '${TZ}'), ($3::timestamp AT TIME ZONE '${TZ}'))`,
          [loadId, pickup, delivery]);

      const truck = await unit("U1", opco);
      const truck2 = await unit("U2", opco);
      const drv = await driver("D1");
      const nb = await load("NB", truck, drv);
      await stops(nb.id, "2026-09-01 00:00", "2026-09-03 00:00");
      const sb = await load("SB", truck, drv);
      await stops(sb.id, "2026-09-03 00:00", "2026-09-05 00:00");
      const otherTruckLoad = await load("T2", truck2, drv);
      await stops(otherTruckLoad.id, "2026-09-06 00:00", "2026-09-07 00:00");
      const noTruckLoad = await load("NT", null, drv);
      const offSettlement = await load("OFF", truck, drv);

      const draft = {
        operating_company_id: opco, unit_id: truck, driver_id: drv,
        loads: [
          { load_number: nb.load_number, pickup_date: "2026-09-01", delivery_date: "2026-09-03" },
          { load_number: sb.load_number, pickup_date: "2026-09-03", delivery_date: "2026-09-05" },
          { load_number: otherTruckLoad.load_number, pickup_date: "2026-09-06", delivery_date: "2026-09-07" },
          { load_number: noTruckLoad.load_number, pickup_date: "2026-09-08", delivery_date: "2026-09-08" },
        ],
      } as never;
      const fill = (date: string, load_number?: string) => creatorFillLoad(db as never, draft, { label: `Fuel ${date}`, date, load_number });

      // Overlapping NB / SB windows on 09-03: decided by THE one rule (not refused as ambiguous), same answer as the import.
      const oneRule = await resolveFuelLoadAtTime(db as never, { operatingCompanyId: opco, unitId: truck, driverId: drv, at: "2026-09-03T17:00:00.000Z" });
      const overlap = await fill("2026-09-03");
      expect(overlap.loadId).toBe(oneRule?.load_id);
      expect([nb.id, sb.id]).toContain(overlap.loadId);
      expect(overlap).toMatchObject({ driverId: drv, unitId: truck });
      // A fill on 09-04: the SB load the truck was running.
      expect((await fill("2026-09-04")).loadId).toBe(sb.id);
      // A typed settlement load on ANOTHER truck: the fill carries that load's unit, not the draft's.
      expect(await fill("2026-09-06", otherTruckLoad.load_number)).toMatchObject({ loadId: otherTruckLoad.id, unitId: truck2, driverId: drv });
      // A company load that is not on this settlement: refused (it would attach the fill to another trip).
      await db.query("SAVEPOINT a");
      await expect(fill("2026-09-04", offSettlement.load_number)).rejects.toMatchObject({ code: "line_load_not_on_settlement" });
      await db.query("ROLLBACK TO SAVEPOINT a");
      // A settlement load with no truck of this company: refused (no same-entity unit to carry; another company's
      // truck cannot even be assigned — mdata.refuse_cross_company_reference).
      await db.query("SAVEPOINT b");
      await expect(fill("2026-09-08", noTruckLoad.load_number)).rejects.toMatchObject({ code: "line_load_has_no_unit" });
      await db.query("ROLLBACK TO SAVEPOINT b");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
