import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIntegrityRoutes } from "../integrity.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OBSERVATION = "22222222-2222-4222-8222-222222222222";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) => fn({ query: mockQuery })),
}));
vi.mock("../../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

describe("Safety integrity report exact ranges", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("count(*)::int AS total_count")) return { rows: [{ total_count: 251 }] };
      if (sql.includes("safety.integrity_observations")) return { rows: [{ id: OBSERVATION, status: "new" }] };
      return { rows: [{ id: OBSERVATION }], rowCount: 1, values };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "safety@ih35.local" };
    });
    await registerSafetyIntegrityRoutes(app);
    await app.ready();
  });

  afterEach(async () => app.close());

  it.each([
    ["wo-cost-outliers", "outliers"],
    ["fuel-mpg-anomalies", "anomalies"],
    ["driver-dwell-outliers", "outliers"],
    ["hos-pattern-breaks", "pattern_breaks"],
  ])("returns exact total and forwards range for %s", async (path, key) => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/integrity/${path}?operating_company_id=${COMPANY}&limit=25&offset=50`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ [key]: [{ id: OBSERVATION }], total_count: 251 });
    expect(mockQuery.mock.calls.some(([sql, values]) => String(sql).includes("LIMIT $2 OFFSET $3") && values?.[1] === 25 && values?.[2] === 50)).toBe(true);
  });

  it("fetches observation state only for canonical current-page ids", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/integrity/observations?operating_company_id=${COMPANY}&ids=${OBSERVATION}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ observations: [{ id: OBSERVATION, status: "new" }] });
    expect(mockQuery.mock.calls.some(([sql, values]) => String(sql).includes("id = ANY($2::uuid[])") && values?.[1]?.[0] === OBSERVATION)).toBe(true);
  });
});
