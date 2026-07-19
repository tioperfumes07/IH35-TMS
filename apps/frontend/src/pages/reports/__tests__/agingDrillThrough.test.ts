import { describe, expect, it } from "vitest";
import {
  apAgingBillsListHref,
  apAgingVendorProfileHref,
  arAgingCustomerProfileHref,
  arAgingInvoiceListHref,
} from "../agingDrillThrough";

describe("agingDrillThrough URL contracts", () => {
  it("builds A/R invoice list href with customer_id + has_balance=true only", () => {
    const href = arAgingInvoiceListHref("11111111-1111-4111-8111-111111111111");
    const url = new URL(href, "https://app.example");
    expect(url.pathname).toBe("/accounting/invoices");
    expect(url.searchParams.get("customer_id")).toBe("11111111-1111-4111-8111-111111111111");
    expect(url.searchParams.get("has_balance")).toBe("true");
    expect(url.searchParams.get("status")).toBeNull();
    expect([...url.searchParams.keys()].sort()).toEqual(["customer_id", "has_balance"]);
  });

  it("preserves A/R customer billing profile href", () => {
    expect(arAgingCustomerProfileHref("11111111-1111-4111-8111-111111111111")).toBe(
      "/customers/11111111-1111-4111-8111-111111111111?tab=billing"
    );
  });

  it("builds A/P bills list href with vendor_id + has_balance=true (includes partial)", () => {
    const href = apAgingBillsListHref("22222222-2222-4222-8222-222222222222");
    const url = new URL(href, "https://app.example");
    expect(url.pathname).toBe("/accounting/bills");
    expect(url.searchParams.get("vendor_id")).toBe("22222222-2222-4222-8222-222222222222");
    expect(url.searchParams.get("has_balance")).toBe("true");
    expect(url.searchParams.get("status")).toBeNull();
    expect([...url.searchParams.keys()].sort()).toEqual(["has_balance", "vendor_id"]);
  });

  it("preserves A/P vendor profile href", () => {
    expect(apAgingVendorProfileHref("22222222-2222-4222-8222-222222222222")).toBe(
      "/vendors/22222222-2222-4222-8222-222222222222?tab=ap"
    );
  });
});
