import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (c: typeof db) => unknown) => fn(db) }));
import { countBillsByVendor, listBillsByVendor } from "../bills.service.js";

describe("bill list and aggregate entity selection parity", () => {
  it("applies both selected units and loads to rows and vendor totals", async () => {
    const company = "11111111-1111-4111-8111-111111111111";
    const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    db.query.mockReset().mockResolvedValue({ rows: [] });
    const filters = { unitId: ids.join(","), loadId: ids.join(","), status: "active" as const };
    await listBillsByVendor("reader", company, ids[0], { ...filters, limit: 25, offset: 50 });
    await countBillsByVendor("reader", company, ids[0], filters);
    const reads = db.query.mock.calls.filter(([sql]) => sql.includes("FROM accounting.bills b"));
    expect(reads).toHaveLength(2);
    for (const [sql, values] of reads) {
      expect(sql).toContain("b.unit_id = ANY(");
      expect(sql).toContain("bl.load_id = ANY(");
      expect(values.filter(Array.isArray)).toEqual([ids, ids]);
    }
    expect(reads[1][0]).not.toContain("LIMIT");
  });
});
