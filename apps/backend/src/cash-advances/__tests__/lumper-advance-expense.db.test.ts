/**
 * LEAD 443.128 A (G15 + BCF-06) — real Postgres: a lumper paid as a driver cash advance becomes the load's lumper expense
 * (driver / unit / trailer from the load; Dr the lumper item's account / Cr the account the advance debited, so the driver owes
 * nothing), and a billable lumper becomes a lumper line on a draft invoice for the load. Idempotent. Before 443.128 the
 * advance recorded "expense posting HOLD" and no expense, no invoice line existed (the second assertion block is the red).
 * Every fixture lives in ONE transaction that is rolled back.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createJournalEntryOnClient } from "../../accounting/journal-entries.service.js";
import { LUMPER_EXPENSE_ITEM_NAME, recordLumperAdvanceExpenseInClientTx } from "../lumper-advance-expense.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("a lumper paid by cash advance is the load's lumper expense + invoice line (443.128 A, real Postgres)", () => {
  it("expense on the load, Dr lumper / Cr the advance's own account, billable -> draft invoice lumper line, once", async () => {
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
      const tag = `LMP${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, '443.128 lumper test', 'operating_carrier') RETURNING id::text AS id`, [tag])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const acct = async (name: string, type: string, num: string) =>
        (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, $2, $3, $4, true) RETURNING id::text AS id`, [opco, name, type, num])).id;
      const lumperExpense = await acct("Lumper Expense", "Expense", "95310");
      const lumperIncome = await acct("Lumper Income", "Income", "94230");
      const driverAdvance = await acct("Driver Cash Advance", "Asset", "91245");
      const clearing = await acct("Driver Net-Pay Clearing", "Liability", "92170");
      await db.query(`INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side) VALUES ($1, 'revenue', 'lumper', $2, 'credit')`, [opco, lumperIncome]);
      const cat = (await one(`INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, $2, 'Lumper') RETURNING id::text AS id`, [opco, `L${tag.slice(-6)}`])).id;
      const expenseItem = (await one(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, $2, 'Service', $3, $4) RETURNING id::text AS id`, [opco, LUMPER_EXPENSE_ITEM_NAME, cat, lumperExpense])).id;
      const incomeItem = (await one(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_income_account_id) VALUES ($1, 'Warehouse-Lumper Fee', 'Service', $2, $3) RETURNING id::text AS id`, [opco, cat, lumperIncome])).id;
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('EXPENSE_GL_POSTING_ENABLED', $1::uuid, $2::uuid, true, $2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [opco, TEST_OWNER_USER_ID]
      );
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Lumper', $2, '5555550128') RETURNING id::text AS id`, [opco, tag])).id;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name, lumper_billing_mode) VALUES ($1, 'Lumper customer', 'itemized') RETURNING id::text AS id`, [opco])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`, [`${tag}-U`, `V${tag}`.slice(0, 17), opco])).id;
      const trailer = (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-T`, opco])).id;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id, trailer_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'company') RETURNING id::text AS id`,
        [opco, `6${String(Date.now()).slice(-9)}`, customer, TEST_OWNER_USER_ID, trailerType, unit, driver]
      )).id;
      await db.query(`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id) VALUES ($1, $2, 'inline_quicksave_trailer', $3, $4)`, [opco, load, TEST_OWNER_USER_ID, trailer]);
      await db.query(`INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, city, state, lumper_required, lumper_amount_cents, lumper_billable) VALUES ($1, 1, 'pickup', 'Laredo', 'TX', false, 0, NULL), ($1, 2, 'delivery', 'Dallas', 'TX', false, 18500, true)`, [load]);
      const liability = (await one(`INSERT INTO driver_finance.driver_liabilities (operating_company_id, driver_id, type, source_description, original_amount, current_balance) VALUES ($1, $2, 'advance', 'lumper', 185.00, 0) RETURNING id::text AS id`, [opco, driver])).id;
      const advance = (await one(
        `INSERT INTO driver_finance.driver_advances (operating_company_id, display_id, driver_id, liability_id, amount, purpose, disbursement_method, disbursement_status, recipient_type, created_by_user_id, status, outstanding_balance, load_id, posting_date)
         VALUES ($1, $2, $3, $4, 185.00, 'lumper', 'ach', 'disbursed', 'driver', $5, 'outstanding', 0, $6, CURRENT_DATE) RETURNING id::text AS id`,
        [opco, `CA-${tag}`, driver, liability, TEST_OWNER_USER_ID, load]
      )).id;
      // The disbursement's own posting (what postSourceTransaction 'driver_advance' writes): Dr the driver's advance / Cr clearing.
      await createJournalEntryOnClient(db as never, {
        operating_company_id: opco, entry_date: new Date().toISOString().slice(0, 10), memo: `advance ${tag}`, source: "auto",
        postings: [
          { account_id: driverAdvance, debit_or_credit: "debit", amount_cents: 18500, description: "advance", source_transaction_type: "driver_advance", source_transaction_id: advance },
          { account_id: clearing, debit_or_credit: "credit", amount_cents: 18500, description: "advance", source_transaction_type: "driver_advance", source_transaction_id: advance },
        ],
      } as never, { userId: TEST_OWNER_USER_ID, role: "Owner" });

      // Before 443.128: nothing booked the lumper — no expense, no invoice line (the red).
      const expensesOnLoad = async () => Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM accounting.expenses WHERE load_id = $1 AND voided_at IS NULL`, [load])).n);
      expect(await expensesOnLoad()).toBe(0);

      const r = await recordLumperAdvanceExpenseInClientTx(db, { operatingCompanyId: opco, advanceId: advance, actorUserId: TEST_OWNER_USER_ID });
      expect(r, JSON.stringify(r)).toMatchObject({ recorded: true, billable: true });
      if (!r.recorded) throw new Error("not recorded");
      const exp = await one<{ driver: string | null; unit: string | null; trailer: string | null; total: string; billable: string | null; l_item: string | null }>(
        `SELECT e.driver_uuid::text AS driver, e.unit_id::text AS unit, e.trailer_id::text AS trailer, e.total_amount_cents::text AS total,
                el.billable_customer_uuid::text AS billable, el.item_id::text AS l_item
           FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id WHERE e.id = $1`, [r.expense_id]);
      expect(exp).toMatchObject({ driver, unit, trailer, total: "18500", billable: customer, l_item: expenseItem });
      // Posted: Dr lumper expense / Cr the driver's advance account — the advance is consumed by the expense.
      expect(r.journal_entry_id).toBeTruthy();
      const legs = (await db.query<{ account_id: string; side: string; cents: string }>(
        `SELECT account_id::text, debit_or_credit AS side, amount_cents::text AS cents FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1 ORDER BY debit_or_credit`, [r.journal_entry_id])).rows;
      expect(legs).toEqual([{ account_id: driverAdvance, side: "credit", cents: "18500" }, { account_id: lumperExpense, side: "debit", cents: "18500" }]);
      const advanceBalance = Number((await one<{ v: string }>(
        `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS v FROM accounting.journal_entry_postings WHERE account_id = $1`, [driverAdvance])).v);
      expect(advanceBalance).toBe(0);
      // Billable -> a lumper line on a DRAFT invoice for this load and customer, on the lumper income account.
      const inv = await one<{ status: string; customer: string; load: string; line_type: string; cents: string; account: string; item: string | null }>(
        `SELECT i.status::text AS status, i.customer_id::text AS customer, i.source_load_id::text AS load, il.line_type::text AS line_type,
                il.line_total_cents::text AS cents, il.account_id::text AS account, il.item_id::text AS item
           FROM accounting.invoices i JOIN accounting.invoice_lines il ON il.invoice_id = i.id WHERE il.id = $1`, [r.invoice_line_id]);
      expect(inv).toMatchObject({ status: "draft", customer, load, line_type: "lumper", cents: "18500", account: lumperIncome, item: incomeItem });

      // Once: the same advance again records nothing.
      expect(await recordLumperAdvanceExpenseInClientTx(db, { operatingCompanyId: opco, advanceId: advance, actorUserId: TEST_OWNER_USER_ID })).toMatchObject({ recorded: false, reason: "already_recorded" });
      expect(await expensesOnLoad()).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
