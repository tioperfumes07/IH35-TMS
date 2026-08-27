import { describe, expect, it, vi } from "vitest";
import { listSessions } from "../session.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

describe("photo comparison session list paging", () => {
  it("counts and pages the exact same company-filtered history", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total_count: "237" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ uuid: "session-101" }], rowCount: 1 });

    const result = await listSessions(
      { query } as never,
      {
        operatingCompanyId: COMPANY,
        driverUuid: DRIVER,
        status: "review_required",
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-27T23:59:59Z",
        limit: 50,
        offset: 100,
      },
    );

    expect(result).toEqual({ sessions: [{ uuid: "session-101" }], totalCount: 237 });
    expect(query).toHaveBeenCalledTimes(2);
    const [countSql, countValues] = query.mock.calls[0];
    const [pageSql, pageValues] = query.mock.calls[1];
    expect(countSql).toContain("COUNT(*)::text AS total_count");
    expect(pageSql).toContain("LIMIT $6");
    expect(pageSql).toContain("OFFSET $7");
    expect(countValues).toEqual([COMPANY, DRIVER, "review_required", "2026-08-01T00:00:00Z", "2026-08-27T23:59:59Z"]);
    expect(pageValues).toEqual([...countValues, 50, 100]);
  });
});
