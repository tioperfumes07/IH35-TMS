import * as client from "./client";
import { listCustomerPayments, recordCustomerPayment, unapplyCustomerPaymentApplication } from "./customers";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("customer payments API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("recordCustomerPayment POSTs remapped payload with operating_company_id in query", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ id: "p1" } as never);
    await recordCustomerPayment("cust-1", "opco-1", {
      date: "2026-05-01",
      amount_cents: 5000,
      method: "ach",
      reference: "ref-1",
      applications: [{ invoice_id: "inv-1", amount_cents: 5000 }],
      remaining_to_credit_balance_cents: 0,
    });
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/customers/cust-1/payments?operating_company_id=opco-1",
      {
        method: "POST",
        body: {
          received_at: "2026-05-01",
          amount_cents: 5000,
          payment_method: "ach",
          reference_number: "ref-1",
          applications: [{ invoice_id: "inv-1", amount_cents: 5000 }],
        },
      }
    );
  });

  // LINK-F5170: the backend's listCustomerPaymentsQuerySchema REQUIRES operating_company_id
  // (companyQuerySchema, a non-optional uuid) — this test previously asserted a URL with NO
  // operating_company_id, locking in the bug that made every real call 400 unconditionally.
  it("listCustomerPayments GETs with operating_company_id and limit", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ payments: [] } as never);
    await listCustomerPayments("cust-1", "opco-1", { limit: 25 });
    expect(spy).toHaveBeenCalledWith("/api/v1/customers/cust-1/payments?operating_company_id=opco-1&limit=25");
  });

  // CUST-MONEY-F6105: the old POST /customers/:id/payments/:paymentId/unapply route was never
  // mounted by any backend file (a guaranteed 404 on every real click). Unapply now goes through the
  // canonical, MOUNTED DELETE /api/v1/accounting/payments/:paymentId/applications/:id route.
  it("unapplyCustomerPaymentApplication DELETEs the canonical payment-application route", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await unapplyCustomerPaymentApplication("pay-1", "app-1", "opco-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/accounting/payments/pay-1/applications/app-1?operating_company_id=opco-1", { method: "DELETE" });
  });
});
