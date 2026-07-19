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
    if (sql.includes("factoring_lifecycle_posting_keys")) {
      if (sql.trim().startsWith("INSERT")) return { rows: [] };
      return { rows: alreadyPosted ? [{ journal_entry_id: "existing-je" }] : [] };
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
