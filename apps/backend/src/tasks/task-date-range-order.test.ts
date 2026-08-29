import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0039-TASKS-DATE-RANGE-ORDER-UNVALIDATED: same class as GO-0036/GO-0037 -- neither
// GET /tasks nor GET /tasks/planner validated that date_from is on-or-before date_to. GET /tasks
// used two independent >=/<= inequalities; GET /tasks/planner used a BETWEEN. A reversed range
// makes either predicate unsatisfiable, silently returning a legitimate 200 with an empty
// tasks:[]/total_count:0/count:0 -- indistinguishable from a genuine zero-task period.

const mockQuery = vi.fn(async (sql: string) => {
  if (sql.includes("set_config")) return { rows: [] };
  return { rows: [] };
});

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) => fn({ query: mockQuery }),
}));

const mockRequireAuth = vi.fn((req: { user?: unknown }) => {
  req.user = { uuid: "u1000000-0000-4000-8000-000000000001", email: "u1@example.com", role: "Manager" };
  return true;
});
vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...(args as [{ user?: unknown }, unknown])),
}));

// This test's user must be a member of COMPANY_A for the membership check (already-fixed GO-0034)
// to let requests through to the order check.
vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn().mockResolvedValue(undefined),
}));

const COMPANY_A = "0c000000-0000-4000-8000-00000000000a";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const taskRoutes = (await import("./task.routes.js")).default;
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.ready();
  return app;
}

describe("task.routes.ts — date-range order validation (GO-0039)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    mockQuery.mockClear();
    if (app) await app.close();
  });

  it("GET /tasks rejects date_from > date_to with 400, accepts a valid range", async () => {
    app = await buildApp();

    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?operating_company_id=${COMPANY_A}&date_from=2026-02-01&date_to=2026-01-01`,
    });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/date_from must be on or before date_to/i);

    const good = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?operating_company_id=${COMPANY_A}&date_from=2026-01-01&date_to=2026-01-31`,
    });
    expect(good.statusCode).toBe(200);
  });

  it("GET /tasks with no dates at all still succeeds (order check only applies when both are present)", async () => {
    app = await buildApp();

    const res = await app.inject({ method: "GET", url: `/api/v1/tasks?operating_company_id=${COMPANY_A}` });
    expect(res.statusCode).toBe(200);
  });

  it("GET /tasks/planner rejects date_from > date_to with 400, accepts a valid range", async () => {
    app = await buildApp();

    const bad = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/planner?operating_company_id=${COMPANY_A}&date_from=2026-02-01&date_to=2026-01-01`,
    });
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).details.period[0]).toMatch(/date_from must be on or before date_to/i);

    const good = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/planner?operating_company_id=${COMPANY_A}&date_from=2026-01-01&date_to=2026-01-31`,
    });
    expect(good.statusCode).toBe(200);
  });
});
