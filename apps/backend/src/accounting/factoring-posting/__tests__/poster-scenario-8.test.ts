import { describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringChargebackEvent,
} from "../poster.service.js";

// CODER-34 — secured-borrowing lifecycle proof (the $5,000 example: fee 75, reserve 75, ACH 10).
// Mocked infra so the arithmetic + the exact JE legs are asserted deterministically (no DB). GUARD re-proves
// the same unwind on a Neon branch with the flag ON.
const {
  mockQuery,
  mockWithLuciaBypass,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

function installDefaults(existingMemos: Set<string> = new Set()) {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();

  mockIsEnabled.mockResolvedValue(true);
  // Resolve each role to an id equal to the role name, so legs can be asserted by account.
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _opco: string, role: string) => role);
  mockCreateJournalEntry.mockResolvedValue({ id: "je-1" });

  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      return {
        rows: [
          {
            id: "fac-1",
            display_id: "FAC-0001",
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
    if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
      const memo = String(values?.[1] ?? "");
      return { rows: existingMemos.has(memo) ? [{ id: "existing-je" }] : [] };
    }
    return { rows: [] };
  });
}

function postingsFromCall(callIndex: number) {
  const call = mockCreateJournalEntry.mock.calls[callIndex];
  return (call?.[0]?.postings ?? []) as Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number }>;
}
function leg(postings: ReturnType<typeof postingsFromCall>, accountId: string) {
  return postings.find((p) => p.account_id === accountId);
}
function sum(postings: ReturnType<typeof postingsFromCall>, dc: "debit" | "credit") {
  return postings.filter((p) => p.debit_or_credit === dc).reduce((s, p) => s + p.amount_cents, 0);
}

describe("CODER-34 secured-borrowing lifecycle ($5,000 · fee 75 · reserve 75 · ACH 10)", () => {
  it("FUNDING: Dr Cash 4840 + Reserve 75 + Fee 75 + ACH 10 / Cr Factoring Advance liability 5000; A/R UNCHANGED", async () => {
    installDefaults();
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      advanced_at_iso: "2026-01-07T00:00:00.000Z",
      funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 7500, ach_cents: 1000 },
    });
    expect(res.posted).toBe(true);
    expect(mockIsEnabled).toHaveBeenCalledWith(expect.anything(), "FACTORING_GL_POSTING_ENABLED", { operating_company_id: OPCO });

    const p = postingsFromCall(0);
    // liability credit = full net invoice
    expect(leg(p, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "credit", amount_cents: 500000 });
    // cash = 5000 - 75 - 75 - 10 = 4840
    expect(leg(p, "cash_clearing")).toMatchObject({ debit_or_credit: "debit", amount_cents: 484000 });
    expect(leg(p, "factor_reserve_held")).toMatchObject({ debit_or_credit: "debit", amount_cents: 7500 });
    // fee 75 + ACH 10 both hit factor_fee_expense (two debit lines) → total 8500
    const feeLegs = p.filter((x) => x.account_id === "factor_fee_expense");
    expect(feeLegs.map((x) => x.amount_cents).sort((a, b) => a - b)).toEqual([1000, 7500]);
    // A/R untouched at funding
    expect(leg(p, "ar_control")).toBeUndefined();
    // balances
    expect(sum(p, "debit")).toBe(500000);
    expect(sum(p, "credit")).toBe(500000);
    // source is auto (never a customer_payment)
    expect(mockCreateJournalEntry.mock.calls[0]?.[0]?.source).toBe("auto");
  });

  it("CUSTOMER PAYMENT: Dr Factoring Advance 5000 / Cr A/R 5000 (the ONLY A/R decrease)", async () => {
    installDefaults();
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 500000,
      paid_at_iso: "2026-02-15T00:00:00.000Z",
    });
    expect(res.posted).toBe(true);
    const p = postingsFromCall(0);
    expect(leg(p, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "debit", amount_cents: 500000 });
    expect(leg(p, "ar_control")).toMatchObject({ debit_or_credit: "credit", amount_cents: 500000 });
  });

  it("RESERVE RELEASE: Dr Cash 75 / Cr Factoring Reserves 75 (not against A/R)", async () => {
    installDefaults();
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      released_at_iso: "2026-02-20T00:00:00.000Z",
      release_amount_cents: 7500,
      factor_fee_cents: 0,
    });
    expect(res.posted).toBe(true);
    const p = postingsFromCall(0);
    expect(leg(p, "cash_clearing")).toMatchObject({ debit_or_credit: "debit", amount_cents: 7500 });
    expect(leg(p, "factor_reserve_held")).toMatchObject({ debit_or_credit: "credit", amount_cents: 7500 });
    expect(leg(p, "ar_control")).toBeUndefined();
  });

  it("FLAG OFF: nothing posts", async () => {
    installDefaults();
    mockIsEnabled.mockResolvedValue(false);
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 7500, ach_cents: 1000 },
    });
    expect(res).toMatchObject({ posted: false, reason: "flag_off" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("IDEMPOTENT: a re-run whose funding memo already exists does not double-post", async () => {
    installDefaults(new Set(["Factoring funding FAC-0001"]));
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 7500, ach_cents: 1000 },
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("CHARGEBACK: Dr Advance + Dr Default Interest / Cr Cash; Dr Recoursed / Cr A/R", async () => {
    installDefaults();
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      charged_back_at_iso: "2026-04-15T00:00:00.000Z",
      chargeback_amount_cents: 500000,
      default_interest_cents: 3350,
      recoursed_ar_cents: 500000,
    });
    expect(res.posted).toBe(true);
    // entry A — repay FARO
    const repay = postingsFromCall(0);
    expect(leg(repay, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "debit", amount_cents: 500000 });
    expect(leg(repay, "default_interest_expense")).toMatchObject({ debit_or_credit: "debit", amount_cents: 3350 });
    expect(leg(repay, "cash_clearing")).toMatchObject({ debit_or_credit: "credit", amount_cents: 503350 });
    // entry B — return receivable
    const ret = postingsFromCall(1);
    expect(leg(ret, "factoring_recoursed_ar")).toMatchObject({ debit_or_credit: "debit", amount_cents: 500000 });
    expect(leg(ret, "ar_control")).toMatchObject({ debit_or_credit: "credit", amount_cents: 500000 });
  });
});
