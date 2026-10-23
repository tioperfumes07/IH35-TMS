import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceSummaryRoutes } from "../summary.routes.js";
import { registerMaintenancePartsInvoiceLinksRoutes } from "../../maintenance/parts-invoice-links.routes.js";
import { registerMaintenancePartsInventoryRoutes } from "../../maintenance/parts-inventory.routes.js";
import { registerLegalMattersRoutes } from "../../legal/matters.routes.js";
import { registerPropertyTaxRoutes } from "../../compliance/property-tax/property-tax.routes.js";
import { registerFleetLocationHosRoutes } from "../../telematics/fleet-location-hos.routes.js";
import { registerHosTrackerRoutes } from "../../telematics/hos-tracker.routes.js";

const companyId = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const query = vi.hoisted(() => vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] as Record<string, unknown>[] })));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (db: unknown) => unknown) => fn({ query }) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));

const surfaces = [
  { register: registerInsuranceSummaryRoutes, path: "/api/v1/insurance/coverage-gaps", field: "unit_id", sql: "u.id = ANY($3::uuid[])" },
  { register: registerMaintenancePartsInvoiceLinksRoutes, path: "/api/v1/maintenance/parts-invoice-links", field: "vendor_id", sql: "pil.vendor_id = ANY($2::uuid[])" },
  { register: registerMaintenancePartsInventoryRoutes, path: "/api/v1/maintenance/parts-inventory/purchases", field: "vendor_id", sql: "pp.vendor_id = ANY($2::uuid[])" },
  { register: registerLegalMattersRoutes, path: "/api/v1/legal/matters", field: "unit_id", sql: "m.unit_id = ANY($2::uuid[])" },
  { register: registerPropertyTaxRoutes, path: "/api/v1/compliance/property-tax/renditions", field: "unit_id", sql: "l.unit_id = ANY($2::uuid[])" },
  { register: registerFleetLocationHosRoutes, path: "/api/v1/telematics/fleet-location-hos", field: "unit_id", sql: "u.id = ANY($2::uuid[])" },
  { register: registerHosTrackerRoutes, path: "/api/v1/telematics/hos/daily-roster", field: "driver_id", sql: "a.driver_id = ANY($2::uuid[])" },
];
const apps: FastifyInstance[] = [];
beforeEach(() => query.mockClear());
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function build(register: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify();
  apps.push(app);
  app.addHook("preHandler", async (req) => { req.user = { uuid: ids[0]!, role: "Owner", email: null }; });
  await register(app);
  return app;
}

describe.each(surfaces)("entity CSV read filter $path", ({ register, path, field, sql }) => {
  it("preserves all selections as a bound array and the company predicate", async () => {
    const app = await build(register);
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: ids.join(","), date: "2026-10-23" });
    const response = await app.inject({ method: "GET", url: `${path}?${params}` });
    expect(response.statusCode, response.body).toBe(200);
    const call = query.mock.calls.find(([text]) => text.includes(sql));
    expect(call, sql).toBeDefined();
    expect(call?.[1]).toContain(companyId);
    expect(call?.[1]).toContainEqual(ids);
    expect(call?.[0]).not.toContain(ids[0]);
  });
  it.each(["invalid", `${ids[0]},`, Array(101).fill(ids[0]).join(",")])("rejects invalid or oversized lists before database access", async (value) => {
    const app = await build(register);
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: value, date: "2026-10-23" });
    const response = await app.inject({ method: "GET", url: `${path}?${params}` });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

it("keeps assignments count and pagination on the identical vendor AND unit selections", async () => {
  const app = await build(registerMaintenancePartsInvoiceLinksRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, vendor_id: ids.join(","), unit_id: ids.join(","), limit: "25", offset: "50" });
  const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/parts-invoice-links?${params}` });
  expect(response.statusCode, response.body).toBe(200);
  const calls = query.mock.calls.filter(([sql]) => sql.includes("FROM maintenance.parts_invoice_links pil"));
  expect(calls).toHaveLength(2);
  for (const [sql, values] of calls) {
    expect(sql).toContain("pil.vendor_id = ANY($2::uuid[]) AND wo.unit_id = ANY($3::uuid[])");
    expect(values?.slice(0, 3)).toEqual([companyId, ids, ids]);
  }
  expect(calls[1]?.[1]?.slice(-2)).toEqual([25, 50]);
});

it("Fleet HOS xlsx uses the same bound multi-unit filter as JSON", async () => {
  const app = await build(registerFleetLocationHosRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, unit_id: ids.join(","), format: "xlsx" });
  const response = await app.inject({ method: "GET", url: `/api/v1/telematics/fleet-location-hos?${params}` });
  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toContain("spreadsheetml.sheet");
  expect(query.mock.calls.find(([sql]) => sql.includes("u.id = ANY($2::uuid[])"))?.[1]).toEqual([companyId, ids]);
});
