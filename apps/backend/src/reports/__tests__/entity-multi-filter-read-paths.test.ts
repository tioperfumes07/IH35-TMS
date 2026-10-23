import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerReportsApAgingRoutes } from "../ap-aging.routes.js";
import { registerReportsArAgingRoutes } from "../ar-aging.routes.js";
import { registerFuelReconciliationRoutes } from "../fuel-reconciliation.routes.js";
import { registerMaintenanceCostPerUnitRoutes } from "../maintenance-cost-per-unit.routes.js";
import { registerDriverPayHistoryRoutes } from "../driver-pay-history.routes.js";
import { registerProfitPerTruckRoutes } from "../profit-per-truck.routes.js";
import { registerAuditReportRoutes } from "../../audit/audit-reports.routes.js";
import { getApAgingReport } from "../../accounting/ap-aging.service.js";
import { getArAgingReport } from "../../accounting/ar-aging.service.js";
import { registerStatementExportRoutes } from "../../accounting/statement-export.routes.js";

const companyId = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const { query, cacheKeys } = vi.hoisted(() => ({
  query: vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] as Record<string, unknown>[] })),
  cacheKeys: [] as string[],
}));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (db: unknown) => unknown) => fn({ query }) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: async () => false }));
vi.mock("../../maintenance/pm-cost-per-mile.service.js", () => ({ computePmCostPerMile: async () => ({ units: [] }) }));
vi.mock("../../lib/ttl-cache.js", () => ({ createTtlCache: () => ({ get: (key: string) => { cacheKeys.push(key); return undefined; }, set: vi.fn() }) }));
vi.mock("../../accounting/statement-export-pdf.service.js", () => ({ renderStatementPdf: async () => Buffer.from("test-pdf") }));
vi.mock("../../accounting/statement-export-xlsx.service.js", () => ({ renderStatementXlsx: async () => Buffer.from("test-xlsx") }));

const surfaces = [
  { register: registerReportsApAgingRoutes, path: "/api/v1/reports/ap-aging", field: "vendor_id", extra: { as_of_date: "2999-01-01" }, sql: "vendor_id::text = ANY($2::text[])" },
  { register: registerReportsApAgingRoutes, path: "/api/v1/reports/ap-aging", field: "vendor_id", extra: { as_of_date: "2020-01-01" }, sql: "vendor_id::text = ANY($3::text[])" },
  { register: registerReportsArAgingRoutes, path: "/api/v1/reports/ar-aging", field: "customer_id", extra: { as_of_date: "2999-01-01" }, sql: "customer_id = ANY($2::uuid[])" },
  { register: registerReportsArAgingRoutes, path: "/api/v1/reports/ar-aging", field: "customer_id", extra: { as_of_date: "2020-01-01" }, sql: "customer_id = ANY($3::uuid[])" },
  { register: registerFuelReconciliationRoutes, path: "/api/v1/reports/fuel-reconciliation", field: "unit_id", extra: { period_start: "2026-10-01", period_end: "2026-10-23" }, sql: "COALESCE(ft.unit_id, l.assigned_unit_id) = ANY($4::uuid[])" },
  { register: registerFuelReconciliationRoutes, path: "/api/v1/reports/fuel-reconciliation", field: "unit_id", extra: { period: "2026-10" }, sql: "COALESCE(ft.unit_id, l.assigned_unit_id) = ANY($4::uuid[])" },
  { register: registerMaintenanceCostPerUnitRoutes, path: "/api/v1/reports/maintenance-cost-per-unit", field: "unit_id", extra: { period_start: "2026-10-01", period_end: "2026-10-23" }, sql: "wo.unit_id = ANY($5::uuid[])" },
  { register: registerMaintenanceCostPerUnitRoutes, path: "/api/v1/reports/maintenance-cost-per-unit", field: "unit_id", extra: { period: "2026-10" }, sql: "wo.unit_id = ANY($5::uuid[])" },
  { register: registerDriverPayHistoryRoutes, path: "/api/v1/reports/driver-pay-history", field: "driver_id", extra: { start: "2026-10-01", end: "2026-10-23" }, sql: "s.driver_id = ANY($2::uuid[])" },
  { register: registerProfitPerTruckRoutes, path: "/api/v1/reports/profit-per-truck", field: "unit_id", extra: { month: "2026-10" }, sql: "u.id = ANY($4::uuid[])" },
  { register: registerAuditReportRoutes, path: "/api/v1/audit/reports/deduction-trail", field: "driver_id", extra: {}, sql: "c.subject_id = ANY($2::uuid[])" },
  { register: registerStatementExportRoutes, path: "/api/v1/accounting/ar-aging/export/pdf", field: "customer_id", extra: { as_of_date: "2026-10-23" }, sql: "i.customer_id = ANY($3::uuid[])" },
  { register: registerStatementExportRoutes, path: "/api/v1/accounting/ar-aging/export/xlsx", field: "customer_id", extra: { as_of_date: "2026-10-23" }, sql: "i.customer_id = ANY($3::uuid[])" },
  { register: registerStatementExportRoutes, path: "/api/v1/accounting/ap-aging/export/pdf", field: "vendor_id", extra: { as_of_date: "2026-10-23" }, sql: "aging.vendor_id = ANY($3::text[])" },
  { register: registerStatementExportRoutes, path: "/api/v1/accounting/ap-aging/export/xlsx", field: "vendor_id", extra: { as_of_date: "2026-10-23" }, sql: "aging.vendor_id = ANY($3::text[])" },
];
const apps: FastifyInstance[] = [];
beforeEach(() => { query.mockClear(); cacheKeys.length = 0; });
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function build(register: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify();
  apps.push(app);
  app.addHook("preHandler", async (req) => { req.user = { uuid: ids[0]!, role: "Owner", email: null }; });
  await register(app);
  return app;
}

