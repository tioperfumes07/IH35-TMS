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

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
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
    const seenSql: string[] = [];
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      seenSql.push(sql);
      if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
      if (sql.includes("to_regclass($1)")) {
        return { rows: [{ ok: values?.[0] === "maintenance.work_orders" || values?.[0] === "mdata.units" }] };
      }
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("COUNT(*)::int AS count")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dashboard/kpis?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { open_wos: number; pm_due: number };
    expect(typeof body.open_wos).toBe("number");
    expect(body.pm_due).toBe(0);
    const fleetSql = seenSql.find((sql) => sql.includes("AS total_units"));
    expect(fleetSql).toContain("owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid");
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

  it("preserves open WO count and dollars when an optional KPI query fails", async () => {
    let criticalCalls = 0;
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
      if (sql.includes("to_regclass($1)") && values?.[0] === "maintenance.work_orders") return { rows: [{ ok: true }] };
      if (sql.includes("to_regclass($1)")) return { rows: [{ ok: false }] };
      if (sql.includes("AS count") && sql.includes("maintenance.work_orders")) {
        criticalCalls += 1;
        return { rows: [{ count: 3 }] };
      }
      if (sql.includes("AS open_dollars")) {
        criticalCalls += 1;
        return { rows: [{ open_dollars: 100 }] };
      }
      if (sql.includes("information_schema.columns")) throw new Error("optional schema drift");
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ open_wos: 3, open_dollars: 100 });
    // Primary attempt + degraded fallback each read count and dollars.
    expect(criticalCalls).toBe(4);
  });

  it("defines open dollars as actual cost falling back to estimated cost", async () => {
    const seenSql: string[] = [];
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      seenSql.push(sql);
      if (sql.includes("to_regclass($1)") && values?.[0] === "maintenance.work_orders") return { rows: [{ ok: true }] };
      if (sql.includes("to_regclass($1)")) return { rows: [{ ok: false }] };
      if (sql.includes("AS count")) return { rows: [{ count: 3 }] };
      if (sql.includes("AS open_dollars")) return { rows: [{ open_dollars: 125 }] };
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ open_wos: 3, open_dollars: 125 });
    const openDollarSql = seenSql.find((sql) => sql.includes("AS open_dollars"));
    expect(openDollarSql).toContain("w.total_actual_cost");
    expect(openDollarSql).toContain("w.estimated_cost_cents");
    expect(openDollarSql).toContain("/ 100.0");
  });
});
