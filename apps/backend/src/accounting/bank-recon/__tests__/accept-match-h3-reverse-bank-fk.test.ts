/**
 * WAVE-H3 — acceptMatch stamps reverse money→bank FKs (LINK-007 / LINK-008).
 * Forward matched_* alone left payments/bill_payments.source_bank_transaction_id null.
 */
import { describe, expect, it, vi } from "vitest";
import { acceptMatchWithResolveDifference } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(),
}));

vi.mock("../../accounting-spine-emit.js", () => ({
  writeTransactionSourceLink: vi.fn(),
}));

vi.mock("../../cash-basis/engine.js", () => ({
  applyCashBasisSuppression: vi.fn((entries: unknown[]) => entries),
}));

vi.mock("../../../banking/bank-account-visibility.js", () => ({
  bankAccountHiddenFilterSql: () => "",
  bankTransactionHiddenFilterSql: () => "",
  isBankAccountHideEnabled: () => false,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BANK_ACCT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BILL_PAY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function bankTxnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_TX,
    bank_account_id: BANK_ACCT,
    operating_company_id: OPCO,
    transaction_date: "2026-07-31",
    amount_cents: -50000,
    is_credit: false,
    description: "ACH payment",
    merchant_name: "Customer",
    notes: null,
    review_state: "for_review",
    ...overrides,
  };
}

describe("WAVE-H3 acceptMatch reverse bank FK stamps", () => {
  it("payment match stamps accounting.payments.source_bank_transaction_id", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("FROM accounting.payments") && sql.includes("amount_cents")) {
        return { rows: [{ amount_cents: 50000 }] };
      }
      return { rows: [] };
    });

    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "payment",
      ledger_entry_id: PAYMENT,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });

    const reverse = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE accounting.payments") && String(sql).includes("source_bank_transaction_id"),
    );
    expect(reverse).toBeDefined();
    expect(String(reverse?.[0])).toContain("COALESCE(source_bank_transaction_id");
    expect(reverse?.[1]).toEqual([BANK_TX, PAYMENT, OPCO]);

    const forward = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE banking.bank_transactions") && String(sql).includes("matched_payment_id"),
    );
    expect(forward).toBeDefined();
  });

  it("ACCT-F5620 — payment match also backlinks matched_invoice_id when the payment is already applied to one invoice", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    const INVOICE = "99999999-9999-4999-8999-999999999999";
    mockQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM banking.bank_transactions") && s.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (s.includes("FROM accounting.payments") && s.includes("amount_cents") && !s.includes("source_bank_transaction_id")) {
        return { rows: [{ amount_cents: 50000 }] };
      }
      // backlinkBankTransactionToInvoice's own read of the payment it was just handed.
      if (s.includes("FROM accounting.payments") && s.includes("source_bank_transaction_id")) {
        return { rows: [{ source_bank_transaction_id: BANK_TX }] };
      }
      if (s.includes("FROM accounting.payment_applications")) {
        return { rows: [{ invoice_id: INVOICE }] };
      }
      if (s.includes("UPDATE banking.bank_transactions") && s.includes("matched_invoice_id")) {
        return { rows: [{ id: BANK_TX }], rowCount: 1 };
      }
      return { rows: [] };
    });

    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "payment",
      ledger_entry_id: PAYMENT,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });

    const invoiceLookup = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.payment_applications"));
    expect(invoiceLookup).toBeDefined();
    expect(invoiceLookup?.[1]).toEqual([PAYMENT, OPCO]);

    const backlink = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("UPDATE banking.bank_transactions") && String(sql).includes("matched_invoice_id")
    );
    expect(backlink).toBeDefined();
    expect(backlink?.[1]).toEqual([INVOICE, PAYMENT, BANK_TX, OPCO]);
  });

  it("bill_payment match stamps source_bank_transaction_id + from_bank_account_id", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("FROM accounting.bill_payments") && sql.includes("amount_cents")) {
        return { rows: [{ amount_cents: 50000 }] };
      }
      return { rows: [] };
    });

    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "bill_payment",
      ledger_entry_id: BILL_PAY,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });

    const reverse = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE accounting.bill_payments") && String(sql).includes("source_bank_transaction_id"),
    );
    expect(reverse).toBeDefined();
    expect(String(reverse?.[0])).toContain("from_bank_account_id = COALESCE");
    expect(reverse?.[1]).toEqual([BANK_TX, BILL_PAY, OPCO, BANK_ACCT]);
  });
});
