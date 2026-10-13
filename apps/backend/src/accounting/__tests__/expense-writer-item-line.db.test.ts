/**
 * LEAD 443.110 G13 — real Postgres: the shared expense writer (createExpenseInClientTx), which the Settlement Creator now
 * uses for its paid-now company expenses, records a load expense completely:
 *  - numbered on the load's spine and linked in expense_attribution.expense_load_links;
 *  - the line names its item with the source quantity / rate / UoM, the item's account, and the header's driver / unit /
 *    trailer;
 *  - the same vendor document number for the same vendor is refused as a duplicate; another company's item is refused.
 * Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createExpenseInClientTx, type CreateExpenseBody } from "../expenses.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("shared expense writer records item, line hubs and the load link (443.110 G13, real Postgres)", () => {
  it("load spine + expense_load_links, item/qty/rate/UoM + driver/unit/trailer on the line, duplicates and foreign items refused", async () => {
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
      const tag = `G13T${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const co = async (code: string) => (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'G13 writer test', 'operating_carrier') RETURNING id::text AS id`, [code])).id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const acct = async (company: string, name: string, num: string) =>
        (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, $2, 'Expense', $3, true) RETURNING id::text AS id`, [company, name, num])).id;
      const defAcct = await acct(opco, "G13 DEF", "96501");
      const otherAcct = await acct(other, "G13 other DEF", "96502");
      const item = async (company: string, account: string) => {
        const cat = (await one(`INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, $2, 'G13 category') RETURNING id::text AS id`, [company, `G13C${company.slice(0, 4)}`])).id;
        return (await one(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, 'G13 DEF', 'Service', $2, $3) RETURNING id::text AS id`, [company, cat, account])).id;
      };
      const defItem = await item(opco, defAcct);
      const foreignItem = await item(other, otherAcct);
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'G13 Loves', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Gthirteen', 'Driver', '5555550113') RETURNING id::text AS id`, [opco])).id;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'G13 customer') RETURNING id::text AS id`, [opco])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`, [`${tag}-U`, `VIN${tag}`.slice(0, 17), opco])).id;
      const trailer = (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-T`, opco])).id;
      const loadNumber = `8${String(Date.now()).slice(-9)}`;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
        [opco, loadNumber, customer, TEST_OWNER_USER_ID, trailerType, unit]
      )).id;

      const body = (over: Partial<CreateExpenseBody> = {}): CreateExpenseBody =>
        ({
          operating_company_id: opco,
          driver_id: driver,
          category_account_id: defAcct,
          expense_date: "2026-10-12",
          amount_cents: 6784,
          vendor_uuid: vendor,
          memo: `[SC 9999] DEF ${tag}`,
          is_company_expense: true,
          load_id: load,
          unit_id: null,
          trailer_id: trailer,
          vendor_document_number: `INV-${tag}`,
          item_id: defItem,
          quantity: 15.432,
          rate_cents: 439.6061,
          unit_of_measure: "gal",
          ...over,
        }) as CreateExpenseBody;

      const created = await createExpenseInClientTx(db, body(), TEST_OWNER_USER_ID);
      expect("expense_id" in created).toBe(true);
      const expenseId = (created as { expense_id: string }).expense_id;
      expect((created as { expense_number: string }).expense_number).toBe(loadNumber);

      const link = (await db.query<{ load_id: string; expense_number: string }>(
        `SELECT load_id::text, expense_number FROM expense_attribution.expense_load_links WHERE expense_id = $1`, [expenseId])).rows;
      expect(link).toEqual([{ load_id: load, expense_number: loadNumber }]);
      const header = (await db.query<{ unit_id: string; load_id: string }>(`SELECT unit_id::text, load_id::text FROM accounting.expenses WHERE id = $1`, [expenseId])).rows[0]!;
      expect(header).toEqual({ unit_id: unit, load_id: load });
      const line = (await db.query<{ item_id: string; quantity: string; rate_cents: string; unit_of_measure: string; expense_account_uuid: string; driver_id: string; unit_id: string; trailer_id: string; load_id: string; amount_cents: string }>(
        `SELECT item_id::text, quantity::text, rate_cents::text, unit_of_measure, expense_account_uuid::text, driver_id::text, unit_id::text, trailer_id::text, load_id::text, amount_cents::text
           FROM accounting.expense_lines WHERE expense_id = $1`, [expenseId])).rows;
      expect(line).toHaveLength(1);
      expect(line[0]).toMatchObject({ item_id: defItem, unit_of_measure: "gal", expense_account_uuid: defAcct, driver_id: driver, unit_id: unit, trailer_id: trailer, load_id: load, amount_cents: "6784" });
      expect(Number(line[0]!.quantity)).toBeCloseTo(15.432, 3);

      // Same vendor + same vendor document number -> refused as a duplicate (different memo, so it is the vendor rule).
      const dup = await createExpenseInClientTx(db, body({ memo: `[SC 9999] DEF again ${tag}` }), TEST_OWNER_USER_ID);
      expect("duplicateVendorDocumentNumber" in dup).toBe(true);
      // Another company's item is refused.
      const foreign = await createExpenseInClientTx(db, body({ memo: `[SC 9999] DEF foreign ${tag}`, vendor_document_number: `INV-${tag}-2`, item_id: foreignItem }), TEST_OWNER_USER_ID);
      expect("itemNotInCompany" in foreign).toBe(true);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
