import { describe, expect, it, vi } from "vitest";
import { postFuelExpenseFromEvent } from "../poster.service.js";

const { mockQuery, mockWithLuciaBypass, mockResolveAccountForCategory } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const resolveAccount = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockResolveAccountForCategory: resolveAccount,
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

describe("fuel-posting poster.service company-direct path", () => {
  it("posts Dr fuel expense / Cr cash-like account", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      posting_side: "debit",
    });

    let postingLineIdx = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("role_key = $1")) return { rows: [{ account_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-2" }] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-2" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        postingLineIdx += 1;
        return { rows: [{ id: `jep-cd-${postingLineIdx}` }] };
      }
      return { rows: [] };
    });

    const result = await postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-456",
      fuel_kind: "def",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 1899,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      ifta_state: "OK",
      ifta_gallons: 12.5,
    });

    expect(result.result).toBe("posted");
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "fuel",
      "def"
    );

    const postingLineCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(postingLineCalls).toHaveLength(2);
    expect(postingLineCalls[0]?.[1]).toEqual(
      expect.arrayContaining(["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "debit", 1899])
    );
    expect(postingLineCalls[1]?.[1]).toEqual(
      expect.arrayContaining(["dddddddd-dddd-4ddd-8ddd-dddddddddddd", "credit", 1899])
    );
  });
});
