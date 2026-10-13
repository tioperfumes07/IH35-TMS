/**
 * LEAD 443.126 2a / 443.121 #2 — real Postgres: THE one fill-driver rule ("unit and driver from the card / truck").
 * A fill whose provider named no driver (the two real no-load Relay receipts of 2026-10-12 carried none) takes the driver
 * the fuel card was assigned to at fill time, else the truck's ONE driver assignment at that moment, else the load's
 * driver. Two candidates = no answer (never a guess); another company's driver is never used.
 * Old code: there was no rule — resolveFillDriverAtTime does not exist and a no-load fill posted with no driver.
 *
 * Everything runs in ONE rolled-back transaction under a throwaway company.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { resolveFillDriverAtTime } from "../fuel-load-at-time.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("one fill-driver rule (443.126 2a, real Postgres)", () => {
  it("provider -> card assignment -> single truck assignment -> load; ambiguous and foreign never answer", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `FDA${Date.now().toString(36).toUpperCase()}`;
      const company = async (suffix: string) =>
        (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [`${tag}${suffix}`, `Fill driver test ${tag}${suffix}`])).id;
      const opco = await company("A");
      const other = await company("B");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const unit = async (n: string) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
          [`${tag}${n}`, `${tag}${n}VIN0000000`.slice(0, 17), opco])).id;
      const driver = async (co: string, n: string) =>
        (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Fda', $2, '5555550126') RETURNING id::text AS id`, [co, n])).id;
      const truckOnly = await unit("U1");
      const withCard = await unit("U2");
      const twoDrivers = await unit("U3");
      const loadOnly = await unit("U4");
      const dTruck = await driver(opco, "Truck");
      const dCard = await driver(opco, "Card");
      const dTruck2 = await driver(opco, "Truck2");
      const dLoad = await driver(opco, "Load");
      const dForeign = await driver(other, "Foreign");
      const at = "2026-10-12T17:34:10Z";
      const vda = (u: string, d: string, from = "2026-10-12T00:00:00Z", to: string | null = null) =>
        db.query(`INSERT INTO telematics.vehicle_driver_assignments (operating_company_id, unit_id, driver_id, started_at, ended_at, source) VALUES ($1, $2, $3, $4, $5, 'samsara_webhook')`,
          [opco, u, d, from, to]);
      await vda(truckOnly, dTruck);
      await vda(truckOnly, dTruck2, "2026-10-11T00:00:00Z", "2026-10-12T00:00:00Z"); // ended before the fill: not a candidate
      await vda(withCard, dTruck);
      await db.query(`INSERT INTO fuel.fuel_card_assignments (operating_company_id, unit_id, driver_id, card_last_digits, effective_from) VALUES ($1, $2, $3, '4321', '2026-10-01T00:00:00Z')`,
        [opco, withCard, dCard]);
      await vda(twoDrivers, dTruck);
      await vda(twoDrivers, dTruck2);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text AS id`,
        [opco, `${tag}L`, customer, TEST_OWNER_USER_ID, trailerType, loadOnly, dLoad])).id;

      const rule = (unitId: string | null, extra: { matchedDriverId?: string | null; loadId?: string | null; operatingCompanyId?: string } = {}) =>
        resolveFillDriverAtTime(db as never, { operatingCompanyId: extra.operatingCompanyId ?? opco, matchedDriverId: extra.matchedDriverId ?? null, unitId, at, loadId: extra.loadId ?? null });

      expect(await rule(truckOnly, { matchedDriverId: dLoad })).toEqual({ driver_id: dLoad, matched_by: "provider" });
      expect(await rule(truckOnly)).toEqual({ driver_id: dTruck, matched_by: "truck_assignment" }); // the 2026-10-12 shape
      expect(await rule(withCard)).toEqual({ driver_id: dCard, matched_by: "card_assignment" });
      expect(await rule(twoDrivers)).toBeNull(); // two truck drivers at that moment: never a guess
      expect(await rule(twoDrivers, { loadId: load })).toEqual({ driver_id: dLoad, matched_by: "load" });
      expect(await rule(loadOnly, { loadId: load })).toEqual({ driver_id: dLoad, matched_by: "load" });
      expect(await rule(null)).toBeNull();
      // Another company's driver on this company's truck is never returned.
      await db.query(`INSERT INTO telematics.vehicle_driver_assignments (operating_company_id, unit_id, driver_id, started_at, source) VALUES ($1, $2, $3, '2026-10-12T00:00:00Z', 'samsara_webhook')`,
        [opco, loadOnly, dForeign]);
      expect(await rule(loadOnly)).toBeNull();
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  }, 60_000);
});
