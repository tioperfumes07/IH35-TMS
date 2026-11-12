import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyRollingLedgerRows, rollingLedgerExpenseBucket } from "../rolling-ledger-classification.js";
import { getRollingLedgerRows } from "../cash-flow.service.js";

const row = { row_kind: "expense" as const, document_kind: "expense", document_id: "document",
  document_label: "Miscellaneous", counterparty: "Payee", type: "Expense", amount_cents: 700 };

describe("ROUND8.17 reader-owned cash-flow classification", () => {
  it.each(["invoice", "load", "factoring_advance"])("never classifies %s income as an expense", document_kind => {
    expect(rollingLedgerExpenseBucket({ ...row, row_kind: "income", document_kind,
      type: "Income", counterparty: "Fuel Driver Finance" })).toBeNull();
  });
  it.each([
    ["loan_amortization_row", "finance"], ["driver_bill", "driver"], ["settlement", "driver"],
    ["card_payable", "diesel"], ["relay_topup", "diesel"], ["fuel_forecast", "diesel"],
    ["bill", "vendor"], ["expense", "other"],
  ])("preserves existing %s expense grouping", (document_kind, bucket) => {
    expect(rollingLedgerExpenseBucket({ ...row, document_kind })).toBe(bucket);
  });
  it("mixed rows and run-rate seed cannot double-count income in Other", () => {
    const source = [{ ...row }, { ...row, row_kind: "income" as const, amount_cents: 10000 }];
    const result = classifyRollingLedgerRows(source);
    expect(result.filter(r => r.expense_bucket === "other").reduce((sum, r) => sum + r.amount_cents, 0)).toBe(700);
    expect(result.map(r => r.amount_cents)).toEqual([700, 10000]);
    expect(source.every(r => !("expense_bucket" in r))).toBe(true);
  });
  it("reader exposes classification after row-adjustment overlay", () => {
    const source = readFileSync(new URL("../cash-flow.service.ts", import.meta.url), "utf8");
    expect(/classifyRollingLedgerRows\(await applyRowAdjustments\(client, operatingCompanyId, rows, today\)\)/.test(source)).toBe(true);
  });
  it("actual reader preserves hide/rollover semantics and classifies adjusted income as null", async () => {
    const company = "11111111-1111-4111-8111-111111111111";
    const query = async (sql: string) => {
      if (sql.includes("AS amount_open_cents") && sql.includes("receipts.basis = 'Confirmed'")) {
        return { rows: [{ id: "invoice-1", display_id: "Invoice", customer_name: "Fuel customer",
          issue_date: "2026-11-01", due_date: "2026-11-12", amount_open_cents: 10000 }] };
      }
      if (sql.includes("FROM accounting.bills b") && sql.includes("AS remaining_cents")) {
        return { rows: [{ id: "bill-1", display_id: "Bill", vendor_name: "Vendor", bill_date: "2026-11-01",
          due_date: "2026-11-12", remaining_cents: 700, bill_category: "vendor" }] };
      }
      if (sql.includes("FROM accounting.cash_flow_row_adjustments a")) {
        return { rows: [
          { id: "move", document_kind: "invoice", document_id: "invoice-1", original_due_date: "2026-11-12",
            projected_due_date: "2026-11-15", hidden_at: null, reason_label: "Rescheduled", note: null },
          { id: "hide", document_kind: "bill", document_id: "bill-1", hidden_at: "2026-11-12" },
        ] };
      }
      return { rows: [] };
    };
    const result = await getRollingLedgerRows({ query } as never, company, "2026-11-12");
    expect(result).toHaveLength(2);
    expect(result.map(r => [r.document_id, r.amount_cents, r.due_date, r.expense_bucket])).toEqual([
      ["invoice-1", 0, "2026-11-12", null], ["invoice-1", 10000, "2026-11-15", null],
    ]);
    expect(result[0].is_rollover_echo).toBe(true);
    expect(result[1].reason_label).toBe("Rescheduled");
  });
});
