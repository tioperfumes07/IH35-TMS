/**
 * ROUND L.31 M3 — a ScentsX bad-debt write-off is a credit memo coded to 6700 Bad Debt Expense applied to the invoice:
 * Dr 6700 / Cr 1100 through the one credit-memo engine, and the invoice is off the A/R aging. (Setup copied from books-end-to-end.)
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
import { createCreditMemoInClientTx } from "../accounting/credit-memo-create.service.js";
import { agingQuery, customerAccount } from "./receivables.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX bad-debt write-off (real Postgres, rolled back)", () => {
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

  it("write-off posts Dr 6700 / Cr 1100 and the invoice's open balance goes to $0.00", async () => {
    const u = TEST_OWNER_USER_ID;
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Bad debt test buyer', $1::uuid, false) RETURNING id::text`, [co]);
    const inv = await createExpandedInvoice(db as never, { operatingCompanyId: co, userId: u, invoiceType: "manual", customerId: cust.rows[0]!.id,
      billToEntityType: "customer", billToEntityId: cust.rows[0]!.id });
    await createInvoiceLineInClientTx(db, { operatingCompanyId: co, invoiceId: inv.id, line_type: "other", description: "Test EDP 100ml",
      quantity: 4, unit_amount_cents: 2500, account_id: await acct("4000") }, u);
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now() WHERE id = $1::uuid`, [inv.id]);
    expect(await postInvoiceGlIfEnabled(db, co, inv.id, { userId: u })).toMatchObject({ posted: true });
    const r = await createCreditMemoInClientTx(db as never, { operatingCompanyId: co, userId: u, input: { customer_id: cust.rows[0]!.id, amount_cents: 10000, reason: "other",
      account_id: await acct("6700"), notes: "Bad debt write-off: store closed", related_invoice_id: inv.id, apply_to_invoice: true } });
    expect("error" in r ? r : "ok").toBe("ok");
    const cmId = (r as { data: { id: string } }).data.id;
    expect(await lines("credit_memo", cmId)).toEqual([["debit", "6700", 10000], ["credit", "1100", 10000]]);
    // As of the application's own date (the books' aging dates credit-memo applications by their UTC date — ar-aging.service.ts).
    const asOf = (await db.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'UTC')::date::text AS d`)).rows[0]!.d;
    const a = await customerAccount(db as never, cust.rows[0]!.id, agingQuery.parse({ as_of: asOf }));
    expect(a.open_invoices.find((x) => x.id === inv.id)).toBeUndefined();
  });
});
