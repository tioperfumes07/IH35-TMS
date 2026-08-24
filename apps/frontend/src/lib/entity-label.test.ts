import { describe, expect, it } from "vitest";
import { entityLabel, visibleDocumentLabel } from "./entity-label";

// ACCT-F6284 — accounting.bill_payments/bills rows created by the bank-transaction-split flow
// write JSON.stringify({source:"bank_tx_split", ...}) straight into their `memo` column, which the
// Accounting hub's "Find Transactions" panel then falls back to as a display label
// (reference_number → check_number → memo). A real live row rendered as literal
// `{"source":"bank_tx_split","bank_transaction_id":"f9cc15bf-...","split_line_no":2}` in prod.
describe("entityLabel / visibleDocumentLabel — CLS-UUID-LABEL + ACCT-F6284 (serialized-JSON guard)", () => {
  it("renders a real name as-is", () => {
    expect(entityLabel("ACME Freight", "id-1", "Vendor")).toBe("ACME Freight");
  });

  it("treats a uuid-shaped name as missing (CLS-UUID-LABEL)", () => {
    expect(entityLabel("827804a8-8554-4036-89f5-7d26c90b82b4", "827804a8-8554-4036-89f5-7d26c90b82b4", "Payment")).toBe(
      "Payment — not visible",
    );
  });

  it("ACCT-F6284: treats a serialized-JSON object as missing, not a literal dump", () => {
    const memo = JSON.stringify({
      source: "bank_tx_split",
      bank_transaction_id: "f9cc15bf-4cfb-4723-bc42-0b231196ad62",
      split_line_no: 2,
    });
    expect(entityLabel(memo, "827804a8-8554-4036-89f5-7d26c90b82b4", "Payment")).toBe("Payment — not visible");
  });

  it("ACCT-F6284: treats a serialized-JSON array the same way", () => {
    expect(entityLabel("[1,2,3]", "id-1", "Payment")).toBe("Payment — not visible");
  });

  it("does not false-positive on a real memo that merely starts with a brace-like character", () => {
    // Not valid JSON — must NOT be treated as a JSON blob, must render as-is.
    expect(entityLabel("{not json, just a note}", "id-1", "Payment")).toBe("{not json, just a note}");
  });

  it("falls back to Unassigned with no name and no id", () => {
    expect(entityLabel(null, null, "Payment")).toBe("Unassigned");
  });

  it("visibleDocumentLabel: ACCT-F6284 JSON guard applies here too", () => {
    const memo = JSON.stringify({ source: "bank_tx_split", split_line_no: 1 });
    expect(visibleDocumentLabel(memo, "id-1", "Payment")).toBe("Payment");
  });

  it("visibleDocumentLabel: a real document number renders as-is", () => {
    expect(visibleDocumentLabel("CHK-10234", "id-1", "Payment")).toBe("CHK-10234");
  });
});
