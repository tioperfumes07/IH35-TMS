import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyRoutes } from "../safety.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery })
  ),
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

describe("legacy safety CSA source contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("suppresses legacy Hazmat values and returns source metadata", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM safety.csa_scores")) {
        return { rows: [{ id: "legacy-score", basic_hazmat: 92, score_total: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/csa/latest?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      latest: { id: "legacy-score", basic_hazmat: null },
      source: {
        metric_kind: "internal_inspection_point_rollup",
        is_fmcsa_percentile: false,
      },
    });
  });

  it("keeps an all-null internal rollup unavailable in KPI output", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("num_nonnulls")) return { rows: [{ score: null }], rowCount: 1 };
      if (sql.includes("COUNT(*)::int AS count")) return { rows: [{ count: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().csa_score_latest).toBeNull();
    expect(response.json().csa_source).toMatchObject({
      metric_kind: "internal_inspection_point_rollup",
      is_fmcsa_percentile: false,
    });
  });
});
