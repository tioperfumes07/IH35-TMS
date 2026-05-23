import { describe, expect, it, vi } from "vitest";
import {
  ExpenseCategoryMapResolutionError,
  resolveAccountForCategory,
} from "../resolver.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

describe("expense-category-map resolver", () => {
  it("fails fast with clear message when active mapping is missing", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const promise = resolveAccountForCategory(
      "11111111-1111-4111-8111-111111111111",
      "fuel",
      "DIESEL",
    );

    await expect(promise).rejects.toThrow(ExpenseCategoryMapResolutionError);
    await expect(promise).rejects.toThrow(
      "No active expense category mapping for operating_company_id=11111111-1111-4111-8111-111111111111, category_kind=fuel, category_code=DIESEL",
    );
  });

  it("returns mapped account_id and posting_side for active row", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: "33333333-3333-4333-8333-333333333333", posting_side: "debit" }],
      rowCount: 1,
    });

    const resolved = await resolveAccountForCategory(
      "11111111-1111-4111-8111-111111111111",
      "fuel",
      "DIESEL",
    );

    expect(resolved).toEqual({
      account_id: "33333333-3333-4333-8333-333333333333",
      posting_side: "debit",
    });
  });
});
