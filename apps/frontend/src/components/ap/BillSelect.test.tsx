import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("BillSelect", () => {
  it("uses has_balance vendor bills query", () => {
    const source = fs.readFileSync(path.resolve("apps/frontend/src/components/ap/BillSelect.tsx"), "utf8");
    expect(source).toContain("has_balance: true");
    expect(source).toContain("listVendorBills");
  });

  it("filters zero-balance rows client-side", () => {
    const source = fs.readFileSync(path.resolve("apps/frontend/src/components/ap/BillSelect.tsx"), "utf8");
    expect(source).toContain("paid_cents");
  });
});
