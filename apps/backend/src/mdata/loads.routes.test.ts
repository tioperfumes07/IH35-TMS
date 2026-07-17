import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadRoutes } from "./loads.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("COUNT(*)::int AS total_count")) {
    return { rows: [{ total_count: 0 }] };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("mdata loads routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Dispatcher") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerLoadRoutes(app);
    return app;
  }

  it("GET /api/v1/mdata/loads accepts empty driver UUID filter as unset", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/mdata/loads?operating_company_id=11111111-1111-4111-8111-111111111111&driver_id=",
    });

    expect(response.statusCode).toBe(200);
    expect(response.statusCode).not.toBe(500);
    expect(response.json()).toMatchObject({
      loads: [],
    });
  });

  // CODER-17 hardening regression: an unrecognized sort (the invoices page's "-pickup_date"
  // dash-prefix convention, or any junk) must degrade to the default sort with 200 — never 400.
  // The ORDER BY column stays whitelisted via sortColumnMap, so this is safe.
  it("GET /api/v1/mdata/loads degrades an unknown sort to default (no 400)", async () => {
    const app = await buildApp();
    for (const sort of ["-pickup_date", "totally_bogus:asc", "load_number"]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/mdata/loads?operating_company_id=11111111-1111-4111-8111-111111111111&sort=${encodeURIComponent(sort)}`,
      });
      expect(response.statusCode, `sort=${sort}`).toBe(200);
      expect(response.statusCode).not.toBe(400);
    }
  });

  it("PATCH /api/v1/mdata/loads/:id/status blocks non-Owner cancel when reason requires owner approval", async () => {
    const loadId = "22222222-2222-4222-8222-222222222222";
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM mdata.loads") && sql.includes("SELECT id, status")) {
        return {
          rows: [{ id: loadId, status: "assigned", operating_company_id: "11111111-1111-4111-8111-111111111111" }],
        };
      }
      if (sql.includes("FROM catalogs.load_cancellation_reasons")) {
        expect(params?.[0]).toBe("DRIVER_WALKOFF");
        expect(params?.[1]).toBe("11111111-1111-4111-8111-111111111111");
        return { rows: [{ reason_code: "DRIVER_WALKOFF", requires_owner_approval: true }] };
      }
      if (sql.includes("UPDATE mdata.loads")) {
        throw new Error("UPDATE must not run when owner approval is required for non-Owner");
      }
      return { rows: [] };
    });

    const app = await buildApp("Dispatcher");
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/status`,
      payload: {
        new_status: "cancelled",
        cancellation_reason_code: "DRIVER_WALKOFF",
        cancellation_notes: "Driver walked off at the shipper yard this morning.",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "owner_approval_required" });
  });

  it("PATCH /api/v1/mdata/loads/:id/status allows Owner cancel for approval-required reason", async () => {
    const loadId = "33333333-3333-4333-8333-333333333333";
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.loads") && sql.includes("SELECT id, status")) {
        return {
          rows: [{ id: loadId, status: "assigned", operating_company_id: "11111111-1111-4111-8111-111111111111" }],
        };
      }
      if (sql.includes("FROM catalogs.load_cancellation_reasons")) {
        return { rows: [{ reason_code: "DRIVER_WALKOFF", requires_owner_approval: true }] };
      }
      if (sql.includes("UPDATE mdata.loads") && sql.includes("SET status")) {
        return {
          rows: [
            {
              id: loadId,
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              load_number: "L-100",
              customer_id: "44444444-4444-4444-8444-444444444444",
              status: "cancelled",
              rate_total_cents: 0,
              currency_code: "USD",
              assigned_unit_id: null,
              assigned_primary_driver_id: null,
              assigned_secondary_driver_id: null,
              team_id: null,
              dispatcher_user_id: null,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              soft_deleted_at: null,
              deleted_by_user_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const app = await buildApp("Owner");
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/status`,
      payload: {
        new_status: "cancelled",
        cancellation_reason_code: "DRIVER_WALKOFF",
        cancellation_notes: "Owner approved driver walk-off after review.",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "cancelled" });
  });
});
