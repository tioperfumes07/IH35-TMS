import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocked collaborators (all EXISTING infra this service REUSES — no new GL math) ──────────────────────
// vi.mock factories are hoisted above imports; shared mutable state + mock fns must live in vi.hoisted().
const h = vi.hoisted(() => {
  class ExpenseCategoryMapResolutionError extends Error {}
  const state = {
    flagOn: true,
    consented: true,
    advanceAccountId: "acc00000-0000-0000-0000-0000000000AD",
    advanceResolves: true,
    txnRow: { amount_cents: "12500", is_credit: false, categorization_load_id: null as string | null } as
      | { amount_cents: string | number; is_credit: boolean; categorization_load_id: string | null }
      | undefined,
    createdDeductionId: "ded00000-0000-0000-0000-000000000777",
  };
  const updateCalls: { sql: string; values?: unknown[] }[] = [];
  const mockClient = {
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("SELECT") && sql.includes("FROM banking.bank_transactions")) {
        return { rows: state.txnRow ? [state.txnRow] : [], rowCount: state.txnRow ? 1 : 0 };
      }
      if (sql.includes("UPDATE banking.bank_transactions")) {
        updateCalls.push({ sql, values });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return {
    ExpenseCategoryMapResolutionError,
    state,
    updateCalls,
    mockClient,
    chargeBucket: vi.fn(async () => 12500),
    getOrCreateBucket: vi.fn(async () => ({ id: "buc00000-0000-0000-0000-000000000010", remaining_balance_cents: 0 })),
    createSettlementDeduction: vi.fn(async () => ({ id: state.createdDeductionId })),
  };
});
const { state, updateCalls, chargeBucket, getOrCreateBucket, createSettlementDeduction } = h;

vi.mock("../accounting/shared.js", () => ({
  withCompanyScope: async (_u: string, _c: string, cb: (client: unknown) => unknown) => cb(h.mockClient),
}));
vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: vi.fn(async () => h.state.flagOn),
}));
vi.mock("../accounting/expense-category-map/resolver.service.js", () => ({
  ExpenseCategoryMapResolutionError: h.ExpenseCategoryMapResolutionError,
  resolveAccountForCategory: vi.fn(async () => {
    if (!h.state.advanceResolves) throw new h.ExpenseCategoryMapResolutionError("not designated");
    return { account_id: h.state.advanceAccountId };
  }),
}));
vi.mock("../legal/signed-finance-handoff.service.js", () => ({
  hasSignedDeductionAuthorization: vi.fn(async () => h.state.consented),
}));
vi.mock("../accounting/settlement-posting/bucket-ledger.service.js", () => ({
  getOrCreateBucket: h.getOrCreateBucket,
  chargeBucket: h.chargeBucket,
}));
vi.mock("../driver-finance/deductions.service.js", () => ({
  createSettlementDeduction: h.createSettlementDeduction,
}));

import { maybeCreateBankCategorizationDriverDeduction } from "./bank-driver-expense-deduction.service.js";

const BASE = {
  companyId: "oc000000-0000-0000-0000-000000000001",
  actorUserUuid: "usr00000-0000-0000-0000-000000000001",
  bankTransactionId: "btx00000-0000-0000-0000-000000000005",
  driverId: "dr000000-0000-0000-0000-000000000009",
  glAccountId: "acc00000-0000-0000-0000-0000000000EE", // an EXPENSE account (not the advance account)
  recoverFromDriver: true,
  recoverDeductionType: "fine",
  loadId: "lod00000-0000-0000-0000-000000000003",
  memo: "Toll violation citation",
};

beforeEach(() => {
  state.flagOn = true;
  state.consented = true;
  state.advanceResolves = true;
  state.advanceAccountId = "acc00000-0000-0000-0000-0000000000AD";
  state.txnRow = { amount_cents: "12500", is_credit: false, categorization_load_id: null };
  updateCalls.length = 0;
  vi.clearAllMocks();
});

