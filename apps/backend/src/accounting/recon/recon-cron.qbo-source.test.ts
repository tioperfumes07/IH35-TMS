import { describe, expect, it } from "vitest";
import { buildReconEntriesFromQboRegister, type QboRegisterSources } from "./recon-cron.service.js";

// B1-1: the QBO reconciliation source must pull ALL SIX bank-hitting QBO transaction types, not just
// Deposit + Purchase. These tests pin the coverage (every type produces a ReconEntry), the signed-cents
// convention (credit / money-IN positive, money-OUT negative), and the two scoping rules that prevent
// double-counting / non-cash leakage (Undeposited-Funds Payments skipped; only bank-leg JE lines counted).

const BANK_A = "35"; // a QBO Bank account id
const BANK_B = "36"; // a second QBO Bank account id
const UNDEPOSITED = "4"; // NOT in the bank/CC set (Undeposited Funds)
const REVENUE = "79"; // NOT in the bank/CC set (an income account)

function emptySources(): QboRegisterSources {
  return {
    deposits: [],
    purchases: [],
    transfers: [],
    billPayments: [],
    payments: [],
    journalEntries: [],
    bankAccountRefs: new Set<string>([BANK_A, BANK_B]),
  };
}

describe("buildReconEntriesFromQboRegister — B1-1 six bank-hitting types", () => {
  it("covers ALL SIX QBO transaction types (none silently missed)", () => {
    const src: QboRegisterSources = {
      ...emptySources(),
      deposits: [{ Id: "d1", TxnDate: "2026-07-05", TotalAmt: 100, DepositToAccountRef: { value: BANK_A } }],
      purchases: [{ Id: "p1", TxnDate: "2026-07-05", TotalAmt: 50, AccountRef: { value: BANK_A } }],
      transfers: [{ Id: "t1", TxnDate: "2026-07-05", Amount: 200, FromAccountRef: { value: BANK_A }, ToAccountRef: { value: BANK_B } }],
      billPayments: [{ Id: "bp1", TxnDate: "2026-07-05", TotalAmt: 75, PayType: "Check", CheckPayment: { BankAccountRef: { value: BANK_A } } }],
      payments: [{ Id: "pay1", TxnDate: "2026-07-05", TotalAmt: 60, DepositToAccountRef: { value: BANK_A } }],
      journalEntries: [
        {
          Id: "je1",
          TxnDate: "2026-07-05",
          Line: [
            { Amount: 40, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: BANK_A } } },
            { Amount: 40, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: REVENUE } } },
          ],
        },
      ],
    };

    const entries = buildReconEntriesFromQboRegister(src);
    const kinds = new Set(entries.map((e) => e.source_ref.id.split(":")[1]));
    // deposit, purchase, transfer, billpayment, payment, journalentry — all six present.
    expect(kinds).toEqual(new Set(["deposit", "purchase", "transfer", "billpayment", "payment", "journalentry"]));
  });

  it("applies the signed-cents convention (money-IN positive, money-OUT negative)", () => {
    const src: QboRegisterSources = {
      ...emptySources(),
      deposits: [{ Id: "d1", TxnDate: "2026-07-05", TotalAmt: 100, DepositToAccountRef: { value: BANK_A } }],
      purchases: [
        { Id: "p1", TxnDate: "2026-07-05", TotalAmt: 50, AccountRef: { value: BANK_A } },
        { Id: "p2", TxnDate: "2026-07-05", TotalAmt: 12, AccountRef: { value: BANK_A }, Credit: true }, // refund
      ],
      billPayments: [{ Id: "bp1", TxnDate: "2026-07-05", TotalAmt: 75, CreditCardPayment: { CCAccountRef: { value: BANK_A } } }],
    };
    const entries = buildReconEntriesFromQboRegister(src);
    const byId = new Map(entries.map((e) => [e.source_ref.id, e.amount_cents]));
    expect(byId.get("qbo:deposit:d1")).toBe(10000); // money IN +
    expect(byId.get("qbo:purchase:p1")).toBe(-5000); // money OUT -
    expect(byId.get("qbo:purchase:p2")).toBe(1200); // vendor refund flips to money IN +
    expect(byId.get("qbo:billpayment:bp1")).toBe(-7500); // money OUT -
  });

  it("splits a Transfer into two opposite bank legs", () => {
    const src: QboRegisterSources = {
      ...emptySources(),
      transfers: [{ Id: "t1", TxnDate: "2026-07-05", Amount: 200, FromAccountRef: { value: BANK_A }, ToAccountRef: { value: BANK_B } }],
    };
    const entries = buildReconEntriesFromQboRegister(src);
    const from = entries.find((e) => e.source_ref.id === "qbo:transfer:t1:from");
    const to = entries.find((e) => e.source_ref.id === "qbo:transfer:t1:to");
    expect(from?.amount_cents).toBe(-20000);
    expect(from?.account_ref).toBe(BANK_A);
    expect(to?.amount_cents).toBe(20000);
    expect(to?.account_ref).toBe(BANK_B);
  });

  it("skips a Payment left in Undeposited Funds (avoids double-count with its later Deposit)", () => {
    const src: QboRegisterSources = {
      ...emptySources(),
      payments: [
        { Id: "pay-direct", TxnDate: "2026-07-05", TotalAmt: 60, DepositToAccountRef: { value: BANK_A } },
        { Id: "pay-undeposited", TxnDate: "2026-07-05", TotalAmt: 90, DepositToAccountRef: { value: UNDEPOSITED } },
        { Id: "pay-noacct", TxnDate: "2026-07-05", TotalAmt: 30 }, // no DepositToAccountRef → Undeposited Funds
      ],
    };
    const entries = buildReconEntriesFromQboRegister(src);
    const ids = entries.map((e) => e.source_ref.id);
    expect(ids).toContain("qbo:payment:pay-direct");
    expect(ids).not.toContain("qbo:payment:pay-undeposited");
    expect(ids).not.toContain("qbo:payment:pay-noacct");
  });

  it("counts only bank-leg JournalEntry lines, with Debit=+ / Credit=- on the bank account", () => {
    const src: QboRegisterSources = {
      ...emptySources(),
      journalEntries: [
        {
          Id: "je1",
          TxnDate: "2026-07-05",
          Line: [
            { Amount: 40, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: BANK_A } } }, // cash IN
            { Amount: 25, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: BANK_B } } }, // cash OUT
            { Amount: 15, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: REVENUE } } }, // non-bank → excluded
          ],
        },
      ],
    };
    const entries = buildReconEntriesFromQboRegister(src);
    const jeEntries = entries.filter((e) => e.source_ref.id.startsWith("qbo:journalentry:"));
    expect(jeEntries).toHaveLength(2);
    expect(jeEntries.find((e) => e.account_ref === BANK_A)?.amount_cents).toBe(4000);
    expect(jeEntries.find((e) => e.account_ref === BANK_B)?.amount_cents).toBe(-2500);
    expect(jeEntries.some((e) => e.account_ref === REVENUE)).toBe(false);
  });
});
