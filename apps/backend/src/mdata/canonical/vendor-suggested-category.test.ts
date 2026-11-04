import { describe, expect, it } from "vitest";
import { formatSuggestedCategory, readVendorSuggestedCategories, VENDOR_SUGGESTED_CATEGORY_SQL } from "./vendor-suggested-category.js";

describe("row 97 vendor suggested category", () => {
  it("formats the owner's example", () => {
    expect(formatSuggestedCategory({ label: "5000 Fuel & Diesel", share_pct: 98, total_expenses: 865 })).toBe("5000 Fuel & Diesel · 98% of 865 expenses");
    expect(formatSuggestedCategory({ label: "5320 Trailer Washout", share_pct: 100, total_expenses: 1 })).toBe("5320 Trailer Washout · 100% of 1 expense");
  });
  it("counts live expenses only, on operating-cost accounts, and reads never writes", () => {
    expect(VENDOR_SUGGESTED_CATEGORY_SQL).toMatch(/e\.voided_at IS NULL/);
    expect(VENDOR_SUGGESTED_CATEGORY_SQL).toMatch(/account_type IN \('Expense', 'CostOfGoodsSold'\)/);
    expect(VENDOR_SUGGESTED_CATEGORY_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it("shares the top account and marks an already-saved one", async () => {
    const client = {
      query: async () => ({
        rows: [
          { vendor_id: "v1", account_id: "a1", account_number: "5000", account_name: "Fuel & Diesel", expenses: 849, total_expenses: 865, saved_account_id: null },
          { vendor_id: "v2", account_id: "a2", account_number: null, account_name: "Tolls", expenses: 3, total_expenses: 3, saved_account_id: "a2" },
        ],
      }),
    };
    const m = await readVendorSuggestedCategories(client, "oc");
    expect(m.get("v1")).toMatchObject({ label: "5000 Fuel & Diesel", share_pct: 98, already_saved: false });
    expect(m.get("v2")).toMatchObject({ label: "Tolls", share_pct: 100, already_saved: true });
  });
});
