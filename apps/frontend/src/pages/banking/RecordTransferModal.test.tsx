// @vitest-environment jsdom
import source from "./RecordTransferModal.tsx?raw";
import { describe, expect, it } from "vitest";

describe("RecordTransferModal — mark-transfer wiring (0441-mod8)", () => {
  it("calls markBankTransactionTransfer for bank-to-bank linkBankTransactionId", () => {
    expect(source).toContain("markBankTransactionTransfer");
    expect(source).toContain('transferType === "bank_to_bank"');
    expect(source).toContain("destination_bank_account_id");
    expect(source).toContain("transfer_kind");
  });

  it("does not retain stale skip comment for broken mark-transfer", () => {
    expect(source).not.toContain("known-broken/mismatched");
    expect(source).not.toContain("intentionally left for manual categorization");
  });
});
