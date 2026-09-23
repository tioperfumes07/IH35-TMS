import { describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringChargebackEvent,
} from "../poster.service.js";

// Flag-gate + idempotency + CPA fail-closed policy for partial/ambiguous recourse (no defaults).
const { mockQuery, mockWithLuciaBypass, mockWithCurrentUser, mockIsEnabled, mockCreateJournalEntry, mockResolveRoleAccount } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockWithCurrentUser: withCurrentUser,
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass, withCurrentUser: mockWithCurrentUser }));
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

function installDefaults(flagOn: boolean, alreadyPosted = false) {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();

  mockIsEnabled.mockResolvedValue(flagOn);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
  mockCreateJournalEntry.mockImplementation(async (...args: unknown[]) => {
    const options = (args.length >= 4 ? args[3] : args[2]) as
      | { afterInsertBeforeCommit?: (client: { query: typeof mockQuery }, header: { id: string }) => Promise<void> }
      | undefined;
    const client = args.length >= 4 ? (args[0] as { query: typeof mockQuery }) : { query: mockQuery };
    const header = { id: "je-1" };
    if (options?.afterInsertBeforeCommit) {
      await options.afterInsertBeforeCommit(client, header);
    }
    return header;
  });
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
      return { rows: [] };
    }
    if (sql.includes("FOR UPDATE")) return { rows: [{ id: ADVANCE }] };
    if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
    if (sql.includes("factoring_lifecycle_posting_keys")) {
      if (sql.includes("INSERT")) return { rows: alreadyPosted ? [] : [{ journal_entry_id: "je-1" }] };
      return { rows: alreadyPosted ? [{ journal_entry_id: "existing-je" }] : [] };
    }
    if (sql.includes("AS outstanding")) {
      return { rows: [{ outstanding: "500000" }] };
    }
    if (alreadyPosted && sql.includes("status::text AS status") && sql.includes("journal_entries")) {
      return { rows: [{ id: "existing-je", status: "posted", reverses_je_id: null, reversed_by_je_id: null }] };
    }
    if (alreadyPosted && sql.includes("chart_of_accounts_roles") && sql.includes("AS role")) {
      return {
        rows: [
          {
            role: "factoring_advance_liability",
            debit_or_credit: "credit",
            amount_cents: "500000",
            source_transaction_type: null,
            source_transaction_id: null,
          },
          {
            role: "cash_clearing",
            debit_or_credit: "debit",
            amount_cents: "492500",
            source_transaction_type: null,
            source_transaction_id: null,
          },
          {
            role: "factor_reserve_held",
            debit_or_credit: "debit",
            amount_cents: "7500",
            source_transaction_type: null,
            source_transaction_id: null,
          },
        ],
      };
    }
    if (sql.includes("AS ok") && sql.includes("journal_entry_uuid") && sql.includes("= COALESCE")) {
      return { rows: [{ ok: true }] };
    }
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      return {
        rows: [
          {
            id: ADVANCE,
            display_id: "FAC-0001",
            status: "advanced",
            invoice_total_cents: 500000,
            advance_amount_cents: 492500,
            reserve_amount_cents: 7500,
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
    if (sql.includes("UPDATE accounting.journal_entry_postings")) return { rows: [] };
        if (sql.includes("FROM accounting.journal_entries")) {
      // Authoritative repair candidate query — empty unless already_posted fixtures override.
      return { rows: [] };
    }
    if (sql.includes("FROM accounting.journal_entry_postings")) {
      // Conflict probe (LIMIT 1 + foreign provenance predicates) must be empty.
      if (sql.includes("LIMIT 1") && (sql.includes("NOT (") || sql.includes("IS DISTINCT FROM") || sql.includes("source_transaction_id IS NOT NULL"))) {
        return { rows: [] };
      }
      return { rows: [{ id: "line-1" }] };
    }

    if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) return { rows: [] };
    if (sql.includes("UPDATE accounting.invoices")) return { rows: [] };
    if (sql.includes("UPDATE accounting.factoring_advances")) return { rows: [] };
    return { rows: [] };
  });
}

describe("factoring poster — flag gate (OFF ⇒ zero posts)", () => {
  const call = (fn: string) => {
    switch (fn) {
      case "funding":
        return postFactoringAdvanceEvent({
          operating_company_id: OPCO,
          factoring_advance_id: ADVANCE,
          actor_user_id: ACTOR,
          funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 0, ach_cents: 0 },
        });
      case "payment":
        return postFactoringCustomerPaymentEvent({
          operating_company_id: OPCO,
          factoring_advance_id: ADVANCE,
          actor_user_id: ACTOR,
          amount_cents: 500000,
        });
      case "release":
        return postFactoringReleaseEvent({
          operating_company_id: OPCO,
          factoring_advance_id: ADVANCE,
          actor_user_id: ACTOR,
          release_amount_cents: 7500,
        });
      default:
        return postFactoringChargebackEvent({
          operating_company_id: OPCO,
          factoring_advance_id: ADVANCE,
          actor_user_id: ACTOR,
          chargeback_amount_cents: 500000,
          default_interest_cents: 0,
          recoursed_ar_cents: 500000,
        });
    }
  };

  for (const fn of ["funding", "payment", "release", "chargeback"]) {
    it(`${fn}: flag OFF ⇒ {posted:false, reason:"flag_off"} and NO journal entry written`, async () => {
      installDefaults(false);
      const res = await call(fn);
      expect(res).toMatchObject({ posted: false, reason: "flag_off" });
      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });
  }
});

