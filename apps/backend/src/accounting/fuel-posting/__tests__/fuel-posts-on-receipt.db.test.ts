/**
 * LEAD RULINGS 443.116 #1 — real Postgres: a card fill POSTS WHEN IT IS RECEIVED (import), through the ONE fill poster the
 * bank match uses; the bank match then only finds it (0 new postings); the Settlement Creator adopts the received receipt.
 * On the old code (FUEL_POSTS_ON_BANK_MATCH_ONLY) the import returned skipped_posts_on_bank_match for every fill — this
 * test fails there at the "posted" assertion.
 *
 * Fixtures are committed under an isolated company (the receipt poster runs on its own pooled transaction, like the
 * import does in production) — never the shared company, never production.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import {
  FUEL_POSTS_ON_RECEIPT_FLAG_KEY,
  maybePostFuelExpenseFromCanonicalTxn,
  type FuelTxnGlPostCandidate,
} from "../maybe-post-from-fuel-transaction.service.js";
import { postFuelFillOnBankMatch } from "../../bank-recon/bank-match-fuel-post.service.js";
import { findReceivedCardFillToAdopt } from "../../../driver-finance/creator-received-fill-adoption.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("fuel posts on receipt (443.116 #1, real Postgres)", () => {
  it("flag OFF: import posts nothing; ON: Dr fuel / Cr Dreamline payable + document on the load; re-import and bank match post 0; Creator adopts", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "FPR", legalNamePrefix: "443.116 fuel on receipt" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `FPR${Date.now().toString(36).toUpperCase()}`;
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    try {
      // ---- committed fixtures (isolated company) ---------------------------------------------------------------
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const newLoad = async (n: string) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType])).id;
      const load = await newLoad("L1");
      const otherLoad = await newLoad("L2");
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}U`, `${tag}VIN00000000`.slice(0, 17), opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Fpr', 'Driver', '5555550116') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, `${tag} Dreamline`])).id;
      const fuelAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '95000') RETURNING id::text AS id`, [opco, `${tag} Fuel & Diesel`])).id;
      const payable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '92510') RETURNING id::text AS id`, [opco, `${tag} Dreamline Diesel Card Payable`])).id;
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_dreamline', $2, true)`, [opco, payable]);
      const card = (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, 'DREAMLINE', 'Dreamline', true) RETURNING id::text AS id`, [opco])).id;
      const fill = (await one(
        `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, driver_id, unit_id, fuel_type, gallons, price_per_gallon,
           total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
         VALUES ($1, $2, $3, $4, $5, 'diesel', 50, 5, 250.00, now(), now(), '7116001', 'import', $6, $7, 'TX') RETURNING id::text AS id`,
        [opco, vendor, load, driver, unit, `${tag}-fill`, card])).id;
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), 'EXPENSE_GL_POSTING_ENABLED', $1, NULL, true, $2, now())`, [opco, TEST_OWNER_USER_ID]);
      await db.query("COMMIT");

      const candidate: FuelTxnGlPostCandidate = {
        operating_company_id: opco,
        actor_user_id: TEST_OWNER_USER_ID,
        fuel_transaction_id: fill,
        fuel_type: "diesel",
        transaction_at: new Date().toISOString(),
        amount_cents: 25000,
        driver_id: driver,
        location_state: "TX",
        gallons: 50,
        fuel_card_id: card,
        has_fuel_card: true,
      };
      const postingCount = async () =>
        Number((await one<{ n: string }>(
          `SELECT count(*)::text AS n FROM accounting.journal_entry_postings
            WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND source_transaction_id = $2`,
          [opco, fill])).n);

      // ---- flag OFF (default): the fill waits for its bank match ---------------------------------------------------
      expect(await maybePostFuelExpenseFromCanonicalTxn(candidate)).toEqual({ status: "skipped_posts_on_bank_match" });
      expect(await postingCount()).toBe(0);

      // ---- flag ON for this company: the fill posts when it is received ---------------------------------------------
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, true, $3, now())`, [FUEL_POSTS_ON_RECEIPT_FLAG_KEY, opco, TEST_OWNER_USER_ID]);
      const first = await maybePostFuelExpenseFromCanonicalTxn(candidate);
      expect(first.status).toBe("posted");
      const je = (first as { posting: { journal_entry_id: string } }).posting.journal_entry_id;
      const legs = (await db.query<{ account_id: string; dc: string; cents: string; load_id: string | null }>(
        `SELECT account_id::text, debit_or_credit AS dc, amount_cents::text AS cents, load_id::text
           FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid ORDER BY line_sequence`, [je])).rows;
      const debit = legs.filter((l) => l.dc === "debit").reduce((t, l) => t + Number(l.cents), 0);
      const credit = legs.filter((l) => l.dc === "credit").reduce((t, l) => t + Number(l.cents), 0);
      expect(debit).toBe(25000);
      expect(credit).toBe(25000);
      expect(legs.find((l) => l.dc === "debit")?.account_id).toBe(fuelAcct);
      expect(legs.find((l) => l.dc === "credit")?.account_id).toBe(payable);
      expect(legs.every((l) => l.load_id === load)).toBe(true);
      // The fill's expense document is on the load and adopts the SAME journal entry.
      const doc = await one<{ load_id: string | null; journal_entry_id: string | null; posting_status: string }>(
        `SELECT load_id::text, journal_entry_id::text, posting_status FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND source_fuel_transaction_id = $2::uuid AND voided_at IS NULL`, [opco, fill]);
      expect(doc).toMatchObject({ load_id: load, journal_entry_id: je, posting_status: "posted" });
      const marker = await db.query(
        `SELECT 1 FROM audit.audit_events WHERE event_class = 'fuel.posted_on_receipt' AND payload->>'journal_entry_id' = $1`, [je]);
      expect(marker.rows.length).toBe(1);
      const after = await postingCount();

      // ---- re-import: idempotent ------------------------------------------------------------------------------------
      const again = await maybePostFuelExpenseFromCanonicalTxn(candidate);
      expect(again.status).toBe("already_posted");
      expect(await postingCount()).toBe(after);

      // ---- the bank match only finds the posted fill: same entry, 0 new postings --------------------------------------
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const matched = await postFuelFillOnBankMatch(db as never, {
        operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: fill,
      });
      await db.query("COMMIT");
      expect(matched.result).toBe("already_posted");
      expect(matched.journal_entry_id).toBe(je);
      expect(await postingCount()).toBe(after);

      // ---- the Settlement Creator adopts the received receipt on its own load, never on another ---------------------
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const base = { operatingCompanyId: opco, vendorId: vendor, reference: "7116001", fuelType: "diesel" };
      expect(await findReceivedCardFillToAdopt(db as never, { ...base, loadId: load })).toBe(fill);
      expect(await findReceivedCardFillToAdopt(db as never, { ...base, loadId: otherLoad })).toBeNull();
      await db.query("ROLLBACK");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
