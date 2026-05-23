import { describe, expect, it, vi } from "vitest";
import { postFactoringFeeExpenseEvent } from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockCreateJournalEntry,
  mockResolveRoleAccount,
  mockResolveAccountForCategory,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
    mockResolveAccountForCategory: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../journal-entries.service.js", () => ({
  createJournalEntry: mockCreateJournalEntry,
}));

vi.mock("../../coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: mockResolveRoleAccount,
}));

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

describe("factoring fee posting VQ6", () => {
  it("posts fee as separate expense line and never nets against revenue", async () => {
    mockQuery.mockReset();
    mockCreateJournalEntry.mockReset();
    mockResolveRoleAccount.mockReset();
    mockResolveAccountForCategory.mockReset();

    mockResolveRoleAccount.mockResolvedValue("ar-account-id");
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "fee-account-id",
      posting_side: "debit",
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances")) return { rows: [{ display_id: "FAC-1001" }] };
      if (sql.includes("FROM accounting.journal_entries")) return { rows: [] };
      return { rows: [] };
    });

    await postFactoringFeeExpenseEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      factor_fee_cents: 20000,
      released_at_iso: "2026-02-20T00:00:00.000Z",
      actor: {
        user_id: "33333333-3333-4333-8333-333333333333",
        role: "Administrator",
      },
    });

    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "factoring_fee",
      "default"
    );
    expect(mockCreateJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source: "auto",
        postings: [
          expect.objectContaining({
            account_id: "fee-account-id",
            debit_or_credit: "debit",
            amount_cents: 20000,
          }),
          expect.objectContaining({
            account_id: "ar-account-id",
            debit_or_credit: "credit",
            amount_cents: 20000,
          }),
        ],
      }),
      expect.any(Object)
    );
  });
});