describe("maybeCreateBankCategorizationDriverDeduction", () => {
  it("flag OFF → strict no-op (no bucket, no deduction, no reverse link)", async () => {
    state.flagOn = false;
    const res = await maybeCreateBankCategorizationDriverDeduction(BASE);
    expect(res).toEqual({ posted: false, reason: "flag_off" });
    expect(getOrCreateBucket).not.toHaveBeenCalled();
    expect(createSettlementDeduction).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("no driver tagged → no-op", async () => {
    const res = await maybeCreateBankCategorizationDriverDeduction({ ...BASE, driverId: null });
    expect(res).toEqual({ posted: false, reason: "no_driver" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("recover_from_driver false → analytics-only tag, no deduction", async () => {
    const res = await maybeCreateBankCategorizationDriverDeduction({ ...BASE, recoverFromDriver: false });
    expect(res).toEqual({ posted: false, reason: "not_recover_from_driver" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("cedes to the driver-advance path when the chosen account IS the advance account (no double-book)", async () => {
    const res = await maybeCreateBankCategorizationDriverDeduction({ ...BASE, glAccountId: state.advanceAccountId });
    expect(res).toEqual({ posted: false, reason: "driver_advance_branch" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("a credit (money IN) is not a recoverable payment → not_a_debit", async () => {
    state.txnRow = { amount_cents: "12500", is_credit: true, categorization_load_id: null };
    const res = await maybeCreateBankCategorizationDriverDeduction(BASE);
    expect(res).toEqual({ posted: false, reason: "not_a_debit" });
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("consent gate (FLSA): no signed authorization → fail-closed consent_missing", async () => {
    state.consented = false;
    const res = await maybeCreateBankCategorizationDriverDeduction(BASE);
    expect(res).toEqual({ posted: false, reason: "consent_missing" });
    expect(chargeBucket).not.toHaveBeenCalled();
    expect(createSettlementDeduction).not.toHaveBeenCalled();
  });

  it("happy path: fine → charges bucket + creates recoverable deduction (load_id direct + bank-txn provenance) + reverse-links the txn", async () => {
    const res = await maybeCreateBankCategorizationDriverDeduction(BASE);
    expect(res).toMatchObject({
      posted: true,
      deduction_id: state.createdDeductionId,
      bucket_id: "buc00000-0000-0000-0000-000000000010",
      bucket_type: "fine",
      driver_id: BASE.driverId,
      load_id: BASE.loadId,
      amount_cents: 12500,
    });

    // Reused the bucket ledger.
    expect(getOrCreateBucket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ driverId: BASE.driverId, bucketType: "fine" })
    );
    expect(chargeBucket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 12500 })
    );

    // Reused the ONE canonical deduction writer, carrying the linkage the owner requires.
    expect(createSettlementDeduction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        driverId: BASE.driverId,
        operatingCompanyId: BASE.companyId,
        amountCents: 12500,
        sourceType: "fine",
        loadId: BASE.loadId, // load_id DIRECT
        bucketId: "buc00000-0000-0000-0000-000000000010",
        sourceBankTransactionId: BASE.bankTransactionId, // reverse drill-through
      })
    );

    // Reverse link written on the bank transaction (bank txn → the deduction it created).
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.sql).toContain("categorization_deduction_id");
    expect(updateCalls[0]!.values).toEqual([state.createdDeductionId, BASE.bankTransactionId, BASE.companyId]);
  });

  it("falls back to the persisted categorization_load_id when the caller omits loadId", async () => {
    state.txnRow = { amount_cents: "9900", is_credit: false, categorization_load_id: "lod00000-0000-0000-0000-0000000000FF" };
    const res = await maybeCreateBankCategorizationDriverDeduction({ ...BASE, loadId: null });
    expect(res).toMatchObject({ posted: true, load_id: "lod00000-0000-0000-0000-0000000000FF" });
    expect(createSettlementDeduction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loadId: "lod00000-0000-0000-0000-0000000000FF" })
    );
  });

  it("unknown bucket type normalizes to 'fine' (poster resolves ${type}_recovery generically)", async () => {
    const res = await maybeCreateBankCategorizationDriverDeduction({ ...BASE, recoverDeductionType: "not-a-real-bucket" });
    expect(res).toMatchObject({ posted: true, bucket_type: "fine" });
  });
});