describe("factoring poster — idempotency (deterministic posting key)", () => {
  it("funding: posting key already claimed ⇒ already_posted, no double-post", async () => {
    installDefaults(true, true);
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 0, ach_cents: 0 },
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});

// ROUND 86 (Lead, 2026-09-23) — reserve_amount_cents = factor_fee_cents on 120 of 120 live rows
// because the submission-time estimate (auto-submit-on-delivery.service.ts) runs the SAME formula
// against factoring.factor's reserve_rate and fee_rate, which are both configured 0.0150 today —
// so the two numbers are mathematically forced equal at submission, before Faro's real funding
// report is ever seen. This is the fix: once real funding_figures ARE known (a genuine funding
// event, not a bare re-post), the advance row's own stored reserve/fee/advance columns are
// corrected to the real, independently-sourced numbers — never left frozen at the duplicate-rate
// estimate — and the wire fee (previously always ach_cents:0) is deducted as its own leg.
describe("factoring poster — Round 86: real funding figures correct the advance row (escrow ≠ fee, wire fee deducted, faro_invoice_number/date set once)", () => {
  it("funding: writes the REAL reserve/fee/advance/pct + faro_invoice_number/purchase_date back onto accounting.factoring_advances, distinct from the submission-time estimate", async () => {
    installDefaults(true, false);
    // The fixture advance row (mocked "FROM accounting.factoring_advances" branch) carries the
    // submission-time estimate reserve_amount_cents=7500 / factor_fee_cents=0 — genuinely funded
    // figures from Faro's own CSV are DIFFERENT (escrow 6000, discount 4500, wire fee 1000), the
    // real-world shape this fix targets (escrow and fee are NOT the same number).
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      funding_figures: { invoice_total_cents: 500000, reserve_cents: 6000, fee_cents: 4500, ach_cents: 1000 },
      faro_invoice_number: "92",
      faro_purchase_date: "2026-09-11",
    });
    expect(res.posted).toBe(true);
    const correctionCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("UPDATE accounting.factoring_advances")
    );
    expect(correctionCall).toBeDefined();
    const [, params] = correctionCall as [string, unknown[]];
    // [advance_id, reserve, reserve_pct, fee, fee_pct, cash/advance_amount, advance_rate_pct,
    //  faro_invoice_number, faro_purchase_date, operating_company_id]
    expect(params[1]).toBe(6000); // real reserve, NOT the 7500 submission estimate
    expect(params[3]).toBe(4500); // real fee, NOT the 0 submission estimate — and NOT equal to reserve
    expect(params[1]).not.toBe(params[3]); // the exact bug this fix closes: escrow ≠ fee
    expect(params[5]).toBe(500000 - 6000 - 4500 - 1000); // cash = liability - reserve - fee - ach (wire fee deducted)
    expect(params[7]).toBe("92");
    expect(params[8]).toBe("2026-09-11");
  });

  it("funding: does NOT touch accounting.factoring_advances' reserve/fee/advance columns when no funding_figures are supplied (never fabricates a correction from numbers nobody gave it)", async () => {
    installDefaults(true, false);
    mockQuery.mockClear();
    await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      // no funding_figures — falls back to the advance row's own stored values for posting, and
      // must NOT issue the Round 86 correction UPDATE (nothing new was actually learned).
    });
    const correctionCall = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("UPDATE accounting.factoring_advances") &&
        call[0].includes("faro_invoice_number")
    );
    expect(correctionCall).toBeUndefined();
  });
});

describe("factoring poster — partial/ambiguous recourse fail-closed (no defaults)", () => {
  it("partial chargeback amount ≠ exact linked liability ⇒ policy_partial_or_ambiguous_recourse", async () => {
    installDefaults(true);
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 300000,
      default_interest_cents: 0,
      recoursed_ar_cents: 500000,
    });
    expect(res).toMatchObject({ posted: false, reason: "policy_partial_or_ambiguous_recourse" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("omitted recoursed_ar_cents / default_interest_cents ⇒ policy fail-closed (no PENDING default)", async () => {
    installDefaults(true);
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 500000,
      // @ts-expect-error — intentional omit to prove no default
      default_interest_cents: undefined,
      // @ts-expect-error
      recoursed_ar_cents: undefined,
    });
    expect(res).toMatchObject({ posted: false, reason: "policy_partial_or_ambiguous_recourse" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("recoursed_ar_cents=0 ⇒ policy fail-closed (no silent skip of A/R return)", async () => {
    installDefaults(true);
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 500000,
      default_interest_cents: 0,
      recoursed_ar_cents: 0,
    });
    expect(res).toMatchObject({ posted: false, reason: "policy_partial_or_ambiguous_recourse" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});
