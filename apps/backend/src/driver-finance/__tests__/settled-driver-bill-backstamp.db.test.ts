/**
 * LEAD 443.137 #1 — real Postgres: a SETTLED per-load driver bill minted before G9 (no unit, no trailer) is back-stamped from its
 * load by backStampSettledDriverBillUnitAndTrailer — unit from the load, company trailer (same-entity) — fill-only; amount,
 * status and settlement unchanged; a second run changes nothing. restampDriverBillUnitAndTrailer still never touches it.
 * ONE transaction, rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { backStampSettledDriverBillUnitAndTrailer, restampDriverBillUnitAndTrailer } from "../driver-bill-unit-trailer.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("settled driver bill back-stamp from its load (443.137 #1, real Postgres)", () => {
  it("fills unit + company trailer on a settled bill, money untouched, once", async () => {
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
      const load = (await db.query<{ company: string; number: string }>(
        `SELECT operating_company_id::text AS company, load_number AS number FROM mdata.loads WHERE id = $1::uuid`, [loadId])).rows[0]!;
      const company = load.company;
      const sfx = randomUUID().slice(0, 6);
      const unit = (await db.query<{ id: string }>(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3::uuid, true) RETURNING id::text`,
        [`U-BS-${sfx}`, `1BSTEST${sfx.toUpperCase()}0000`.slice(0, 17), company])).rows[0]!.id;
      const driver = randomUUID();
      await db.query(`INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'BS', 'Fixture', $3)`,
        [driver, company, `+1003${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`]);
      const trailer = (await db.query<{ id: string }>(
        `INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'DryVan', $2::uuid) RETURNING id::text`,
        [`T-BS-${sfx}`, company])).rows[0]!.id;
      await db.query(`UPDATE mdata.loads SET assigned_unit_id = $2::uuid, trailer_source = 'company', non_owned_trailer_id = NULL WHERE id = $1::uuid`, [loadId, unit]);
      await db.query(
        `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id, assigned_by_user_id, warnings_acknowledged)
         VALUES ($1::uuid, $2::uuid, 'full_form', NULL, $3::uuid, $4::uuid, '[]'::jsonb)`, [company, loadId, trailer, TEST_OWNER_USER_ID]);
      const settlement = randomUUID();
      await db.query(
        `INSERT INTO driver_finance.driver_settlements (id, operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, CURRENT_DATE - 7, CURRENT_DATE, 'draft', 100, 0, 0, 100, 'week_calendar')`,
        [settlement, company, `BS-${sfx}`, driver]);
      const bill = (await db.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_bills (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 10000, 'paid', $6::uuid) RETURNING id::text`,
        [company, loadId, load.number, `BS-${sfx}`, driver, settlement])).rows[0]!.id;
      await db.query(`UPDATE driver_finance.driver_bills SET unit_id = NULL, trailer_id = NULL, non_owned_trailer_id = NULL WHERE id = $1::uuid`, [bill]);
      const read = async () => (await db.query<{ unit_id: string | null; trailer_id: string | null; non_owned: string | null; gross: number; status: string; settled: string | null }>(
        `SELECT unit_id::text, trailer_id::text, non_owned_trailer_id::text AS non_owned, gross_amount_cents::int AS gross, status, settled_in_settlement_id::text AS settled
           FROM driver_finance.driver_bills WHERE id = $1::uuid`, [bill])).rows[0]!;

      // The open-bill restamp never touches a settled bill (G9 rule unchanged).
      await restampDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, loadId });
      expect(await read()).toMatchObject({ unit_id: null, trailer_id: null });

      const out = await backStampSettledDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, actorUserId: TEST_OWNER_USER_ID, authorization: "test" });
      expect(out.map((r) => r.id)).toContain(bill);
      expect(await read()).toEqual({ unit_id: unit, trailer_id: trailer, non_owned: null, gross: 10000, status: "paid", settled: settlement });
      const again = await backStampSettledDriverBillUnitAndTrailer(db as never, { operatingCompanyId: company, actorUserId: TEST_OWNER_USER_ID, authorization: "test" });
      expect(again.map((r) => r.id)).not.toContain(bill);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
