import * as client from "./client";
import { listCustomerPayments, recordCustomerPayment, unapplyCustomerPayment } from "./customers";
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

  it("listCustomerPayments GETs with limit", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ payments: [] } as never);
    await listCustomerPayments("cust-1", { limit: 25 });
    expect(spy).toHaveBeenCalledWith("/api/v1/customers/cust-1/payments?limit=25");
  });

  it("unapplyCustomerPayment POSTs", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await unapplyCustomerPayment("cust-1", "pay-1");
    expect(spy).toHaveBeenCalledWith("/api/v1/customers/cust-1/payments/pay-1/unapply", { method: "POST" });
  });
});
