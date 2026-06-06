import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const TRK_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const TRANSP_COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const TRK_USER_ID = "11111111-1111-4111-8111-111111111111";
const TRANSP_USER_ID = "22222222-2222-4222-8222-222222222222";

const requireAuthState = { allowed: true };
const assertCompanyMembershipMock = vi.fn(async (userId: string, operatingCompanyId: string) => {
  if (userId === TRK_USER_ID && operatingCompanyId === TRANSP_COMPANY_ID) {
    const err = new Error("forbidden_company_membership");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
});
const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("set_config")) return { rows: [] };
  if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
  if (sql.includes("FROM accounting.qbo_customers")) {
    return {
      rows: [
        {
          total_local: "1",
          synced: "1",
          unsynced: "0",
          pushing: "0",
          failed: "0",
          dead_letter: "0",
        },
      ],
    };
  }
  return { rows: [] };
});

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: (...args: Parameters<typeof assertCompanyMembershipMock>) => assertCompanyMembershipMock(...args),
}));

import { registerQboCustomersPushStatusRoutes } from "../qbo-customers-status.routes.js";

describe("qbo customers status RLS guard", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
    assertCompanyMembershipMock.mockClear();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(user: { uuid: string; role: string }) {
    const app = Fastify();
    apps.push(app);

    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = user;
    });

    app.setErrorHandler((error, _req, reply) => {
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode === 403 || String(error.message).includes("forbidden")) {
        return reply.code(403).send({ error: "forbidden" });
      }
      return reply.code(500).send({ error: "internal_error" });
    });

    await registerQboCustomersPushStatusRoutes(app);
    return app;
  }

  it("TRK cross-tenant GET with TRANSP id -> 403", async () => {
    const app = await buildApp({ uuid: TRK_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sync/qbo-customers/status?operating_company_id=${TRANSP_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("TRK same-tenant GET with TRK id -> 200", async () => {
    const app = await buildApp({ uuid: TRK_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sync/qbo-customers/status?operating_company_id=${TRK_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total_local: 1,
      synced: 1,
      unsynced: 0,
      pushing: 0,
      failed: 0,
      dead_letter: 0,
    });
  });

  it("TRANSP same-tenant GET with TRANSP id -> 200", async () => {
    const app = await buildApp({ uuid: TRANSP_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sync/qbo-customers/status?operating_company_id=${TRANSP_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total_local: 1,
      synced: 1,
      unsynced: 0,
      pushing: 0,
      failed: 0,
      dead_letter: 0,
    });
  });
});
