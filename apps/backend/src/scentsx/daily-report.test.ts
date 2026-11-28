/**
 * ROUND L.31 M8 — the day's transactions + end-of-shift drawer count, on ScentsX, real Postgres, rolled back. A $100.00 cash sale
 * (invoice Dr 1100 / Cr 4000, then the cash Dr 1010 Store Cash Registers / Cr 1100) shows in the day's report with sales +10000 and
 * money in +10000 (plus the A/R legs). Counting $0.50 less than the books posts exactly Dr 6450 Cash Over & Short / Cr 1010 for 50;
 * counting what the books now say posts nothing. Writers are the product's own — no GL math here.
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
import { dailyReport, drawerCount, drawerCountBody, registerBook } from "./daily-report.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX daily report + drawer count (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  let cust: string;
  const u = TEST_OWNER_USER_ID;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const lines = async (type: string, id: string) =>
    (await db.query<{ num: string; side: string; cents: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND p.source_transaction_type = $2 AND p.source_transaction_id = $3 ORDER BY p.debit_or_credit DESC, a.account_number`,
      [co, type, id])).rows.map((r) => [r.side, r.num, Number(r.cents)]);
  const invoice = async (cents: number) => {
    const inv = await createExpandedInvoice(db as never, { operatingCompanyId: co, userId: u, invoiceType: "manual", customerId: cust, billToEntityType: "customer", billToEntityId: cust });
    await createInvoiceLineInClientTx(db, { operatingCompanyId: co, invoiceId: inv.id, line_type: "other", description: "EDP 100ml", quantity: 1, unit_amount_cents: cents, account_id: await acct("4000") }, u);
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now(), issue_date = $2::date WHERE id = $1::uuid`, [inv.id, new Date().toISOString().slice(0, 10)]);
    expect(await postInvoiceGlIfEnabled(db, co, inv.id, { userId: u })).toMatchObject({ posted: true });
    return inv.id;
  };
  const pay = async (cents: number, ref: string, applications: Array<{ invoice_id: string; amount_cents: number }>) => {
    const r = await recordCustomerPaymentInClientTx(db, {
      row: { operating_company_id: co, customer_id: cust, payment_method: "cash", payment_date: new Date().toISOString().slice(0, 10), reference: ref, amount_cents: cents,
        deposited_to_account_id: await acct("1010"), notes: null, created_by_user_id: u, is_sample_data: false },
      applications, validate_application: async () => null, skip_context: {},
      audit: { action: "accounting.payment.create", module: "accounting" }, spine: { event_type: "payment.recorded" as never, entity_type: "payment" },
    } as never);
    return (r as { payment?: { id: string } }).payment?.id ?? (await db.query<{ id: string }>(`SELECT id::text FROM accounting.payments WHERE operating_company_id = $1::uuid AND reference = $2`, [co, ref])).rows[0]!.id;
  };
  const open = async (invoiceId: string) => Number((await db.query<{ o: string }>(
    `SELECT (i.total_cents - COALESCE((SELECT sum(pa.amount_cents) FROM accounting.payment_applications pa WHERE pa.target_kind = 'invoice' AND pa.target_id = i.id AND pa.unapplied_at IS NULL), 0))::text AS o
       FROM accounting.invoices i WHERE i.id = $1::uuid`, [invoiceId])).rows[0]!.o);
  const unapplied = async (paymentId: string) => Number((await db.query<{ u: string }>(`SELECT COALESCE(amount_unapplied_cents, 0)::text AS u FROM accounting.payments WHERE id = $1::uuid`, [paymentId])).rows[0]!.u);

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, u, ["GL_POSTING_ENABLED", "INVOICE_AR_GL_POSTING_ENABLED", "CUSTOMER_PAYMENT_GL_POSTING_ENABLED"]]);
    cust = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('M8 drawer test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("the day's report reads the books; a short drawer posts Dr 6450 / Cr 1010; an exact count posts nothing", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const before = await dailyReport(db, { date: day });
    const inv = await invoice(10000);
    const p = await pay(10000, "M8-CASH-1", [{ invoice_id: inv, amount_cents: 10000 }]);
    expect(await lines("customer_payment", p)).toEqual([["debit", "1010", 10000], ["credit", "1100", 10000]]);
    const r = await dailyReport(db, { date: day });
    expect(r.totals.entries - before.totals.entries).toBe(2);
    expect(r.totals.sales_cents - before.totals.sales_cents).toBe(10000);
    expect(r.totals.cash_in_cents - before.totals.cash_in_cents).toBe(10000);
    expect(r.entries.map((e) => e.source_transaction_id)).toEqual(expect.arrayContaining([inv, p]));
    expect(r.by_type.find((t) => t.type === "customer_payment")!.amount_cents).toBeGreaterThanOrEqual(10000);

    const bank1010 = (await db.query<{ id: string }>(`SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND a.account_number = '1010' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;
    const book = await registerBook(db, day, bank1010);
    expect(book).toBeGreaterThanOrEqual(10000);
    const je = async (id: string) => (await db.query<{ num: string; side: string; cents: string }>(`SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents
       FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id WHERE p.journal_entry_uuid = $1::uuid ORDER BY p.debit_or_credit DESC`, [id])).rows
      .map((x) => [x.side, x.num, Number(x.cents)]);
    const short = await drawerCount(db, { userId: u, role: "Owner" }, drawerCountBody.parse({ date: day, counted_cents: book - 50, bank_account_id: bank1010 }));
    expect(short).toMatchObject({ book_cents: book, counted_cents: book - 50, variance_cents: -50, direction: "short" });
    expect(await je(short.journal_entry_id!)).toEqual([["debit", "6450", 50], ["credit", "1010", 50]]);
    expect(await registerBook(db, day, bank1010)).toBe(book - 50);
    const over = await drawerCount(db, { userId: u, role: "Owner" }, drawerCountBody.parse({ date: day, counted_cents: book, bank_account_id: bank1010 }));
    expect(over).toMatchObject({ book_cents: book - 50, variance_cents: 50, direction: "over" });
    expect(await je(over.journal_entry_id!)).toEqual([["debit", "1010", 50], ["credit", "6450", 50]]);
    const exact = await drawerCount(db, { userId: u, role: "Owner" }, drawerCountBody.parse({ date: day, counted_cents: book, bank_account_id: bank1010 }));
    expect(exact).toMatchObject({ variance_cents: 0, direction: "exact", journal_entry_id: null });
  });
});
