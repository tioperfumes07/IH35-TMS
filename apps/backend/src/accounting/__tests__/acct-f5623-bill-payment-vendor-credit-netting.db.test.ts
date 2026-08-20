/**
 * ACCT-F5623 — every bill-payment WRITE path must cap the payable amount net of non-voided
 * accounting.vendor_credit_applications, mirroring BILL_OPEN_BALANCE_SQL's existing READ-side netting
 * (bills.service.ts, used by AP aging / bills list / Pay-Bill picker).
 *
 * WHY THIS EXISTS. Before this fix, `payBill()`, the vendor bill-payments route, and the bulk
 * mark_paid action all computed `remaining = amount - paid_cents` with no vendor-credit deduction, so
 * a bill already partly or fully settled by a vendor credit could still be paid in cash up to its
 * full face amount — a real duplicate/over-payment of company cash discharging a liability twice.
 *
 * Each of the three writers gets its own case, driving the REAL function/route against REAL Postgres
 * — a static guard can prove the helper is CALLED, but only a DB test proves the resulting remaining
 * balance is actually correct and the overpayment is actually refused.
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
import { payBill } from "../bills.service.js";
import { registerVendorBillPaymentsRoutes } from "../vendor-bill-payments.routes.js";
import { registerBillsBulkRoutes } from "../bills-bulk.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F5623 — bill payment nets non-voided vendor credits", () => {
  let db: pg.Client;
  let app: FastifyInstance;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 8);
  const userId = "00000000-0000-4000-8000-0000000000d9";
  const vendorId = randomUUID();
  const BILL_CENTS = 50_000;
  const CREDIT_APPLIED_CENTS = 30_000; // leaves a real 20_000 open balance

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  let creditSeq = 0;

  /**
   * accounting.vendor_credits.display_id is CHECK-constrained to ^VC-[0-9]{4}-[0-9]{4}$ and UNIQUE per
   * (operating_company_id, display_id); amount_unapplied_cents is a GENERATED column (amount_cents -
   * amount_applied_cents), so amount_applied_cents is the column that's actually written.
   */
  async function seedCredit(client: pg.Client, amountAppliedCents: number): Promise<string> {
    const creditId = randomUUID();
    await client.query(
      `INSERT INTO accounting.vendor_credits
         (id, operating_company_id, vendor_id, display_id, status, amount_cents, amount_applied_cents, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'applied', $5, $5, $6::uuid)`,
      [creditId, companyId, vendorId, `VC-2026-${String(++creditSeq).padStart(4, "0")}`, amountAppliedCents, userId]
    );
    return creditId;
  }

  /** Seeds a fresh bill, plus a vendor credit application against it, per test — full isolation. */
  async function seedBillWithAppliedCredit(): Promise<string> {
    const billId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, vendor_id, bill_date, status, amount_cents, bill_number)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, 'unpaid', $4, $5)`,
        [billId, companyId, vendorId, BILL_CENTS, `F5623-${suffix}-${billId.slice(0, 4)}`]
      );
      const creditId = await seedCredit(db, CREDIT_APPLIED_CENTS);
      await db.query(
        `INSERT INTO accounting.vendor_credit_applications (operating_company_id, credit_id, bill_id, applied_cents, applied_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
        [companyId, creditId, billId, CREDIT_APPLIED_CENTS, userId]
      );
    });
    return billId;
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
        [userId, `f5623-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "F63",
      legalNamePrefix: "F5623 Vendor Credit Netting",
      actorUserId: userId,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid, $2::uuid, $3, 'Other')`,
        [vendorId, companyId, `F5623 Vendor ${suffix}`]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerVendorBillPaymentsRoutes(a);
      await registerBillsBulkRoutes(a);
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

  it("payBill() refuses a cash payment for more than the credit-netted remaining balance", async () => {
    const billId = await seedBillWithAppliedCredit();

    // True open balance is BILL_CENTS - CREDIT_APPLIED_CENTS = 20_000. Asking for 25_000 must be
    // refused — before the fix it would have succeeded (only paid_cents, which is 0, was subtracted).
    await expect(
      payBill(
        {
          operatingCompanyId: companyId,
          billId,
          paymentDate: new Date().toISOString().slice(0, 10),
          amountCents: 25_000,
          paymentMethod: "ach",
        },
        userId
      )
    ).rejects.toThrow("payment_exceeds_remaining_balance");

    // The true remaining balance (20_000) must still be payable in full.
    const ok = await payBill(
      {
        operatingCompanyId: companyId,
        billId,
        paymentDate: new Date().toISOString().slice(0, 10),
        amountCents: 20_000,
        paymentMethod: "ach",
      },
      userId
    );
    expect(ok.id).toBeTruthy();
  });

  it("vendor bill-payments route refuses a cash payment for more than the credit-netted remaining balance", async () => {
    const billId = await seedBillWithAppliedCredit();

    const over = await app.inject({
      method: "POST",
      url: `/api/v1/vendors/${vendorId}/bill-payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        paid_at: new Date().toISOString().slice(0, 10),
        amount_cents: 25_000,
        payment_method: "ach",
        applications: [{ bill_id: billId, amount_cents: 25_000 }],
      },
    });
    expect(over.statusCode, `expected refusal, got: ${over.body}`).toBe(400);
    expect((over.json() as { error: string }).error).toBe("payment_exceeds_remaining_balance");

    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/vendors/${vendorId}/bill-payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        paid_at: new Date().toISOString().slice(0, 10),
        amount_cents: 20_000,
        payment_method: "ach",
        applications: [{ bill_id: billId, amount_cents: 20_000 }],
      },
    });
    expect(ok.statusCode, `expected success, got: ${ok.body}`).toBe(201);
  });

  it("bulk mark_paid refuses to pay a bill that a vendor credit has already fully settled", async () => {
    // Seed a bill FULLY settled by the credit (amount == credit applied) — mark_paid has no caller
    // amount at all, so this is the case where the bug would silently fabricate a cash payment for
    // a liability with ZERO true remaining balance.
    const billId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, vendor_id, bill_date, status, amount_cents, bill_number)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, 'unpaid', $4, $5)`,
        [billId, companyId, vendorId, CREDIT_APPLIED_CENTS, `F5623-BULK-${suffix}`]
      );
      const creditId = await seedCredit(db, CREDIT_APPLIED_CENTS);
      await db.query(
        `INSERT INTO accounting.vendor_credit_applications (operating_company_id, credit_id, bill_id, applied_cents, applied_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
        [companyId, creditId, billId, CREDIT_APPLIED_CENTS, userId]
      );
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/bills/bulk-update?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        ids: [billId],
        action: "mark_paid",
        reason: "ACCT-F5623 test — bulk mark-paid on a credit-settled bill",
        payload: { paid_at: new Date().toISOString().slice(0, 10), payment_method: "ach" },
      },
    });
    expect(res.statusCode, `bulk call itself: ${res.body}`).toBe(200);
    const body = res.json() as { succeeded: string[]; failed: Array<{ id: string; code: string; message: string }> };
    // THE BUG THIS TEST EXISTS TO CATCH: before the fix, `remaining` ignored the applied credit and
    // would have been BILL_CENTS-worth positive, so this bill would have been "successfully" paid in
    // cash for a liability already fully discharged by the credit.
    expect(body.succeeded, `expected billId NOT in succeeded, got: ${JSON.stringify(body)}`).not.toContain(billId);
    const failure = body.failed.find((f) => f.id === billId);
    expect(failure?.code, `expected a failure entry for billId, got: ${JSON.stringify(body)}`).toBe("E_STATE_INVALID");

    const noPaymentWritten = await bypass(async () => {
      const out = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.bill_payments WHERE bill_id = $1::uuid`,
        [billId]
      );
      return Number(out.rows[0]?.n ?? 0);
    });
    expect(noPaymentWritten).toBe(0);
  });
});
