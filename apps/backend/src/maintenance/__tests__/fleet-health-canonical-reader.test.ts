import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), engine: vi.fn(), membership: vi.fn() }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: (_id: string, fn: (c: unknown) => unknown) => fn({ query: mocks.query }) }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: mocks.membership }));
vi.mock("../pm-due-engine.service.js", () => ({ computePmDueEngineForCompany: mocks.engine }));
import { registerFleetHealthRoutes } from "../fleet-health.routes.js";
import { captureRoutes } from "../../../test-helpers/capture-route-handler.js";

describe("Fleet Health route canonical PM population", () => {
  it("reads once, sharing the exact canonical PM population between KPI and paginated rows", async () => {
    mocks.engine.mockResolvedValue([]);
    mocks.query.mockResolvedValue({ rows: [] });
    const captured = captureRoutes();
    await registerFleetHealthRoutes(captured.app);
    const company = "00000000-0000-4000-8000-000000000001";
    await captured.handler()({ user: { uuid: "reader" }, query: { operating_company_id: company } }, {});
    expect(mocks.membership).toHaveBeenCalledWith("reader", company);
    expect(mocks.engine).toHaveBeenCalledTimes(1);
    expect(mocks.engine).toHaveBeenCalledWith(expect.anything(), company, expect.objectContaining({ byUnit: expect.any(Map) }));
    const reads = mocks.query.mock.calls.filter(([sql]) => sql.includes("WITH co"));
    expect(reads).toHaveLength(2);
    for (const [sql, values] of reads) {
      expect(values).toEqual([company, 200, 0, "[]"]);
      expect(sql).toContain("jsonb_to_recordset($4::jsonb)");
      expect(sql).not.toMatch(/COALESCE\((?:vlp|tele)\.odometer_mi,\s*pm\.last_service_odometer\)/);
    }
  });
});
