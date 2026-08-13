import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyDotInspectionsRoutes } from "./dot-inspections.js";

/**
 * CLS-UUID-LABEL: GET /api/v1/safety/dot-inspections selected `SELECT *` with no driver/unit/WO
 * join, so DOTInspectionsTab's EntityLink rendered the raw driver_id/unit_id/auto_spawned_wo_id
 * uuids as link text (no label prop was even passed). Mirrors the join safety.accident_reports
 * already uses (SAF-F26).
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery })
  ),
}));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));
vi.mock("../../maintenance/two-section-service.js", () => ({
  createWorkOrderWithLines: vi.fn(),
}));
vi.mock("../../storage/r2-client.js", () => ({
  putObjectBytes: vi.fn(),
  isR2Configured: vi.fn(() => false),
}));

describe("GET /api/v1/safety/dot-inspections joins human labels", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM safety.dot_inspections di")) {
        return {
          rows: [
            {
              id: "inspection-1",
              driver_id: "driver-1",
              unit_id: "unit-1",
              auto_spawned_wo_id: "wo-1",
              driver_name: "Jane Ortiz",
              unit_number: "T-402",
              work_order_display_id: "WO-T-402-IS-0007",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyDotInspectionsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("joins driver name, unit number, and WO display id so the list is never raw-uuid-only", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dot-inspections?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      dot_inspections: [
        {
          id: "inspection-1",
          driver_name: "Jane Ortiz",
          unit_number: "T-402",
          work_order_display_id: "WO-T-402-IS-0007",
        },
      ],
    });

    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/LEFT JOIN mdata\.drivers d/);
    expect(sqlText).toMatch(/LEFT JOIN mdata\.units u/);
    expect(sqlText).toMatch(/LEFT JOIN maintenance\.work_orders wo/);
  });

  it("filters the driver reverse read in SQL before the list limit", async () => {
    const driverId = "22222222-2222-4222-8222-222222222222";
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dot-inspections?operating_company_id=${COMPANY}&driver_id=${driverId}`,
    });

    expect(response.statusCode).toBe(200);
    const listCall = mockQuery.mock.calls.find((call) => String(call[0]).includes("FROM safety.dot_inspections di"));
    expect(String(listCall?.[0])).toContain("AND di.driver_id = $2");
    expect(listCall?.[1]).toEqual([COMPANY, driverId]);
  });
});
