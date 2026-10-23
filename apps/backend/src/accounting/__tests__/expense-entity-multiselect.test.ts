import { describe, expect, it, vi } from "vitest";
import { queryExpensesList } from "../expenses.routes.js";

const company = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";

describe("expense entity filters before pagination", () => {
  it("binds every selection as OR within a field and AND across fields", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await queryExpensesList({ query }, company, {
      loadId: `${first},${second}`, driverId: first,
      unitId: `${second},${first}`, trailerId: second, limit: 20, offset: 40,
    });
    const [sql, values] = query.mock.calls[0];
    expect(values).toEqual([company, [first, second], [first], [second], [second, first], 20, 40]);
    for (const [column, param] of [["load_id", 2], ["driver_uuid", 3], ["trailer_id", 4], ["unit_id", 5]]) {
      expect(sql).toContain(`e.${column} = ANY($${param}::uuid[])`);
    }
    expect(sql).toContain(" AND ");
    expect(sql.indexOf("e.load_id = ANY")).toBeLessThan(sql.lastIndexOf("LIMIT"));
  });

  it("rejects malformed or injected selections before issuing SQL", async () => {
    const query = vi.fn();
    await expect(queryExpensesList({ query }, company, {
      loadId: `${first},not-an-id`, limit: 20, offset: 0,
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
