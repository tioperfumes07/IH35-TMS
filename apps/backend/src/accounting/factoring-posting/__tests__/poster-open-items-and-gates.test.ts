import { describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  postFactoringChargebackEvent,
} from "../poster.service.js";

// Block 1-v3 — flag-gate + idempotency no-ops, plus the two chargeback @cpa-open-item DOCUMENTING tests
// (they assert CURRENT behavior and cite the doc §6 open items; they do NOT "fix" it). Same mocked infra
// as poster-scenario-8 (no DB): the per-leg balance/legs are proven there; here we prove the gates + open items.
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
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry, enqueueJournalEntrySideEffects: vi.fn(async () => undefined) }));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

function installDefaults(flagOn: boolean, existingMemos: Set<string> = new Set()) {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();

  mockIsEnabled.mockResolvedValue(flagOn);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
  mockCreateJournalEntry.mockImplementation(async (_input: unknown, _actor: unknown, options?: { afterInsertBeforeCommit?: (client: { query: typeof mockQuery }, header: { id: string }) => Promise<void> }) => {
    const header = { id: "je-1" };
    if (options?.afterInsertBeforeCommit) {
      await options.afterInsertBeforeCommit({ query: mockQuery }, header);
    }
    return header;
  });
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

function legs(callIndex: number) {
  const call = mockCreateJournalEntry.mock.calls[callIndex];
  return (call?.[1]?.postings ?? call?.[0]?.postings ?? []) as Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number }>;
}
const leg = (p: ReturnType<typeof legs>, id: string) => p.find((x) => x.account_id === id);

describe("factoring poster — flag gate (OFF ⇒ zero posts)", () => {
  const call = (fn: string) => {
    switch (fn) {
      case "funding":
        return postFactoringAdvanceEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 0, ach_cents: 0 } });
      case "payment":
        return postFactoringCustomerPaymentEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, amount_cents: 500000 });
      case "release":
        return postFactoringReleaseEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, release_amount_cents: 7500 });
      default:
        return postFactoringChargebackEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, chargeback_amount_cents: 500000 });
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

describe("factoring poster — idempotency (deterministic memo dedupe)", () => {
  it("funding: a re-run with the same memo already present ⇒ already_posted, no double-post", async () => {
    installDefaults(true, new Set(["Factoring funding FAC-0001"]));
    const res = await postFactoringAdvanceEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, funding_figures: { invoice_total_cents: 500000, reserve_cents: 7500, fee_cents: 0, ach_cents: 0 } });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});

describe("factoring poster — @cpa-open-item DOCUMENTING tests (assert current behavior; see design doc §6.1)", () => {
  // §6.1 open item: chargeback liability extinguishment. Funding credits the liability at FULL face (500000);
  // a PARTIAL chargeback debits it at only chargeback_amount_cents, leaving a residual liability. This test
  // DOCUMENTS that residual — it is not a fix. CPA must confirm chargebacks are always full-face.
  it("partial chargeback repays only chargeback_amount ⇒ residual liability persists (documented open item)", async () => {
    installDefaults(true);
    await postFactoringChargebackEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, chargeback_amount_cents: 300000 });
    const repay = legs(0);
    // liability is debited at the (partial) chargeback amount only — NOT the 500000 face booked at funding.
    expect(leg(repay, "factoring_advance_liability")).toMatchObject({ debit_or_credit: "debit", amount_cents: 300000 });
    // → residual liability of 500000 − 300000 = 200000 remains. Flagged PENDING_OWNER_CONFIRMATION in doc §6.1.
  });

  // §6.1 open item: recoursed-AR default amount. When recoursed_ar_cents is omitted it defaults to the
  // advance repaid (chargeback_amount), NOT the invoice face. This DOCUMENTS that default.
  it("recoursed_ar defaults to chargeback_amount (advance), not invoice face (documented open item)", async () => {
    installDefaults(true);
    await postFactoringChargebackEvent({ operating_company_id: OPCO, factoring_advance_id: ADVANCE, actor_user_id: ACTOR, chargeback_amount_cents: 480000 });
    // repay JE is call 0, receivable-return JE is call 1
    const ret = legs(1);
    expect(leg(ret, "factoring_recoursed_ar")).toMatchObject({ debit_or_credit: "debit", amount_cents: 480000 });
    expect(leg(ret, "ar_control")).toMatchObject({ debit_or_credit: "credit", amount_cents: 480000 });
  });
});
