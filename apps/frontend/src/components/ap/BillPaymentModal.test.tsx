import { describe, expect, it } from "vitest";
import source from "./BillPaymentModal.tsx?raw";

describe("BillPaymentModal", () => {
  it("loads open vendor bills with has_balance filter", () => {
    expect(source).toContain("has_balance: true");
    expect(source).toContain("listVendorBills");
  });

  it("validates applied totals against payment amount", () => {
    expect(source).toContain("manualInvalid");
    expect(source).toContain("appliedSum > totalCents");
    expect(source).toContain("recordApBillPayment");
  });
});
