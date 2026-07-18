import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFuelGpsMatchRoutes } from "../fuel-gps-match.routes.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";
const REVOKED_COMPANY = "44444444-4444-4444-8444-444444444444";
const TRANSACTION = "33333333-3333-4333-8333-333333333333";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("org.user_company_access")) {
      expect(sql).toContain("uca.deactivated_at IS NULL");
      expect(sql).toContain("JOIN org.companies c");
      expect(sql).toContain("c.is_active = true");
      expect(sql).toContain("c.deactivated_at IS NULL");
      // REVOKED_COMPANY has an existing access row, but deactivated_at is set;
      // the canonical helper query therefore returns no authorized membership.
      if (String(values?.[1] ?? "") === REVOKED_COMPANY) return { rows: [], rowCount: 0 };
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

  it("rejects a deactivated membership before scope, banking read, or Safety write", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/fuel-gps-match/rematch/${TRANSACTION}?operating_company_id=${REVOKED_COMPANY}`,
    });

    expect(res.statusCode).toBe(403);
    const sqlCalls = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("org.user_company_access"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes("set_config('app.operating_company_id'"))).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes("FROM banking.bank_transactions bt"))).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes("INSERT INTO safety.fuel_gps_matches"))).toBe(false);
  });
});
