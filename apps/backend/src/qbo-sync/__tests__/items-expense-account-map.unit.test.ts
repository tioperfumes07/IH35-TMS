/**
 * QBO Item ExpenseAccountRef → catalogs.items.default_expense_account_id (static contract).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const pullerPath = path.join(ROOT, "apps/backend/src/qbo-sync/items-puller.ts");

describe("qbo item expense account map", () => {
  const src = fs.readFileSync(pullerPath, "utf8");

  it("resolves ExpenseAccountRef via qbo_account_id", () => {
    expect(src).toContain("resolveDefaultExpenseAccountId");
    expect(src).toContain("ExpenseAccountRef");
    expect(src).toContain("qbo_account_id");
  });

  // ACCT-F4431380 (9e) — OLD: the puller upserted catalogs.items.default_expense_account_id from this lookup.
  // NEW: the puller writes only mdata.qbo_items (QuickBooks is a read-only archive), so it must write
  // NEITHER catalog — the lookup stays read-only and never invents an account.
  it("never writes catalogs.items or catalogs.accounts (read-only lookup, mirror-only puller)", () => {
    expect(src).not.toMatch(/(?:INSERT INTO|UPDATE)\s+catalogs\.(?:items|accounts)/);
    expect(src).toMatch(/INSERT INTO mdata\.qbo_items/);
  });
});
