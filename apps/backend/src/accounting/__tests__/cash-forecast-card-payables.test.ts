import { describe, expect, it } from "vitest";
import { buildForecastWeeks } from "../cash-forecast.math.js";
import { bankCashLedgerFilterSql } from "../../banking/internal-wallet-balance.js";
import { readCardPayableOutflows } from "../../cash-flow/card-payables.js";

const settings = { fuel_estimate_weekly_cents: 0, insurance_weekly_cents: 0, lease_weekly_cents: 0, payroll_weekly_cents: 0 };

describe("rows 91/148/149 — card payables in the forecast, one cash definition", () => {
  it("row 91: card payables (Dreamline 2510 + WEX 2520) are outflows in their due week", () => {
    const rows = buildForecastWeeks({
      startWeek: "2026-11-02",
      weeks: 2,
      openingBalance: 500_000_00,
      settings,
      inflowInvoices: new Map(),
      inflowFactoring: new Map(),
      outflowBills: new Map(),
      outflowCardPayables: new Map([["2026-11-02", 187_894_21 + 29_156_88]]),
      outflowFactoringFee: new Map(),
    });
    expect(rows[0]?.expected_outflows.card_payables).toBe(217_051_09);
    expect(rows[0]?.projected_balance).toBe(500_000_00 - 217_051_09);
    expect(rows[1]?.expected_outflows.card_payables).toBe(0);
  });

  it("row 149: bank cash is an Asset-of-cash-kind; Liability card rows and reserves are excluded", () => {
    const sql = bankCashLedgerFilterSql("ba");
    expect(sql).toContain("la.account_type = 'Asset'");
    expect(sql).toContain("'Checking'");
    expect(sql).not.toContain("Liability");
    expect(sql).toContain("ba.ledger_account_id");
  });

  it("row 91: the shared reader returns only credit balances > 0 and honours an owner roll-over / hide", async () => {
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes("chart_of_accounts_roles")) return { rows: [{ account_id: "acc-1" }] };
        if (sql.includes("cash_flow_row_adjustments"))
          return { rows: [{ document_id: "acc-1", projected_due_date: "2026-11-20", hidden_at: null }] };
        if (sql.includes("journal_entry_postings"))
          return { rows: [{ account_id: "acc-1", account_name: "Dreamline Diesel Card Payable", balance_cents: "18789421" }] };
        return { rows: [] };
      },
    };
    const out = await readCardPayableOutflows(client as never, "c", "2026-11-03");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.balance_cents).toBe(18_789_421);
    expect(out[0]?.due_date).toBe("2026-11-20");
  });
});
