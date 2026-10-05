import { describe, expect, it } from "vitest";
import {
  BANK_LINE_DOCUMENT_POINTER_COLUMNS,
  bankLineHasLiveDocumentPointer,
  bankLineHasLiveDocumentPointerSql,
  bankLineIsUnmatchedSql,
} from "../bank-line-match-pointer.js";

describe("ENG-MATCH bank-line document pointer", () => {
  it("names every ROUND 368.2 pointer plus deposit, and never coa_account_id", () => {
    expect(BANK_LINE_DOCUMENT_POINTER_COLUMNS).toContain("matched_bill_id");
    expect(BANK_LINE_DOCUMENT_POINTER_COLUMNS).toContain("matched_payment_id");
    expect(BANK_LINE_DOCUMENT_POINTER_COLUMNS).toContain("matched_deposit_id");
    expect(BANK_LINE_DOCUMENT_POINTER_COLUMNS).toContain("matched_invoice_id");
    expect(BANK_LINE_DOCUMENT_POINTER_COLUMNS.every((c) => c.startsWith("matched_"))).toBe(true);
    expect(bankLineHasLiveDocumentPointerSql("bt")).not.toContain("created_at");
    expect(bankLineHasLiveDocumentPointerSql("bt")).toContain("num_nonnulls");
    expect(bankLineIsUnmatchedSql("b")).toContain("NOT");
    expect(bankLineIsUnmatchedSql("b")).toContain("b.matched_deposit_id");
  });

  it("treats a live pointer or split/transfer as matched, not a CATEGORIZE-null row", () => {
    expect(bankLineHasLiveDocumentPointer({ worklist: "for_review" })).toBe(false);
    expect(bankLineHasLiveDocumentPointer({ gl_account: null, worklist: "for_review" })).toBe(false);
    expect(bankLineHasLiveDocumentPointer({ matched_payment_id: "p-1", worklist: "for_review" })).toBe(
      true
    );
    expect(bankLineHasLiveDocumentPointer({ matched_deposit_id: "d-1" })).toBe(true);
    expect(bankLineHasLiveDocumentPointer({ status: "split" })).toBe(true);
    expect(bankLineHasLiveDocumentPointer({ status: "transfer" })).toBe(true);
    expect(bankLineHasLiveDocumentPointer({ transfer_kind: "internal" })).toBe(true);
    expect(bankLineHasLiveDocumentPointer({ worklist: "categorized" })).toBe(false);
  });
});
