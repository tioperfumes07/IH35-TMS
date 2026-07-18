import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyDotInspectionsRoutes } from "./dot-inspections.js";

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

describe("DOT inspection CSA canonical rollup", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO safety.dot_inspections")) {
        return {
          rows: [{ id: "inspection-1", outcome: "PASS", unit_id: null, csa_points: values?.[9] }],
          rowCount: 1,
        };
      }
      if (sql.includes("SUM(csa_points)::int AS total_points")) {
        return {
          rows: [{
            total_points: null,
            total_inspections: 1,
            total_oos: 0,
            basic_unsafe_driving: null,
            basic_hos_compliance: null,
            basic_driver_fitness: null,
            basic_controlled_substances: null,
            basic_vehicle_maintenance: null,
            basic_crash_indicator: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO safety.csa_scores")) {
        return { rows: [{ id: "score-1", basic_hazmat: null, total_violations: null }], rowCount: 1 };
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

  it("uses canonical columns and preserves missing point evidence as null", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/safety/dot-inspections?operating_company_id=${COMPANY}`,
      payload: {
        inspection_date: "2026-07-17T12:00:00Z",
        inspector_name: "Officer Test",
        inspection_level: 1,
        outcome: "PASS",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      dot_inspection: { csa_points: null },
      csa_score: { basic_hazmat: null, total_violations: null },
      csa_source: { metric_kind: "internal_inspection_point_rollup" },
    });
    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).not.toMatch(/score_date|source_dot_inspection_count/);
  });
});
