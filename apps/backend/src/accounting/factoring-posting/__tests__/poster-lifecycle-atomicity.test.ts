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
  createJournalEntryOnClient: mockCreateJournalEntry,
  enqueueJournalEntrySideEffects: mockEnqueueSideEffects,
}));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: mockEnsureOpenPeriod }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: mockWriteTsl }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../faro-agreement-gate.js", () => ({
  requireEffectiveFaroFullRecourseAgreement: vi.fn(async () => ({
    ok: true,
    vendorId: "faro-vendor",
    vendorName: "Faro",
    agreementId: "agr-1",
    factorProfileId: "fp-1",
    companyCode: "TRANSP",
    asOf: "2026-01-20",
  })),
  advanceBoundToFaroVendor: vi.fn(async () => true),
  FARO_FULL_RECOURSE_AGREEMENT_CODE: "FARO_FULL_RECOURSE_V1",
}));

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
    async (...args: unknown[]) => {
      const options = (args.length >= 4 ? args[3] : args[2]) as
        | { afterInsertBeforeCommit?: (client: { query: typeof mockQuery }, header: { id: string }) => Promise<void> }
        | undefined;
      const client =
        args.length >= 4
          ? (args[0] as { query: typeof mockQuery })
          : { query: mockQuery };
      const header = { id: "je-atomic-1" };
      if (options?.afterInsertBeforeCommit) {
        await options.afterInsertBeforeCommit(client, header);
      }
      return header;
    }
  );
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
      return { rows: [] };
    }
    if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
    if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
    if (sql.includes("factoring_lifecycle_posting_keys")) {
      if (sql.includes("INSERT")) return { rows: [{ journal_entry_id: "je-atomic-1" }] };
      return { rows: [] };
    }
    if (sql.includes("AS outstanding")) {
      return { rows: [{ outstanding: "500000" }] };
    }
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
          if (sql.includes("FROM accounting.journal_entries")) {
      // Authoritative repair candidate query — empty unless already_posted fixtures override.
      return { rows: [] };
    }
    if (sql.includes("FROM accounting.journal_entry_postings")) {
        // Conflict probe must be empty; line select for TSL attach returns rows.
        if (sql.includes("LIMIT 1") && (sql.includes("NOT (") || sql.includes("IS DISTINCT FROM"))) {
          return { rows: [] };
        }
        return { rows: [{ id: "line-1" }, { id: "line-2" }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.factoring_lifecycle_posting_keys")) return { rows: [] };
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
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) {
        if (sql.includes("INSERT")) return { rows: [] };
        return { rows: [{ journal_entry_id: "existing-je" }] };
      }
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
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("status::text AS status")) {
        return {
          rows: [{ id: "existing-je", status: "posted", reverses_je_id: null, reversed_by_je_id: null }],
        };
      }
      if (sql.includes("chart_of_accounts_roles") && sql.includes("AS role")) {
        return {
          rows: [
            {
              role: "cash_clearing",
              debit_or_credit: "debit",
              amount_cents: "97000",
              source_transaction_type: null,
              source_transaction_id: null,
            },
            {
              role: "factor_reserve_held",
              debit_or_credit: "debit",
              amount_cents: "1500",
              source_transaction_type: null,
              source_transaction_id: null,
            },
            {
              role: "factor_fee_expense",
              debit_or_credit: "debit",
              amount_cents: "1500",
              source_transaction_type: null,
              source_transaction_id: null,
            },
            {
              role: "factoring_advance_liability",
              debit_or_credit: "credit",
              amount_cents: "100000",
              source_transaction_type: null,
              source_transaction_id: null,
            },
          ],
        };
      }
      if (sql.includes("AS ok") && sql.includes("journal_entry_uuid") && sql.includes("= COALESCE")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entries")) {
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        if (sql.includes("source_transaction_id IS NOT NULL") || sql.includes("NOT (")) {
          return { rows: [] };
        }
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
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("LIMIT 1") && (sql.includes("NOT (") || sql.includes("IS DISTINCT FROM"))) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        return { rows: [{ id: "line-1" }] };
      }
      return { rows: [] };
    });
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

  type ShapeLeg = {
    role: string;
    debit_or_credit: string;
    amount_cents: string;
    source_transaction_type: string | null;
    source_transaction_id: string | null;
  };

  function alreadyPostedAdvanceMocks(opts: {
    shapeLegs: ShapeLeg[];
    shapeLegsAlt?: ShapeLeg[];
    keyJeIds?: { repay?: string; return?: string; single?: string };
    /**
     * entry_date of the already-posted JE(s). The chargeback repair path enforces
     * `expected_entry_date` (a valid same-date JE is the only legitimate already_posted
     * candidate — a JE booked on a different date must NOT be silently re-attached).
     * Must equal the repaired event's economic date.
     */
    entryDate?: string;
  }) {
    let shapeCalls = 0;
    const singleKey = opts.keyJeIds?.single ?? "existing-je";
    const jeEntryDate = opts.entryDate ?? null;
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) {
        if (sql.includes("INSERT")) return { rows: [] };
        const eventKey = String(values?.[3] ?? "");
        if (eventKey.includes("chargeback_repay")) {
          return { rows: [{ journal_entry_id: opts.keyJeIds?.repay ?? "je-repay" }] };
        }
        if (eventKey.includes("chargeback_return")) {
          return { rows: [{ journal_entry_id: opts.keyJeIds?.return ?? "je-return" }] };
        }
        return { rows: [{ journal_entry_id: singleKey }] };
      }
      if (sql.includes("AS outstanding")) {
        return { rows: [{ outstanding: "100000" }] };
      }
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return { rows: [advanceRow()] };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("status::text AS status")) {
        return {
          rows: [
            {
              id: "existing-je",
              status: "posted",
              entry_date: jeEntryDate,
              reverses_je_id: null,
              reversed_by_je_id: null,
            },
          ],
        };
      }
      if (sql.includes("chart_of_accounts_roles") && sql.includes("AS role")) {
        shapeCalls += 1;
        const legs = shapeCalls === 1 ? opts.shapeLegs : (opts.shapeLegsAlt ?? opts.shapeLegs);
        return { rows: legs };
      }
      if (sql.includes("AS ok") && sql.includes("journal_entry_uuid") && sql.includes("= COALESCE")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
        return { rows: [{ id: singleKey }] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entries")) {
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        if (sql.includes("source_transaction_id IS NOT NULL") || sql.includes("NOT (")) {
          return { rows: [] };
        }
        return { rows: [{ id: "line-1" }] };
      }
      if (sql.includes("FROM accounting.invoices") && !sql.includes("UPDATE")) {
        return { rows: [{ id: "inv-1", total_cents: "100000", voided_at: null }] };
      }
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE accounting.invoices")) return { rows: [] };
      if (sql.includes("UPDATE accounting.factoring_advances")) return { rows: [] };
      return { rows: [] };
    });
  }

  it("customer payment already_posted repairs links + subledger in one withLuciaBypass txn", async () => {
    alreadyPostedAdvanceMocks({
      shapeLegs: [
        {
          role: "factoring_advance_liability",
          debit_or_credit: "debit",
          amount_cents: "50000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
        {
          role: "ar_control",
          debit_or_credit: "credit",
          amount_cents: "50000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
      ],
    });
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
    alreadyPostedAdvanceMocks({
      shapeLegs: [
        {
          role: "cash_clearing",
          debit_or_credit: "debit",
          amount_cents: "1500",
          source_transaction_type: null,
          source_transaction_id: null,
        },
        {
          role: "factor_reserve_held",
          debit_or_credit: "credit",
          amount_cents: "1500",
          source_transaction_type: null,
          source_transaction_id: null,
        },
      ],
    });
    const prev = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
        reserveInserts += 1;
        return { rows: [] };
      }
      return prev ? prev(sql, values) : { rows: [] };
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
    alreadyPostedAdvanceMocks({
      keyJeIds: { repay: "je-repay", return: "je-return" },
      // charged_back_at_iso 2026-02-01T00:00Z resolves to America/Chicago business
      // date 2026-01-31 — the repair's expected_entry_date. The already-posted JE
      // must carry that same economic date to be a valid repair candidate.
      entryDate: "2026-01-31",
      shapeLegs: [
        {
          role: "factoring_advance_liability",
          debit_or_credit: "debit",
          amount_cents: "100000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
        {
          role: "cash_clearing",
          debit_or_credit: "credit",
          amount_cents: "100000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
      ],
      shapeLegsAlt: [
        {
          role: "factoring_recoursed_ar",
          debit_or_credit: "debit",
          amount_cents: "100000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
        {
          role: "ar_control",
          debit_or_credit: "credit",
          amount_cents: "100000",
          source_transaction_type: null,
          source_transaction_id: null,
        },
      ],
    });
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

  it("chargeback mid-flow inject after repay rolls back — no side-effect enqueue", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) {
        if (sql.includes("INSERT")) return { rows: [{ journal_entry_id: "je-atomic-1" }] };
        return { rows: [] };
      }
      if (sql.includes("AS outstanding")) return { rows: [{ outstanding: "100000" }] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return { rows: [advanceRow()] };
      }
      if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entries")) return { rows: [] };
      if (sql.includes("FROM accounting.journal_entry_postings")) {
        if (sql.includes("LIMIT 1") && (sql.includes("NOT (") || sql.includes("IS DISTINCT FROM"))) {
          return { rows: [] };
        }
        return { rows: [{ id: "line-1" }] };
      }
      if (sql.includes("UPDATE accounting.invoices")) return { rows: [] };
      if (sql.includes("UPDATE accounting.factoring_advances")) return { rows: [] };
      return { rows: [] };
    });
    __posterAtomicityTestHooks.failAfterChargebackRepayBeforeReturn = true;
    await expect(
      postFactoringChargebackEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        chargeback_amount_cents: 100000,
        default_interest_cents: 0,
        recoursed_ar_cents: 100000,
        charged_back_at_iso: "2026-02-01T00:00:00.000Z",
      })
    ).rejects.toThrow("injected_failure_after_chargeback_repay_before_return");
    expect(mockEnqueueSideEffects).not.toHaveBeenCalled();
    __posterAtomicityTestHooks.failAfterChargebackRepayBeforeReturn = false;
  });
});
