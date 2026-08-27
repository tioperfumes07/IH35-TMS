import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeAndUpsertScore, registerSafetyCsaScoresRoutes } from "./csa-scores.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockMembership } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMembership: vi.fn(async () => undefined),
}));

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
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: mockMembership,
}));

describe("safety CSA source-honesty routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockMembership.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyCsaScoresRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("labels local rows as internal rollups and suppresses stored Hazmat values", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM safety.csa_scores")) {
        return {
          rows: [{ id: "score-a", basic_hazmat: 91, basic_unsafe_driving: null }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/csa-scores/current?operating_company_id=${COMPANY_A}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      current: { id: "score-a", basic_hazmat: null, basic_unsafe_driving: null },
      source: {
        metric_kind: "internal_inspection_point_rollup",
        is_fmcsa_percentile: false,
        hazmat: { availability: "requires_authenticated_carrier_sms" },
      },
    });
  });

  it("returns an exact company total and forwards the requested history range", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("count(*)::int AS total_count")) return { rows: [{ total_count: 137 }] };
      if (sql.includes("ORDER BY period_end DESC LIMIT $2 OFFSET $3")) {
        expect(values).toEqual([COMPANY_A, 25, 50]);
        return { rows: [{ id: "score-page", basic_hazmat: 88 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/csa-scores?operating_company_id=${COMPANY_A}&limit=25&offset=50`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      csa_scores: [{ id: "score-page", basic_hazmat: null }],
      total_count: 137,
    });
  });

  it("checks membership and scopes each tenant request independently", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM safety.csa_scores")) {
        return { rows: [{ operating_company_id: values?.[0] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const first = await app.inject({
      method: "GET",
      url: `/api/v1/safety/csa-scores/current?operating_company_id=${COMPANY_A}`,
    });
    const second = await app.inject({
      method: "GET",
      url: `/api/v1/safety/csa-scores/current?operating_company_id=${COMPANY_B}`,
    });

    expect(first.json().current.operating_company_id).toBe(COMPANY_A);
    expect(second.json().current.operating_company_id).toBe(COMPANY_B);
    expect(mockMembership).toHaveBeenNthCalledWith(1, expect.any(String), COMPANY_A);
    expect(mockMembership).toHaveBeenNthCalledWith(2, expect.any(String), COMPANY_B);
  });

  it("rejects public SAFER as an authoritative Hazmat source", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/safety/csa-scores/pull-from-safer?operating_company_id=${COMPANY_A}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "source_not_authoritative",
      source: { availability: "requires_authenticated_carrier_sms" },
    });
  });

  it("rolls Unsafe=5 and HOS=3 into 5 and 3 rather than 8 and 8", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("WITH inspection_points AS")) {
        expect(sql).toContain("violations_jsonb -> 'csa_point_breakdown' ->> 'unsafe_driving'");
        expect(sql).toContain("violations_jsonb -> 'csa_point_breakdown' ->> 'hos_compliance'");
        expect(sql).not.toMatch(/SUM\(csa_points\)\s+FILTER/i);
        return {
          rows: [{
            total_points: 8,
            total_inspections: 1,
            total_oos: 0,
            basic_unsafe_driving: 5,
            basic_hos_compliance: 3,
            basic_driver_fitness: null,
            basic_controlled_substances: null,
            basic_vehicle_maintenance: null,
            basic_crash_indicator: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO safety.csa_scores")) {
        expect(values?.[1]).toBe(5);
        expect(values?.[2]).toBe(3);
        expect(values?.[8]).toBe(8);
        return {
          rows: [{
            id: "score-5-plus-3",
            basic_unsafe_driving: values?.[1],
            basic_hos_compliance: values?.[2],
            total_violations: values?.[8],
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const score = await computeAndUpsertScore(
      { query },
      COMPANY_A,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );

    expect(score).toMatchObject({
      basic_unsafe_driving: 5,
      basic_hos_compliance: 3,
      total_violations: 8,
    });
  });
});
