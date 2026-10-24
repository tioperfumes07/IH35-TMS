import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(async (_id, fn) => fn({ query })) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));

const COMPANY = "11111111-1111-4111-8111-111111111111";
const IDS = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const cases = [
  ["../safety.routes.js", "registerSafetyRoutes", "/api/v1/safety/accidents", ["driver_id", "unit_id", "trailer_id", "load_id"], "safety.accident_reports", ""],
  ["../safety.routes.js", "registerSafetyRoutes", "/api/v1/safety/training/completions", ["driver_id"], "safety.training_records", ""],
  ["../incidents.routes.js", "registerSafetyIncidentsRoutes", "/api/v1/safety/incidents", ["driver_id", "unit_id", "trailer_id", "load_id"], "safety.incidents", "incident_type=damage_report"],
  ["../dvir.routes.js", "registerSafetyDvirRoutes", "/api/v1/safety/dvir", ["driver_id", "unit_id", "trailer_id"], "safety.dvir_submissions", ""],
  ["../fines.routes.js", "registerSafetyFinesRoutes", "/api/v1/safety/fines", ["subject_driver_id", "related_load_id", "related_unit_id"], "safety.civil_fines", ""],
  ["../company-violations.routes.js", "registerSafetyCompanyViolationsRoutes", "/api/v1/safety/company-violations", ["driver_id", "unit_id"], "safety.company_violations", ""],
  ["../integrity-alerts.routes.js", "registerSafetyIntegrityAlertsRoutes", "/api/v1/safety/integrity-alerts", ["subject_driver_id", "subject_unit_id", "subject_vendor_id"], "safety.integrity_alerts", ""],
  ["../safety-v5.routes.js", "registerSafetyV5Routes", "/api/v1/safety/internal-fines", ["driver_id", "load_id"], "safety.internal_fines", ""],
  ["../drug-program.routes.js", "registerSafetyDrugProgramRoutes", "/api/v1/safety/drug-program/tests", ["driver_id"], "safety.drug_test", ""],
  ["../events/safety-events.routes.js", "registerSafetyEventsRoutes", "/api/v1/safety/events-log", ["related_load_id", "subject_driver_id", "subject_unit_id"], "safety.safety_events", ""],
  ["../position-history/position-history.routes.js", "positionHistoryRoutes", "/api/v1/safety/position-history", ["unit_id"], "maintenance.position_history", ""],
  ["../../routes/safety/dot-inspections.js", "registerSafetyDotInspectionsRoutes", "/api/v1/safety/dot-inspections", ["driver_id", "unit_id", "trailer_id"], "safety.dot_inspections", ""],
  ["../../routes/safety/hos-violations.js", "registerSafetyHosViolationsRoutes", "/api/v1/safety/hos-violations", ["driver_id", "load_id"], "safety.hos_violations", ""],
  ["../../routes/safety/complaints.js", "registerSafetyComplaintsRoutes", "/api/v1/safety/complaints", ["driver_id"], "safety.complaints", ""],
  ["../../telematics/dashcam-on-demand.routes.js", "registerDashcamOnDemandRoutes", "/api/v1/telematics/dashcam-clips", ["unit_id"], "telematics.dashcam_clips", ""],
  ["../../fuel/fuel-transactions.routes.js", "registerFuelTransactionsRoutes", "/api/v1/fuel/transactions", ["driver_id", "unit_id", "trailer_id", "load_id"], "fuel.fuel_transactions", ""],
  ["../../fuel/fuel-card-overage.routes.js", "registerFuelCardOverageRoutes", "/api/v1/fuel/card-overage-events", ["driver_id", "unit_id"], "fuel.fuel_card_overage_events", "status=all"],
  ["../../maintenance/driver-reports.routes.js", "registerMaintenanceDriverReportsRoutes", "/api/v1/maintenance/driver-reports", ["driver_id", "load_id"], "maintenance.driver_reports", ""],
  ["../../maintenance/work-orders.routes.js", "registerMaintenanceWorkOrderRoutes", "/api/v1/maintenance/work-orders", ["external_vendor_id"], "maintenance.work_orders", ""],
  ["../../work-orders/work-orders.routes.js", "registerWorkOrdersV1Routes", "/api/v1/work-orders", ["unit_id", "driver_id"], "maintenance.work_orders", ""],
  ["../../settlements/auto-deductions/policy.routes.js", "registerAutoDeductionPolicyRoutes", "/api/v1/auto-deductions/policies", ["driver_id"], "driver_finance.auto_deduction_policies", ""],
  ["../../settlements/team-splits/team-splits.routes.js", "registerTeamSplitRoutes", "/api/v1/team-splits/configs", ["driver_id"], "mdata.driver_teams", ""],
  ["../../driver-finance/deductions.routes.js", "registerDriverFinanceDeductionRoutes", "/api/v1/driver-finance/deductions", ["driver_id"], "driver_finance.driver_settlement_deductions", ""],
  ["../../maintenance/kpi.routes.js", "registerMaintenanceKpiRoutes", "/api/v1/maintenance/kpi/pm-compliance", ["unit_id"], "maintenance.pm_schedules", "period_start=2026-06-01&period_end=2026-06-07"],
] as const;

describe("safety entity multi-filter read boundaries", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ present: true, ok: true }] };
      if (sql.includes("cnt_all")) return { rows: [{ cnt_all: 0, cnt_open: 0, cnt_in_progress: 0, cnt_completed: 0, cnt_cancelled: 0 }] };
      if (/FROM mdata\.drivers (?:d|md)\s/.test(sql) && !sql.includes("LEFT JOIN")) return { rows: IDS.map(id => ({ id })) };
      return { rows: [], rowCount: 0 };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async req => { req.user = { uuid: IDS[0], role: "Owner", email: "owner@example.test" }; });
  });
  afterEach(async () => { await app.close(); });

  it.each(cases)("%s %s preserves every selected ID in scoped SQL", async (modulePath, register, url, fields, table, extra) => {
    const module = await import(modulePath);
    await module[register](app);
    const params = new URLSearchParams({ operating_company_id: COMPANY, ...Object.fromEntries(fields.map(field => [field, IDS.join(",")])) });
    const response = await app.inject({ method: "GET", url: `${url}?${params}&${extra}` });
    expect(response.statusCode, response.body).toBe(200);
    const reads = query.mock.calls.filter(([sql]) => String(sql).includes(`FROM ${table} `));
    expect(reads.length).toBeGreaterThan(0);
    for (const [sql, values] of reads) {
      expect(sql).toContain("operating_company_id = $1::uuid");
      expect(values[0]).toBe(COMPANY);
      const entityOffset = table === "safety.incidents" ? 2 : 1;
      for (let n = 0; n < fields.length; n++) expect(values[n + entityOffset]).toEqual(IDS);
      expect(sql.match(/= ANY\(\$\d+::uuid\[\]\)/g)?.length).toBeGreaterThanOrEqual(fields.length);
      expect(sql).not.toContain(IDS[0]);
    }
  });

  it.each(cases)("%s %s rejects a malformed second ID before reading", async (modulePath, register, url, fields, _table, extra) => {
    const module = await import(modulePath);
    await module[register](app);
    const response = await app.inject({ method: "GET", url: `${url}?operating_company_id=${COMPANY}&${fields[0]}=${IDS[0]},invalid&${extra}` });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
