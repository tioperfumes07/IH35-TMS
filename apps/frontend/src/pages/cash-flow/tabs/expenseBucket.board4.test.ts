import { describe, expect, it } from "vitest";
import type { RollingLedgerRow } from "../../../api/cashFlow";
import { expenseBucket } from "./expenseBucket";

function row(partial: Partial<RollingLedgerRow> & Pick<RollingLedgerRow, "row_kind" | "document_kind" | "amount_cents">): RollingLedgerRow {
  return {
    type: partial.row_kind === "income" ? "Invoice" : "Expense",
    document_id: "doc-1",
    document_label: "Label",
    counterparty: "Party",
    origin_date: "2026-11-01",
    due_date: "2026-11-12",
    days_overdue: 0,
    status: "upcoming",
    ...partial,
  };
}

describe("ROUND 8.20 board4 expenseBucket — income never Other", () => {
  it("income-only invoice is null (not other) when reader omits expense_bucket", () => {
    expect(
      expenseBucket(
        row({
          row_kind: "income",
          document_kind: "invoice",
          amount_cents: 10000,
          type: "Invoice",
          counterparty: "Fuel Driver Finance",
        }),
      ),
    ).toBeNull();
  });

  it("honors reader expense_bucket=null for income", () => {
    expect(
      expenseBucket(
        row({
          row_kind: "income",
          document_kind: "invoice",
          amount_cents: 10000,
          expense_bucket: null,
        }),
      ),
    ).toBeNull();
  });

  it("mixed income+expense: only expense 700 lands in other", () => {
    const source = [
      row({ row_kind: "expense", document_kind: "expense", amount_cents: 700, expense_bucket: "other" }),
      row({ row_kind: "income", document_kind: "invoice", amount_cents: 10000, expense_bucket: null }),
    ];
    const otherSum = source
      .filter((r) => expenseBucket(r) === "other")
      .reduce((s, r) => s + r.amount_cents, 0);
    expect(otherSum).toBe(700);
  });

  it("preserves reader finance/driver/diesel/vendor buckets", () => {
    expect(
      expenseBucket(row({ row_kind: "expense", document_kind: "bill", amount_cents: 1, expense_bucket: "vendor" })),
    ).toBe("vendor");
    expect(
      expenseBucket(row({ row_kind: "expense", document_kind: "driver_bill", amount_cents: 1, expense_bucket: "driver" })),
    ).toBe("driver");
  });
});
