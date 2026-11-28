/**
 * SCENTSX B11 — ScentsX's books run end to end on the shared engine (migration 202616950100): an invoice posts A/R and
 * revenue, the customer's payment lands in Operating Checking and clears A/R, a rent bill posts expense and A/P, the bill
 * payment leaves Operating Checking and clears A/P. Every line is on ScentsX's own accounts; debits = credits.
 * Real Postgres, rolled back. Uses the engine's own writers (recordCustomerPaymentInClientTx, postInvoiceGlIfEnabled,
 * postSourceTransactionInClientTx) — no GL math here.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { postInvoiceGlIfEnabled } from "../accounting/invoice-gl.service.js";
import { recordCustomerPaymentInClientTx } from "../accounting/payment-writer.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";

describe("ScentsX books end to end (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const lines = async (type: string, id: string) =>
    (await db.query<{ num: string; side: string; cents: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND p.source_transaction_type = $2 AND p.source_transaction_id = $3 ORDER BY p.debit_or_credit DESC, a.account_number`,
      [co, type, id]
    )).rows.map((r) => [r.side, r.num, Number(r.cents)]);

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    // Precondition (same pattern as driver-reimbursement-idempotent.db.test.ts): 202616950100 turns the money flags ON for
    // SCENTSX only when an Owner user exists — prod has one, a fresh CI database does not — so the test sets the per-entity
    // overrides the posting chain reads, inside its rolled-back transaction.
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f
        WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED", "INVOICE_AR_GL_POSTING_ENABLED", "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED", "BILL_PAYMENT_GL_POSTING_ENABLED"]]
    );
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("the books are set up: bank, lists and posting flags exist for ScentsX only", async () => {
    const r = await db.query<{ banks: number; terms: number; methods: number; reasons: number; vtypes: number; cats: number; items: number; bank_role: string | null }>(
      `SELECT (SELECT count(*)::int FROM banking.bank_accounts WHERE operating_company_id = $1::uuid) banks,
              (SELECT count(*)::int FROM catalogs.payment_terms WHERE operating_company_id = $1::uuid) terms,
              (SELECT count(*)::int FROM catalogs.payment_methods WHERE operating_company_id = $1::uuid) methods,
              (SELECT count(*)::int FROM catalogs.void_cancel_reasons WHERE operating_company_id = $1::uuid) reasons,
              (SELECT count(*)::int FROM catalogs.vendor_types WHERE operating_company_id = $1::uuid) vtypes,
              (SELECT count(*)::int FROM catalogs.expense_categories WHERE operating_company_id = $1::uuid) cats,
              (SELECT count(*)::int FROM catalogs.items WHERE operating_company_id = $1::uuid) items,
              (SELECT a.account_number FROM accounting.chart_of_accounts_roles x JOIN catalogs.accounts a ON a.id = x.account_id
                WHERE x.operating_company_id = $1::uuid AND x.role = 'operating_bank' AND x.is_active) bank_role`, [co]
    );
    expect(r.rows[0]).toMatchObject({ banks: 4, terms: 6, methods: 9, vtypes: 10, cats: 20, items: 9 + 18 + 1, /* 9 sale items + migration 202617270100: one expense item per expense category (20 less freight-in and customs) + Supplier deposit */ bank_role: "1000" });
  });

  it("invoice → payment → bill → bill payment post on ScentsX's accounts and net A/R and A/P to zero", async () => {
    const u = TEST_OWNER_USER_ID;
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Books test buyer', $1::uuid, false) RETURNING id::text`, [co]
    );
    const inv = await createExpandedInvoice(db as never, { operatingCompanyId: co, userId: u, invoiceType: "manual", customerId: cust.rows[0]!.id,
      billToEntityType: "customer", billToEntityId: cust.rows[0]!.id });
    await createInvoiceLineInClientTx(db, { operatingCompanyId: co, invoiceId: inv.id, line_type: "other", description: "Test EDP 100ml",
      quantity: 10, unit_amount_cents: 2500, account_id: await acct("4000") }, u);
    // The draft is issued (the Invoices page "Send" / bulk mark-sent does exactly this), then the engine posts it.
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now() WHERE id = $1::uuid`, [inv.id]);
    const posted = await postInvoiceGlIfEnabled(db, co, inv.id, { userId: u });
    expect(posted).toMatchObject({ posted: true });
    expect(await lines("invoice", inv.id)).toEqual([["debit", "1100", 25000], ["credit", "4000", 25000]]);

    const pay = await recordCustomerPaymentInClientTx(db, {
      row: { operating_company_id: co, customer_id: cust.rows[0]!.id, payment_method: "check", payment_date: new Date().toISOString().slice(0, 10),
        reference: "CHK 1001", amount_cents: 25000, deposited_to_account_id: await acct("1000"), notes: null, created_by_user_id: u, is_sample_data: false },
      applications: [{ invoice_id: inv.id, amount_cents: 25000 }],
      validate_application: async () => null,
      skip_context: {},
      audit: { action: "accounting.payment.create", module: "accounting" },
      spine: { event_type: "payment.recorded" as never, entity_type: "payment" },
    } as never);
    const payId = (pay as { payment?: { id: string } }).payment?.id ?? (await db.query<{ id: string }>(
      `SELECT id::text FROM accounting.payments WHERE operating_company_id = $1::uuid AND reference = 'CHK 1001'`, [co])).rows[0]!.id;
    expect(await lines("customer_payment", payId)).toEqual([["debit", "1000", 25000], ["credit", "1100", 25000]]);

    const bill = await db.query<{ id: string }>(
      `INSERT INTO accounting.bills (operating_company_id, bill_date, status, amount_cents, total_amount, bill_number)
       VALUES ($1::uuid, CURRENT_DATE, 'unpaid', 120000, 1200.00, 'SX-RENT-TEST') RETURNING id::text`, [co]
    );
    await db.query(
      `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, category_kind, category_code) VALUES ($1::uuid, 1, 1200.00, 'Warehouse rent', 'other', 'RENT')`,
      [bill.rows[0]!.id]
    );
    await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill", source_transaction_id: bill.rows[0]!.id }, { userId: u });
    expect(await lines("bill", bill.rows[0]!.id)).toEqual([["debit", "6000", 120000], ["credit", "2000", 120000]]);

    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000'`, [co]
    )).rows[0]!.id;
    const bp = await db.query<{ id: string }>(
      `INSERT INTO accounting.bill_payments (operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount, payment_method, from_bank_account_id, status, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, 'SX-LANDLORD', CURRENT_DATE, 120000, 1200.00, 'ach', $3::uuid, 'posted', $4::uuid) RETURNING id::text`,
      [co, bill.rows[0]!.id, bank, u]
    );
    await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill_payment", source_transaction_id: bp.rows[0]!.id }, { userId: u });
    expect(await lines("bill_payment", bp.rows[0]!.id)).toEqual([["debit", "2000", 120000], ["credit", "1000", 120000]]);

    const tb = await db.query<{ dr: string; cr: string; ar: string; ap: string }>(
      `SELECT sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::text dr,
              sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)::text cr,
              sum(CASE WHEN a.account_number = '1100' THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END ELSE 0 END)::text ar,
              sum(CASE WHEN a.account_number = '2000' THEN CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END ELSE 0 END)::text ap
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND p.source_transaction_id = ANY ($2::text[])`,
      [co, [inv.id, payId, bill.rows[0]!.id, bp.rows[0]!.id]]
    );
    expect(tb.rows[0]).toMatchObject({ dr: "290000", cr: "290000", ar: "0", ap: "0" });
  });
});
