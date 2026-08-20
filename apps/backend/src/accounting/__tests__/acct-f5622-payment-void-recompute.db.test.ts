/**
 * ACCT-F5622 — voiding a customer payment must revert the invoice's paid status.
 *
 * WHY THIS EXISTS. payments.routes.ts's POST /:id/void correctly soft-unapplies the voided payment's
 * accounting.payment_applications rows (sets unapplied_at, void-not-delete) and correctly reverses the
 * GL journal entry. That UPDATE re-fires the AFTER UPDATE trigger pmt_app_recompute_invoice ->
 * accounting.recompute_invoice_paid() (and the sibling pmt_app_recompute_payment ->
 * recompute_payment_applied()). Both functions previously summed ALL payment_applications rows for the
 * invoice/payment with no "unapplied_at IS NULL" filter, so voiding recomputed the exact same total as
 * before the void — the invoice stayed permanently marked paid/partial while the GL correctly showed
 * the receivable restored. Migration 202612821200 adds the missing filter; this test proves the
 * end-to-end behavior through the REAL routes and the REAL trigger, not a unit test of the SQL in
 * isolation — a static guard can prove the filter text is present in the function body, but only a
 * DB test proves the trigger actually reverts the invoice when a real void happens.
 *
 * ISOLATION: owns a UNIQUE org.companies row (createIsolatedOperatingCompany) — same rationale as the
 * sibling subledger-gl-tieout-ar.db.test.ts: chart_of_accounts_roles is UNIQUE per (company, role), so
 * a shared entity would let parallel forks clobber each other's account_id.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerCustomerPaymentsRoutes } from "../customer-payments.routes.js";
import { registerPaymentsRoutes } from "../payments.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F5622 — payment void reverts the invoice's paid status", () => {
  let db: pg.Client;
  let app: FastifyInstance;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000d8";
  const incomeAccountId = randomUUID();
  const undepositedAccountId = randomUUID();
  const customerId = randomUUID();

  const INVOICE_CENTS = 45_000;
  let invoiceSeq = 0;

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedInvoice(): Promise<string> {
    const invoiceId = randomUUID();
    const loadId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered',$5,$6::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [loadId, companyId, `L-F5622-${suffix}-${invoiceId.slice(0, 4)}`, customerId, INVOICE_CENTS, userId]
      );
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,$5,0,$5,'sent',$6::uuid)`,
        [invoiceId, companyId, customerId, `INV-2026-${String(++invoiceSeq).padStart(5, "0")}`, INVOICE_CENTS, loadId]
      );
      await db.query(
        `INSERT INTO accounting.invoice_lines
           (operating_company_id, invoice_id, line_type, account_id, description, quantity, unit_amount_cents, line_total_cents, display_order)
         VALUES ($1::uuid,$2::uuid,'linehaul',$3::uuid,'Linehaul',1,$4,$4,0)`,
        [companyId, invoiceId, incomeAccountId, INVOICE_CENTS]
      );
    });
    return invoiceId;
  }

  async function receivePayment(invoiceId: string, amountCents: number) {
    return app.inject({
      method: "POST",
      url: `/api/v1/customers/${customerId}/payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        received_at: new Date().toISOString().slice(0, 10),
        amount_cents: amountCents,
        payment_method: "ach",
        applications: [{ invoice_id: invoiceId, amount_cents: amountCents }],
      },
    });
  }

  async function voidPayment(paymentId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/accounting/payments/${paymentId}/void?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: { void_reason: "ACCT-F5622 test — reversing a customer payment entered in error" },
    });
  }

  async function invoiceRow(invoiceId: string): Promise<{ status: string; amount_paid_cents: number }> {
    const res = await db.query<{ status: string; amount_paid_cents: string }>(
      `SELECT status, amount_paid_cents FROM accounting.invoices WHERE id = $1`,
      [invoiceId]
    );
    const row = res.rows[0];
    if (!row) throw new Error("invoice not found");
    return { status: row.status, amount_paid_cents: Number(row.amount_paid_cents) };
  }

  async function paymentAppliedCents(paymentId: string): Promise<number> {
    const res = await db.query<{ amount_applied_cents: string }>(
      `SELECT amount_applied_cents FROM accounting.payments WHERE id = $1`,
      [paymentId]
    );
    return Number(res.rows[0]?.amount_applied_cents ?? 0);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `f5622-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "F62",
      legalNamePrefix: "F5622 Void Recompute",
      actorUserId: userId,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Income F5622 Test','Income',true)`,
        [incomeAccountId, companyId, `IN${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Undeposited F5622 Test','Asset',true)`,
        [undepositedAccountId, companyId, `UF${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'undeposited_funds',$2::uuid,true)`,
        [companyId, undepositedAccountId]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `F5622 Cust ${suffix}`]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerCustomerPaymentsRoutes(a);
      await registerPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db) return;
    try {
      if (isolated) await deactivateIsolatedOperatingCompany(isolated);
    } catch {
      /* best-effort cleanup — never mask a real assertion failure */
    }
    await db.end();
  });

  it("full payment marks the invoice paid, then voiding it reverts the invoice to unpaid", async () => {
    const invoiceId = await seedInvoice();

    const paid = await receivePayment(invoiceId, INVOICE_CENTS);
    expect(paid.statusCode, `payment failed: ${paid.body}`).toBe(201);
    const paymentId = (paid.json() as { id: string }).id;

    const afterPay = await invoiceRow(invoiceId);
    expect(afterPay.status).toBe("paid");
    expect(afterPay.amount_paid_cents).toBe(INVOICE_CENTS);
    expect(await paymentAppliedCents(paymentId)).toBe(INVOICE_CENTS);

    const voided = await voidPayment(paymentId);
    expect(voided.statusCode, `void failed: ${voided.body}`).toBe(200);

    // THE BUG THIS TEST EXISTS TO CATCH: before the fix, recompute_invoice_paid()'s SUM had no
    // unapplied_at filter, so the trigger recomputed the SAME total post-void and both assertions
    // below would have failed (status stuck "paid", amount_paid_cents stuck at INVOICE_CENTS).
    const afterVoid = await invoiceRow(invoiceId);
    expect(afterVoid.status).toBe("sent");
    expect(afterVoid.amount_paid_cents).toBe(0);
    expect(await paymentAppliedCents(paymentId)).toBe(0);
  });

  it("partial payment + void leaves the invoice correctly partial-or-sent, never stuck", async () => {
    const invoiceId = await seedInvoice();
    const partialCents = Math.floor(INVOICE_CENTS / 3);

    const paid = await receivePayment(invoiceId, partialCents);
    expect(paid.statusCode, `payment failed: ${paid.body}`).toBe(201);
    const paymentId = (paid.json() as { id: string }).id;

    const afterPay = await invoiceRow(invoiceId);
    expect(afterPay.status).toBe("partial");
    expect(afterPay.amount_paid_cents).toBe(partialCents);

    const voided = await voidPayment(paymentId);
    expect(voided.statusCode, `void failed: ${voided.body}`).toBe(200);

    const afterVoid = await invoiceRow(invoiceId);
    expect(afterVoid.status).toBe("sent");
    expect(afterVoid.amount_paid_cents).toBe(0);
  });
});
