/**
 * ROUND L.31 M1 — receive payment the QuickBooks way on ScentsX (CC1's M1, rewritten by LEAD: its test queried a table that does not
 * exist, perfume.company_customer_links, and had never run). Through the ONE payment engine, real Postgres, rolled back:
 *   A) one check pays two open invoices ($100.00 + $50.00 = $150.00) — one JE Dr 1000 / Cr 1100 for 15000, both invoices closed;
 *   B) a payment received before any invoice ($80.00, no applications) — posted Dr 1000 / Cr 1100 the same way and left unapplied:
 *      the customer's credit on A/R (amount_unapplied_cents = 8000);
 *   C) later, that payment is applied to a new $80.00 invoice through applyPayment — the payment's unapplied amount falls to 0, the
 *      invoice is closed, and no second payment JE is written (the money moved once, in B).
 * No GL math here.
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
import { applyPayment } from "../accounting/payments/apply.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX receive payment — many invoices, unapplied, applied later (real Postgres, rolled back)", () => {
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
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now() WHERE id = $1::uuid`, [inv.id]);
    expect(await postInvoiceGlIfEnabled(db, co, inv.id, { userId: u })).toMatchObject({ posted: true });
    return inv.id;
  };
  const pay = async (cents: number, ref: string, applications: Array<{ invoice_id: string; amount_cents: number }>) => {
    const r = await recordCustomerPaymentInClientTx(db, {
      row: { operating_company_id: co, customer_id: cust, payment_method: "check", payment_date: new Date().toISOString().slice(0, 10), reference: ref, amount_cents: cents,
        deposited_to_account_id: await acct("1000"), notes: null, created_by_user_id: u, is_sample_data: false },
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
    cust = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('M1 pay test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("A) one check pays two invoices: one JE Dr 1000 / Cr 1100, both invoices closed", async () => {
    const a = await invoice(10000); const b = await invoice(5000);
    const p = await pay(15000, "M1-CHK-A", [{ invoice_id: a, amount_cents: 10000 }, { invoice_id: b, amount_cents: 5000 }]);
    expect(await lines("customer_payment", p)).toEqual([["debit", "1000", 15000], ["credit", "1100", 15000]]);
    expect([await open(a), await open(b)]).toEqual([0, 0]);
    expect(await unapplied(p)).toBe(0);
  });

  it("B + C) a payment before the invoice stays unapplied credit, then is applied later with no second JE", async () => {
    const p = await pay(8000, "M1-CHK-B", []);
    expect(await lines("customer_payment", p)).toEqual([["debit", "1000", 8000], ["credit", "1100", 8000]]);
    expect(await unapplied(p)).toBe(8000);
    const c = await invoice(8000);
    expect(await open(c)).toBe(8000);
    await applyPayment(db as never, { operating_company_id: co, payment_id: p, applications: [{ target_kind: "invoice", target_id: c, amount_cents: 8000 }] as never }, { user_id: u });
    expect(await open(c)).toBe(0);
    expect(await unapplied(p)).toBe(0);
    expect((await lines("customer_payment", p)).length).toBe(2);
  });
});
