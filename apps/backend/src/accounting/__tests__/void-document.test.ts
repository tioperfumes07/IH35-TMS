import { describe, expect, it, vi } from "vitest";

vi.mock("../bills.service.js", () => ({
  voidBillInClientTx: vi.fn(async () => ({ ok: true, reversal_journal_entry_id: "je-bill-1" })),
  voidBillPaymentInClientTx: vi.fn(async () => ({ ok: true, bill_id: "b1", reversal_journal_entry_id: "je-bp-1" })),
}));
vi.mock("../void.service.js", () => ({
  postVoidReversal: vi.fn(async () => ({
    reversal_journal_entry_id: "je-generic-1",
    reversal_date: "2026-09-22",
    closed_period_reversal: false,
    reversed_line_count: 2,
  })),
}));
vi.mock("../posting-engine.service.js", () => ({
  reversePostedSourceTransactionInClientTx: vi.fn(async () => ({ journal_entry_id: "je-exp-1" })),
}));
vi.mock("../factoring-posting/poster.service.js", () => ({
  reverseFactoringAdvanceEvent: vi.fn(async () => ({
    reversed: true,
    reversal_journal_entry_id: "je-fac-1",
    original_journal_entry_id: "je-fac-orig",
    reversed_posting_keys: ["funding"],
  })),
}));
vi.mock("../journal-entries.service.js", () => ({
  voidJournalEntry: vi.fn(async () => ({ reversal_journal_entry_id: "je-void-1" })),
}));
vi.mock("../../driver-finance/void-document-callees.service.js", () => ({
  reverseSettlementForVoid: vi.fn(async () => ({
    voidedAt: "2026-09-23T00:00:00.000Z",
    reversalJournalEntryId: "je-settlement-1",
    glReversalResult: "reversed",
    bankTransactionUnmatched: false,
  })),
  reverseDeductionForVoid: vi.fn(async () => ({
    voidedAt: "2026-09-23T00:00:00.000Z",
    reversalJournalEntryId: null,
    outcome: "voided_applied_retained",
  })),
}));

import { voidDocument, VoidDocumentNotYetWiredError } from "../void-document.service.js";
import { voidBillInClientTx, voidBillPaymentInClientTx } from "../bills.service.js";
import { postVoidReversal } from "../void.service.js";
import { reversePostedSourceTransactionInClientTx } from "../posting-engine.service.js";
import { reverseFactoringAdvanceEvent } from "../factoring-posting/poster.service.js";
import { reverseSettlementForVoid, reverseDeductionForVoid } from "../../driver-finance/void-document-callees.service.js";

const fakeClient = { query: vi.fn() } as unknown as Parameters<typeof voidDocument>[0];
const baseInput = {
  operatingCompanyId: "opco-1",
  reason: "test void",
  actor: { userId: "user-1", role: "Owner" },
  currentBusinessDate: "2026-09-22",
};

