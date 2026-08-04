import { describe, it, expect } from "vitest";
import {
  pickBestCategoryRule,
  matchesRule,
  normalizeCategoryToken,
} from "./plaid-category-match.js";

const fuel = "58c6e304-ab3e-4714-9c35-623ec51ae7cf";
const maint = "27c4a09a-0d34-4908-9da1-44b6174b5bce";
const other = "4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7";

describe("plaid-category-match leaf beats parent", () => {
  const rules = [
    { id: "gas", plaid_category_pattern: "GAS_STATIONS", coa_account_id: fuel, priority: 10 },
    { id: "fuel", plaid_category_pattern: "FUEL", coa_account_id: fuel, priority: 10 },
    { id: "trans", plaid_category_pattern: "TRANSPORTATION", coa_account_id: fuel, priority: 20 },
    { id: "other", plaid_category_pattern: "OTHER", coa_account_id: other, priority: 90 },
    { id: "maint", plaid_category_pattern: "AUTO_MAINTENANCE", coa_account_id: maint, priority: 30 },
  ];

  it("GAS_STATIONS wins over TRANSPORTATION when both match", () => {
    const best = pickBestCategoryRule(rules, ["TRANSPORTATION", "GAS_STATIONS"]);
    expect(best?.id).toBe("gas");
  });

  it("exact leaf beats shorter parent substring on detailed path", () => {
    const best = pickBestCategoryRule(rules, ["TRANSPORTATION_GAS_STATIONS"]);
    expect(best?.plaid_category_pattern).toBe("GAS_STATIONS");
  });

  it("parent TRANSPORTATION still matches when no leaf present", () => {
    const best = pickBestCategoryRule(rules, ["TRANSPORTATION"]);
    expect(best?.id).toBe("trans");
  });

  it("priority is tie-breaker within same specificity tier", () => {
    const twins = [
      { id: "a", plaid_category_pattern: "FUEL", coa_account_id: fuel, priority: 5 },
      { id: "b", plaid_category_pattern: "FUEL", coa_account_id: fuel, priority: 10 },
    ];
    expect(pickBestCategoryRule(twins, ["FUEL"])?.id).toBe("a");
  });

  it("normalize strips noise", () => {
    expect(normalizeCategoryToken("gas-stations")).toBe("GAS_STATIONS");
  });

  it("matchesRule still boolean-compatible", () => {
    expect(matchesRule("GAS_STATIONS", ["TRANSPORTATION", "GAS_STATIONS"])).toBe(true);
    expect(matchesRule("AUTO_MAINTENANCE", ["TRANSPORTATION"])).toBe(false);
  });
});
