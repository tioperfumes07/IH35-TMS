/**
 * BOARD 26 (LEAD ROUND 8.25) — the cash-basis trial balance always balances.
 * Fail-old (live, BOARD-45-STATUS row 26): explicit Cash showed "Out of balance" while Accrual showed "Balanced".
 * The plug used the balance-sheet identity A − (L + E): it ignored Revenue / Expense rows and booked a positive delta
 * as a debit, so suppressing A/R doubled the imbalance instead of offsetting it.
 */
import { describe, expect, it } from "vitest";
import { transformTrialBalanceToCashBasis } from "../report-transforms.js";
import type { TrialBalanceRow } from "../../trial-balance.service.js";

const row = (account_id: string, account_code: string, account_name: string, account_type: string, d: number, c: number): TrialBalanceRow => ({
  account_id, account_code, account_name, account_type, total_debits: d, total_credits: c, net_balance: d - c,
});

const summary = (rows: TrialBalanceRow[]) => {
  const d = rows.reduce((s, r) => s + r.total_debits, 0);
  const c = rows.reduce((s, r) => s + r.total_credits, 0);
  return { grand_total_debits: d, grand_total_credits: c, balanced: d === c };
};

describe("transformTrialBalanceToCashBasis — plug = the TB's own difference", () => {
  it("revenue on an unpaid invoice: A/R suppressed, TB still balances, plug is a debit to Cash Basis Adjustment", () => {
    const rows = [
      row("cash", "1000", "Operating Bank", "Asset", 100_000, 0),
      row("ar", "1100", "Accounts Receivable", "Asset", 50_000, 0),
      row("rev", "4000", "Freight Revenue", "Revenue", 0, 150_000),
    ];
    const out = transformTrialBalanceToCashBasis(rows, summary(rows), "2026-11-13");
    expect(out.summary.balanced).toBe(true);
    expect(out.summary.grand_total_debits).toBe(out.summary.grand_total_credits);
    const adj = out.rows.find((r) => r.account_id === "cash-basis-adjustment")!;
    expect([adj.total_debits, adj.total_credits]).toEqual([50_000, 0]);
    expect(out.rows.find((r) => r.account_id === "ar")!.net_balance).toBe(0);
    expect(out.rows.find((r) => r.account_id === "cash")!.net_balance).toBe(100_000);
    expect(out.rows.find((r) => r.account_id === "rev")!.total_credits).toBe(150_000);
  });

  it("unpaid bill: A/P suppressed, plug is a credit", () => {
    const rows = [
      row("cash", "1000", "Operating Bank", "Asset", 0, 30_000),
      row("ap", "2000", "Accounts Payable", "Liability", 0, 20_000),
      row("exp", "6000", "Repairs", "Expense", 50_000, 0),
    ];
    const out = transformTrialBalanceToCashBasis(rows, summary(rows), "2026-11-13");
    expect(out.summary.balanced).toBe(true);
    const adj = out.rows.find((r) => r.account_id === "cash-basis-adjustment")!;
    expect([adj.total_debits, adj.total_credits]).toEqual([0, 20_000]);
  });

  it("nothing suppressed: no adjustment line, identical to accrual", () => {
    const rows = [row("cash", "1000", "Operating Bank", "Asset", 10_000, 0), row("rev", "4000", "Freight Revenue", "Revenue", 0, 10_000)];
    const out = transformTrialBalanceToCashBasis(rows, summary(rows), "2026-11-13");
    expect(out.rows.some((r) => r.account_id === "cash-basis-adjustment")).toBe(false);
    expect(out.summary).toEqual({ grand_total_debits: 10_000, grand_total_credits: 10_000, balanced: true });
  });
});
