import Fastify from "fastify";
import { expect, it, vi, beforeEach } from "vitest";
import { registerFactoringRoutes } from "../factoring.routes.js";
const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ids = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const mocks = vi.hoisted(() => ({ assignments: vi.fn(), batches: vi.fn(), query: vi.fn(async () => ({ rows: [] })) }));
vi.mock("../factor.service.js", () => ({ listFactorAssignmentsForCustomer: mocks.assignments, listFactorBatchHistoryForCustomer: mocks.batches }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: async (_id: string, fn: (client: unknown) => unknown) => fn({ query: mocks.query }) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); mocks.assignments.mockImplementation(async (_c, id) => [{ id: `assignment-${id}` }]); mocks.batches.mockResolvedValue([{ id: "shared-batch", total_face_cents: 10000 }]); });
async function read(value: string) {
  const app = Fastify(); app.addHook("preHandler", async req => { req.user = { uuid: ids[0]!, role: "Owner", email: null }; });
  await registerFactoringRoutes(app);
  try { return await app.inject({ method: "GET", url: `/api/v1/factoring/customer-histories?${new URLSearchParams({ operating_company_id: company, customer_ids: value })}` }); }
  finally { await app.close(); }
}
it("reads each selected customer in one scoped session and never double counts a shared batch", async () => {
  const response = await read(ids.join(",")); expect(response.statusCode, response.body).toBe(200);
  expect(response.json().assignments).toHaveLength(2); expect(response.json().batches).toEqual([{ id: "shared-batch", total_face_cents: 10000 }]);
  for (const id of ids) expect(mocks.batches).toHaveBeenCalledWith(company, id, expect.objectContaining({ client: expect.anything() }));
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("set_config"), [company]);
});
it("reports the canonical history cap instead of claiming complete history", async () => {
  mocks.batches.mockResolvedValue(Array.from({ length: 200 }, (_, id) => ({ id: String(id) })));
  const response = await read(ids.join(",")); expect(response.json().capped_customer_count).toBe(2); expect(response.json().batches).toHaveLength(200);
});
it("rejects an invalid later ID before any reader is called", async () => {
  const response = await read(ids[0] + ",invalid"); expect(response.statusCode).toBe(400); expect(mocks.assignments).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
});
