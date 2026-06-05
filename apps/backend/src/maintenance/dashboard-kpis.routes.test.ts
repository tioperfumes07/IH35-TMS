import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceDashboardKpisRoutes } from "./dashboard-kpis.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const mockQuery = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn(() => true);

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

describe("maintenance dashboard kpis routes (AUDIT-FIX-9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
      if (sql.includes("to_regclass('maintenance.work_orders')")) return { rows: [{ ok: true }] };
      if (sql.includes("to_regclass('views.maintenance_dashboard_kpis')")) return { rows: [{ ok: false }] };
      if (sql.includes("to_regclass('mdata.units')")) return { rows: [{ ok: true }] };
      if (sql.includes("to_regclass('maintenance.pm_alerts')")) return { rows: [{ ok: false }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("COUNT(*)::int AS count")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerMaintenanceDashboardKpisRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns KPI payload with 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dashboard/kpis?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { open_wos: number; pm_due: number };
    expect(typeof body.open_wos).toBe("number");
    expect(body.pm_due).toBe(0);
  });

  it("degrades to zeroed payload when work_orders table is missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
      if (sql.includes("to_regclass('maintenance.work_orders')")) return { rows: [{ ok: false }] };
      throw new Error("relation maintenance.work_orders does not exist");
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dashboard/kpis?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ open_wos: 0, tire_alerts: 0, pm_due: 0 });
  });
});
