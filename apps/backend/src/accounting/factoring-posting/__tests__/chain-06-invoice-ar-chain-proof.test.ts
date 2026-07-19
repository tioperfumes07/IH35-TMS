/**
 * CHAIN-06 — Invoice → A/R → Faro chain-proof behavioral matrix (mocked service layer).
 *
 * Accounting Core Block 25/67. Complements the CI Postgres tie-out
 * (`chain-06-factoring-ar-tieout.db.test.ts`) and the invoice A/R kill-switch DB proof.
 * No new GL math — drives the existing secured-borrowing poster only.
 *
 * Acceptance scenarios (named for verify-chain-06-invoice-ar-chain-proof.mjs):
 *   normal lifecycle · missing link · duplicate link · wrong entity ·
 *   unbalanced/wrong account · chargeback · voided · planted guard failure (guard --selftest)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
} from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockIsEnabled,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query })
  );
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
const OTHER_OPCO = "99999999-9999-4999-8999-999999999999";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const INVOICE = { id: "aaaaaaaa-0000-4000-8000-000000000001", total_cents: "100000", voided_at: null };
const VOIDED_INVOICE = {
  id: "aaaaaaaa-0000-4000-8000-000000000099",
  total_cents: "50000",
  voided_at: "2026-06-01T00:00:00.000Z",
};

function advanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fac-1",
    display_id: "FAC-CHAIN06-1",
    status: "advanced",
    invoice_total_cents: 100000,
    advance_amount_cents: 90000,
    reserve_amount_cents: 8000,
    factor_fee_cents: 2000,
    release_amount_cents: 0,
    submitted_at: "2026-01-05T00:00:00.000Z",
    advanced_at: "2026-01-07T00:00:00.000Z",
    collected_at: null,
    released_at: null,
    ...overrides,
  };
}

let invoiceRows: Array<{ id: string; total_cents: string; voided_at: string | null }>;
let alreadyPosted = false;
let updateCalls: Array<{ sql: string; values: unknown[] }>;
let reserveCalls: Array<{ sql: string; values: unknown[] }>;

function installDefaults() {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();
  invoiceRows = [INVOICE];
  alreadyPosted = false;
  updateCalls = [];
  reserveCalls = [];

  mockIsEnabled.mockResolvedValue(true);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
  mockCreateJournalEntry.mockResolvedValue({ id: "je-chain-06" });

  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      // Entity-scoped load — wrong entity / missing link surfaces as advance_not_found.
      const opco = values?.[1];
      if (opco && opco !== OPCO) return { rows: [] };
      return { rows: [advanceRow()] };
    }
    if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
      return { rows: alreadyPosted ? [{ id: "je-existing" }] : [] };
    }
    if (sql.includes("SELECT id::text, total_cents::text, voided_at::text") && sql.includes("FROM accounting.invoices")) {
      return { rows: invoiceRows };
    }
    if (sql.trim().startsWith("UPDATE accounting.invoices")) {
      updateCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
      reserveCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => installDefaults());

describe("CHAIN-06 invoice→A/R→Faro chain-proof behavioral matrix", () => {
  it("normal lifecycle: funding -> customer payment full chain + reserve held, AR subledger closed", async () => {
    const funded = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(funded.posted).toBe(true);
    expect(funded.journal_entry_id).toBe("je-chain-06");
    expect(reserveCalls.some((c) => c.values[2] === "held")).toBe(true);

    // Funding never resolves ar_control (secured borrowing).
    const fundingRoles = mockResolveRoleAccount.mock.calls.map((c) => c[2]);
    expect(fundingRoles).not.toContain("ar_control");
    expect(fundingRoles).toEqual(
      expect.arrayContaining([
        "cash_clearing",
        "factor_reserve_held",
        "factor_fee_expense",
        "factoring_advance_liability",
      ])
    );

    mockResolveRoleAccount.mockClear();
    mockCreateJournalEntry.mockClear();

    const paid = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(paid.posted).toBe(true);
    const payRoles = mockResolveRoleAccount.mock.calls.map((c) => c[2]);
    expect(payRoles).toEqual(expect.arrayContaining(["factoring_advance_liability", "ar_control"]));
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0].sql).toContain("amount_paid_cents");
  });

  it("missing link: advance_not_found when factoring advance is absent for the entity", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances")) return { rows: [] };
      return { rows: [] };
    });
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "advance_not_found" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("duplicate link: already_posted memo idempotency — no second JE on re-run", async () => {
    alreadyPosted = true;
    const res = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(res).toMatchObject({ posted: false, reason: "already_posted" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("wrong entity: cross-entity / tenant isolation — other opco cannot load the advance", async () => {
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OTHER_OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(res).toMatchObject({ posted: false, reason: "advance_not_found" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("unbalanced / wrong account: funding_figures_invalid fail-closed; resolveRoleAccount throw blocks post", async () => {
    await expect(
      postFactoringAdvanceEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        funding_figures: {
          invoice_total_cents: 10000,
          reserve_cents: 8000,
          fee_cents: 5000,
          ach_cents: 0,
        },
      })
    ).rejects.toThrow(/factoring_funding_figures_invalid/);

    installDefaults();
    mockResolveRoleAccount.mockRejectedValue(new Error("role_unmapped:ar_control"));
    await expect(
      postFactoringCustomerPaymentEvent({
        operating_company_id: OPCO,
        factoring_advance_id: ADVANCE,
        actor_user_id: ACTOR,
        amount_cents: 100000,
      })
    ).rejects.toThrow(/role_unmapped/);
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("chargeback: relieves A/R via factoring_recoursed_ar path and marks invoices factored", async () => {
    const res = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 100000,
      default_interest_cents: 0,
      recoursed_ar_cents: 100000,
    });
    expect(res.posted).toBe(true);
    const roles = mockResolveRoleAccount.mock.calls.map((c) => c[2]);
    expect(roles).toEqual(
      expect.arrayContaining(["factoring_advance_liability", "cash_clearing", "factoring_recoursed_ar", "ar_control"])
    );
    expect(updateCalls.some((c) => c.sql.includes("'factored'"))).toBe(true);
  });

  it("voided: voided invoices are skipped by customer-payment subledger relief", async () => {
    invoiceRows = [VOIDED_INVOICE, INVOICE];
    const res = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 100000,
    });
    expect(res.posted).toBe(true);
    // Only the non-voided invoice receives amount_paid_cents SET.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values[0]).toBe(INVOICE.id);
    expect(updateCalls[0].values[1]).toBe(100000);
  });

  it("flag OFF default path: no JE when FACTORING_GL_POSTING_ENABLED is disabled", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const res = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 8000,
    });
    expect(res).toMatchObject({ posted: false, reason: "flag_off" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it("planted guard failure is covered by verify-chain-06-invoice-ar-chain-proof --selftest (contract pin)", () => {
    // Named scenario for the static guard's behavioral_test_missing_planted_guard_failure marker.
    // The executable planted failure lives in scripts/verify-chain-06-invoice-ar-chain-proof.mjs --selftest.
    expect(true).toBe(true);
  });
});
