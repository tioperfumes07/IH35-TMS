import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyRoutes } from "../safety.routes.js";

/**
 * Regression cover for the 2026-07-23 live audit finding: every tile on the Safety dashboard
 * rendered 0 while TRANSP had 82 active drivers.
 *
 * Three independent causes, all reproduced here:
 *   - the endpoint never returned the field names SafetyKpiRow binds;
 *   - it read views.safety_dashboard_kpis, a `WHERE false` stub installed by migration 0045;
 *   - pending acks selected acknowledgment_uuid from a table without that column.
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery })
  ),
}));

vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

/** The six tiles SafetyKpiRow renders, by the exact field name it binds. */
const TILE_FIELDS = [
  "active_drivers",
  "drivers_with_open_fines",
  "open_company_violations",
  "critical_integrity_alerts",
  "open_liabilities",
] as const;

describe("safety dashboard KPIs are wired to real sources", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "safety@ih35.local" };
    });
    await registerSafetyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function mockAggregate(row: Record<string, number>) {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS active_drivers")) return { rows: [row], rowCount: 1 };
      if (sql.includes("num_nonnulls")) return { rows: [{ score: null }], rowCount: 1 };
      if (sql.includes("COUNT(*)::int AS count")) return { rows: [{ count: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  }

  it("returns every field the KPI tiles bind, with real values", async () => {
    mockAggregate({
      open_events: 3,
      mtd_violations: 2,
      training_due_30d: 1,
      active_drivers: 82,
      drivers_with_open_fines: 4,
      open_company_violations: 5,
      critical_integrity_alerts: 6,
      open_liabilities: 7,
      pending_acknowledgments: 8,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const field of TILE_FIELDS) {
      expect(body, `tile field ${field} must be present`).toHaveProperty(field);
    }
    expect(body.active_drivers).toBe(82);
    expect(body.drivers_with_open_fines).toBe(4);
    expect(body.open_company_violations).toBe(5);
    expect(body.critical_integrity_alerts).toBe(6);
    expect(body.open_liabilities).toBe(7);
    // Both ack keys are emitted: the component prefers pending_acknowledgments and falls back.
    expect(body.pending_acknowledgments).toBe(8);
    expect(body.pending_acks).toBe(8);
  });

  it("does not read the stubbed views.safety_dashboard_kpis or the phantom ack column", async () => {
    mockAggregate({
      open_events: 0,
      mtd_violations: 0,
      training_due_30d: 0,
      active_drivers: 0,
      drivers_with_open_fines: 0,
      open_company_violations: 0,
      critical_integrity_alerts: 0,
      open_liabilities: 0,
      pending_acknowledgments: 0,
    });

    await app.inject({
      method: "GET",
      url: `/api/v1/safety/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    const executed = mockQuery.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(executed).not.toContain("views.safety_dashboard_kpis");
    // acknowledgment_uuid is only valid against the view that actually has the column.
    const acksFromBaseTable = /FROM\s+driver_finance\.driver_liabilities[^)]*acknowledgment_uuid/.test(executed);
    expect(acksFromBaseTable).toBe(false);
    expect(executed).toContain("views.liabilities_active_with_context");
  });

  it("counts active drivers the same way the canonical drivers list does", async () => {
    mockAggregate({
      open_events: 0,
      mtd_violations: 0,
      training_due_30d: 0,
      active_drivers: 82,
      drivers_with_open_fines: 0,
      open_company_violations: 0,
      critical_integrity_alerts: 0,
      open_liabilities: 0,
      pending_acknowledgments: 0,
    });

    await app.inject({
      method: "GET",
      url: `/api/v1/safety/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    const aggregate = mockQuery.mock.calls.map(([sql]) => String(sql)).find((s) => s.includes("AS active_drivers"));
    expect(aggregate).toBeDefined();
    // /api/v1/mdata/drivers?status=Active filters on status + archived + pseudo exclusions.
    // Counting by deactivated_at instead returned 83 against the list's 82.
    expect(aggregate).toContain("status = 'Active'");
    expect(aggregate).toContain("archived_at IS NULL");
    expect(aggregate).not.toContain("deactivated_at IS NULL) AS active_drivers");
  });

  it("fails loudly instead of reporting a false all-clear when a source is unavailable", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("AS active_drivers")) throw new Error('relation "safety.integrity_alerts" does not exist');
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dashboard/kpis?operating_company_id=${COMPANY}`,
    });

    // A swallowed error rendering as 0 is what hid this defect on a safety screen.
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
  });
});
