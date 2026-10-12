/**
 * LEAD 443.121 #1 — real Postgres: ONE fuel receipt identity across every fuel writer. The Settlement Creator posts a
 * Dreamline fill's expense document under source 'expense'; the card bank line's match then used to look only for a
 * 'fuel_event' posting and posted the SAME receipt again. Now: the match finds the receipt's live posting (any writer) and
 * posts 0; the database refuses a second live posting batch for the receipt (fuel_receipt_already_posted); a reversal frees
 * the receipt so a correction can post. On the old code the bank match returns "posted" (a second entry) — this test
 * fails there at the "already_posted" assertion.
 *
 * Fixtures are committed under an isolated company — never the shared company, never production.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { postFuelFillOnBankMatch } from "../../bank-recon/bank-match-fuel-post.service.js";
import { findPostedFuelReceipt } from "../poster.service.js";
import { createExpenseFromFuelTransaction } from "../../../fuel/fuel-expense-document.service.js";
import { postSourceTransactionInClientTx } from "../../posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("one fuel receipt identity (443.121 #1, real Postgres)", () => {
  it("Creator expense posting then bank match -> 0 new postings; DB refuses a second live posting; reversal frees the receipt", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "FRI", legalNamePrefix: "443.121 fuel receipt identity" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `FRI${Date.now().toString(36).toUpperCase()}`;
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
         VALUES ($1, $2, $3, $4, $5, 'diesel', 50, 5, 250.00, now(), now(), '7121001', 'import', $6, $7, 'TX') RETURNING id::text AS id`,
        [opco, vendor, load, driver, unit, `${tag}-fill`, card])).id;
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at)
         VALUES (gen_random_uuid(), 'EXPENSE_GL_POSTING_ENABLED', $1, NULL, true, $2, now())`, [opco, TEST_OWNER_USER_ID]);
      await db.query("COMMIT");

      const scope = async () => {
        await db.query("BEGIN");
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      };
      const livePostingsOfFill = async () =>
        Number((await one<{ n: string }>(
          `SELECT count(*)::text AS n FROM accounting.journal_entry_postings p
             JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
            WHERE p.operating_company_id = $1::uuid AND j.reversed_by_je_id IS NULL AND j.reverses_je_id IS NULL
              AND ((p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = $2)
                OR (p.source_transaction_type = 'expense' AND p.source_transaction_id IN (
                      SELECT e.id::text FROM accounting.expenses e WHERE e.source_fuel_transaction_id = $2::uuid)))`,
          [opco, fill])).n);

      // ---- the Settlement Creator path: the fill's expense document, posted under source 'expense' ------------------
      await scope();
      const doc = await createExpenseFromFuelTransaction(db as never, {
        operating_company_id: opco,
        fuel_transaction_id: fill,
        requesting_user_uuid: TEST_OWNER_USER_ID,
        company_direct_credit: "dreamline_card_payable",
        creator_manual_entry: true,
      } as never);
      expect(["created", "already_exists"]).toContain(doc.outcome);
      const expenseId = (doc as { expense_id: string }).expense_id;
      const creatorPosting = await postSourceTransactionInClientTx(
        db as never,
        { operating_company_id: opco, source_transaction_type: "expense", source_transaction_id: expenseId },
        { userId: TEST_OWNER_USER_ID },
      );
      expect(creatorPosting.journal_entry_id).toBeTruthy();
      await db.query("COMMIT");
      const afterCreator = await livePostingsOfFill();
      expect(afterCreator).toBeGreaterThan(0);

      // ---- the card bank line is matched: it finds the receipt's posting (any writer) and posts NOTHING ------------
      await scope();
      const matched = await postFuelFillOnBankMatch(db as never, {
        operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: fill,
      });
      await db.query("COMMIT");
      expect(matched.result).toBe("already_posted");
      expect(matched.journal_entry_id).toBe(creatorPosting.journal_entry_id);
      expect(await livePostingsOfFill()).toBe(afterCreator);

      // ---- the import / Creator adopt the same identity: an expense document of the fill and the fill itself are ONE receipt
      await scope();
      const viaExpense = await findPostedFuelReceipt(db as never, opco, "expense", expenseId);
      const viaFill = await findPostedFuelReceipt(db as never, opco, "fuel_event", fill);
      expect(viaExpense?.journal_entry_id).toBe(creatorPosting.journal_entry_id);
      expect(viaFill?.journal_entry_id).toBe(creatorPosting.journal_entry_id);
      await db.query("ROLLBACK");

      // ---- a writer that forgets to ask is refused by the DATABASE ------------------------------------------------
      await scope();
      let refused: { code?: string; message?: string } | null = null;
      try {
        await db.query(
          `INSERT INTO accounting.posting_batches (operating_company_id, batch_status, source_transaction_type, source_transaction_id, idempotency_key, created_by_user_id)
           VALUES ($1::uuid, 'in_progress', 'fuel_event', $2, $3, $4::uuid)`,
          [opco, fill, `${tag}-forgot`, TEST_OWNER_USER_ID]);
      } catch (err) {
        refused = err as { code?: string; message?: string };
      }
      await db.query("ROLLBACK");
      expect(refused?.code).toBe("23505");
      expect(refused?.message ?? "").toMatch(/fuel_receipt_already_posted/);

      // ---- a reversal frees the receipt: a correction may post again --------------------------------------------
      await scope();
      await db.query(
        `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo, status, source, created_by_user_id, reverses_je_id)
         VALUES ($1::uuid, CURRENT_DATE, $2, 'posted', 'auto', $3::uuid, $4::uuid)`,
        [opco, `${tag} reversal`, TEST_OWNER_USER_ID, creatorPosting.journal_entry_id]);
      const freed = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM fuel.fuel_receipt_postings WHERE operating_company_id = $1::uuid AND released_at IS NULL`, [opco]);
      expect(Number(freed.n)).toBe(0);
      expect(await findPostedFuelReceipt(db as never, opco, "fuel_event", fill)).toBeNull();
      await db.query("ROLLBACK");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 90_000);
});
