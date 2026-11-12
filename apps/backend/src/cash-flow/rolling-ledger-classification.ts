/** Display grouping only: never changes document amount, posting account or due date. */
export type CashFlowExpenseBucket = "finance" | "driver" | "diesel" | "vendor" | "other";

type ClassifiableRow = {
  row_kind: "income" | "expense";
  document_kind: string;
  document_id: string;
  document_label: string;
  counterparty: string;
  type: string;
};

/** One reader-owned classification for Home, Rolling Ledger and run-rate seeds.
 * Income is deliberately NULL, never the catch-all expense group. Existing expense
 * grouping is retained; this is not a GL reclassification or a forecast amount rewrite.
 */
export function rollingLedgerExpenseBucket(row: ClassifiableRow): CashFlowExpenseBucket | null {
  if (row.row_kind !== "expense") return null;
  const text = `${row.type} ${row.document_kind} ${row.document_label} ${row.counterparty}`.toLowerCase();
  if (row.document_kind === "loan_amortization_row" || /loan|lease|amort|note|rent|finance/.test(text)) return "finance";
  if (row.document_kind === "driver_bill" || row.document_kind === "settlement" || /driver|settlement/.test(text)) return "driver";
  if (/fuel \(projected\)|fuel est|diesel|fuel|relay|card fill|card_payable/.test(text)
    || ["card_payable", "relay_topup", "fuel_forecast"].includes(row.document_kind)
    || /^fuel-avg-/.test(row.document_id)) return "diesel";
  if (row.document_kind === "bill" || row.type === "Bill") return "vendor";
  return "other";
}

export function classifyRollingLedgerRows<T extends ClassifiableRow>(rows: T[]) {
  return rows.map(row => ({ ...row, expense_bucket: rollingLedgerExpenseBucket(row) }));
}
