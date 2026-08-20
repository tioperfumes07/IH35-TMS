import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadRoutes } from "./loads.routes.js";

const requireAuthState = { allowed: true };

const defaultQueryMock = async (sql: string, _params?: unknown[]) => {
  if (sql.includes("COUNT(*)::int AS total_count")) {
    return { rows: [{ total_count: 0 }] };
  }
  return { rows: [] };
};

const queryMock = vi.fn(defaultQueryMock);

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
    queryMock.mockReset();
    queryMock.mockImplementation(defaultQueryMock);
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

  it.each([
    {
      sort: "pickup_date",
      direction: "ASC",
      expectedIds: ["early", "late", "null"],
    },
    {
      sort: "-pickup_date",
      direction: "DESC",
      expectedIds: ["late", "early", "null"],
    },
  ])("GET /api/v1/mdata/loads truthfully orders canonical pickup timestamps for $sort", async ({
    sort,
    direction,
    expectedIds,
  }) => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const rowsByDirection: Record<string, Array<Record<string, unknown>>> = {
      ASC: [
        { id: "early", operating_company_id: companyId, status: "booked", pickup_scheduled_at: "2026-07-18T08:00:00.000Z" },
        { id: "late", operating_company_id: companyId, status: "booked", pickup_scheduled_at: "2026-07-19T08:00:00.000Z" },
        { id: "null", operating_company_id: companyId, status: "booked", pickup_scheduled_at: null },
      ],
      DESC: [
        { id: "late", operating_company_id: companyId, status: "booked", pickup_scheduled_at: "2026-07-19T08:00:00.000Z" },
        { id: "early", operating_company_id: companyId, status: "booked", pickup_scheduled_at: "2026-07-18T08:00:00.000Z" },
        { id: "null", operating_company_id: companyId, status: "booked", pickup_scheduled_at: null },
      ],
    };
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)::int AS total_count")) return { rows: [{ total_count: 3 }] };
      if (sql.includes("l.id, l.operating_company_id")) return { rows: rowsByDirection[direction] };
      return { rows: [] };
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/loads?operating_company_id=${companyId}&sort=${encodeURIComponent(sort)}&limit=3&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().loads.map((row: { id: string }) => row.id)).toEqual(expectedIds);

    const listCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("l.id, l.operating_company_id"));
    expect(listCall).toBeDefined();
    expect(listCall?.[0]).toContain(
      `ORDER BY sp.scheduled_arrival_at ${direction} NULLS LAST, l.created_at DESC, l.id ASC`
    );
    expect(listCall?.[0]).toContain("l.operating_company_id = ANY($1::uuid[])");
    expect(listCall?.[0]).toContain("stop_type = 'pickup'");
    expect(listCall?.[0]).toContain("soft_deleted_at IS NULL");
    expect(listCall?.[1]?.[0]).toEqual([companyId]);
  });

  it("GET /api/v1/mdata/loads ignores an archived delivery candidate in count and paginated list", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const deliveryStops = [
      {
        city: "Archived Delivery",
        sequence_number: 3,
        scheduled_arrival_at: "2026-07-17T08:00:00.000Z",
        soft_deleted_at: "2026-07-18T09:00:00.000Z",
      },
      {
        city: "First Active Delivery",
        sequence_number: 2,
        scheduled_arrival_at: "2026-07-19T08:00:00.000Z",
        soft_deleted_at: null,
      },
    ];
    const deliveryLateralExcludesArchived = (sql: string) =>
      /stop_type = 'delivery'[\s\S]{0,100}soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY sequence_number DESC/.test(sql);

    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("COUNT(*)::int AS total_count")) {
        expect(params).toEqual([[companyId]]);
        return { rows: [{ total_count: deliveryLateralExcludesArchived(sql) ? 2 : 3 }] };
      }
      if (sql.includes("l.id, l.operating_company_id")) {
        expect(params).toEqual([[companyId], 1, 1]);
        const selectedDelivery = deliveryLateralExcludesArchived(sql)
          ? deliveryStops.find((stop) => stop.soft_deleted_at === null)
          : deliveryStops[0];
        return {
          rows: [
            {
              id: "second-page-load",
              operating_company_id: companyId,
              status: "booked",
              first_delivery_city: selectedDelivery?.city,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/loads?operating_company_id=${companyId}&limit=1&offset=1`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total_count: 2,
      has_more: false,
      loads: [{ id: "second-page-load", first_delivery_city: "First Active Delivery" }],
    });

    const relevantCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes("FROM mdata.loads l") && String(sql).includes("stop_type = 'delivery'")
    );
    expect(relevantCalls).toHaveLength(2);
    expect(relevantCalls.every(([sql]) => deliveryLateralExcludesArchived(String(sql)))).toBe(true);
  });

  it("GET /api/v1/mdata/loads documents invalid sort fallback without claiming pickup order", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/mdata/loads?operating_company_id=11111111-1111-4111-8111-111111111111&sort=totally_bogus",
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("l.id, l.operating_company_id"));
    expect(listCall).toBeDefined();
    expect(listCall?.[0]).toContain("ORDER BY l.created_at DESC, l.id ASC");
    expect(listCall?.[0]).not.toContain("ORDER BY sp.scheduled_arrival_at");
  });

  it("GET /api/v1/mdata/loads projects the latest entity-scoped trailer for the mounted dispatch board", async () => {
    const app = await buildApp();
    const companyId = "11111111-1111-4111-8111-111111111111";
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/loads?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("tr.id AS trailer_id"));
    expect(listCall).toBeDefined();
    const sql = String(listCall?.[0]);
    expect(sql).toContain("tr.equipment_number AS trailer_number");
    expect(sql).toContain("FROM dispatch.load_assignment_history lah");
    expect(sql).toContain("AND lah.operating_company_id = l.operating_company_id");
    expect(sql).toContain("COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = l.operating_company_id");
    expect(sql).toContain("ORDER BY lah.assigned_at DESC, lah.created_at DESC");
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
