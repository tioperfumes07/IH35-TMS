import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDispatchArchTabsRoutes } from "../arch-tabs.routes.js";
import { registerFactoringQueueRoutes } from "../factoring-queue.routes.js";
import { registerDispatchPodBolRoutes } from "../pod.routes.js";
import { registerDispatchRefinementsRoutes } from "../dispatch-refinements.routes.js";

const companyId = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const query = vi.hoisted(() => vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] as Record<string, unknown>[] })));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (db: unknown) => unknown) => fn({ query }) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));

const surfaces = [
  { register: registerDispatchArchTabsRoutes, path: "/api/v1/dispatch/assignment-history", field: "driver_id", sql: "h.new_driver_id = ANY($2::uuid[]) OR h.previous_driver_id = ANY($2::uuid[])" },
  { register: registerDispatchArchTabsRoutes, path: "/api/v1/dispatch/intransit-issues", field: "load_id", sql: "i.load_id = ANY($2::uuid[])" },
  { register: registerDispatchArchTabsRoutes, path: "/api/v1/dispatch/intransit-issues", field: "issue_driver_id", sql: "i.driver_id = ANY($2::uuid[])" },
  { register: registerDispatchArchTabsRoutes, path: "/api/v1/dispatch/intransit-issues", field: "issue_unit_id", sql: "i.unit_id = ANY($2::uuid[])" },
  { register: registerFactoringQueueRoutes, path: "/api/v1/dispatch/factoring-queue", field: "customer_id", sql: "c.id = ANY($5::uuid[])" },
  { register: registerFactoringQueueRoutes, path: "/api/v1/dispatch/factoring-queue", field: "load_id", sql: "l.id = ANY($5::uuid[])" },
  { register: registerDispatchPodBolRoutes, path: "/api/v1/dispatch/pod-documents", field: "load_id", sql: "p.load_id = ANY($2::uuid[])" },
  { register: registerDispatchRefinementsRoutes, path: "/api/v1/load-templates", field: "customer_id", sql: "template_json->>'customer_id' = ANY($2::text[])" },
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

describe.each(surfaces)("dispatch entity CSV $path $field", ({ register, path, field, sql }) => {
  it("binds both selections before query counting or paging", async () => {
    const app = await build(register);
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: ids.join(",") });
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
    const params = new URLSearchParams({ operating_company_id: companyId, [field]: value });
    const response = await app.inject({ method: "GET", url: `${path}?${params}` });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

it("assignment history count and page use both old/new driver matches on the same IDs", async () => {
  const app = await build(registerDispatchArchTabsRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, driver_id: ids.join(","), limit: "25", offset: "50" });
  const response = await app.inject({ method: "GET", url: `/api/v1/dispatch/assignment-history?${params}` });
  expect(response.statusCode, response.body).toBe(200);
  const calls = query.mock.calls.filter(([sql]) => sql.includes("FROM dispatch.load_assignment_history h"));
  expect(calls).toHaveLength(2);
  for (const [sql, values] of calls) {
    expect(sql).toContain("(h.new_driver_id = ANY($2::uuid[]) OR h.previous_driver_id = ANY($2::uuid[]))");
    expect(values?.slice(0, 2)).toEqual([companyId, ids]);
  }
  expect(calls[1]?.[1]?.slice(-2)).toEqual([25, 50]);
});

it("in-transit filters combine OR within each field and AND across fields", async () => {
  const app = await build(registerDispatchArchTabsRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, load_id: ids.join(","), issue_driver_id: ids.join(","), issue_unit_id: ids.join(",") });
  const response = await app.inject({ method: "GET", url: `/api/v1/dispatch/intransit-issues?${params}` });
  expect(response.statusCode).toBe(200);
  const call = query.mock.calls.find(([sql]) => sql.includes("FROM dispatch.intransit_issues i"));
  expect(call?.[0]).toContain("i.load_id = ANY($2::uuid[]) AND i.driver_id = ANY($3::uuid[]) AND i.unit_id = ANY($4::uuid[])");
  expect(call?.[1]).toEqual([companyId, ids, ids, ids]);
});

it("factoring customer and load predicates are both applied before COUNT/window and LIMIT", async () => {
  const app = await build(registerFactoringQueueRoutes);
  const params = new URLSearchParams({ operating_company_id: companyId, customer_id: ids.join(","), load_id: ids.join(","), limit: "25", offset: "50" });
  const response = await app.inject({ method: "GET", url: `/api/v1/dispatch/factoring-queue?${params}` });
  expect(response.statusCode).toBe(200);
  const call = query.mock.calls.find(([sql]) => sql.includes("COUNT(*) OVER () AS total_count"));
  expect(call?.[0]).toContain("c.id = ANY($5::uuid[])");
  expect(call?.[0]).toContain("l.id = ANY($6::uuid[])");
  expect(call?.[0]).toContain("LIMIT $3 OFFSET $4");
  expect(call?.[1]?.slice(2)).toEqual([26, 50, ids, ids]);
});
