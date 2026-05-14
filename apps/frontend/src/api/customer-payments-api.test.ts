import * as client from "./client";
import { listCustomerPayments, recordCustomerPayment, unapplyCustomerPayment } from "./customers";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("customer payments API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("recordCustomerPayment POSTs payload", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ id: "p1" } as never);
    await recordCustomerPayment("cust-1", {
      date: "2026-05-01",
      amount_cents: 5000,
      method: "ach",
      applications: [{ invoice_id: "inv-1", amount_cents: 5000 }],
      remaining_to_credit_balance_cents: 0,
    });
    expect(spy).toHaveBeenCalledWith("/api/v1/customers/cust-1/payments", {
      method: "POST",
      body: {
        date: "2026-05-01",
        amount_cents: 5000,
        method: "ach",
        applications: [{ invoice_id: "inv-1", amount_cents: 5000 }],
        remaining_to_credit_balance_cents: 0,
      },
    });
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
