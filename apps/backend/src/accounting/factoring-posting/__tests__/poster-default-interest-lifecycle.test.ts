import { describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringDefaultInterestAccrualEvent,
} from "../poster.service.js";

// Faro-contract full-lifecycle proof (mocked infra, no DB — the exact JE legs + compounding arithmetic are
// asserted deterministically; GUARD re-proves on a Neon branch with the flag ON). Worked example, Net $5,000:
//   FUNDING       Dr Cash 4,850 + Reserve 75 + Fee 75 / Cr Factoring-Advance-Liability 5,000  (A/R untouched)
//   DAY-40        Dr Default-Interest-Expense 3.35 / Cr Liability 3.35   (0.067%/day on 5,000)
//   DAY-41        Dr Default-Interest-Expense 3.35 / Cr Liability 3.35   (COMPOUNDS off 5,003.35)
//   CUSTOMER PAYS Dr Liability 5,000 / Cr A/R 5,000   (the ONLY A/R decrease)
//   RESERVE REL.  Dr Cash 75 / Cr Reserve 75
const {
  mockQuery,
  mockWithLuciaBypass,
  mockWithCurrentUser,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
  mockAppendCrudAudit,
} =
  vi.hoisted(() => {
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
      mockAppendCrudAudit: vi.fn(),
    };
  });

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass, withCurrentUser: mockWithCurrentUser }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry, createJournalEntryOnClient: mockCreateJournalEntry, enqueueJournalEntrySideEffects: vi.fn(async () => undefined) }));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAppendCrudAudit }));
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

type AccrualState = { exists?: boolean; lastClosing?: number | null };

function installDefaults(opts: { flagOn?: boolean; accrual?: AccrualState } = {}) {
  const flagOn = opts.flagOn ?? true;
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();
  mockAppendCrudAudit.mockReset();

  mockIsEnabled.mockResolvedValue(flagOn);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
  mockCreateJournalEntry.mockImplementation(
    async (...args: unknown[]) => {
      const options = (args.length >= 4 ? args[3] : args[2]) as
        | { afterInsertBeforeCommit?: (client: { query: typeof mockQuery }, header: { id: string }) => Promise<void> }
        | undefined;
      const client =
        args.length >= 4
          ? (args[0] as { query: typeof mockQuery })
          : { query: mockQuery };
      const header = { id: "je-1" };
      if (options?.afterInsertBeforeCommit) {
        await options.afterInsertBeforeCommit(client, header);
      }
      return header;
    }
  );
  mockAppendCrudAudit.mockResolvedValue(undefined);

  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FOR UPDATE")) return { rows: [{ id: "locked" }] };
    if (sql.includes("information_schema.columns")) return { rows: [{ n: "0" }] };
    if (sql.includes("AS outstanding")) {
      return { rows: [{ outstanding: "500000" }] };
    }
    if (sql.includes("factoring_lifecycle_posting_keys")) {
      if (sql.includes("INSERT")) return { rows: [{ journal_entry_id: "je-1" }] };
      // already_posted repair looks up the posting-key JE for the accrual day.
      if (opts.accrual?.exists) return { rows: [{ journal_entry_id: "je-di-1" }] };
      return { rows: [] };
    }
    if (sql.includes("AS ok") && sql.includes("journal_entry_uuid") && sql.includes("= COALESCE")) {
      return { rows: [{ ok: true }] };
    }
    if (sql.includes("FROM accounting.invoices") && !sql.includes("UPDATE") && !sql.includes("AS outstanding")) {
      return { rows: [{ id: "inv-1", total_cents: "500000", voided_at: null }] };
    }
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      return {
        rows: [
          {
            id: "fac-1",
            display_id: "FAC-0001",
            status: "advanced",
            invoice_total_cents: 500000,
            advance_amount_cents: 492500,
            reserve_amount_cents: 7500,
            factor_fee_cents: 7500,
            release_amount_cents: 0,
            submitted_at: "2026-01-05T00:00:00.000Z",
            advanced_at: "2026-01-07T00:00:00.000Z",
            collected_at: null,
            released_at: null,
          },
        ],
      };
    }
    // Exact accrual row load (already_posted repair) — must precede bare exists probe.
    if (
      sql.includes("factoring_default_interest_accruals") &&
      sql.includes("interest_cents::text") &&
      sql.includes("accrual_date = $3::date")
    ) {
      if (!opts.accrual?.exists) return { rows: [] };
      // Day-40 contractual math on Net $5,000: interest 335, opening 500000, closing 500335.
      return {
        rows: [
          {
            interest_cents: "335",
            opening_balance_cents: "500000",
            closing_balance_cents: "500335",
            journal_entry_id: "je-di-1",
          },
        ],
      };
    }
    // accrual-exists-for-day probe
    if (sql.includes("factoring_default_interest_accruals") && sql.includes("accrual_date = $3::date")) {
      return { rows: opts.accrual?.exists ? [{ id: "acc-x" }] : [] };
    }
    // last accrual closing balance (optional beforeDateExclusive filter)
    if (sql.includes("factoring_default_interest_accruals") && sql.includes("ORDER BY accrual_date DESC")) {
      const c = opts.accrual?.lastClosing;
      return { rows: c == null ? [] : [{ closing_balance_cents: String(c) }] };
    }
    if (sql.includes("INSERT INTO accounting.factoring_default_interest_accruals")) return { rows: [] };
    if (sql.includes("FROM accounting.journal_entries")) {
      if (opts.accrual?.exists) {
        return {
          rows: [
            {
              id: "je-di-1",
              status: "posted",
              entry_date: "2026-02-16",
              reverses_je_id: null,
              reversed_by_je_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    }
    if (sql.includes("chart_of_accounts_roles") && opts.accrual?.exists) {
      return {
        rows: [
          {
            role: "default_interest_expense",
            debit_or_credit: "debit",
            amount_cents: "335",
            source_transaction_type: "factoring_default_interest",
            source_transaction_id: ADVANCE,
          },
          {
            role: "factoring_advance_liability",
            debit_or_credit: "credit",
            amount_cents: "335",
            source_transaction_type: "factoring_default_interest",
            source_transaction_id: ADVANCE,
          },
        ],
      };
    }
    if (false && sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) return { rows: [] };
    return { rows: [] };
  });
}

function postingsFromCall(callIndex: number) {
  const call = mockCreateJournalEntry.mock.calls[callIndex];
  return (call?.[1]?.postings ?? call?.[0]?.postings ?? []) as Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number }>;
}
function leg(p: ReturnType<typeof postingsFromCall>, id: string) {
  return p.find((x) => x.account_id === id);
}
function sum(p: ReturnType<typeof postingsFromCall>, dc: "debit" | "credit") {
  return p.filter((x) => x.debit_or_credit === dc).reduce((s, x) => s + x.amount_cents, 0);
}

