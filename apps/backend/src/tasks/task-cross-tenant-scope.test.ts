import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TASK-XTENANT-SCOPE: tasks.task has NO RLS (confirmed against every migration that touches this
// schema — never ENABLE ROW LEVEL SECURITY'd, only a blanket GRANT SELECT/INSERT/UPDATE/DELETE).
// The SET_TASK_SCOPE_SQL GUCs the routes set are therefore a complete no-op for this table — the
// ONLY isolation is whatever operating_company_id filter the application SQL itself supplies.
// GET /:id, PATCH /:id/status, PATCH /:id/progress, GET/POST /:id/links, /:id/comments, /:id/activity
// all previously filtered ONLY by task_id, with zero operating_company_id check anywhere — a
// same-install user authenticated under company A could read or mutate company B's task by task_id
// alone. Live-confirmed on Neon: multiple companies (TRANSP, USMCA) have real task rows today.
//
// These tests exercise the two clearest read + write cases against the REAL query text the route
// sends (not a mocked-away assertion) to prove the fix actually blocks cross-tenant access at
// runtime, not just that the right substring appears in the SQL.

const mockQuery = vi.fn();

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

import taskRoutes from "./task.routes.js";

const COMPANY_A = "0c000000-0000-4000-8000-00000000000a";
const COMPANY_B = "0c000000-0000-4000-8000-00000000000b";
const TASK_ID = "5e900000-0000-4000-8000-000000000001";

// A row that ACTUALLY belongs to company A, keyed by which company_id the query filtered on —
// simulates a real Postgres WHERE operating_company_id = $N filter: only returns the row when the
// query's own bound param matches the row's real company.
const TASK_ROW = { task_id: TASK_ID, operating_company_id: COMPANY_A, title: "Company A's task", status: "pending" };

function scopedQueryImpl(sql: string, values: unknown[] = []) {
  if (sql.includes("set_config")) return { rows: [] };
  const companyParamIndex = values.findIndex((v) => v === COMPANY_A || v === COMPANY_B);
  const filteredCompany = companyParamIndex >= 0 ? values[companyParamIndex] : undefined;

  if (sql.includes("SELECT task_id FROM tasks.task") || sql.includes("FROM tasks.task t")) {
    // The fixed query includes an operating_company_id bind param; only match when it equals A.
    if (!sql.includes("operating_company_id") || filteredCompany !== COMPANY_A) return { rows: [] };
    return { rows: [{ ...TASK_ROW }] };
  }
  if (sql.startsWith("UPDATE tasks.task")) {
    if (!sql.includes("operating_company_id") || filteredCompany !== COMPANY_A) return { rows: [] };
    return { rows: [{ ...TASK_ROW, status: "in_progress" }] };
  }
  return { rows: [] };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.ready();
  return app;
}

describe("task.routes.ts — cross-tenant scope (TASK-XTENANT-SCOPE)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(scopedQueryImpl);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /:id returns 404 (not another company's task) when queried under the WRONG company", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}?operating_company_id=${COMPANY_B}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Task not found" });
  });

  it("GET /:id returns the task when queried under its OWN (real) company", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}?operating_company_id=${COMPANY_A}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).task.task_id).toBe(TASK_ID);
  });

  it("PATCH /:id/status cannot mutate another company's task (404, not silently accepted)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${TASK_ID}/status?operating_company_id=${COMPANY_B}`,
      payload: { status: "in_progress" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /:id/status succeeds for the task's OWN company", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${TASK_ID}/status?operating_company_id=${COMPANY_A}`,
      payload: { status: "in_progress" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).task.status).toBe("in_progress");
  });
});
