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

  it("upserts default_expense_account_id without inventing accounts", () => {
    expect(src).toContain("default_expense_account_id");
    expect(src).not.toMatch(/INSERT INTO catalogs\.accounts/);
  });
});
