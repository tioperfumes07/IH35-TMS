import { describe, expect, it } from "vitest";
import {
  operatingBankAccountSetSql,
  operatingBankActualsByDaySql,
  operatingBankFeedCountSql,
} from "../cash-flow-bank-actuals.sql.js";
import { getActualVsProjected } from "../cash-flow.service.js";

const CO = "11111111-1111-4111-8111-111111111111";

describe("LEAD 443.282 — Cash Flow actuals read the operating bank", () => {
  it("uses the opening-cash account set: depository, active, not deactivated, Plaid-linked", () => {
    const sql = operatingBankAccountSetSql("ba", "");
    for (const p of ["ba.account_class = 'depository'", "ba.is_active = true", "ba.deactivated_at IS NULL", "ba.plaid_item_id IS NOT NULL"]) {
      expect(sql).toContain(p);
    }
  });

  it("rejects an unsafe alias", () => {
    expect(() => operatingBankAccountSetSql("ba; drop", "")).toThrow(/invalid SQL alias/);
  });

  it("splits money in / money out by is_credit (never the amount sign) and excludes voided, merged, pending, sample and internal transfers", () => {
    const sql = operatingBankActualsByDaySql("AND ba.hidden_at IS NULL");
    expect(sql).toContain("FROM banking.bank_transactions bt");
    expect(sql).toContain("CASE WHEN bt.is_credit THEN ABS(bt.amount_cents) ELSE 0 END");
    expect(sql).toContain("CASE WHEN bt.is_credit THEN 0 ELSE ABS(bt.amount_cents) END");
    expect(sql).not.toMatch(/amount_cents\s*[<>]=?\s*0/);
    for (const p of ["bt.voided_at IS NULL", "bt.merged_into_bank_transaction_id IS NULL", "COALESCE(bt.pending, false) = false", "COALESCE(bt.is_sample_data, false) = false", "bt.destination_bank_account_id", "bt.paired_transaction_id"]) {
      expect(sql).toContain(p);
    }
    // the hide filter is re-aliased for the other side of a transfer, never left pointing at "ba"
    expect(sql).toContain("AND xa.hidden_at IS NULL");
    expect(sql).toContain("AND pa.hidden_at IS NULL");
    expect(sql).toContain("$1::uuid");
    expect(sql).toContain("BETWEEN $2::date AND $3::date");
  });

  it("feed count reads the same account set", () => {
    expect(operatingBankFeedCountSql("")).toContain("ba.plaid_item_id IS NOT NULL");
  });

  it("getActualVsProjected reads actuals from the bank, never from A/R or A/P application rows", async () => {
    const seen: string[] = [];
    const client = {
      query: async (sql: string) => {
        seen.push(sql);
        if (sql.includes("AS actual_income_cents") && sql.includes("FROM banking.bank_transactions bt")) {
          return { rows: [{ actual_date: "2030-01-01", actual_income_cents: "1062909", actual_expense_cents: "424172" }] };
        }
        if (sql.includes("COUNT(*)::int AS n FROM banking.bank_accounts ba")) return { rows: [{ n: 1 }] };
        return { rows: [] };
      },
    };
    const r = await getActualVsProjected(client as never, CO, "2030-01-01", "2030-01-02");
    expect(seen.some((s) => /FROM accounting\.payments p/.test(s))).toBe(false);
    expect(seen.some((s) => /FROM accounting\.bill_payments bp/.test(s))).toBe(false);
    expect(r.accuracy_summary.total_actual_income_cents).toBe(1062909);
    expect(r.accuracy_summary.total_actual_expense_cents).toBe(424172);
    const inc = r.lines.find((l) => l.date === "2030-01-01" && l.category === "income");
    expect(inc?.actual_cents).toBe(1062909);
    expect(inc?.actual_unavailable).toBeUndefined();
  });

  it("marks actuals unavailable only when there is no operating bank feed", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("COUNT(*)::int AS n FROM banking.bank_accounts ba")) return { rows: [{ n: 0 }] };
        if (sql.includes("SUM(amount_cents)::bigint AS projected_income_cents")) return { rows: [{ delivery_date: "2030-01-01", projected_income_cents: "100" }] };
        return { rows: [] };
      },
    };
    const r = await getActualVsProjected(client as never, CO, "2030-01-01", "2030-01-01");
    expect(r.lines.filter((l) => l.category !== "net").every((l) => l.actual_unavailable === true)).toBe(true);
  });
});
