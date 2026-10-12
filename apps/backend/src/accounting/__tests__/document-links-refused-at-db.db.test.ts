/**
 * ROUND 443.106 + DEGH-05 / 443.131 — real Postgres: the database refuses a broken document link,
 * and a correctly-linked row (the shape the load wizard / Settlement Creator / feed writers already
 * produce) still commits. DEGH-05 finishes the trailer clause (trailer_id OR non_owned_trailer_id OR
 * load.trailer_source='none') and compares expense-line driver/unit even when the header is NULL.
 *
 * Fails on old code: with the pre-DEGH-05 refuse_driver_bill_without_links body, a driver bill without
 * trailer commits; after 202615891200, the same INSERT is refused by name. Every fixture lives in ONE
 * transaction that is rolled back — nothing is left behind.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TRAILER_MIGRATION = join(ROOT, "db/migrations/202615891200_driver_bill_trailer_clause.sql");

/** Pre-DEGH-05 body (443.106) — vendor/driver/load/unit only; no trailer. */
const OLD_REFUSE_DRIVER_BILL = `
CREATE OR REPLACE FUNCTION accounting.refuse_driver_bill_without_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE
  missing text[] := ARRAY[]::text[];
  bill_label text;
  load_born boolean;
BEGIN
  IF NEW.voided_at IS NOT NULL THEN RETURN NEW; END IF;
  load_born := (NEW.bill_category = 'driver') OR (NEW.load_id IS NOT NULL);
  IF NOT load_born THEN RETURN NEW; END IF;
  IF NEW.mdata_vendor_id IS NULL AND NULLIF(btrim(COALESCE(NEW.vendor_id, '')), '') IS NULL THEN
    missing := array_append(missing, 'vendor');
  END IF;
  IF NEW.driver_id IS NULL THEN missing := array_append(missing, 'driver'); END IF;
  IF NEW.load_id IS NULL THEN missing := array_append(missing, 'load'); END IF;
  IF NEW.unit_id IS NULL THEN missing := array_append(missing, 'unit'); END IF;
  IF coalesce(array_length(missing, 1), 0) = 0 THEN RETURN NEW; END IF;
  bill_label := COALESCE(NULLIF(btrim(COALESCE(NEW.bill_number, '')), ''), NEW.id::text);
  RAISE EXCEPTION 'refuse_driver_bill_without_links: bill % is a live driver/load-born bill but is missing % — every driver bill carries vendor, driver, load and unit (ROUND 443.106)',
    bill_label, array_to_string(missing, ', ')
    USING ERRCODE = 'check_violation';
END;
$fn$;
`;

const OLD_REFUSE_EXPENSE_LINE = `
CREATE OR REPLACE FUNCTION accounting.refuse_expense_line_attr_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE
  h record;
  v_number text;
  missing text[] := ARRAY[]::text[];
BEGIN
  SELECT e.load_id, e.driver_uuid, e.unit_id, e.voided_at, e.expense_number
    INTO h FROM accounting.expenses e WHERE e.id = NEW.expense_id;
  IF NOT FOUND OR h.voided_at IS NOT NULL OR h.load_id IS NULL THEN RETURN NEW; END IF;
  IF h.driver_uuid IS NOT NULL AND NEW.driver_id IS DISTINCT FROM h.driver_uuid THEN
    missing := array_append(missing, 'driver');
  END IF;
  IF h.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM h.unit_id THEN
    missing := array_append(missing, 'unit');
  END IF;
  IF coalesce(array_length(missing, 1), 0) = 0 THEN RETURN NEW; END IF;
  v_number := COALESCE(h.expense_number, NEW.expense_id::text);
  RAISE EXCEPTION 'refuse_expense_line_attr_mismatch: expense % line % attribution (%) does not match its load-bearing header — driver/unit on the line must match the header (ROUND 443.106)',
    v_number, NEW.line_sequence, array_to_string(missing, ', ')
    USING ERRCODE = 'check_violation';
END;
$fn$;
`;

