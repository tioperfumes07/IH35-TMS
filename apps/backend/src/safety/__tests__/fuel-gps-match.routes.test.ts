import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFuelGpsMatchRoutes } from "../fuel-gps-match.routes.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";
const TRANSACTION = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("org.user_company_access")) {
      return String(values?.[1] ?? "") === MEMBER_COMPANY
        ? { rows: [{ ok: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  const withCurrentUser = vi.fn(
    async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("fuel GPS rematch tenant guard", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockClear();
    mockWithCurrentUser.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: USER, role: "Safety", email: "safety@ih35.local" };
    });
    await registerFuelGpsMatchRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("checks membership before setting company scope", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/fuel-gps-match/rematch/${TRANSACTION}?operating_company_id=${MEMBER_COMPANY}`,
    });

    expect(res.statusCode).toBe(404);
    const sqlCalls = mockQuery.mock.calls.map((call) => String(call[0]));
    const membershipIndex = sqlCalls.findIndex((sql) => sql.includes("org.user_company_access"));
    const scopeIndex = sqlCalls.findIndex((sql) => sql.includes("set_config('app.operating_company_id'"));
    expect(membershipIndex).toBeGreaterThanOrEqual(0);
    expect(scopeIndex).toBeGreaterThan(membershipIndex);
  });

  it("rejects a non-member before any scope or rematch query runs", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/fuel-gps-match/rematch/${TRANSACTION}?operating_company_id=${OTHER_COMPANY}`,
    });

    expect(res.statusCode).toBe(403);
    const sqlCalls = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("org.user_company_access"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("set_config('app.operating_company_id'"))).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes("FROM banking.bank_transactions bt"))).toBe(false);
  });
});
