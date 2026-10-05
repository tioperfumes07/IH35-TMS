/**
 * ENG-SPINE — factoring-advance accept follow-ups (1:1 + multi-document).
 * Multi-document used to always sweep 1090. Reserve-bank repurchase must chargeback;
 * a pending Faro reserve ROW posts once and skips sweep/chargeback.
 */
import { describe, expect, it, vi } from "vitest";
import { acceptExactMultiDocumentMatch, acceptMatchWithResolveDifference } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

const { mockPostSourceTransaction } = vi.hoisted(() => ({
  mockPostSourceTransaction: vi.fn(
    async (_client: unknown, _p: { source_transaction_type?: string; source_transaction_id?: string }) => ({
      journal_entry_id: "je-sweep",
    }),
  ),
}));
const { mockChargeback, mockLoadAmounts } = vi.hoisted(() => ({
  mockChargeback: vi.fn(async (_p: { factoring_advance_id?: string }) => ({ posted: true, journal_entry_id: "je-cb-1" })),
  mockLoadAmounts: vi.fn(async () => ({ liability_cents: 25000, recoursed_ar_cents: 25000 })),
}));
const { mockIsReserve, mockLoadFaro, mockPostFaro } = vi.hoisted(() => ({
  mockIsReserve: vi.fn(async () => false),
  mockLoadFaro: vi.fn(async () => null),
  mockPostFaro: vi.fn(async () => ({ journal_entry_id: "je-faro-1", poster_cleared_bank: true as const })),
}));

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

vi.mock("../../../factoring/owner-only-purchase.js", () => ({
  checkFactoringPurchaseOwner: vi.fn(async () => true),
  FactoringPurchaseOwnerOnlyError: class extends Error {},
}));

vi.mock("../../posting-engine.service.js", async (orig) => {
  const actual = await orig<typeof import("../../posting-engine.service.js")>();
  return { ...actual, ensureOpenPeriod: vi.fn(async () => undefined), postSourceTransactionInClientTx: mockPostSourceTransaction };
});

vi.mock("../../factoring-posting/poster.service.js", async (orig) => {
  const actual = await orig<typeof import("../../factoring-posting/poster.service.js")>();
  return {
    ...actual,
    postFactoringChargebackEvent: mockChargeback,
    loadExactLinkedChargebackAmountsOnClient: mockLoadAmounts,
  };
});

vi.mock("../bank-match-faro-reserve-post.service.js", async (orig) => {
  const actual = await orig<typeof import("../bank-match-faro-reserve-post.service.js")>();
  return {
    ...actual,
    isFaroReserveBankAccount: mockIsReserve,
    loadFaroReserveEntryForBankTxn: mockLoadFaro,
    postFaroReserveRowOnBankMatch: mockPostFaro,
    postFaroRsvDepositsOnPaymentMatch: vi.fn(async () => undefined),
  };
});

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BANK_ACCT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADV_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADV_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function bankTxnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_TX,
    bank_account_id: BANK_ACCT,
    operating_company_id: OPCO,
    transaction_date: "2026-09-22",
    amount_cents: 50000,
    is_credit: true,
    description: "FARO PURCHASE",
    merchant_name: "FARO",
    notes: null,
    review_state: "for_review",
    bank_ledger_account_id: "acct-bank-ledger",
    ...overrides,
  };
}

function mockSql(txnOverrides: Record<string, unknown> = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [{ id: "match-1" }], rowCount: 1 };
    if (s.includes("FROM banking.bank_transactions") && s.includes("SELECT")) return { rows: [bankTxnRow(txnOverrides)] };
    if (s.includes("FROM accounting.factoring_advances")) return { rows: [{ amount_cents: 25000 }] };
    if (s.includes("UPDATE banking.bank_transactions")) return { rows: [{ id: BANK_TX }], rowCount: 1 };
    return { rows: [] };
  });
}

