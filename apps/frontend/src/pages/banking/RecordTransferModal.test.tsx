// @vitest-environment jsdom
import source from "./RecordTransferModal.tsx?raw";
import { describe, expect, it } from "vitest";

describe("RecordTransferModal — mark-transfer wiring (0441-mod8)", () => {
  it("links a bank-to-bank linkBankTransactionId inside createTransfer (from_bank_line, ROUND 360)", () => {
    expect(source).toContain("from_bank_line");
    expect(source).toContain('transferType === "bank_to_bank"');
    expect(source).toContain("destination_bank_account_id");
    expect(source).toContain("transfer_kind");
  });

  it("does not retain stale skip comment for broken mark-transfer", () => {
    expect(source).not.toContain("known-broken/mismatched");
    expect(source).not.toContain("intentionally left for manual categorization");
  });

  // BANK-ECON-03 / BANK-SURF-03 — one cash movement, ONE banking.transfers row: the line is linked in the same request
  // that creates the transfer; a separate mark-transfer call (which minted the duplicate) must never come back.
  it("never calls mark-transfer separately, so no second ledger row can be minted", () => {
    expect(source).not.toMatch(/\bmarkBankTransactionTransfer\s*\(|import[^;]*\bmarkBankTransactionTransfer\b/);
  });
});

describe("DISP-F6XXX — Cash Deposit From Account must reach Undeposited Funds", () => {
  it("cash_deposit fromOptions filter source includes 'undeposited', not just cash|petty", () => {
    // Source-text guard (matches this file's own established pattern above): the cash_deposit
    // fromOptions filter originally read /cash|petty/i, which excludes every real "Undeposited
    // Funds" CoA account -- the ONLY account a customer payment can be deposited FROM before it can
    // ever reach the bank-reconciliation workspace. Confirmed live: a real account literally named
    // "Undeposited Funds" (id 09d53946-..., this entity's own undeposited_funds CoA role target)
    // showed "No matches" in the From Account picker before this fix.
    const cashDepositBlock = source.slice(source.indexOf('transferType === "cash_deposit"'));
    const filterLine = cashDepositBlock.slice(0, cashDepositBlock.indexOf(".map("));
    expect(filterLine).toMatch(/\/[^/]*undeposited[^/]*\/i/i);
    // Additive widening only -- the original petty-cash/cash-on-hand use case must still match.
    expect(filterLine).toMatch(/cash/i);
    expect(filterLine).toMatch(/petty/i);
  });
});
