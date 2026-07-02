import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluatePmAutoEngineStatus,
  registerMaintenancePmAutoEngineRoutes,
  runPmAutoEngineForTenant,
} from "../pm-auto-engine.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("pm auto-engine service (B28)", () => {
  describe("evaluatePmAutoEngineStatus", () => {
    it("returns due when odometer meets next due", () => {
      expect(evaluatePmAutoEngineStatus(120_500, 120_000)).toBe("due");
    });

    it("returns near_due inside lookahead window", () => {
      expect(evaluatePmAutoEngineStatus(119_600, 120_000, 500)).toBe("near_due");
    });

    it("returns current when far from due", () => {
      expect(evaluatePmAutoEngineStatus(100_000, 120_000, 500)).toBe("current");
    });
  });

  describe("runPmAutoEngineForTenant", () => {
    it("skips evaluation when engine is paused", async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
        if (sql.includes("pm_auto_engine_settings")) return { rows: [{ is_paused: true }] };
        if (sql.includes("UPDATE maintenance.pm_schedule_runs")) return { rows: [] };
        return { rows: [] };
      });
      const result = await runPmAutoEngineForTenant({ query }, COMPANY, { run_id: "run-1" });
      expect(result.schedules_evaluated).toBe(0);
    });
  });
});

describe("pm auto-engine routes (B28)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("pm_schedule_runs") && sql.includes("SELECT")) {
        return {
          rows: [
            {
              id: "run-1",
              status: "completed",
              schedules_evaluated: 2,
              work_orders_created: 1,
              alerts_created: 0,
            },
          ],
        };
      }
      if (sql.includes("pm_auto_wo_log") && sql.includes("SELECT")) {
        return { rows: [{ id: "log-1", action: "wo_created", schedule_label: "Oil change" }] };
      }
      if (sql.includes("pm_auto_engine_settings") && sql.includes("SELECT")) {
        return { rows: [{ is_paused: false }] };
      }
      return { rows: [] };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "maint@ih35.local",
      };
    });
    await registerMaintenancePmAutoEngineRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/pm-auto-engine/runs returns dashboard payload", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/pm-auto-engine/runs?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs: unknown[]; recent_log: unknown[] };
    expect(body.runs.length).toBeGreaterThan(0);
    expect(body.recent_log.length).toBeGreaterThan(0);
  });

  it("POST settings pauses and resumes engine", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.pm_auto_engine_settings")) return { rows: [] };
      return { rows: [] };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/pm-auto-engine/settings",
      payload: { operating_company_id: COMPANY, is_paused: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ is_paused: true });
  });

  it("POST run-now triggers manual evaluation", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass('maintenance.pm_auto_engine_settings')")) return { rows: [{ ok: true }] };
      if (sql.includes("pm_auto_engine_settings") && sql.includes("is_paused")) return { rows: [{ is_paused: false }] };
      if (sql.includes("pm_schedules")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.pm_schedule_runs")) return { rows: [{ id: "run-2" }] };
      if (sql.includes("UPDATE maintenance.pm_schedule_runs")) return { rows: [] };
      return { rows: [] };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/pm-auto-engine/run-now",
      payload: { operating_company_id: COMPANY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ schedules_evaluated: 0 });
  });
});
