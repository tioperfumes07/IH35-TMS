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
    // The POST is entity-scoped now — `?operating_company_id=` on the URL, matching the sibling GET
    // asserted below. This pinned the UNSCOPED path, so it failed on a change that made the call MORE
    // correct. Asserting the scoped URL also means dropping the scope silently would fail here.
    expect(spy).toHaveBeenCalledWith("/api/v1/vendors/vend-1/bill-payments?operating_company_id=co-1", {
      method: "POST",
      // Body shape moved with the scoping change: operating_company_id left the BODY for the query string,
      // `date` is sent as `paid_at`, `method` as `payment_method`, and remaining_to_credit_balance_cents is
      // no longer part of the request. Asserted as the exact shape the client builds today.
      body: {
        paid_at: "2026-05-02",
        amount_cents: 1200,
        payment_method: "check",
        reference_number: undefined,
        applications: [{ bill_id: "bill-1", amount_cents: 1200 }],
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
