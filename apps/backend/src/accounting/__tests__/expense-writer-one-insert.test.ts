// LEAD 443.182 C — one writer per document: accounting.expenses / accounting.expense_lines are INSERTed in exactly one
// place (expense-writer.service.ts insertExpenseHeader / insertExpenseLine). This pins the primitive's contract and that
// every expense writer persists through it.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { EXPENSE_SQL_CURRENT_DATE, EXPENSE_SQL_NOW, insertExpenseHeader, insertExpenseLine } from "../expense-writer.service.js";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const client = (rows: unknown[] = [{ id: "e-1" }]) => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return { calls, query: vi.fn(async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows }; }) };
};

describe("443.182 C — the one expense header / line INSERT", () => {
  it("binds every value as a parameter, in column order, and returns the new id", async () => {
    const c = client();
    const id = await insertExpenseHeader(c, { operating_company_id: "co", status: "draft", total_amount_cents: 1500, memo: "m" });
    expect(id).toBe("e-1");
    expect(c.calls[0]!.sql).toBe("INSERT INTO accounting.expenses (operating_company_id, status, total_amount_cents, memo) VALUES ($1, $2, $3, $4) RETURNING id::text AS id");
    expect(c.calls[0]!.values).toEqual(["co", "draft", 1500, "m"]);
  });

  it("writes now() / CURRENT_DATE inline (never as a bound string) and skips undefined columns", async () => {
    const c = client();
    await insertExpenseHeader(c, { operating_company_id: "co", posted_at: EXPENSE_SQL_NOW, transaction_date: EXPENSE_SQL_CURRENT_DATE, unit_id: undefined, load_id: null });
    expect(c.calls[0]!.sql).toContain("(operating_company_id, posted_at, transaction_date, load_id) VALUES ($1, now(), CURRENT_DATE, $2)");
    expect(c.calls[0]!.values).toEqual(["co", null]);
  });

  it("refuses a header with no company, a line with no expense, and any column that is not a plain identifier", async () => {
    await expect(insertExpenseHeader(client(), { status: "draft" })).rejects.toThrow("expense_header_requires_operating_company_id");
    await expect(insertExpenseLine(client(), { amount_cents: 1 })).rejects.toThrow("expense_line_requires_expense_id");
    await expect(insertExpenseHeader(client(), { operating_company_id: "co", "memo) VALUES (1); --": "x" })).rejects.toThrow("expense_row_bad_column");
  });

  it("returns null when the database returns no row (callers keep their own refusal)", async () => {
    expect(await insertExpenseHeader(client([]), { operating_company_id: "co" })).toBeNull();
    expect(await insertExpenseLine(client([{ id: "l-1" }]), { expense_id: "e-1", line_sequence: 1 })).toBe("l-1");
  });

  it("every expense writer persists through the one INSERT — none keeps its own", () => {
    const writers = [
      "accounting/bank-line-expense.service.ts",
      "accounting/checks/check-create.service.ts",
      "accounting/recurring.worker.ts",
      "accounting/expenses.routes.ts",
      "cash-advances/lumper-cash-advance-split.ts",
      "feed/seed-settlement-document.service.ts",
      "fuel/fuel-expense-document.service.ts",
      "fuel/dreamline-statement-import.service.ts",
      "maintenance/two-section-service.ts",
    ];
    for (const rel of writers) {
      const src = readFileSync(resolve(SRC, rel), "utf8");
      expect(src, rel).not.toMatch(/INSERT\s+INTO\s+accounting\.expense(s|_lines)\s*\(/i);
      expect(src, rel).toMatch(/(insertExpense(Header|Line)|writeExpenseDocumentInClientTx|postExpenseDocumentInClientTx)\(/);
    }
    // 443.182 C step 2 — the document writers hand the engine their document: none numbers, links, or posts an expense itself.
    for (const rel of writers.filter((r) => r !== "accounting/expenses.routes.ts")) {
      const src = readFileSync(resolve(SRC, rel), "utf8");
      expect(src, rel).not.toMatch(/\b(generateExpenseNumber|nextExpenseDisplayId|insertExpenseLoadLink|insertExpenseHeader|insertExpenseLine)\(/);
      expect(src, rel).not.toMatch(/INSERT\s+INTO\s+expense_attribution\.expense_load_links/i);
      expect(src, rel).not.toMatch(/postSourceTransaction(InClientTx)?\([^)]{0,400}source_transaction_type:\s*"expense"/);
    }
    const canon = readFileSync(resolve(SRC, "accounting/expense-writer.service.ts"), "utf8");
    expect((canon.match(/INSERT\s+INTO\s+accounting\.expenses\s*\(/gi) ?? []).length).toBe(1);
    expect((canon.match(/INSERT\s+INTO\s+accounting\.expense_lines\s*\(/gi) ?? []).length).toBe(1);
  });
});
