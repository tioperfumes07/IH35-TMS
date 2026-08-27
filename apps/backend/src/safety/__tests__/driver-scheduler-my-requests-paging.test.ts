import { describe, expect, it, vi } from "vitest";
import { listMyLeaveRequests } from "../driver-scheduler.service.js";

describe("driver scheduler personal request paging", () => {
  it("counts and pages the same company-and-driver-scoped history", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const driverId = "22222222-2222-4222-8222-222222222222";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total_count: 226 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "request-201" }], rowCount: 1 });

    const result = await listMyLeaveRequests({ query } as never, companyId, driverId, 25, 200);

    expect(result).toEqual({ requests: [{ id: "request-201" }], totalCount: 226 });
    expect(query).toHaveBeenCalledTimes(2);
    const [countSql, countValues] = query.mock.calls[0];
    const [pageSql, pageValues] = query.mock.calls[1];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain("operating_company_id = $1::uuid");
      expect(sql).toContain("driver_id = $2");
    }
    expect(countValues).toEqual([companyId, driverId]);
    expect(pageSql).toContain("ORDER BY created_at DESC, id DESC");
    expect(pageSql).toContain("LIMIT $3");
    expect(pageSql).toContain("OFFSET $4");
    expect(pageValues).toEqual([companyId, driverId, 25, 200]);
  });
});
