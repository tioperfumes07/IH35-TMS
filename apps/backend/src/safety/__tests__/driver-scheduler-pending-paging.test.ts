import { describe, expect, it, vi } from "vitest";
import { listPendingLeaveRequests } from "../driver-scheduler.service.js";

describe("driver scheduler pending request paging", () => {
  it("counts and pages the same company-scoped pending-review set", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total_count: "123" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "request-51" }], rowCount: 1 });

    const result = await listPendingLeaveRequests({ query } as never, companyId, 50, 50);

    expect(result).toEqual({ requests: [{ id: "request-51" }], totalCount: 123 });
    expect(query).toHaveBeenCalledTimes(2);
    const [countSql, countValues] = query.mock.calls[0];
    const [pageSql, pageValues] = query.mock.calls[1];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain("r.operating_company_id = $1::uuid");
      expect(sql).toContain("r.status = 'pending_review'");
      expect(sql).toContain("r.voided_at IS NULL");
    }
    expect(countValues).toEqual([companyId]);
    expect(pageSql).toContain("LIMIT $2");
    expect(pageSql).toContain("OFFSET $3");
    expect(pageValues).toEqual([companyId, 50, 50]);
  });
});
