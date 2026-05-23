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

describe("fuel-posting poster.service driver-advance path", () => {
  it("posts Dr fuel expense / Cr fuel advance liability via resolver account", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });

    let postingLineIdx = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("FROM catalogs.accounts") && sql.includes("account_type = 'Liability'")) {
        return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-1" }] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-1" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        postingLineIdx += 1;
        return { rows: [{ id: `jep-${postingLineIdx}` }] };
      }
      return { rows: [] };
    });

    const result = await postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-123",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T10:15:00.000Z",
      amount_cents: 42567,
      posting_path: "driver_advance",
      driver_id: "33333333-3333-4333-8333-333333333333",
      ifta_state: "TX",
      ifta_gallons: 78.4,
    });

    expect(result.result).toBe("posted");
    expect(result.journal_entry_posting_ids).toEqual(["jep-1", "jep-2"]);
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "fuel",
      "diesel"
    );

    const postingLineCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(postingLineCalls).toHaveLength(2);
    expect(postingLineCalls[0]?.[1]).toEqual(
      expect.arrayContaining(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "debit", 42567])
    );
    expect(postingLineCalls[1]?.[1]).toEqual(
      expect.arrayContaining(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "credit", 42567])
    );
  });
});
