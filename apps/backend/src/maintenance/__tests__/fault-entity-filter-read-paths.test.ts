import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFaultCodeAlertsRoutes } from "../fault-code-alerts.routes.js";
import { registerAutoWoDraftsRoutes } from "../fault-auto-wo/auto-wo-drafts.routes.js";
const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const query = vi.hoisted(() => vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] })));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (db: unknown) => unknown) => fn({ query }) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));
const apps: FastifyInstance[] = [];
beforeEach(() => query.mockClear());
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function build(register: (app: FastifyInstance) => Promise<void>) {
  const app = Fastify(); apps.push(app);
  app.addHook("preHandler", async req => { req.user = { uuid: ids[0]!, role: "Owner", email: null }; });
  await register(app); return app;
}
describe.each([
  { register: registerFaultCodeAlertsRoutes, path: "fault-code-alerts", field: "unit_id", predicate: "h.unit_id = ANY($2::uuid[])" },
  { register: registerFaultCodeAlertsRoutes, path: "fault-code-alerts", field: "driver_id", predicate: "driver_at_time.driver_id = ANY($2::uuid[])" },
  { register: registerAutoWoDraftsRoutes, path: "auto-wo-drafts", field: "unit_id", predicate: "w.unit_id = ANY($4::uuid[])" },
])("$path $field", ({ register, path, field, predicate }) => {
  it("binds all selected ids before pagination", async () => {
    const app = await build(register);
    const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/${path}?${new URLSearchParams({ operating_company_id: company, [field]: ids.join(",") })}` });
    expect(response.statusCode, response.body).toBe(200);
    const call = query.mock.calls.find(([sql]) => sql.includes(predicate));
    expect(call).toBeDefined(); expect(call?.[1]).toContainEqual(ids); expect(call?.[1]).toContain(company);
    expect(call?.[0]).not.toContain(ids[0]);
  });
  it("rejects invalid second id before reading", async () => {
    const app = await build(register);
    const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/${path}?${new URLSearchParams({ operating_company_id: company, [field]: ids[0] + ",invalid" })}` });
    expect(response.statusCode).toBe(400); expect(query).not.toHaveBeenCalled();
  });
});
it("fault unit and driver selections intersect rather than reject or clear one another", async () => {
  const app = await build(registerFaultCodeAlertsRoutes);
  const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/fault-code-alerts?${new URLSearchParams({ operating_company_id: company, unit_id: ids.join(","), driver_id: ids.join(",") })}` });
  expect(response.statusCode, response.body).toBe(200);
  const call = query.mock.calls.find(([sql]) => sql.includes("FROM maintenance.samsara_fault_code_history"));
  expect(call?.[0]).toContain("h.unit_id = ANY($2::uuid[])");
  expect(call?.[0]).toContain("AND driver_at_time.driver_id = ANY($3::uuid[])");
  expect(call?.[1]).toEqual([company, ids, ids, 50]);
});