describe("Faro factoring — default-interest + full lifecycle (Net $5,000)", () => {
  it("FUNDING: Dr Cash 4,850 + Reserve 75 + Fee 75 / Cr Liability 5,000; A/R untouched; balanced", async () => {
    installDefaults();
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      advanced_at_iso: "2026-01-07T00:00:00.000Z",
    });
    expect(res.posted).toBe(true);
    const p = postingsFromCall(0);
    expect(leg(p, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "credit", amount_cents: 500000 });
    expect(leg(p, "cash_clearing")).toMatchObject({ debit_or_credit: "debit", amount_cents: 485000 });
    expect(leg(p, "factor_reserve_held")).toMatchObject({ debit_or_credit: "debit", amount_cents: 7500 });
    expect(leg(p, "factor_fee_expense")).toMatchObject({ debit_or_credit: "debit", amount_cents: 7500 });
    expect(leg(p, "ar_control")).toBeUndefined();
    expect(sum(p, "debit")).toBe(500000);
    expect(sum(p, "credit")).toBe(500000);
  });

  it("DAY-40 ACCRUAL (first charged day): opening = Net 500,000 → interest 335 → Dr Interest / Cr Liability", async () => {
    installDefaults({ accrual: { exists: false, lastClosing: null } });
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      accrual_date_iso: "2026-02-16T00:00:00.000Z", // day 40
    });
    expect(res.posted).toBe(true);
    expect(res.closing_balance_cents).toBe(500335);
    const p = postingsFromCall(0);
    expect(leg(p, "default_interest_expense")).toMatchObject({ debit_or_credit: "debit", amount_cents: 335 });
    expect(leg(p, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "credit", amount_cents: 335 });
    expect(sum(p, "debit")).toBe(sum(p, "credit"));
  });

  it("DAY-41 ACCRUAL: COMPOUNDS off the prior closing 500,335 → interest 335 → closing 500,670", async () => {
    installDefaults({ accrual: { exists: false, lastClosing: 500335 } });
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      accrual_date_iso: "2026-02-17T00:00:00.000Z", // day 41
    });
    expect(res.posted).toBe(true);
    // round(500335 * 0.00067) = round(335.22) = 335 ; closing compounds
    expect(res.closing_balance_cents).toBe(500670);
    const p = postingsFromCall(0);
    expect(leg(p, "default_interest_expense")).toMatchObject({ amount_cents: 335 });
  });

  it("ACCRUAL before grace (day 30): NO-OP (before_grace)", async () => {
    installDefaults();
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      accrual_date_iso: "2026-02-06T00:00:00.000Z", // day 30 <= 35
    });
    expect(res).toMatchObject({ posted: false, reason: "before_grace" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("ACCRUAL idempotent: a day already accrued does not double-post (already_posted)", async () => {
    installDefaults({ accrual: { exists: true } });
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      // Plain YYYY-MM-DD — avoid UTC midnight → prior Chicago calendar day on repair expected_entry_date.
      accrual_date_iso: "2026-02-16",
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("ACCRUAL flag OFF: NO-OP", async () => {
    installDefaults({ flagOn: false });
    const res = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      accrual_date_iso: "2026-02-16T00:00:00.000Z",
    });
    expect(res).toMatchObject({ posted: false, reason: "flag_off" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("CUSTOMER PAYS: Dr Liability 5,000 / Cr A/R 5,000 (the only A/R decrease)", async () => {
    installDefaults();
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 500000,
      paid_at_iso: "2026-02-20T00:00:00.000Z",
    });
    expect(res.posted).toBe(true);
    const p = postingsFromCall(0);
    expect(leg(p, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "debit", amount_cents: 500000 });
    expect(leg(p, "ar_control")).toMatchObject({ debit_or_credit: "credit", amount_cents: 500000 });
  });

  it("RESERVE RELEASE: Dr Cash 75 / Cr Reserve 75 (not against A/R)", async () => {
    installDefaults();
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      released_at_iso: "2026-02-25T00:00:00.000Z",
      release_amount_cents: 7500,
      factor_fee_cents: 0,
    });
    expect(res.posted).toBe(true);
    const p = postingsFromCall(0);
    expect(leg(p, "cash_clearing")).toMatchObject({ debit_or_credit: "debit", amount_cents: 7500 });
    expect(leg(p, "factor_reserve_held")).toMatchObject({ debit_or_credit: "credit", amount_cents: 7500 });
    expect(leg(p, "ar_control")).toBeUndefined();
  });
});
