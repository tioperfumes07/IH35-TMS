import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildResult, resolvePaging } from "../shared.js";
import { OPERATIONS_DEPTH_SUBVIEWS, registerDriverOperationsDepthRoutes } from "../routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const OTHER_DRIVER = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("operations-depth shared helpers", () => {
  it("resolvePaging clamps defaults and caps page_size", () => {
    expect(resolvePaging()).toMatchObject({ page: 1, page_size: 25, limit: 25, offset: 0 });
    expect(resolvePaging({ page: 3, page_size: 10 })).toMatchObject({ page: 3, page_size: 10, offset: 20 });
    expect(resolvePaging({ page: 0, page_size: 9999 })).toMatchObject({ page: 1, page_size: 200 });
  });

  it("buildResult derives has_more from total window", () => {
    expect(buildResult([{ a: 1 }], 50, 1, 25)).toMatchObject({ total: 50, has_more: true });
    expect(buildResult([{ a: 1 }], 25, 1, 25)).toMatchObject({ total: 25, has_more: false });
  });
});

describe("registry", () => {
  it("exposes exactly the 12 driver operations-depth sub-views", () => {
    expect(OPERATIONS_DEPTH_SUBVIEWS).toHaveLength(12);
    expect(OPERATIONS_DEPTH_SUBVIEWS.map((s) => s.slug)).toEqual([
      "debt-history",
      "payroll-history",
      "escrow-history",
      "permit-history",
      "accident-history",
      "settlement-history",
      "fuel-history",
      "maintenance-assignments",
      "safety-events",
      "communications-log",
      "pwa-engagement",
      "documents-vault",
    ]);
  });
});

describe("driver operations-depth routes (GAP-48)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Owner",
        email: "owner@ih35.local",
      };
    });
    await registerDriverOperationsDepthRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function wireInScopeDriver() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: DRIVER }] };
      if (sql.includes("COUNT(*)")) return { rows: [{ total: "2" }] };
      return { rows: [{ uuid: "row-1" }, { uuid: "row-2" }] };
    });
  }

  for (const subView of OPERATIONS_DEPTH_SUBVIEWS) {
    it(`GET ${subView.slug} returns paged, scoped data`, async () => {
      wireInScopeDriver();
      const res = await app.inject({
        method: "GET",
        url: `/api/drivers/${DRIVER}/operations/${subView.slug}?operating_company_id=${COMPANY}&page=1&page_size=25`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sub_view).toBe(subView.slug);
      expect(body.rows).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.page_size).toBe(25);

      const setConfigCalled = mockQuery.mock.calls.some((c) => String(c[0]).includes("set_config('app.operating_company_id'"));
      expect(setConfigCalled).toBe(true);
    });
  }

  it("returns 404 when the driver is outside the operating company scope", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [] };
      return { rows: [] };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/drivers/${OTHER_DRIVER}/operations/debt-history?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "driver_not_found" });
  });

  it("rejects an invalid operating_company_id with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/drivers/${DRIVER}/operations/debt-history?operating_company_id=not-a-uuid`,
    });
    expect(res.statusCode).toBe(400);
  });
});
