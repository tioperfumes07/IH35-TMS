/**
 * ROUND L.31 M11 — ScentsX sales tax. A taxable sale ($100.00 + an $8.25 Texas tax line, which the invoice poster books to the sales_tax_payable role, 2100) and an exempt one ($50.00, no tax) are
 * invoiced and posted by the product's own writers; the liability report for the day then shows tax collected +825 on 2100, taxable
 * sales +10000, exempt sales +5000. "Pay sales tax" = a bill to the tax agency's vendor coded to 2100, paid from Operating Checking
 * through the ONE bill + bill-payment engines: 2100 paid +825, the balance owed back where it started, A/P net 0, bank -825.
 * The return's prepare (accounting/sales-tax) now splits taxable vs non-taxable instead of reporting every sale taxable.
 * Real Postgres, rolled back — no GL math here.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createBillInClientTx, payBillInClientTx } from "../accounting/bills.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { postInvoiceGlIfEnabled } from "../accounting/invoice-gl.service.js";
import { salesTaxLiability, salesTaxQuery } from "./sales-tax.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX sales tax liability + pay (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const balance = async (num: string) => Number((await db.query<{ b: string }>(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS b
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE j.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND j.voided_at IS NULL`, [co, await acct(num)])).rows[0]!.b);
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED", "INVOICE_AR_GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED", "BILL_PAYMENT_GL_POSTING_ENABLED", "VENDOR_CREDIT_GL_POSTING_ENABLED"]]);
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("liability = 2100 from the books; sales split taxable / exempt; paying it through a bill clears it", async () => {
    const u = TEST_OWNER_USER_ID;
    const day = (await db.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
    const q = salesTaxQuery.parse({ from: day, to: day });
    const before = await salesTaxLiability(db, q);
    expect(before.account.account_number).toBe("2100");
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Tax test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
    const invoice = async (lines: Array<[string, number, string]>) => {
      const inv = await createExpandedInvoice(db as never, { operatingCompanyId: co, userId: u, invoiceType: "manual", customerId: cust, billToEntityType: "customer", billToEntityId: cust });
      for (const [type, cents, num] of lines) {
        await createInvoiceLineInClientTx(db, { operatingCompanyId: co, invoiceId: inv.id, line_type: type as never, description: type === "tax" ? "Texas sales tax 8.25%" : "EDP 100ml",
          quantity: 1, unit_amount_cents: cents, account_id: await acct(num) }, u);
      }
      await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now(), issue_date = $2::date WHERE id = $1::uuid`, [inv.id, day]);
      expect(await postInvoiceGlIfEnabled(db, co, inv.id, { userId: u })).toMatchObject({ posted: true });
      return inv.id;
    };
    // A 'tax' line's own account is never posted (posting-engine buildInvoiceLines books tax from the header to sales_tax_payable).
    await invoice([["other", 10000, "4000"], ["tax", 825, "4000"]]);
    await invoice([["other", 5000, "4000"]]);

    const mid = await salesTaxLiability(db, q);
    expect(mid.liability.collected_cents - before.liability.collected_cents).toBe(825);
    expect(mid.liability.closing_cents - before.liability.closing_cents).toBe(825);
    expect(mid.sales.taxable_sales_cents - before.sales.taxable_sales_cents).toBe(10000);
    expect(mid.sales.exempt_sales_cents - before.sales.exempt_sales_cents).toBe(5000);
    expect(mid.sales.tax_on_invoices_cents - before.sales.tax_on_invoices_cents).toBe(825);

    // Pay sales tax: a bill to the agency's vendor coded to 2100, paid from the bank, through the bill engines.
    const agency = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'ZZ Texas Comptroller test', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    const bank = (await db.query<{ id: string }>(`SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;
    const b1000 = await balance("1000"); const b2000 = await balance("2000");
    const bill = await createBillInClientTx(db as never, { operatingCompanyId: co, source: "manual", vendorId: agency, billNumber: `ZZ-STX-${day}`, autoDisplayId: true,
      billDate: day, dueDate: day, amountCents: 825, lines: [{ amountCents: 825, accountId: await acct("2100"), description: `Texas sales tax ${day}` }] }, u);
    await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill", source_transaction_id: bill.id }, { userId: u });
    const pay = await payBillInClientTx(db as never, { operatingCompanyId: co, billId: bill.id, paymentDate: day, amountCents: 825, paymentMethod: "ach", fromBankAccountId: bank, referenceNumber: "TX-WEBFILE-1" } as never, u);
    const payId = (pay as { id?: string; bill_payment_id?: string }).id ?? (pay as { bill_payment_id?: string }).bill_payment_id;
    if (!(await db.query(`SELECT 1 FROM accounting.journal_entry_postings WHERE source_transaction_type = 'bill_payment' AND source_transaction_id = $1`, [payId])).rowCount)
      await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill_payment", source_transaction_id: String(payId) }, { userId: u });

    const after = await salesTaxLiability(db, q);
    expect(after.liability.paid_cents - mid.liability.paid_cents).toBe(825);
    expect(after.liability.closing_cents).toBe(before.liability.closing_cents);
    expect(await balance("2000") - b2000).toBe(0);
    expect(await balance("1000") - b1000).toBe(-825);
    expect(after.liability.lines.filter((l) => l.source_transaction_type === "bill").map((l) => l.debit_cents)).toContain(825);
  });
});
