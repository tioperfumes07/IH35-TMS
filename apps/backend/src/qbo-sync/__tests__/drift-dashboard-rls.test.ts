import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireAuthState = { allowed: true };
const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("set_config")) return { rows: [] };

  if (sql.includes("FROM qbo_sync.drift_alert_throttle")) {
    return {
      rows: [{ entity_type: "items", alert_day: "2026-06-05", drift_count: "1" }],
    };
  }

  if (sql.includes("FROM qbo_sync.drift_log") && sql.includes("GROUP BY entity_type")) {
    return {
      rows: [{ entity_type: "items", c: "1" }],
    };
  }

  if (sql.includes("FROM qbo_sync.drift_log") && sql.includes("LIMIT 200")) {
    const oc = String(values?.[0] ?? "");
    if (oc === TRANSP_COMPANY_ID && currentUserCompanyId === TRK_COMPANY_ID) {
      return { rows: [] };
    }
    return {
      rows: [
        {
          id: "99999999-9999-4999-8999-999999999991",
          entity_type: "items",
          entity_id: "00000000-0000-4000-8000-0000000000aa",
          qbo_id: "QBO-1",
          drift_type: "field_mismatch",
          local_snapshot: {},
          qbo_snapshot: {},
          detected_at: "2026-06-05T00:00:00.000Z",
          resolved_at: null,
          resolution_action: null,
        },
      ],
    };
  }

  if (sql.includes("UPDATE qbo_sync.drift_log")) {
    const oc = String(values?.[1] ?? "");
    if (oc === TRANSP_COMPANY_ID && currentUserCompanyId === TRK_COMPANY_ID) {
      return { rows: [] };
    }
    return { rows: [{ id: String(values?.[0] ?? "") }] };
  }

  return { rows: [] };
});

const fetchChartOfAccountsSyncStatusMock = vi.fn(async () => ({
  total_local: 10,
  synced: 10,
  drift_detected: 0,
  last_pull_at: "2026-06-05T00:00:00.000Z",
}));
const fetchItemsSyncStatusMock = vi.fn(async () => ({
  total_local: 20,
  synced: 20,
  drift_detected: 0,
  last_pull_at: "2026-06-05T00:00:00.000Z",
}));
const assertCompanyMembershipMock = vi.fn(async (userId: string, operatingCompanyId: string) => {
  if (userId === TRK_USER_ID && operatingCompanyId === TRANSP_COMPANY_ID) {
    const err = new Error("forbidden_company_membership");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
});

const TRK_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const TRANSP_COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const TRK_USER_ID = "11111111-1111-4111-8111-111111111111";
const TRANSP_USER_ID = "22222222-2222-4222-8222-222222222222";
let currentUserCompanyId = TRK_COMPANY_ID;

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

vi.mock("../chart-of-accounts-reconciler.js", () => ({
  fetchChartOfAccountsSyncStatus: (...args: unknown[]) => fetchChartOfAccountsSyncStatusMock(...args),
}));

vi.mock("../items-reconciler.js", () => ({
  fetchItemsSyncStatus: (...args: unknown[]) => fetchItemsSyncStatusMock(...args),
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: (...args: Parameters<typeof assertCompanyMembershipMock>) => assertCompanyMembershipMock(...args),
}));

import { registerQboSyncDriftDashboardRoutes } from "../drift-dashboard.routes.js";

describe("qbo-sync drift dashboard RLS guard", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
    assertCompanyMembershipMock.mockClear();
    currentUserCompanyId = TRK_COMPANY_ID;
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

    await registerQboSyncDriftDashboardRoutes(app);
    return app;
  }

  it("TRK cross-tenant GET with TRANSP id -> 403", async () => {
    currentUserCompanyId = TRK_COMPANY_ID;
    const app = await buildApp({ uuid: TRK_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/qbo-sync/drift-dashboard?operating_company_id=${TRANSP_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("TRK cross-tenant POST drift-log/:id/resolve with TRANSP id -> 403", async () => {
    currentUserCompanyId = TRK_COMPANY_ID;
    const app = await buildApp({ uuid: TRK_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/qbo-sync/drift-log/99999999-9999-4999-8999-999999999991/resolve",
      payload: {
        operating_company_id: TRANSP_COMPANY_ID,
        resolution_action: "accept_local",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("TRK same-tenant GET with TRK id -> 200", async () => {
    currentUserCompanyId = TRK_COMPANY_ID;
    const app = await buildApp({ uuid: TRK_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/qbo-sync/drift-dashboard?operating_company_id=${TRK_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      entities: expect.any(Array),
      drift_log: expect.any(Array),
    });
  });

  it("TRANSP same-tenant GET with TRANSP id -> 200", async () => {
    currentUserCompanyId = TRANSP_COMPANY_ID;
    const app = await buildApp({ uuid: TRANSP_USER_ID, role: "Owner" });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/qbo-sync/drift-dashboard?operating_company_id=${TRANSP_COMPANY_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      entities: expect.any(Array),
      drift_log: expect.any(Array),
    });
  });
});
