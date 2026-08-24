import { describe, expect, it, vi } from "vitest";
import { listActiveHosDriverRoster } from "../active-hos-driver-roster.service.js";

describe("active HOS driver roster tenant scope", () => {
  it("scopes the assignment and admits only home or actively authorized drivers", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await listActiveHosDriverRoster({ query } as never, "selected-company");

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(["selected-company"]);
    expect(sql).toContain("a.operating_company_id = $1::uuid");
    expect(sql).toContain("d.operating_company_id = $1::uuid");
    expect(sql).toContain("FROM mdata.driver_company_authorizations dca");
    expect(sql).toContain("dca.company_id = $1::uuid");
    expect(sql).toContain("dca.is_authorized = true");
    expect(sql).toContain("dca.deactivated_at IS NULL");
    expect(sql).toContain("a.ended_at IS NULL");
  });
});
