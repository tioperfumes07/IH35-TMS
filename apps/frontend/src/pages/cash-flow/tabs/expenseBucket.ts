import type { CashFlowExpenseBucket, RollingLedgerRow } from "../../../api/cashFlow";

export type ExpenseBucket = CashFlowExpenseBucket;

/**
 * ROUND 8.20 board4 — prefer reader-owned `expense_bucket` (#29090).
 * Income is NEVER "other" (old inline classifier returned "other" for non-expense and
 * double-counted invoice income into Other expenses + run-rate seed).
 */
export function expenseBucket(row: RollingLedgerRow): ExpenseBucket | null {
  if (row.expense_bucket !== undefined) return row.expense_bucket;
  if (row.row_kind !== "expense") return null;
  const t = `${row.type} ${row.document_kind} ${row.document_label} ${row.counterparty}`.toLowerCase();
  if (
    row.document_kind === "loan_amortization_row" ||
    /loan|lease|amort|note|rent|finance/.test(t)
  ) {
    return "finance";
  }
  if (
    row.document_kind === "driver_bill" ||
    row.document_kind === "settlement" ||
    /driver|settlement/.test(t)
  ) {
    return "driver";
  }
  if (
    /fuel \(projected\)|fuel est|diesel|fuel|relay|card fill|card_payable/.test(t) ||
    row.document_kind === "card_payable" ||
    row.document_kind === "relay_topup" ||
    row.document_kind === "fuel_forecast" ||
    /^fuel-avg-/.test(row.document_id)
  ) {
    return "diesel";
  }
  if (row.document_kind === "bill" || row.type === "Bill") return "vendor";
  return "other";
}
