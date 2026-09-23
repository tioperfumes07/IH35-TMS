import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const state = vi.hoisted(() => ({ role: "Owner", statements: [] as string[] }));

vi.mock("../../accounting/shared.js", async () => {
  const actual = await vi.importActual<typeof import("../../accounting/shared.js")>("../../accounting/shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", role: state.role })),
    withCompanyScope: vi.fn(async (_user: string, _company: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn(async (sql: string) => {
          state.statements.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
          return { rows: [] };
        }),
      })
    ),
  };
});

vi.mock("../registry.js", () => ({
  RECONCILER_INVARIANTS: [
    {
      id: "I-TEST",
      title: "test invariant",
      ownerSeat: "CURSOR",
      repairEngine: null,
      detect: vi.fn(async (client: { query: (sql: string) => Promise<unknown> }) => {
        await client.query("SELECT 1 AS invariant_query");
        return [];
      }),
    },
  ],
}));

import { registerReconcilerRoutes } from "../reconciler.routes.js";

describe("GET /api/v1/reconciler/exceptions", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    state.role = "Owner";
    state.statements = [];
    app = Fastify();
    registerReconcilerRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("sets the transaction read-only before the first invariant query runs", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/reconciler/exceptions?operating_company_id=${COMPANY}` });
    expect(res.statusCode).toBe(200);
    const readOnlyAt = state.statements.indexOf("SET LOCAL transaction_read_only");
    const firstInvariant = state.statements.indexOf("SELECT 1 AS");
    expect(readOnlyAt).toBeGreaterThanOrEqual(0);
    expect(firstInvariant).toBeGreaterThan(readOnlyAt);
    const body = res.json();
    expect(body.operating_company_id).toBe(COMPANY);
    expect(body.results).toEqual([{ invariant: "I-TEST", title: "test invariant", status: "ok", exceptions: [] }]);
  });

  it("refuses a role that is not Owner or Administrator, before touching the database", async () => {
    state.role = "Dispatcher";
    const res = await app.inject({ method: "GET", url: `/api/v1/reconciler/exceptions?operating_company_id=${COMPANY}` });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "owner_or_administrator_required" });
    expect(state.statements).toEqual([]);
  });

  it("rejects a missing or malformed operating_company_id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/reconciler/exceptions?operating_company_id=not-a-uuid" });
    expect(res.statusCode).toBe(400);
    expect(state.statements).toEqual([]);
  });
});