function resetAll(txnOverrides: Record<string, unknown> = {}) {
  mockQuery.mockReset();
  mockWithLuciaBypass.mockClear();
  mockPostSourceTransaction.mockClear();
  mockChargeback.mockClear();
  mockLoadAmounts.mockClear();
  mockIsReserve.mockReset();
  mockLoadFaro.mockReset();
  mockPostFaro.mockClear();
  mockIsReserve.mockResolvedValue(false);
  mockLoadFaro.mockResolvedValue(null);
  mockSql(txnOverrides);
}

describe("ENG-SPINE factoring-advance accept follow-ups", () => {
  it("1:1 operating-bank advance sweeps factoring_advance_deposit and does not chargeback", async () => {
    resetAll({ amount_cents: 25000 });
    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "factoring_advance",
      ledger_entry_id: ADV_A,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(mockPostSourceTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source_transaction_type: "factoring_advance_deposit",
        source_transaction_id: ADV_A,
      }),
      expect.anything()
    );
    expect(mockChargeback).not.toHaveBeenCalled();
    expect(mockPostFaro).not.toHaveBeenCalled();
  });

  it("1:1 reserve-bank repurchase chargebacks and does not sweep", async () => {
    resetAll({ amount_cents: 25000 });
    mockIsReserve.mockResolvedValue(true);
    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "factoring_advance",
      ledger_entry_id: ADV_A,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(mockChargeback).toHaveBeenCalledWith(
      expect.objectContaining({
        factoring_advance_id: ADV_A,
        client: expect.anything(),
      })
    );
    expect(mockPostSourceTransaction).not.toHaveBeenCalled();
  });

  it("multi operating-bank batch sweeps every advance", async () => {
    resetAll();
    mockQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [{ id: "match-1" }], rowCount: 1 };
      if (s.includes("FROM banking.bank_transactions") && s.includes("SELECT")) {
        return { rows: [bankTxnRow({ amount_cents: 50000 })] };
      }
      if (s.includes("FROM accounting.factoring_advances")) return { rows: [{ amount_cents: 25000 }] };
      if (s.includes("UPDATE banking.bank_transactions")) return { rows: [{ id: BANK_TX }], rowCount: 1 };
      return { rows: [] };
    });
    await acceptExactMultiDocumentMatch({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      entries: [
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_A },
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_B },
      ],
    });
    const sweeps = mockPostSourceTransaction.mock.calls.filter(
      (c) => c[1]?.source_transaction_type === "factoring_advance_deposit"
    );
    expect(sweeps).toHaveLength(2);
    expect(sweeps.map((c) => c[1]?.source_transaction_id)).toEqual([ADV_A, ADV_B]);
    expect(mockChargeback).not.toHaveBeenCalled();
  });

  it("multi reserve-bank repurchase chargebacks every advance and does not sweep", async () => {
    resetAll();
    mockIsReserve.mockResolvedValue(true);
    await acceptExactMultiDocumentMatch({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      entries: [
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_A },
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_B },
      ],
    });
    expect(mockChargeback).toHaveBeenCalledTimes(2);
    expect(mockChargeback.mock.calls.map((c) => c[0]?.factoring_advance_id)).toEqual([ADV_A, ADV_B]);
    expect(mockPostSourceTransaction).not.toHaveBeenCalled();
  });

  it("multi pending Faro reserve ROW posts once and skips sweep/chargeback", async () => {
    resetAll();
    mockIsReserve.mockResolvedValue(true);
    mockLoadFaro.mockResolvedValue({
      id: "faro-row-1",
      entry_kind: "escrow_held",
      journal_entry_id: null,
      bank_transaction_id: BANK_TX,
    });
    await acceptExactMultiDocumentMatch({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      entries: [
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_A },
        { ledger_entry_kind: "factoring_advance", ledger_entry_id: ADV_B },
      ],
    });
    expect(mockPostFaro).toHaveBeenCalledTimes(1);
    expect(mockChargeback).not.toHaveBeenCalled();
    expect(mockPostSourceTransaction).not.toHaveBeenCalled();
    const advanceStamp = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("matched_factoring_advance_id") && String(sql).includes("COALESCE")
    );
    expect(advanceStamp).toBeDefined();
  });
});
