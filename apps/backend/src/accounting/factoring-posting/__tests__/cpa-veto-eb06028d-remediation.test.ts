/**
 * CPA VETO on exact head eb06028d — five confirmed defects + concurrent CR plants.
 * Unit-level fail-closed plants (no Neon / flags / QBO).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FactoringEntryDateError,
  resolveCanonicalEntryDate,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringChargebackEvent,
} from "../poster.service.js";
import {
  validateLifecycleJeExactShape,
  attachFactoringLifecycleSourceLinksStrict,
  findStrictLifecycleRepairCandidate,
} from "../lifecycle-repair.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockWithCurrentUser,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
  mockFaroGate,
  mockAdvanceBound,
} = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockWithCurrentUser: vi.fn(async (_u: string, fn: (client: { query: typeof query }) => unknown) =>
      fn({ query })
    ),
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
    mockFaroGate: vi.fn(),
    mockAdvanceBound: vi.fn(),
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
  enqueueJournalEntrySideEffects: vi.fn(async () => undefined),
}));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../faro-agreement-gate.js", () => ({
  requireEffectiveFaroFullRecourseAgreement: mockFaroGate,
  advanceBoundToFaroVendor: mockAdvanceBound,
  FARO_FULL_RECOURSE_AGREEMENT_CODE: "FARO_FULL_RECOURSE_V1",
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

describe("resolveCanonicalEntryDate — invalid dates fail closed (no today fallback)", () => {
  it("rejects malformed / ambiguous dates with policy_invalid_entry_date", () => {
    for (const bad of ["not-a-date", "2026-13-01", "2026-7-19", "07/19/2026", "2026/07/19", "abc"]) {
      let thrown: unknown;
      try {
        resolveCanonicalEntryDate(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `expected throw for ${bad}`).toBeInstanceOf(FactoringEntryDateError);
      expect((thrown as FactoringEntryDateError).reason).toBe("policy_invalid_entry_date");
    }
  });

  it("rejects missing candidates with policy_missing_entry_date (never invents today)", () => {
    expect(() => resolveCanonicalEntryDate(null, undefined, "")).toThrow(FactoringEntryDateError);
    try {
      resolveCanonicalEntryDate(null);
    } catch (e) {
      expect((e as FactoringEntryDateError).reason).toBe("policy_missing_entry_date");
    }
  });

  it("accepts strict YYYY-MM-DD and ISO datetime", () => {
    expect(resolveCanonicalEntryDate("2026-01-20")).toBe("2026-01-20");
    expect(resolveCanonicalEntryDate("2026-01-20T18:00:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts Postgres timestamptz::text from loadAdvance (authoritative DB, not caller salvage)", () => {
    // loadAdvance selects advanced_at::text → "YYYY-MM-DD HH:MM:SS.fff+00"
    expect(resolveCanonicalEntryDate("2026-01-20 18:00:00.000000+00")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveCanonicalEntryDate("2026-01-20 18:00:00+00")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("strict repair exact shape — balanced wrong account/amount plants", () => {
  it("rejects balanced JE with wrong role account", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("FROM accounting.journal_entries")) {
        return { rows: [{ id: "je-1", status: "posted", reverses_je_id: null, reversed_by_je_id: null }] };
      }
      if (sql.includes("chart_of_accounts_roles")) {
        return {
          rows: [
            {
              role: "cash_clearing", // wrong — expected factoring_advance_liability
              debit_or_credit: "debit",
              amount_cents: "10000",
              source_transaction_type: "factoring_customer_payment",
              source_transaction_id: ADVANCE,
            },
            {
              role: "ar_control",
              debit_or_credit: "credit",
              amount_cents: "10000",
              source_transaction_type: "factoring_customer_payment",
              source_transaction_id: ADVANCE,
            },
          ],
        };
      }
      if (sql.includes("AS ok") && sql.includes("journal_entry_uuid")) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    const shape = await validateLifecycleJeExactShape(
      { query },
      {
        operating_company_id: OPCO,
        journal_entry_id: "je-1",
        factoring_advance_id: ADVANCE,
        source_transaction_type: "factoring_customer_payment",
        expected_legs: [
          { role: "factoring_advance_liability", debit_or_credit: "debit", amount_cents: 10000 },
          { role: "ar_control", debit_or_credit: "credit", amount_cents: 10000 },
        ],
      }
    );
    expect(shape).toEqual({ ok: false, reason: "repair_candidate_wrong_account_or_amount" });
  });

  it("rejects balanced JE with wrong amount", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("FROM accounting.journal_entries")) {
        return { rows: [{ id: "je-1", status: "posted", reverses_je_id: null, reversed_by_je_id: null }] };
      }
      if (sql.includes("chart_of_accounts_roles")) {
        return {
          rows: [
            {
              role: "factoring_advance_liability",
              debit_or_credit: "debit",
              amount_cents: "9999", // wrong amount
              source_transaction_type: "factoring_customer_payment",
              source_transaction_id: ADVANCE,
            },
            {
              role: "ar_control",
              debit_or_credit: "credit",
              amount_cents: "9999",
              source_transaction_type: "factoring_customer_payment",
              source_transaction_id: ADVANCE,
            },
          ],
        };
      }
      if (sql.includes("AS ok") && sql.includes("journal_entry_uuid")) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    const shape = await validateLifecycleJeExactShape(
      { query },
      {
        operating_company_id: OPCO,
        journal_entry_id: "je-1",
        factoring_advance_id: ADVANCE,
        source_transaction_type: "factoring_customer_payment",
        expected_legs: [
          { role: "factoring_advance_liability", debit_or_credit: "debit", amount_cents: 10000 },
          { role: "ar_control", debit_or_credit: "credit", amount_cents: 10000 },
        ],
      }
    );
    expect(shape).toEqual({ ok: false, reason: "repair_candidate_wrong_account_or_amount" });
  });

  it("foreign source_type with null source id is conflict (never overwrite)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT jep.id") && sql.includes("LIMIT 1")) {
        return { rows: [{ id: "conflict-line" }] };
      }
      return { rows: [] };
    });
    await expect(
      attachFactoringLifecycleSourceLinksStrict(
        { query },
        {
          operating_company_id: OPCO,
          journal_entry_id: "je-1",
          factoring_advance_id: ADVANCE,
          source_transaction_type: "factoring_advance",
        }
      )
    ).rejects.toThrow("factoring_lifecycle_source_link_conflict");
  });

  it("reversed JE candidate is invalid", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "2" }] };
      if (sql.includes("FROM accounting.journal_entries")) {
        return {
          rows: [{ id: "je-1", status: "posted", reverses_je_id: null, reversed_by_je_id: "je-rev" }],
        };
      }
      return { rows: [] };
    });
    const shape = await validateLifecycleJeExactShape(
      { query },
      {
        operating_company_id: OPCO,
        journal_entry_id: "je-1",
        factoring_advance_id: ADVANCE,
        source_transaction_type: "factoring_advance",
        expected_legs: [
          { role: "cash_clearing", debit_or_credit: "debit", amount_cents: 100 },
          { role: "factoring_advance_liability", debit_or_credit: "credit", amount_cents: 100 },
        ],
      }
    );
    expect(shape).toEqual({ ok: false, reason: "repair_candidate_reversed" });
  });
});

describe("customer payment / reserve release — lock + reject overpayment (no Math.min)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsEnabled.mockReset();
    mockCreateJournalEntry.mockReset();
    mockResolveRoleAccount.mockReset();
    mockFaroGate.mockReset();
    mockAdvanceBound.mockReset();
    mockIsEnabled.mockResolvedValue(true);
    mockFaroGate.mockResolvedValue({
      ok: true,
      vendorId: "faro-v",
      vendorName: "Faro",
      agreementId: "agr-1",
      factorProfileId: "fp-1",
      companyCode: "TRANSP",
      asOf: "2026-01-20",
    });
    mockAdvanceBound.mockResolvedValue(true);
    mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
    mockCreateJournalEntry.mockImplementation(async (...args: unknown[]) => {
      const options = (args.length >= 4 ? args[3] : args[2]) as
        | { afterInsertBeforeCommit?: (c: { query: typeof mockQuery }, h: { id: string }) => Promise<void> }
        | undefined;
      const client = args.length >= 4 ? (args[0] as { query: typeof mockQuery }) : { query: mockQuery };
      const header = { id: "je-new" };
      if (options?.afterInsertBeforeCommit) await options.afterInsertBeforeCommit(client, header);
      return header;
    });
  });

  function baseMocks(outstandingLiability: string, outstandingReserve = "1500") {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config(") || sql.includes("SAVEPOINT") || sql.includes("RELEASE") || sql.includes("ROLLBACK TO")) {
        return { rows: [] };
      }
      if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) {
        if (sql.includes("INSERT")) return { rows: [{ journal_entry_id: "je-new" }] };
        return { rows: [] };
      }
      if (sql.includes("role = 'factoring_advance_liability'") && sql.includes("AS outstanding")) {
        return { rows: [{ outstanding: outstandingLiability }] };
      }
      if (sql.includes("role = 'factor_reserve_held'") && sql.includes("AS outstanding")) {
        return { rows: [{ outstanding: outstandingReserve }] };
      }
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: ADVANCE,
              display_id: "FAC-0001",
              status: "advanced",
              invoice_total_cents: 10000,
              advance_amount_cents: 9700,
              reserve_amount_cents: 1500,
              factor_fee_cents: 0,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.journal_entries")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return { rows: [{ id: "inv-1", total_cents: "10000", voided_at: null }] };
      }
      return { rows: [] };
    });
  }

  it("$120 payment vs $100 outstanding → policy_overpayment (rollback, no JE)", async () => {
    baseMocks("10000"); // $100.00
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 12000, // $120
      paid_at_iso: "2026-01-20",
    });
    expect(res).toEqual({ posted: false, reason: "policy_overpayment" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("concurrent settlement race: second payment over outstanding fails closed inside txn", async () => {
    let liabilityReads = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config(") || sql.includes("SAVEPOINT") || sql.includes("RELEASE") || sql.includes("ROLLBACK TO") || sql.includes("FOR UPDATE")) {
        return { rows: sql.includes("FOR UPDATE") ? [{ id: ADVANCE }] : [] };
      }
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) {
        if (sql.includes("INSERT")) return { rows: [{ journal_entry_id: "je-new" }] };
        return { rows: [] };
      }
      if (sql.includes("role = 'factoring_advance_liability'") && sql.includes("AS outstanding")) {
        liabilityReads += 1;
        // First read (prep) shows $100; second read (inside afterInsert) shows $0 — race loser.
        return { rows: [{ outstanding: liabilityReads === 1 ? "10000" : "0" }] };
      }
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: ADVANCE,
              display_id: "FAC-0001",
              status: "advanced",
              invoice_total_cents: 10000,
              advance_amount_cents: 9700,
              reserve_amount_cents: 1500,
              factor_fee_cents: 0,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.journal_entries")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return { rows: [{ id: "inv-1", total_cents: "10000", voided_at: null }] };
      }
      return { rows: [] };
    });

    await expect(
      postFactoringCustomerPaymentEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        amount_cents: 10000,
        paid_at_iso: "2026-01-20",
      })
    ).rejects.toThrow(/factoring_customer_payment_overpayment/);
  });

  it("reserve over-release rejected before writes", async () => {
    baseMocks("10000", "1000");
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 1500,
      released_at_iso: "2026-01-25",
    });
    expect(res).toEqual({ posted: false, reason: "policy_over_release" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("RTS / missing Faro agreement fails closed on payment path", async () => {
    mockFaroGate.mockResolvedValue({ ok: false, reason: "missing_faro_agreement_binding" });
    baseMocks("10000");
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 5000,
      paid_at_iso: "2026-01-20",
    });
    expect(res).toEqual({ posted: false, reason: "policy_faro_agreement" });
  });

  it("invalid supplied paid_at fails closed — no today salvage", async () => {
    baseMocks("10000");
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 5000,
      paid_at_iso: "07/19/2026",
    });
    expect(res).toEqual({ posted: false, reason: "policy_invalid_entry_date" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});

describe("chargeback — reversed funding excluded from eligibility", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsEnabled.mockResolvedValue(true);
    mockFaroGate.mockResolvedValue({
      ok: true,
      vendorId: "faro-v",
      vendorName: "Faro",
      agreementId: "agr-1",
      factorProfileId: null,
      companyCode: "TRANSP",
      asOf: "2026-04-01",
    });
    mockAdvanceBound.mockResolvedValue(true);
    mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
  });

  it("reversed-funding negative: outstanding liability 0 → policy_partial_or_ambiguous_recourse", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config(") || sql.includes("FOR UPDATE")) {
        return { rows: sql.includes("FOR UPDATE") ? [{ id: ADVANCE }] : [] };
      }
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "2" }] };
      if (sql.includes("factoring_lifecycle_posting_keys")) return { rows: [] };
      // Liability query excludes reversed JEs → 0 outstanding
      if (sql.includes("AS outstanding") && sql.includes("factoring_advance_liability")) {
        return { rows: [{ outstanding: "0" }] };
      }
      if (sql.includes("AS outstanding") && sql.includes("invoices")) {
        return { rows: [{ outstanding: "100000" }] };
      }
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: ADVANCE,
              display_id: "FAC-0001",
              status: "advanced",
              invoice_total_cents: 100000,
              advance_amount_cents: 97000,
              reserve_amount_cents: 1500,
              factor_fee_cents: 1500,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 100000,
      default_interest_cents: 0,
      recoursed_ar_cents: 100000,
      charged_back_at_iso: "2026-04-01",
    });
    expect(res).toEqual({ posted: false, reason: "policy_partial_or_ambiguous_recourse" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});

describe("findStrictLifecycleRepairCandidate — expected_legs required for unique", () => {
  it("invalid when authoritative JE fails exact shape", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
      if (sql.includes("source_transaction_type = $2") && sql.includes("SELECT je.id")) {
        return { rows: [{ id: "je-auth" }] };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("status::text")) {
        return { rows: [{ id: "je-auth", status: "posted", reverses_je_id: null, reversed_by_je_id: null }] };
      }
      if (sql.includes("chart_of_accounts_roles")) {
        return {
          rows: [
            {
              role: "wrong_role",
              debit_or_credit: "debit",
              amount_cents: "100",
              source_transaction_type: null,
              source_transaction_id: null,
            },
            {
              role: "also_wrong",
              debit_or_credit: "credit",
              amount_cents: "100",
              source_transaction_type: null,
              source_transaction_id: null,
            },
          ],
        };
      }
      if (sql.includes("AS ok") && sql.includes("journal_entry_uuid")) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    const result = await findStrictLifecycleRepairCandidate(
      { query },
      {
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        source_transaction_type: "factoring_customer_payment",
        expected_legs: [
          { role: "factoring_advance_liability", debit_or_credit: "debit", amount_cents: 100 },
          { role: "ar_control", debit_or_credit: "credit", amount_cents: 100 },
        ],
      }
    );
    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/wrong_account_or_amount/);
  });
});
