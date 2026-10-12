/**
 * LEAD 443.128 B (N1) — real Postgres: an expense that names a load takes the load's unit, driver and trailer (company trailer,
 * customer trailer, or the load's "no trailer" choice) on the header AND its line; a different unit / driver / trailer is
 * refused by name and nothing is written. Every fixture lives in ONE transaction that is rolled back.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createExpenseInClientTx, type CreateExpenseBody } from "../expenses.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("an expense on a load carries the load's unit, driver and trailer (443.128 B, real Postgres)", () => {
  it("inherits from the load on header + line; refuses a different unit / driver / trailer by name; honours customer and no-trailer loads", async () => {
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
      const tag = `N1T${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, '443.128 N1 test', 'operating_carrier') RETURNING id::text AS id`, [tag])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, 'N1 tolls', 'Expense', '96601', true) RETURNING id::text AS id`, [opco])).id;
      const cat = (await one(`INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, $2, 'N1 category') RETURNING id::text AS id`, [opco, `N1C${tag.slice(-6)}`])).id;
      const item = (await one(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, 'N1 tolls', 'Service', $2, $3) RETURNING id::text AS id`, [opco, cat, account])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'N1 vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = async (n: string) => (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'None', $2, $3) RETURNING id::text AS id`, [opco, `${n}${tag}`, `55555${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`])).id;
      const loadDriver = await driver("Load");
      const otherDriver = await driver("Other");
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'N1 customer') RETURNING id::text AS id`, [opco])).id;
      const unit = async (n: string) => (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`, [`${tag}-${n}`, `V${n}${tag}`.slice(0, 17), opco])).id;
      const loadUnit = await unit("U1");
      const otherUnit = await unit("U2");
      const trailer = async (n: string) => (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-${n}`, opco])).id;
      const loadTrailer = await trailer("T1");
      const otherTrailer = await trailer("T2");
      let seq = 0;
      const mkLoad = async (source: "company" | "customer" | "none") => {
        const nonOwned = source === "customer"
          ? (await one(`INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id) VALUES ($1, $2, 'customer', $3) RETURNING id::text AS id`, [opco, `CUST-${tag}`, customer])).id
          : null;
        const id = (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id, trailer_source, non_owned_trailer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text AS id`,
          [opco, `7${String(Date.now()).slice(-8)}${seq++}`, customer, TEST_OWNER_USER_ID, trailerType, loadUnit, loadDriver, source, nonOwned]
        )).id;
        if (source === "company") {
          await db.query(`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id) VALUES ($1, $2, 'inline_quicksave_trailer', $3, $4)`, [opco, id, TEST_OWNER_USER_ID, loadTrailer]);
        }
        return { id, nonOwned };
      };
      const body = (loadId: string, over: Partial<CreateExpenseBody> = {}): CreateExpenseBody =>
        ({
          operating_company_id: opco, category_account_id: account, expense_date: "2026-10-12", amount_cents: 1250, vendor_uuid: vendor,
          memo: `N1 ${tag} ${seq++}`, is_company_expense: true, load_id: loadId, load_exemption_reason: null, item_id: item, ...over,
        }) as CreateExpenseBody;
      const read = async (expenseId: string) => one<{ driver: string | null; unit: string | null; trailer: string | null; non_owned: string | null; l_driver: string | null; l_unit: string | null; l_trailer: string | null }>(
        `SELECT e.driver_uuid::text AS driver, e.unit_id::text AS unit, e.trailer_id::text AS trailer, e.non_owned_trailer_id::text AS non_owned,
                el.driver_id::text AS l_driver, el.unit_id::text AS l_unit, el.trailer_id::text AS l_trailer
           FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id WHERE e.id = $1`, [expenseId]);
      const count = async () => Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM accounting.expenses WHERE operating_company_id = $1`, [opco])).n);

      // Company-trailer load: nothing supplied -> header and line take the load's unit, driver and trailer.
      const company = await mkLoad("company");
      const ok = (await createExpenseInClientTx(db, body(company.id), TEST_OWNER_USER_ID)) as { expense_id: string };
      expect(ok.expense_id, JSON.stringify(ok)).toBeTruthy();
      expect(await read(ok.expense_id)).toMatchObject({ driver: loadDriver, unit: loadUnit, trailer: loadTrailer, l_driver: loadDriver, l_unit: loadUnit, l_trailer: loadTrailer });

      // A different unit / driver / trailer is refused by name and writes nothing.
      const before = await count();
      expect(await createExpenseInClientTx(db, body(company.id, { unit_id: otherUnit }), TEST_OWNER_USER_ID)).toMatchObject({ loadAttributionMismatch: true, mismatch: "unit" });
      expect(await createExpenseInClientTx(db, body(company.id, { driver_id: otherDriver }), TEST_OWNER_USER_ID)).toMatchObject({ loadAttributionMismatch: true, mismatch: "driver" });
      expect(await createExpenseInClientTx(db, body(company.id, { trailer_id: otherTrailer }), TEST_OWNER_USER_ID)).toMatchObject({ loadAttributionMismatch: true, mismatch: "trailer" });
      expect(await count()).toBe(before);

      // Customer-trailer load: the expense carries the customer's trailer, no company trailer; a company trailer is refused.
      const cust = await mkLoad("customer");
      const okCust = (await createExpenseInClientTx(db, body(cust.id), TEST_OWNER_USER_ID)) as { expense_id: string };
      expect(await read(okCust.expense_id)).toMatchObject({ driver: loadDriver, unit: loadUnit, trailer: null, non_owned: cust.nonOwned });
      expect(await createExpenseInClientTx(db, body(cust.id, { trailer_id: loadTrailer }), TEST_OWNER_USER_ID)).toMatchObject({ mismatch: "trailer" });

      // "No trailer" load (bobtail / power only): no trailer on the expense; a supplied one is refused.
      const none = await mkLoad("none");
      const okNone = (await createExpenseInClientTx(db, body(none.id), TEST_OWNER_USER_ID)) as { expense_id: string };
      expect(await read(okNone.expense_id)).toMatchObject({ trailer: null, non_owned: null, l_trailer: null });
      expect(await createExpenseInClientTx(db, body(none.id, { trailer_id: loadTrailer }), TEST_OWNER_USER_ID)).toMatchObject({ mismatch: "trailer" });
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
