/**
 * ROUND 443.106 — real Postgres: the database refuses a broken document link, and a correctly-linked
 * row (the shape the load wizard / Settlement Creator / feed writers already produce) still commits.
 * Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("document links refused at DB (443.106, real Postgres)", () => {
  it("accepts linked driver bill + bill payment + matching expense line; refuses planted broken rows", async () => {
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
      const tag = `DL${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[] = []) =>
        (await db.query<T>(sql, params)).rows[0]!;

      const opco = (
        await one(
          `INSERT INTO org.companies (code, legal_name, company_type, enforce_line_categorization)
           VALUES ($1, '443.106 document links', 'operating_carrier', true) RETURNING id::text AS id`,
          [tag]
        )
      ).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);

      const customer = (
        await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'DL customer') RETURNING id::text AS id`, [
          opco,
        ])
      ).id;
      const vendor = (
        await one(
          `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'DL driver vendor', 'other') RETURNING id::text AS id`,
          [opco]
        )
      ).id;
      const driver = (
        await one(
          `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Doc', 'Links', '5555550199') RETURNING id::text AS id`,
          [opco]
        )
      ).id;
      const otherDriver = (
        await one(
          `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Other', 'Driver', '5555550188') RETURNING id::text AS id`,
          [opco]
        )
      ).id;
      const unit = (
        await one(
          `INSERT INTO mdata.units (unit_number, vin, owner_company_id, currently_leased_to_company_id, is_sample_data)
           VALUES ($1, $2, $3, $3, true) RETURNING id::text AS id`,
          [`${tag}-U1`, `${tag}VIN1`, opco]
        )
      ).id;
      const otherUnit = (
        await one(
          `INSERT INTO mdata.units (unit_number, vin, owner_company_id, currently_leased_to_company_id, is_sample_data)
           VALUES ($1, $2, $3, $3, true) RETURNING id::text AS id`,
          [`${tag}-U2`, `${tag}VIN2`, opco]
        )
      ).id;
      const load = (
        await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [opco, `${tag}1`, customer, TEST_OWNER_USER_ID, trailerType]
        )
      ).id;
      const account = (
        await one(
          `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
           VALUES ($1, 'DL expense', 'Expense', '96401') RETURNING id::text AS id`,
          [opco]
        )
      ).id;
      const cat = (
        await one(
          `INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'DLCAT', 'DL cat') RETURNING id::text AS id`,
          [opco]
        )
      ).id;
      const item = (
        await one(
          `INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id)
           VALUES ($1, 'DL fuel', 'Service', $2, $3) RETURNING id::text AS id`,
          [opco, cat, account]
        )
      ).id;

      const atSave = async (label: string, fn: () => Promise<unknown>) => {
        await db.query(`SAVEPOINT ${label}`);
        try {
          await fn();
          await db.query(`RELEASE SAVEPOINT ${label}`);
          return null;
        } catch (e) {
          await db.query(`ROLLBACK TO SAVEPOINT ${label}`);
          return e as Error;
        }
      };

      // --- Engine-shaped good writes still commit ---
      const goodBill = await atSave("good_bill", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, vendor_id, driver_id, load_id, unit_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $2::text, $3::uuid, $4::uuid, $5::uuid, $6, current_date, 1000, 10, 'unpaid')
           RETURNING id`,
          [opco, vendor, driver, load, unit, `${tag}-B-OK`]
        )
      );
      expect(goodBill).toBeNull();

      const billId = (
        await one<{ id: string }>(`SELECT id::text AS id FROM accounting.bills WHERE bill_number = $1`, [`${tag}-B-OK`])
      ).id;

      const goodPay = await atSave("good_pay", () =>
        db.query(
          `INSERT INTO accounting.bill_payments (
             operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method, vendor_id, status
           ) VALUES ($1::uuid, $2::uuid, current_date, 1000, 10, 'ach', $3, 'posted')`,
          [opco, billId, vendor]
        )
      );
      expect(goodPay).toBeNull();

      const expense = (
        await one(
          `INSERT INTO accounting.expenses (
             operating_company_id, transaction_date, total_amount_cents, status, posting_status,
             load_id, driver_uuid, unit_id, memo
           ) VALUES ($1::uuid, current_date, 500, 'draft', 'unposted', $2::uuid, $3::uuid, $4::uuid, '443.106 fuel')
           RETURNING id::text AS id`,
          [opco, load, driver, unit]
        )
      ).id;

      const goodLine = await atSave("good_line", () =>
        db.query(
          `INSERT INTO accounting.expense_lines (
             expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
             expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure,
             load_id, driver_id, unit_id
           ) VALUES ($1::uuid, 1, $2::uuid, 5, 500, 'fuel', $3::uuid, $4::uuid, 1, 500, 'each', $5::uuid, $6::uuid, $7::uuid)`,
          [expense, opco, account, item, load, driver, unit]
        )
      );
      expect(goodLine).toBeNull();

      // --- Planted broken rows are refused by name ---
      const noLoad = await atSave("no_load", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, driver_id, unit_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $3::uuid, $4::uuid, $5, current_date, 1000, 10, 'unpaid')`,
          [opco, vendor, driver, unit, `${tag}-B-NOLOAD`]
        )
      );
      expect(noLoad?.message).toMatch(/refuse_driver_bill_without_links/);
      expect(noLoad?.message).toMatch(/load/);

      const noVendorPay = await atSave("no_vendor_pay", () =>
        db.query(
          `INSERT INTO accounting.bill_payments (
             operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method, vendor_id, status
           ) VALUES ($1::uuid, $2::uuid, current_date, 1000, 10, 'ach', '', 'posted')`,
          [opco, billId]
        )
      );
      expect(noVendorPay?.message).toMatch(/refuse_bill_payment_without_vendor|null value in column "vendor_id"/i);

      const badAttr = await atSave("bad_attr", () =>
        db.query(
          `INSERT INTO accounting.expense_lines (
             expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
             expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure,
             load_id, driver_id, unit_id
           ) VALUES ($1::uuid, 2, $2::uuid, 5, 500, 'wrong driver', $3::uuid, $4::uuid, 1, 500, 'each', $5::uuid, $6::uuid, $7::uuid)`,
          [expense, opco, account, item, load, otherDriver, otherUnit]
        )
      );
      expect(badAttr?.message).toMatch(/refuse_expense_line_attr_mismatch/);

      // Voided driver bill is not judged (void-not-delete path stays open).
      const voidOk = await atSave("voided_bill", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, bill_number, bill_date, amount_cents, total_amount, status, voided_at, void_reason
           ) VALUES ($1::uuid, 'driver', $2, current_date, 1000, 10, 'void', now(), '443.106 planted void — skip link refusal')`,
          [opco, `${tag}-B-VOID`]
        )
      );
      expect(voidOk).toBeNull();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