describe("voidDocument — ROUND 31.2/32.2 dispatcher (not a new reversal engine)", () => {
  it("bill -> calls the EXISTING voidBillInClientTx, never a new GL write", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "bill", id: "bill-1" });
    expect(voidBillInClientTx).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ billId: "bill-1", operatingCompanyId: "opco-1" })
    );
    expect(result.reversalJournalEntryId).toBe("je-bill-1");
  });

  it("bill_payment -> calls the EXISTING voidBillPaymentInClientTx", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "bill_payment", id: "bp-1" });
    expect(voidBillPaymentInClientTx).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ paymentId: "bp-1" })
    );
    expect(result.reversalJournalEntryId).toBe("je-bp-1");
  });

  it("invoice -> calls the EXISTING generic postVoidReversal with entityType='invoice'", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "invoice", id: "inv-1" });
    expect(postVoidReversal).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ entityType: "invoice", entityId: "inv-1" }),
      expect.objectContaining({ userId: "user-1" })
    );
    expect(result.reversalJournalEntryId).toBe("je-generic-1");
  });

  it("prepaid_purchase -> routes through postVoidReversal with entityType='prepaid_purchase'", async () => {
    await voidDocument(fakeClient, { ...baseInput, type: "prepaid_purchase", id: "pp-1" });
    expect(postVoidReversal).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ entityType: "prepaid_purchase" }),
      expect.anything()
    );
  });

  it("customer_payment -> routes through postVoidReversal with entityType='customer_payment'", async () => {
    await voidDocument(fakeClient, { ...baseInput, type: "customer_payment", id: "cp-1" });
    expect(postVoidReversal).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ entityType: "customer_payment" }),
      expect.anything()
    );
  });

  it("expense -> calls the EXISTING reversePostedSourceTransactionInClientTx (posting-engine.service.ts)", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "expense", id: "exp-1" });
    expect(reversePostedSourceTransactionInClientTx).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ source_transaction_type: "expense", source_transaction_id: "exp-1" }),
      expect.objectContaining({ userId: "user-1" }),
      "2026-09-22"
    );
    expect(result.reversalJournalEntryId).toBe("je-exp-1");
  });

  it("expense -> an unposted expense (SOURCE_NOT_FOUND) is a legitimate zero-reversal void, not an error", async () => {
    (reversePostedSourceTransactionInClientTx as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("nothing posted"), { code: "SOURCE_NOT_FOUND" })
    );
    const result = await voidDocument(fakeClient, { ...baseInput, type: "expense", id: "exp-unposted" });
    expect(result.reversalJournalEntryId).toBeNull();
  });

  it("expense -> any OTHER posting-engine error (e.g. PERIOD_LOCKED) still throws loud", async () => {
    (reversePostedSourceTransactionInClientTx as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("period locked"), { code: "PERIOD_LOCKED" })
    );
    await expect(voidDocument(fakeClient, { ...baseInput, type: "expense", id: "exp-locked" })).rejects.toThrow(
      "period locked"
    );
  });

  it("factoring_advance -> calls the EXISTING reverseFactoringAdvanceEvent, its own connection", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "factoring_advance", id: "fa-1" });
    expect(reverseFactoringAdvanceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ factoring_advance_id: "fa-1", operating_company_id: "opco-1" })
    );
    expect(result.reversalJournalEntryId).toBe("je-fac-1");
  });

  it("journal_entry -> calls the EXISTING voidJournalEntry, its own connection", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "journal_entry", id: "je-1" });
    expect(result.reversalJournalEntryId).toBe("je-void-1");
  });

  it("credit_memo -> throws VoidDocumentNotYetWiredError, never a silent no-op or a guessed reversal", async () => {
    await expect(voidDocument(fakeClient, { ...baseInput, type: "credit_memo", id: "cm-1" })).rejects.toBeInstanceOf(
      VoidDocumentNotYetWiredError
    );
    // No underlying engine touched — the guard fires before any dispatch.
    expect(postVoidReversal).not.toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ entityId: "cm-1" }),
      expect.anything()
    );
  });

  it("liability -> throws VoidDocumentNotYetWiredError, never a silent no-op or a guessed reversal", async () => {
    await expect(voidDocument(fakeClient, { ...baseInput, type: "liability", id: "liab-1" })).rejects.toBeInstanceOf(
      VoidDocumentNotYetWiredError
    );
  });

  it("settlement -> calls the EXISTING reverseSettlementForVoid (driver-finance's own callee, VOID-DOCUMENT-CALLEES)", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "settlement", id: "settle-1" });
    expect(reverseSettlementForVoid).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ operatingCompanyId: "opco-1", settlementId: "settle-1", reason: "test void" })
    );
    expect(result.reversalJournalEntryId).toBe("je-settlement-1");
  });

  it("deduction -> calls the EXISTING reverseDeductionForVoid, an APPLIED (fully-collected) deduction never reverses", async () => {
    const result = await voidDocument(fakeClient, { ...baseInput, type: "deduction", id: "ded-1" });
    expect(reverseDeductionForVoid).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ operatingCompanyId: "opco-1", deductionId: "ded-1" })
    );
    // outcome: voided_applied_retained -- the owner-ruled "why would I forgive the debt" branch,
    // never a reversal.
    expect(result.reversalJournalEntryId).toBeNull();
  });
});
