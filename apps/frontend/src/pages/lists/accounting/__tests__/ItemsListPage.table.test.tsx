import { describe, expect, it } from "vitest";
// AF-2c / PS-B — static guard: the Products & Services list must use ParityTable (sortable + resizable)
// and offer a QBO-style "Group by category" grouping with an Uncategorized bucket, resolving the item's
// real category_id / account ids to names.
import SRC from "../ItemsListPage.tsx?raw";

describe("ItemsListPage — ParityTable + category grouping (PS-B)", () => {
  it("renders via ParityTable, not a raw <table>", () => {
    expect(SRC).toContain("ParityTable");
    expect(SRC).not.toMatch(/<table[\s>]/);
  });

  it("has a Category column and a Group-by-category toggle", () => {
    expect(SRC).toMatch(/label:\s*"Category"/);
    expect(SRC).toContain("Group by category");
    expect(SRC).toContain("groupByCategory");
    expect(SRC).toContain("Uncategorized");
  });

  it("resolves real ids (category_id / account ids) to names for display", () => {
    expect(SRC).toContain("category_id");
    expect(SRC).toContain("default_income_account_id");
    expect(SRC).toContain("default_expense_account_id");
    expect(SRC).toContain("getCoaAccounts");
  });
});
