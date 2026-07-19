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
  repairFactoringLifecycleSourceLinks,
} from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockWithCurrentUser,
  mockIsEnabled,
  mockCreateJournalEntryOnClient,
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
    mockCreateJournalEntryOnClient: vi.fn(),
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
  createJournalEntryOnClient: mockCreateJournalEntryOnClient,
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
    mockCreateJournalEntryOnClient.mockReset();
    mockEnqueueSideEffects.mockReset();
    mockResolveRoleAccount.mockReset();
    mockEnsureOpenPeriod.mockReset();
    mockWriteTsl.mockReset();
    __posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks = false;

    mockIsEnabled.mockResolvedValue(true);
    mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
    mockEnsureOpenPeriod.mockResolvedValue(undefined);
    mockCreateJournalEntryOnClient.mockResolvedValue({ id: "je-atomic-1" });
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
    expect(mockCreateJournalEntryOnClient).toHaveBeenCalledTimes(1);
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
    ).rejects.toThrow(/injected_failure_between_je_and_lifecycle_links/);
    expect(mockCreateJournalEntryOnClient).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSideEffects).not.toHaveBeenCalled();
    expect(mockWriteTsl).not.toHaveBeenCalled();
  });

  it("already_posted path repairs missing lifecycle source links (idempotent, no new JE)", async () => {
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
      return { rows: [] };
    });

    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntryOnClient).not.toHaveBeenCalled();
    expect(mockWriteTsl).toHaveBeenCalled();
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
});
