import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// ACCOUNTING-1 static guard. Locks two owner-decisions (2026-06-30) so they can't silently regress:
//   1. Invoice revenue = HARD-FAIL, PER LINE ITEM — no default revenue account.
//   2. Native 1100 "Accounts Receivable" is DEACTIVATED (void-not-delete) so QBO-45 is the SOLE active
//      AccountsReceivable-subtype control, designated via accounting.chart_of_accounts_roles.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../..");
const postingEngine = readFileSync(resolve(here, "../../posting-engine.service.ts"), "utf8");
const designationMigration = readFileSync(
  resolve(repoRoot, "db/migrations/202606290072_ar_control_account_designation.sql"),
  "utf8"
);
const deactivate1100 = readFileSync(
  resolve(repoRoot, "db/migrations/202606300010_deactivate_native_1100_ar.sql"),
  "utf8"
);

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

describe("invoice revenue — per-item resolution, hard-fail, NO default account", () => {
  it("resolves invoice revenue PER LINE to that line's mapped income account", () => {
    expect(postingEngine).toContain("FROM accounting.invoice_lines il");
    // explicit line account override OR the item's mapped income account
    expect(postingEngine).toContain("default_income_account_id");
    expect(postingEngine).toContain("InvoiceRevenueAccountError");
  });

  it("has NO silent revenue default in the invoice posting path", () => {
    // The revenue_default role + first-Income-by-type fallbacks are gone — revenue can ONLY come from a
    // line's own mapped income account, else it hard-fails.
    expect(postingEngine).not.toMatch(/revenue_default/);
    expect(postingEngine).not.toMatch(/resolveFirstAccountByType/);
  });

  it("hard-fails with a structured code and refuses to post when a line has no mapped income account", () => {
    expect(postingEngine).toContain('"INVOICE_LINE_REVENUE_UNRESOLVED"');
    expect(postingEngine).toMatch(/throw new InvoiceRevenueAccountError/);
  });
});

describe("exactly one active AccountsReceivable-subtype control remains (QBO-45)", () => {
  it("072 designates QBO-45 as ar_control and reclassifies the mis-classified advances off A/R", () => {
    expect(designationMigration).toMatch(/qbo_account_id = '45'/);
    expect(designationMigration).toContain("'ar_control'");
    expect(designationMigration).toMatch(/account_subtype = 'OtherCurrentAssets'/);
    expect(designationMigration).toContain("1150040132");
    expect(designationMigration).toContain("1150040133");
  });

  it("300010 deactivates native 1100 via deactivated_at (void-not-delete), guarded on QBO-45 surviving", () => {
    expect(deactivate1100).toMatch(/deactivated_at\s*=\s*now\(\)/);
    expect(deactivate1100).toMatch(/account_number\s*=\s*'1100'/);
    expect(deactivate1100).toMatch(/qbo_account_id IS NULL/);
    expect(deactivate1100).toContain(TRANSP);
    // survival guard: only retire 1100 while QBO-45 is still an active AccountsReceivable control
    expect(deactivate1100).toMatch(/qbo_account_id = '45'/);
    expect(deactivate1100).toMatch(/account_subtype = 'AccountsReceivable'/);
    // never destructive
    expect(deactivate1100).not.toMatch(/DELETE\s+FROM/i);
    expect(deactivate1100).not.toMatch(/\bDROP\b/i);
  });
});
