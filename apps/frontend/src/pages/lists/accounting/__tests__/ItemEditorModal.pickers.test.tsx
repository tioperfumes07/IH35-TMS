import { describe, expect, it } from "vitest";
// AF-2c / PS-A — static guard: the item editor must use real COA account PICKERS writing FK ids, not
// free-text account NAMES. Prevents regressing to the metadata.income_account / expense_account strings
// that the backend silently dropped (QBO/NetSuite model item→account as a reference, not text).
import SRC from "../ItemEditorModal.tsx?raw";

describe("ItemEditorModal — real account/category pickers (PS-A)", () => {
  it("uses the Combobox picker component", () => {
    expect(SRC).toMatch(/from "\.\.\/\.\.\/\.\.\/components\/Combobox"/);
    // at least income, expense, category, class pickers
    expect((SRC.match(/<Combobox/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("writes REAL FK ids, never free-text account names", () => {
    expect(SRC).toContain("default_income_account_id");
    expect(SRC).toContain("default_expense_account_id");
    expect(SRC).toContain("category_id");
    // the dropped legacy free-text keys must be gone from the save payload
    expect(SRC).not.toMatch(/income_account:\s/);
    expect(SRC).not.toMatch(/expense_account:\s/);
  });

  it("filters income vs expense accounts by account_type", () => {
    expect(SRC).toContain('"Income"');
    expect(SRC).toContain('"OtherIncome"');
    expect(SRC).toContain('"CostOfGoodsSold"');
  });

  it("offers a repeatable inline category create against the categories catalog", () => {
    expect(SRC).toContain("qboCategoriesCatalogClient.create");
    expect(SRC).toContain("invalidateQueries");
    expect(SRC).toMatch(/\+ New category/);
  });
});
