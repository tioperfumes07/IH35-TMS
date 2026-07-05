import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyRoutes } from "../safety.routes.js";

// SAFE-1 guard: the accident "At Fault" control was a dead hardcoded "no". These tests lock the
// contract that at_fault (yes/no/disputed) + preventable (DOT/FMCSA boolean) travel from the route
// body into the persisted INSERT/UPDATE — so the control can never silently regress to a stub.

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ACCIDENT = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));
vi.mock("../safety.service.js", () => ({ listSafetyEvents: vi.fn(async () => ({ events: [] })) }));

function findCall(fragment: string) {
  return mockQuery.mock.calls.find(([sql]) => typeof sql === "string" && (sql as string).includes(fragment));
}

describe("SAFE-1 accident At-Fault + Preventable persistence", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    // Default: SELECTs (before-row) return an existing accident; INSERT/UPDATE echo a row.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO safety.accident_reports")) {
        return { rows: [{ id: ACCIDENT, at_fault: "disputed", preventable: true }], rowCount: 1 };
      }
      if (sql.includes("UPDATE safety.accident_reports")) {
        return { rows: [{ id: ACCIDENT, at_fault: "yes", preventable: false }], rowCount: 1 };
      }
      // before-row SELECT
      return { rows: [{ id: ACCIDENT, at_fault: null, preventable: null }], rowCount: 1 };
    });
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

  it("POST create persists at_fault + preventable into the INSERT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/accidents",
      payload: { operating_company_id: COMPANY, at_fault: "disputed", preventable: true },
    });
    expect(res.statusCode).toBe(201);
    const insert = findCall("INSERT INTO safety.accident_reports");
    expect(insert).toBeTruthy();
    const sql = insert?.[0] as string;
    const params = insert?.[1] as unknown[];
    expect(sql).toContain("at_fault");
    expect(sql).toContain("preventable");
    // at_fault + preventable are bound as parameters (never interpolated).
    expect(params).toContain("disputed");
    expect(params).toContain(true);
  });

  it("POST create defaults an unassessed report to NULL (never a false 'no')", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/accidents",
      payload: { operating_company_id: COMPANY },
    });
    expect(res.statusCode).toBe(201);
    const params = findCall("INSERT INTO safety.accident_reports")?.[1] as unknown[];
    // Neither a hardcoded "no" nor false — both determinations persist as null when not supplied.
    expect(params).not.toContain("no");
    expect(params).not.toContain(false);
  });

  it("PATCH update persists at_fault + preventable", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/accidents/${ACCIDENT}?operating_company_id=${COMPANY}`,
      payload: { at_fault: "yes", preventable: false },
    });
    expect(res.statusCode).toBe(200);
    const update = findCall("UPDATE safety.accident_reports");
    expect(update).toBeTruthy();
    const sql = update?.[0] as string;
    const params = update?.[1] as unknown[];
    expect(sql).toContain("at_fault");
    expect(sql).toContain("preventable");
    expect(params).toContain("yes");
    expect(params).toContain(false);
  });

  it("POST create rejects an at_fault value outside yes/no/disputed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/accidents",
      payload: { operating_company_id: COMPANY, at_fault: "maybe" },
    });
    expect(res.statusCode).toBe(400);
  });
});
