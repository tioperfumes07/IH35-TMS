import * as client from "./client";
import { listVendorBillPayments, recordVendorBillPayment } from "./vendors";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("vendor bill payments API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("recordVendorBillPayment POSTs payload with operating company", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ id: "vp1" } as never);
    await recordVendorBillPayment("vend-1", {
      operating_company_id: "co-1",
      date: "2026-05-02",
      amount_cents: 1200,
      method: "check",
      applications: [{ bill_id: "bill-1", amount_cents: 1200 }],
      remaining_to_credit_balance_cents: 0,
    });
    expect(spy).toHaveBeenCalledWith("/api/v1/vendors/vend-1/bill-payments", {
      method: "POST",
      body: {
        operating_company_id: "co-1",
        date: "2026-05-02",
        amount_cents: 1200,
        method: "check",
        applications: [{ bill_id: "bill-1", amount_cents: 1200 }],
        remaining_to_credit_balance_cents: 0,
      },
    });
  });

  it("listVendorBillPayments GETs with company + limit", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ payments: [] } as never);
    await listVendorBillPayments("vend-1", { operating_company_id: "co-1", limit: 10 });
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/vendors/vend-1/bill-payments?operating_company_id=co-1&limit=10"
    );
  });
});