describeIntegration("document links refused at DB (443.106 + DEGH-05, real Postgres)", () => {
  it("accepts linked driver bill + bill payment + matching expense line; refuses planted broken rows; trailer clause fails on old code", async () => {
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
           VALUES ($1, '443.131 document links', 'operating_carrier', true) RETURNING id::text AS id`,
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
      const trailer = (
        await one(
          `INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id, is_sample_data)
           VALUES ($1, 'DryVan', $2::uuid, true) RETURNING id::text AS id`,
          [`${tag}-T1`, opco]
        )
      ).id;
      const load = (
        await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, trailer_source)
           VALUES ($1, $2, $3, $4, $5, 'company') RETURNING id::text AS id`,
          [opco, `${tag}1`, customer, TEST_OWNER_USER_ID, trailerType]
        )
      ).id;
      const bobtailLoad = (
        await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, trailer_source)
           VALUES ($1, $2, $3, $4, $5, 'none') RETURNING id::text AS id`,
          [opco, `${tag}2`, customer, TEST_OWNER_USER_ID, trailerType]
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

      // --- DEGH-05 fail-on-old: plant 443.106 body → bill without trailer commits ---
      await db.query(OLD_REFUSE_DRIVER_BILL);
      await db.query(OLD_REFUSE_EXPENSE_LINE);
      const oldAcceptsNoTrailer = await atSave("old_no_trailer", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, vendor_id, driver_id, load_id, unit_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $2::text, $3::uuid, $4::uuid, $5::uuid, $6, current_date, 1000, 10, 'unpaid')`,
          [opco, vendor, driver, load, unit, `${tag}-B-OLD`]
        )
      );
      expect(oldAcceptsNoTrailer, "pre-DEGH-05 body must accept a driver bill without trailer").toBeNull();

      const nullHeaderOld = await atSave("old_null_hdr", async () => {
        const exp = (
          await one(
            `INSERT INTO accounting.expenses (
               operating_company_id, transaction_date, total_amount_cents, status, posting_status,
               load_id, driver_uuid, unit_id, memo
             ) VALUES ($1::uuid, current_date, 500, 'draft', 'unposted', $2::uuid, NULL, NULL, 'old null hdr')
             RETURNING id::text AS id`,
            [opco, load]
          )
        ).id;
        await db.query(
          `INSERT INTO accounting.expense_lines (
             expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
             expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure,
             load_id, driver_id, unit_id
           ) VALUES ($1::uuid, 1, $2::uuid, 5, 500, 'line has driver', $3::uuid, $4::uuid, 1, 500, 'each', $5::uuid, $6::uuid, $7::uuid)`,
          [exp, opco, account, item, load, driver, unit]
        );
      });
      expect(nullHeaderOld, "pre-DEGH-05 body must accept line driver when header driver is NULL").toBeNull();

      // --- Apply DEGH-05 migration in this transaction ---
      const migSql = readFileSync(TRAILER_MIGRATION, "utf8")
        .replace(/^BEGIN;\s*/i, "")
        .replace(/\s*COMMIT;\s*$/i, "");
      await db.query(migSql);

      // Same shape without trailer now refuses
      const noTrailer = await atSave("no_trailer", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, vendor_id, driver_id, load_id, unit_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $2::text, $3::uuid, $4::uuid, $5::uuid, $6, current_date, 1000, 10, 'unpaid')`,
          [opco, vendor, driver, load, unit, `${tag}-B-NOTR`]
        )
      );
      expect(noTrailer?.message).toMatch(/refuse_driver_bill_without_links/);
      expect(noTrailer?.message).toMatch(/trailer/);

      // Engine-shaped good write with company trailer still commits
      const goodBill = await atSave("good_bill", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, vendor_id, driver_id, load_id, unit_id, trailer_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $2::text, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, current_date, 1000, 10, 'unpaid')
           RETURNING id`,
          [opco, vendor, driver, load, unit, trailer, `${tag}-B-OK`]
        )
      );
      expect(goodBill).toBeNull();

      // Explicit no-trailer load allows NULL trailer_id / non_owned_trailer_id
      const bobtailBill = await atSave("bobtail_bill", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, mdata_vendor_id, vendor_id, driver_id, load_id, unit_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $2::text, $3::uuid, $4::uuid, $5::uuid, $6, current_date, 1000, 10, 'unpaid')`,
          [opco, vendor, driver, bobtailLoad, unit, `${tag}-B-NONE`]
        )
      );
      expect(bobtailBill).toBeNull();

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
           ) VALUES ($1::uuid, current_date, 500, 'draft', 'unposted', $2::uuid, $3::uuid, $4::uuid, '443.131 fuel')
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
             operating_company_id, bill_category, mdata_vendor_id, driver_id, unit_id, trailer_id,
             bill_number, bill_date, amount_cents, total_amount, status
           ) VALUES ($1::uuid, 'driver', $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, current_date, 1000, 10, 'unpaid')`,
          [opco, vendor, driver, unit, trailer, `${tag}-B-NOLOAD`]
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

      // Null header vs set line refuses after DEGH-05
      const nullHdrExp = (
        await one(
          `INSERT INTO accounting.expenses (
             operating_company_id, transaction_date, total_amount_cents, status, posting_status,
             load_id, driver_uuid, unit_id, memo
           ) VALUES ($1::uuid, current_date, 500, 'draft', 'unposted', $2::uuid, NULL, NULL, 'null hdr')
           RETURNING id::text AS id`,
          [opco, load]
        )
      ).id;
      const nullHdrMismatch = await atSave("null_hdr_line", () =>
        db.query(
          `INSERT INTO accounting.expense_lines (
             expense_id, line_sequence, operating_company_id, amount, amount_cents, description,
             expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure,
             load_id, driver_id, unit_id
           ) VALUES ($1::uuid, 1, $2::uuid, 5, 500, 'line has driver', $3::uuid, $4::uuid, 1, 500, 'each', $5::uuid, $6::uuid, $7::uuid)`,
          [nullHdrExp, opco, account, item, load, driver, unit]
        )
      );
      expect(nullHdrMismatch?.message).toMatch(/refuse_expense_line_attr_mismatch/);

      // Voided driver bill is not judged (void-not-delete path stays open).
      const voidOk = await atSave("voided_bill", () =>
        db.query(
          `INSERT INTO accounting.bills (
             operating_company_id, bill_category, bill_number, bill_date, amount_cents, total_amount, status, voided_at, void_reason
           ) VALUES ($1::uuid, 'driver', $2, current_date, 1000, 10, 'void', now(), '443.131 planted void — skip link refusal')`,
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
