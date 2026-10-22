import { describe, expect, it, vi } from "vitest";
import { queryExpensesList } from "../expenses.routes.js";

describe("expense history pagination order", () => {
  it("uses a unique tie breaker for expenses imported with identical dates and timestamps", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await queryExpensesList({ query }, "11111111-1111-4111-8111-111111111111", {
      status: "active", dateFrom: "2026-10-01", dateTo: "2026-10-22", limit: 200, offset: 200,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY e\.transaction_date DESC, e\.created_at DESC, e\.id DESC\s+LIMIT/);
    expect(query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111", "2026-10-01", "2026-10-22", 200, 200]);
  });
});
