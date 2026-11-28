import { describe, expect, it } from "vitest";
import { PERFUME_MODULES, perfumeModuleOf } from "../perfumeModules";

// Owner 2026-11-27 17:25 CT: one company record, shown as a Vendors center and a Customers center (QuickBooks).
describe("perfume modules — Vendors and Customers centers on the one company record", () => {
  it("Vendors holds the vendor list, its price lists and payables; Customers holds customers, accounts, ranking, receivables", () => {
    expect(PERFUME_MODULES.find((m) => m.id === "vendors")?.tabs).toEqual(["vendors", "suppliers", "payables", "vendorranking"]);
    expect(PERFUME_MODULES.find((m) => m.id === "customers")?.tabs).toEqual(["customers", "accounts", "ranking", "salespeople", "receivables"]);
    expect(PERFUME_MODULES.find((m) => m.id === "leads")?.tabs).toEqual(["contacts", "excel"]);
    expect(perfumeModuleOf("suppliers").id).toBe("vendors");
    expect(perfumeModuleOf("receivables").id).toBe("customers");
  });
  it("every tab sits in exactly one module", () => {
    const all = PERFUME_MODULES.flatMap((m) => m.tabs);
    expect(new Set(all).size).toBe(all.length);
  });
});
