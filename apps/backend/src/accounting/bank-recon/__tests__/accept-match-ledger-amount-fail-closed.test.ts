import { describe, expect, it, vi } from "vitest";
import {
  acceptExactMultiDocumentMatch,
  acceptMatchWithResolveDifference,
  previewMatchVariance,
} from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function bankTxnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_TX,
    bank_account_id: "acct-1",
    operating_company_id: OPCO,
    transaction_date: "2026-08-29",
    amount_cents: 100000,
    is_credit: true,
    description: "ACH deposit",
    merchant_name: "Customer",
    notes: null,
    review_state: "for_review",
    ...overrides,
  };
}

describe("BANK-F3688 — ledger amount fail-closed", () => {
  it("preview refuses a missing/wrong-company payment instead of treating it as $0", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("FROM accounting.payments")) return { rows: [] };
      return { rows: [] };
    });

    await expect(
      previewMatchVariance({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        ledger_entry_kind: "payment",
        ledger_entry_id: PAYMENT,
      })
    ).rejects.toThrow("ledger_document_not_found:payment");
  });

  it("1:1 accept refuses a voided/missing payment (no difference JE against a ghost)", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("FROM accounting.payments")) return { rows: [] };
      return { rows: [] };
    });

    await expect(
      acceptMatchWithResolveDifference({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        actor_user_uuid: ACTOR,
        ledger_entry_kind: "payment",
        ledger_entry_id: PAYMENT,
        difference_account_id: "00000000-0000-4000-8000-000000000000",
      })
    ).rejects.toThrow("ledger_document_not_found:payment");
  });

  it("multi-document accept refuses a missing payment (same gate as 1:1)", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM banking.bank_transactions") && sql.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (sql.includes("FROM accounting.payments")) return { rows: [] };
      return { rows: [] };
    });

    await expect(
      acceptExactMultiDocumentMatch({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        actor_user_uuid: ACTOR,
        entries: [{ ledger_entry_kind: "payment", ledger_entry_id: PAYMENT }],
      })
    ).rejects.toThrow("ledger_document_not_found:payment");
  });
});
