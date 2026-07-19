/**
 * CPA VETO 0280-05 — JE + lifecycle source links must be atomic (same caller-owned txn).
 * Injected failure between JE insert and lifecycle links must roll back with no orphan JE.
 * already_posted paths must repair missing source links without duplicating financial artifacts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  __posterAtomicityTestHooks,
  attachFactoringLifecycleSourceLinks,
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringChargebackEvent,
  repairFactoringLifecycleSourceLinks,
} from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockWithCurrentUser,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockEnqueueSideEffects,
  mockResolveRoleAccount,
  mockEnsureOpenPeriod,
  mockWriteTsl,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockWithCurrentUser: withCurrentUser,
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockEnqueueSideEffects: vi.fn(async () => undefined),
    mockResolveRoleAccount: vi.fn(),
    mockEnsureOpenPeriod: vi.fn(async () => undefined),
    mockWriteTsl: vi.fn(async () => undefined),
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
  withCurrentUser: mockWithCurrentUser,
}));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({
  createJournalEntry: mockCreateJournalEntry,
  enqueueJournalEntrySideEffects: mockEnqueueSideEffects,
}));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: mockEnsureOpenPeriod }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: mockWriteTsl }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

describe("factoring poster — atomic lifecycle source links", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsEnabled.mockReset();
    mockCreateJournalEntry.mockReset();
    mockEnqueueSideEffects.mockReset();
    mockResolveRoleAccount.mockReset();
    mockEnsureOpenPeriod.mockReset();
    mockWriteTsl.mockReset();
    __posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks = false;

    mockIsEnabled.mockResolvedValue(true);
    mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
    mockEnsureOpenPeriod.mockResolvedValue(undefined);
    mockCreateJournalEntry.mockImplementation(
      async (
        _input: unknown,
        _actor: unknown,
        options?: {
          afterInsertBeforeCommit?: (
            client: { query: typeof mockQuery },
            header: { id: string }
          ) => Promise<void>;
        }
      ) => {
        const header = { id: "je-atomic-1" };
        if (options?.afterInsertBeforeCommit) {
          await options.afterInsertBeforeCommit({ query: mockQuery }, header);
        }
        return header;
      }
    );
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: ADVANCE,
              display_id: "FAC-0001",
              invoice_total_cents: 100000,
              advance_amount_cents: 97000,
              reserve_amount_cents: 1500,
              factor_fee_cents: 1500,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
              status: "advanced",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return { rows: [{ id: "line-1" }, { id: "line-2" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) return { rows: [] };
      return { rows: [] };
    });
  });

  afterEach(() => {
    __posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks = false;
  });

  it("funding posts JE + lifecycle links inside withCurrentUser before side-effect enqueue", async () => {
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: true, journal_entry_id: "je-atomic-1" });
    expect(mockWithCurrentUser).toHaveBeenCalled();
    expect(mockEnsureOpenPeriod).toHaveBeenCalled();
    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    expect(mockWriteTsl).toHaveBeenCalled();
    expect(mockEnqueueSideEffects).toHaveBeenCalledTimes(1);
    // Side effects only after the atomic txn callback completes.
    const currentUserOrder = mockWithCurrentUser.mock.invocationCallOrder[0]!;
    const enqueueOrder = mockEnqueueSideEffects.mock.invocationCallOrder[0]!;
    expect(currentUserOrder).toBeLessThan(enqueueOrder);
  });

  it("injected failure between JE and lifecycle links aborts — no side-effect enqueue (rollback proof)", async () => {
    __posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks = true;
    await expect(
      postFactoringAdvanceEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
      })
    ).rejects.toThrow("injected_failure_between_je_and_lifecycle_links");
    expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSideEffects).not.toHaveBeenCalled();
    expect(mockWriteTsl).not.toHaveBeenCalled();
  });

  it("already_posted path repairs missing lifecycle source links + reserve_held (idempotent, no new JE)", async () => {
    let reserveInserts = 0;
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: ADVANCE,
              display_id: "FAC-0001",
              invoice_total_cents: 100000,
              advance_amount_cents: 97000,
              reserve_amount_cents: 1500,
              factor_fee_cents: 1500,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
              status: "advanced",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
        return { rows: [{ id: "existing-je" }] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return { rows: [{ id: "line-1" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
        reserveInserts += 1;
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(mockWriteTsl).toHaveBeenCalled();
    expect(reserveInserts).toBe(1);
  });

  it("attachFactoringLifecycleSourceLinks is idempotent via TSL write helper", async () => {
    const client = { query: mockQuery };
    mockQuery.mockResolvedValue({ rows: [{ id: "line-1" }] });
    await attachFactoringLifecycleSourceLinks(client, {
      operating_company_id: OPCO,
      journal_entry_id: "je-1",
      factoring_advance_id: ADVANCE,
      source_transaction_type: "factoring_advance",
    });
    await attachFactoringLifecycleSourceLinks(client, {
      operating_company_id: OPCO,
      journal_entry_id: "je-1",
      factoring_advance_id: ADVANCE,
      source_transaction_type: "factoring_advance",
    });
    expect(mockWriteTsl.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("repairFactoringLifecycleSourceLinks no-ops safely when memo JE missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.journal_entries")) return { rows: [] };
      return { rows: [] };
    });
    const repaired = await repairFactoringLifecycleSourceLinks({
      operating_company_id: OPCO,
      memo: "Factoring funding FAC-MISSING",
      factoring_advance_id: ADVANCE,
      source_transaction_type: "factoring_advance",
    });
    expect(repaired).toEqual({ journal_entry_id: null, repaired: false });
  });

  function advanceRow() {
    return {
      id: ADVANCE,
      display_id: "FAC-0001",
      invoice_total_cents: 100000,
      advance_amount_cents: 97000,
      reserve_amount_cents: 1500,
      factor_fee_cents: 1500,
      release_amount_cents: 0,
      submitted_at: "2026-01-05T00:00:00.000Z",
      advanced_at: "2026-01-07T00:00:00.000Z",
      collected_at: "2026-01-20T00:00:00.000Z",
      released_at: "2026-01-25T00:00:00.000Z",
      status: "advanced",
    };
  }

  function alreadyPostedAdvanceMocks() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return { rows: [advanceRow()] };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
        return { rows: [{ id: "existing-je" }] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return { rows: [{ id: "line-1" }] };
      }
      if (sql.includes("UPDATE accounting.invoices")) return { rows: [] };
      return { rows: [] };
    });
  }

  it("customer payment already_posted repairs links + subledger in one withLuciaBypass txn", async () => {
    alreadyPostedAdvanceMocks();
    const luciaCallsBefore = mockWithLuciaBypass.mock.calls.length;
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 50000,
      paid_at_iso: "2026-01-20T00:00:00.000Z",
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(mockWriteTsl).toHaveBeenCalled();
    // prepared gate + single atomic repair (not separate repair then subledger txns)
    expect(mockWithLuciaBypass.mock.calls.length - luciaCallsBefore).toBeLessThanOrEqual(2);
  });

  it("reserve release already_posted repairs lifecycle links + reserve_released without new JE", async () => {
    let reserveInserts = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return { rows: [advanceRow()] };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
        return { rows: [{ id: "existing-je" }] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return { rows: [{ id: "line-1" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
        reserveInserts += 1;
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 1500,
      released_at_iso: "2026-01-25T00:00:00.000Z",
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(mockWriteTsl).toHaveBeenCalled();
    expect(reserveInserts).toBe(1);
  });

  it("chargeback already_posted repairs repay+return links; return afterRepair is same txn", async () => {
    alreadyPostedAdvanceMocks();
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 100000,
      default_interest_cents: 0,
      recoursed_ar_cents: 100000,
      charged_back_at_iso: "2026-02-01T00:00:00.000Z",
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    expect(mockWriteTsl).toHaveBeenCalled();
  });
});