describe.each(surfaces)("report CSV $path $field $extra", ({ register, path, field, extra, sql }) => {
  it("binds both IDs before aggregation and separates filtered cache keys", async () => {
    const app = await build(register);
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: ids.join(","), ...extra } as Record<string, string>);
    const response = await app.inject({ method: "GET", url: `${path}?${params}` });
    expect(response.statusCode, response.body).toBe(200);
    const call = query.mock.calls.find(([text]) => text.includes(sql));
    expect(call, sql).toBeDefined();
    expect(call?.[1]).toContain(companyId);
    expect(call?.[1]).toContainEqual(ids);
    expect(call?.[0]).not.toContain(ids[0]);
    if (cacheKeys.length) expect(cacheKeys[0]).toContain(ids.join(","));
  });
  it.each(["invalid", `${ids[0]},`, Array(101).fill(ids[0]).join(",")])("rejects bad or oversized entity lists before any database access", async (value) => {
    const app = await build(register);
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: value, ...extra } as Record<string, string>);
    const response = await app.inject({ method: "GET", url: `${path}?${params}` });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

it("fuel totals, unit rows, unmatched samples and unmatched counts share one unit selection", async () => {
  const app = await build(registerFuelReconciliationRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, unit_id: ids.join(","), period: "2026-10" });
  const response = await app.inject({ method: "GET", url: `/api/v1/reports/fuel-reconciliation?${params}` });
  expect(response.statusCode).toBe(200);
  const calls = query.mock.calls.filter(([sql]) => sql.includes("FROM fuel.fuel_transactions ft") || sql.includes("FROM maintenance.work_orders wo"));
  expect(calls).toHaveLength(7);
  for (const [sql, values] of calls) {
    expect(sql).toContain("ANY($4::uuid[])");
    expect(values?.[3]).toEqual(ids);
  }
});

it("maintenance unit totals and category chart aggregate the identical selected cohort", async () => {
  const app = await build(registerMaintenanceCostPerUnitRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, unit_id: ids.join(","), period: "2026-10" });
  const response = await app.inject({ method: "GET", url: `/api/v1/reports/maintenance-cost-per-unit?${params}` });
  expect(response.statusCode).toBe(200);
  const calls = query.mock.calls.filter(([sql]) => sql.includes("WITH wo_scope AS"));
  expect(calls).toHaveLength(2);
  for (const [sql, values] of calls) {
    expect(sql).toContain("wo.unit_id = ANY($5::uuid[])");
    expect(values?.[4]).toEqual(ids);
  }
});

it("aging statement readers filter before their existing per-counterparty buckets and totals", async () => {
  await getArAgingReport({ userId: ids[0]!, operating_company_id: companyId, as_of_date: "2026-10-23", customer_id: ids.join(",") });
  const arCall = query.mock.calls.find(([sql]) => sql.includes("FROM accounting.invoices i"));
  expect(arCall?.[0]).toContain("i.customer_id = ANY($3::uuid[])");
  expect(arCall?.[1]?.[2]).toEqual(ids);
  query.mockClear();
  await getApAgingReport({ userId: ids[0]!, operating_company_id: companyId, as_of_date: "2026-10-23", vendor_id: ids.join(",") });
  const apCall = query.mock.calls.find(([sql]) => sql.includes("aging.vendor_id = ANY($3::text[])"));
  expect(apCall?.[1]?.[2]).toEqual(ids);
});
