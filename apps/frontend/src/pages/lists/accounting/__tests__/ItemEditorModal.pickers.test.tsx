import { describe, expect, it } from "vitest";
// AF-2c / PS-A — static guard: the item editor must use real COA account PICKERS writing FK ids, not
// free-text account NAMES. Prevents regressing to the metadata.income_account / expense_account strings
// that the backend silently dropped (QBO/NetSuite model item→account as a reference, not text).
import SRC from "../ItemEditorModal.tsx?raw";
// 2026-08-20 (CC-3): income/expense/class pickers migrated off raw <Combobox> onto the shared
// LST-PICKER-01 ReferenceSelect (config-driven "+ Add new" via InlineCreateDrawer/catalogPickerRegistry)
// and the preferred-vendor picker migrated onto EntityPicker (entityPickerRegistry). Both compose
// Combobox internally — reading their sources keeps this guard's substance (real FK picker, real
// inline-create backend) instead of a literal `<Combobox` count in ItemEditorModal.tsx itself.
import REFERENCE_SELECT_SRC from "../../../../components/parity/ReferenceSelect.tsx?raw";
import ENTITY_PICKER_REGISTRY_SRC from "../../../../components/parity/entityPickerRegistry.ts?raw";

describe("ItemEditorModal — real account/category pickers (PS-A)", () => {
  it("uses real referenced pickers (ReferenceSelect for income/expense/class, Combobox for category)", () => {
    expect(SRC).toMatch(/from "\.\.\/\.\.\/\.\.\/components\/parity\/ReferenceSelect"/);
    expect(SRC).toMatch(/from "\.\.\/\.\.\/\.\.\/components\/Combobox"/);
    // income, expense, class pickers
    expect((SRC.match(/<ReferenceSelect/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // category picker (repeatable inline create, not a ReferenceSelect kind)
    expect((SRC.match(/<Combobox/g) ?? []).length).toBeGreaterThanOrEqual(1);
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
    expect(SRC).toMatch(/\+ Add new category/);
  });

  it("offers nested + Add new account via InlineCreateDrawer kind=account (PS-A / supersedes HOLD #3133)", () => {
    // ItemEditorModal wires both account pickers through ReferenceSelect's createKind="account".
    expect(SRC).toMatch(/incomeAccountId[\s\S]{0,300}createKind="account"/);
    expect(SRC).toMatch(/expenseAccountId[\s\S]{0,300}createKind="account"/);
    // ReferenceSelect itself is what actually mounts InlineCreateDrawer kind="account" (the
    // catalogPickerRegistry "account" entry routes to backend "inline-drawer").
    expect(REFERENCE_SELECT_SRC).toContain("InlineCreateDrawer");
    expect(REFERENCE_SELECT_SRC).toMatch(/kind=\{createKind as InlineCreateKind\}/);
    // Wrong create kind must not return as JSX (docs #3133 theater). Comments may name the defect.
    expect(SRC).not.toMatch(/<QuickCreateEntityModal[\s\S]{0,300}kind=["']category["']/);
  });

  it("persists the QBO two-sided purchasing side incl. a real preferred-vendor reference (AF-2c.2)", () => {
    expect(SRC).toContain("purchase_description");
    expect(SRC).toContain("purchase_cost_cents");
    expect(SRC).toContain("preferred_vendor_id");
    // Preferred vendor now reads through the shared EntityPicker kind="vendor" (entityPickerRegistry)
    // rather than a bespoke listVendors call in this file — verify the registry entry it delegates to
    // still reads the real mdata.vendors master with the 200-cap fix on search.
    expect(SRC).toMatch(/<EntityPicker[\s\S]{0,200}kind="vendor"/);
    expect(ENTITY_PICKER_REGISTRY_SRC).toMatch(/vendor:\s*\{[\s\S]{0,900}listVendors/);
    expect(ENTITY_PICKER_REGISTRY_SRC).toMatch(/limit:\s*opts\?\.search \? 200/);
  });
});
