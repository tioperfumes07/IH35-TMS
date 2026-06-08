import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCustomerFreeTimeDetentionRoutes } from "../free-time-detention.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("customer free-time detention routes (GAP-32)", () => {
  let app: FastifyInstance;
  let currentRole = "Manager";

  beforeEach(async () => {
    mockQuery.mockReset();
    currentRole = "Manager";
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: currentRole,
        email: "manager@ih35.local",
      };
    });
    await registerCustomerFreeTimeDetentionRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/customers/:uuid/free-time-detention returns scoped terms", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT id::text") && sql.includes("FROM mdata.customers")) return { rows: [{ id: CUSTOMER }] };
      if (sql.includes("free_time_minutes") && sql.includes("FROM mdata.customers")) {
        return {
          rows: [
            {
              customer_uuid: CUSTOMER,
              operating_company_id: COMPANY,
              free_time_minutes: 120,
              detention_rate_per_hour: "55.00",
              detention_currency: "USD",
              detention_requires_approval: true,
              terms_updated_at: null,
              terms_updated_by_user_uuid: null,
              free_time_pickup_minutes: 120,
              free_time_delivery_minutes: 120,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${CUSTOMER}/free-time-detention?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      terms: {
        customer_uuid: CUSTOMER,
        free_time_minutes: 120,
        detention_rate_per_hour: "55.00",
      },
    });
  });

  it("PATCH /api/v1/customers/:uuid/free-time-detention requires manager+ role", async () => {
    currentRole = "Dispatcher";
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/customers/${CUSTOMER}/free-time-detention?operating_company_id=${COMPANY}`,
      payload: { free_time_minutes: 180 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH writes history row before updating terms", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT id::text") && sql.includes("FROM mdata.customers")) return { rows: [{ id: CUSTOMER }] };
      if (sql.includes("FROM mdata.customers") && sql.includes("free_time_minutes") && sql.includes("LIMIT 1")) {
        return {
          rows: [
            {
              customer_uuid: CUSTOMER,
              operating_company_id: COMPANY,
              free_time_minutes: 120,
              detention_rate_per_hour: "55.00",
              detention_currency: "USD",
              detention_requires_approval: true,
              terms_updated_at: null,
              terms_updated_by_user_uuid: null,
              free_time_pickup_minutes: 120,
              free_time_delivery_minutes: 120,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO master_data.customer_terms_history")) return { rows: [] };
      if (sql.includes("UPDATE mdata.customers")) {
        return {
          rows: [
            {
              customer_uuid: CUSTOMER,
              operating_company_id: COMPANY,
              free_time_minutes: 180,
              detention_rate_per_hour: "65.00",
              detention_currency: "USD",
              detention_requires_approval: false,
              terms_updated_at: "2026-06-08T02:03:00.000Z",
              terms_updated_by_user_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              free_time_pickup_minutes: 120,
              free_time_delivery_minutes: 120,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/customers/${CUSTOMER}/free-time-detention?operating_company_id=${COMPANY}`,
      payload: { free_time_minutes: 180, detention_rate_per_hour: 65, detention_requires_approval: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().terms).toMatchObject({ free_time_minutes: 180, detention_rate_per_hour: "65.00" });

    const historyInsertIdx = mockQuery.mock.calls.findIndex((call) =>
      String(call[0]).includes("INSERT INTO master_data.customer_terms_history")
    );
    const updateIdx = mockQuery.mock.calls.findIndex((call) => String(call[0]).includes("UPDATE mdata.customers"));
    expect(historyInsertIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(historyInsertIdx).toBeLessThan(updateIdx);
  });

  it("GET /api/v1/customers/:uuid/terms-history returns audit rows", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT id::text") && sql.includes("FROM mdata.customers")) return { rows: [{ id: CUSTOMER }] };
      if (sql.includes("FROM master_data.customer_terms_history")) {
        return {
          rows: [
            {
              uuid: "33333333-3333-4333-8333-333333333333",
              customer_uuid: CUSTOMER,
              operating_company_id: COMPANY,
              tenant_id: COMPANY,
              free_time_minutes: 120,
              detention_rate_per_hour: "55.00",
              detention_currency: "USD",
              detention_requires_approval: true,
              terms_updated_at: "2026-06-01T00:00:00.000Z",
              terms_updated_by_user_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              recorded_at: "2026-06-08T02:03:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${CUSTOMER}/terms-history?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toHaveLength(1);
    expect(res.json().rows[0]).toMatchObject({ customer_uuid: CUSTOMER, free_time_minutes: 120 });
  });
});
