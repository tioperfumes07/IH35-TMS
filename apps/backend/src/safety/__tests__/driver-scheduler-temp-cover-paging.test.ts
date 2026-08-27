import { describe, expect, it, vi } from "vitest";
import { listTempAssignments } from "../driver-scheduler.service.js";

describe("driver scheduler temporary cover paging", () => {
  it("counts and pages the identical company/driver/unit active assignment graph", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const driverId = "22222222-2222-4222-8222-222222222222";
    const unitId = "33333333-3333-4333-8333-333333333333";
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ total_count: "207" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "assignment-201" }], rowCount: 1 });

    const result = await listTempAssignments({ query } as never, companyId, {
      driverId,
      unitId,
      limit: 50,
      offset: 200,
    });

    expect(result).toEqual({ assignments: [{ id: "assignment-201" }], totalCount: 207 });
    expect(query).toHaveBeenCalledTimes(2);
    const [countSql, countValues] = query.mock.calls[0];
    const [pageSql, pageValues] = query.mock.calls[1];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain("t.operating_company_id = $1::uuid");
      expect(sql).toContain("t.voided_at IS NULL");
      expect(sql).toContain("t.primary_driver_id = $2::uuid OR t.cover_driver_id = $2::uuid");
      expect(sql).toContain("t.unit_id = $3::uuid");
    }
    expect(countValues).toEqual([companyId, driverId, unitId]);
    expect(pageSql).toContain("LIMIT $4");
    expect(pageSql).toContain("OFFSET $5");
    expect(pageValues).toEqual([companyId, driverId, unitId, 50, 200]);
  });
});
