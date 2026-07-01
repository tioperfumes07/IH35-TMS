import { describe, expect, it } from "vitest";
// BLOCK-3 static guard for the New Account slide-over (AccountDrawer):
//   (3) Balance As Of is a single clean bordered control (no box-in-box).
//   (4) "Make this a subaccount" reveals a SAME-TYPE, per-entity parent picker persisting parent_account_id.
//   (5) A live Preview pane sourced from catalogs.account_types (NOT hardcoded).
import SRC from "../AccountDrawer.tsx?raw";

describe("AccountDrawer — Block 3 (subaccount + preview + clean date)", () => {
  it("(3) Balance As Of has no nested border — wrapper is layout-only, control owns the single box", () => {
    // The DatePicker must NOT be handed a border/height on its wrapper (that produced the box-in-box).
    // Match the Opening Balance field: wrapper className is exactly "mt-1 w-full".
    expect(SRC).toMatch(/data-testid="balance-as-of-datepicker"[\s\S]*?className="mt-1 w-full"/);
    expect(SRC).not.toMatch(/opening_balance_as_of[\s\S]{0,400}?border border-gray-300/);
  });

  it("(4) offers a Make-this-a-subaccount checkbox + parent picker and persists parent_account_id", () => {
    expect(SRC).toContain('data-testid="make-subaccount-checkbox"');
    expect(SRC).toContain('data-testid="parent-account-picker"');
    expect(SRC).toContain("<Combobox");
    // parent_account_id is written into the save payload (per-mode null vs undefined).
    expect(SRC).toMatch(/parent_account_id:\s*mode === "create"/);
  });

  it("(4) parent options are entity-scoped and filtered to the SAME account_type, excluding self", () => {
    // getCoaAccounts is entity-scoped server-side (passes operating_company_id → af1 RLS).
    expect(SRC).toContain("getCoaAccounts(operatingCompanyId)");
    expect(SRC).toMatch(/a\.account_type === form\.account_type/);
    expect(SRC).toMatch(/a\.id !== account\?\.id/);
  });

  it("(4) requires a parent when subaccount is checked", () => {
    expect(SRC).toMatch(/form\.is_subaccount && !form\.parent_account_id/);
  });

  it("(5) renders a Preview pane sourced from the account_types catalog, not hardcoded", () => {
    expect(SRC).toContain('data-testid="account-preview-pane"');
    // Preview is derived from the fetched AccountTypeCatalogEntry (statement / normalBalance / defaultAction).
    expect(SRC).toContain("previewEntry");
    expect(SRC).toContain("previewEntry.statement");
    expect(SRC).toContain("previewEntry.normalBalance");
    expect(SRC).toContain("previewEntry.defaultAction");
    // classification path + humanized catalog codes.
    expect(SRC).toContain('data-testid="preview-classification"');
    expect(SRC).toContain("STATEMENT_LABELS");
    expect(SRC).toContain("ACTION_LABELS");
    expect(SRC).toContain("GROUP_LABELS");
  });

  it("uses the + Create vocab (not + New) — no forbidden add-labels introduced", () => {
    expect(SRC).not.toMatch(/\+ New account/i);
  });
});
