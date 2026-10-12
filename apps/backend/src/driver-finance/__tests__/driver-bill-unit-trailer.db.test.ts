/**
 * LEAD 443.110 G9 — real Postgres: an open driver bill carries its load's truck and trailer (restampDriverBillUnitAndTrailer,
 * the one rule every driver-bill writer calls). Company trailer -> trailer_id; customer-trailer load -> non_owned_trailer_id
 * (never both). A settled bill is a closed document and is not restamped. ONE transaction, rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { restampDriverBillUnitAndTrailer } from "../driver-bill-unit-trailer.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("driver bill carries the load's unit and trailer (real Postgres)", () => {
  it("stamps unit + company trailer, then the customer trailer; never both", async () => {
    const loadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const load = (await db.query<{ company: string; customer: string; number: string }>(
        `SELECT operating_company_id::text AS company, customer_id::text AS customer, load_number AS number FROM mdata.loads WHERE id = $1::uuid`,
        [loadId]
      )).rows[0]!;
      const company = load.company;
      const sfx = randomUUID().slice(0, 6);
      const unit = (await db.query<{ id: string }>(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3::uuid, true) RETURNING id::text`,
        [`U-G9-${sfx}`, `1G9TEST${sfx.toUpperCase()}0000`.slice(0, 17), company]
      )).rows[0]!.id;
      const driver = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'G9', 'Fixture', $3)`,
        [driver, company, `+1002${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`]
      );
      const trailer = (await db.query<{ id: string }>(
        `INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'DryVan', $2::uuid) RETURNING id::text`,
        [`T-G9-${sfx}`, company]
      )).rows[0]!.id;
      await db.query(`UPDATE mdata.loads SET assigned_unit_id = $2::uuid, trailer_source = 'company', non_owned_trailer_id = NULL WHERE id = $1::uuid`, [loadId, unit]);
      await db.query(
        `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id, assigned_by_user_id, warnings_acknowledged)
         VALUES ($1::uuid, $2::uuid, 'full_form', NULL, $3::uuid, (SELECT id FROM identity.users LIMIT 1), '[]'::jsonb)`,
        [company, loadId, trailer]
      );
      const bill = (await db.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_bills (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 10000, 'open') RETURNING id::text`,
        [company, loadId, load.number, `G9-${sfx}`, driver]
      )).rows[0]!.id;

      expect(await restampDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, loadId })).toBeGreaterThanOrEqual(1);
      const read = async () =>
        (await db.query<{ u: string | null; t: string | null; n: string | null }>(
          `SELECT unit_id::text AS u, trailer_id::text AS t, non_owned_trailer_id::text AS n FROM driver_finance.driver_bills WHERE id = $1::uuid`,
          [bill]
        )).rows[0]!;
      expect(await read()).toEqual({ u: unit, t: trailer, n: null });

      // Customer trailer: the load says customer -> the bill takes the non-owned trailer and drops the company one.
      const customerTrailer = (await db.query<{ id: string }>(
        `INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id)
         VALUES ($1::uuid, $2, 'customer', $3::uuid) RETURNING id::text`,
        [company, `CUST-G9-${sfx}`, load.customer]
      )).rows[0]!.id;
      await db.query(`UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $2::uuid WHERE id = $1::uuid`, [loadId, customerTrailer]);
      await restampDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, loadId });
      expect(await read()).toEqual({ u: unit, t: null, n: customerTrailer });

      // A non-open (paid) bill is a closed document: not restamped.
      await db.query(`UPDATE driver_finance.driver_bills SET status = 'paid' WHERE id = $1::uuid`, [bill]);
      await db.query(`UPDATE mdata.loads SET trailer_source = 'company', non_owned_trailer_id = NULL WHERE id = $1::uuid`, [loadId]);
      await restampDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, loadId });
      expect(await read()).toEqual({ u: unit, t: null, n: customerTrailer });
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
