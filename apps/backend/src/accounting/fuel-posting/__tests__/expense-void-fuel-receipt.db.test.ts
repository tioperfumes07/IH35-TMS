/**
 * ACCT-F4431310 — real Postgres: voiding a fuel RECEIPT expense document (443.116 / 443.121: the fill posted on receipt
 * under source 'fuel_event', the document adopting that entry) reverses that entry and releases the receipt identity.
 * On the old code every expense void reversed only 'expense'-sourced postings and swallowed SOURCE_NOT_FOUND, so the
 * document went void with its journal entry LIVE — this test fails there at "net 0".
 * (The refusal path — a reversal error propagates and nothing is stamped — is unit-tested in expense-void-reversal.test.ts.)
 *
 * Fixtures are committed under an isolated company (the receipt poster runs on its own pooled transaction).
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
import { voidDocument } from "../../void-document.service.js";
import { resolveExpenseDocumentLivePostings } from "../../expense-void-reversal.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("voiding a fuel receipt expense reverses its posting (ACCT-F4431310, real Postgres)", () => {
  it("void -> the fuel_event entry nets to 0, receipt identity released, document void; a second void finds nothing live", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "FVR", legalNamePrefix: "fuel receipt void" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `FVR${Date.now().toString(36).toUpperCase()}`;
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
         VALUES ($1, $2, $3, $4, $5, 'diesel', 50, 5, 250.00, now(), now(), '7131001', 'import', $6, $7, 'TX') RETURNING id::text AS id`,
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
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, true, $3, now())`, [FUEL_POSTS_ON_RECEIPT_FLAG_KEY, opco, TEST_OWNER_USER_ID]);
      const posted = await maybePostFuelExpenseFromCanonicalTxn(candidate);
      expect(posted.status).toBe("posted");
      const je = (posted as { posting: { journal_entry_id: string } }).posting.journal_entry_id;
      const doc = await one<{ id: string; journal_entry_id: string | null }>(
        `SELECT id::text, journal_entry_id::text FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND source_fuel_transaction_id = $2::uuid AND voided_at IS NULL`, [opco, fill]);
      expect(doc.journal_entry_id).toBe(je);
      const net = async () => Number((await one<{ n: string }>(
        `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END) FILTER (WHERE account_id = $3::uuid), 0)::text AS n
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND source_transaction_id = $2`,
        [opco, fill, fuelAcct])).n);
      expect(await net()).toBe(25000);
      const liveReceipt = async () => Number((await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM fuel.fuel_receipt_postings rp JOIN accounting.journal_entry_postings p ON p.posting_batch_id = rp.posting_batch_id
          WHERE rp.operating_company_id = $1::uuid AND rp.released_at IS NULL AND p.journal_entry_uuid = $2::uuid`, [opco, je])).n);
      expect(await liveReceipt()).toBeGreaterThan(0);

      // ---- the document has NO 'expense' lines: only the receipt's fuel_event entry is live -----------------------------
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      expect(await resolveExpenseDocumentLivePostings(db as never, opco, doc.id)).toEqual({ expense_source_live: false, fuel_event_sources: [fill] });

      // ---- void through the shared door: the fuel_event entry is reversed, identity released ----------------------------
      const result = await voidDocument(db as never, {
        operatingCompanyId: opco, type: "expense", id: doc.id, reason: "ACCT-F4431310 test void",
        actor: { userId: TEST_OWNER_USER_ID }, currentBusinessDate: new Date().toISOString().slice(0, 10),
      });
      expect(result.reversalJournalEntryId).toBeTruthy();
      await db.query("COMMIT");
      expect(await net()).toBe(0);
      expect(await liveReceipt()).toBe(0);
      const voided = await one<{ voided_at: string | null }>(`SELECT voided_at::text FROM accounting.expenses WHERE id = $1::uuid`, [doc.id]);
      expect(voided.voided_at).toBeTruthy();

      // ---- a second void finds nothing live to reverse (no second reversal) ----------------------------------------------
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      expect(await resolveExpenseDocumentLivePostings(db as never, opco, doc.id)).toEqual({ expense_source_live: false, fuel_event_sources: [] });
      await db.query("ROLLBACK");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
