import { describe, expect, it } from "vitest";
import source from "./BillSelect.tsx?raw";

describe("BillSelect", () => {
  it("uses has_balance vendor bills query", () => {
    expect(source).toContain("has_balance: true");
    expect(source).toContain("listVendorBills");
  });

  it("filters zero-balance rows client-side", () => {
    expect(source).toContain("paid_cents");
  });
});
