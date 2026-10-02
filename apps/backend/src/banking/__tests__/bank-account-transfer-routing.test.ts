import { describe, expect, it, vi } from "vitest";
import { resolveBankAccountTransferTarget } from "../bank-account-transfer-routing.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function client(opts: { dest: boolean; pairs: number; isCredit: boolean }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions WHERE id")) return { rows: [{ bank_account_id: "bofa", amount_cents: "-150000", is_credit: opts.isCredit, transaction_date: "2026-09-15" }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: opts.dest ? [{ id: "dreamline-card" }] : [] };
      if (sql.includes("abs(amount_cents)")) return { rows: Array.from({ length: opts.pairs }, (_, i) => ({ id: `card-line-${i}` })) };
      return { rows: [] };
    }),
  };
}

describe("queue item 13 (G-07) — a payment categorized to the card's 2510 is a bank-to-bank transfer", () => {
  it("routes to the card bank account as an outgoing transfer and pairs the card's single counterpart line", async () => {
    expect(await resolveBankAccountTransferTarget(client({ dest: true, pairs: 1, isCredit: false }), OPCO, "line", "acct-2510")).toEqual({
      destinationBankAccountId: "dreamline-card", transferKind: "out", pairedTransactionId: "card-line-0",
    });
  });

  it("does not guess a pair when the card has zero or several candidate lines", async () => {
    expect((await resolveBankAccountTransferTarget(client({ dest: true, pairs: 2, isCredit: false }), OPCO, "line", "acct-2510"))?.pairedTransactionId).toBeNull();
    expect((await resolveBankAccountTransferTarget(client({ dest: true, pairs: 0, isCredit: false }), OPCO, "line", "acct-2510"))?.pairedTransactionId).toBeNull();
  });

  it("an account that is no bank account's ledger is an ordinary categorization (null)", async () => {
    expect(await resolveBankAccountTransferTarget(client({ dest: false, pairs: 0, isCredit: false }), OPCO, "line", "acct-6100")).toBeNull();
  });

  it("money in is an incoming transfer", async () => {
    expect((await resolveBankAccountTransferTarget(client({ dest: true, pairs: 0, isCredit: true }), OPCO, "line", "acct-x"))?.transferKind).toBe("in");
  });
});
