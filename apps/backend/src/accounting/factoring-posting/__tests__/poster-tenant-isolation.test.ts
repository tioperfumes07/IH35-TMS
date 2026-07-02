import { describe, expect, it, vi } from "vitest";
import { postFactoringAdvanceEvent } from "../poster.service.js";

// CODER-34 — per-entity isolation: the funding poster sets app.operating_company_id to the caller's opco,
// filters the advance by operating_company_id, resolves every role for THAT opco, and books the borrowing
// entry (Cr factoring_advance_liability) — never a customer_payment against A/R.
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

describe("factoring posting tenant isolation (secured borrowing)", () => {
  it("scopes app.operating_company_id, filters the advance by tenant, resolves roles for that opco, credits the liability", async () => {
    mockQuery.mockReset();
    mockIsEnabled.mockReset();
    mockCreateJournalEntry.mockReset();
    mockResolveRoleAccount.mockReset();

    mockIsEnabled.mockResolvedValue(true);
    mockResolveRoleAccount.mockImplementation(async (_c: unknown, _opco: string, role: string) => role);
    mockCreateJournalEntry.mockResolvedValue({ id: "je-1" });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: "fac-1",
              display_id: "FAC-1",
              invoice_total_cents: 1000000,
              advance_amount_cents: 985000,
              reserve_amount_cents: 15000,
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
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) return { rows: [] };
      return { rows: [] };
    });

    await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      advanced_at_iso: "2026-01-07T00:00:00.000Z",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual([OPCO]);

    const advanceSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.factoring_advances"))?.[0];
    expect(String(advanceSql)).toContain("operating_company_id = $2::uuid");

    // roles resolved for THIS opco
    for (const call of mockResolveRoleAccount.mock.calls) {
      expect(call[1]).toBe(OPCO);
    }
    expect(mockResolveRoleAccount).toHaveBeenCalledWith(expect.anything(), OPCO, "factoring_advance_liability");
    expect(mockResolveRoleAccount).toHaveBeenCalledWith(expect.anything(), OPCO, "factor_reserve_held");
    // liability credit present; no ar_control resolved at funding
    const postings = mockCreateJournalEntry.mock.calls[0]?.[0]?.postings ?? [];
    expect(postings.find((p: { account_id: string }) => p.account_id === "factoring_advance_liability")).toMatchObject({
      debit_or_credit: "credit",
    });
    expect(mockResolveRoleAccount).not.toHaveBeenCalledWith(expect.anything(), OPCO, "ar_control");
  });
});
