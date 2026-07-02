import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerNamesMasterRoutes } from "../names-master.routes.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const queryMock = vi.fn(async (sql: string) => {
  if (sql.includes("SET LOCAL")) return { rows: [] };
  // Cross-tenant guard: assertCompanyMembership() SELECTs org.user_company_access — simulate a
  // seeded membership row so the legitimate same-company call passes.
  if (sql.includes("user_company_access")) return { rows: [{ ok: 1 }], rowCount: 1 };
  if (sql.includes("count(*)")) {
    if (sql.includes("customer_contacts")) return { rows: [{ count: "2" }] };
    if (sql.includes("mdata.qbo_customers")) return { rows: [{ count: "0" }] };
    if (sql.includes("mdata.qbo_vendors")) return { rows: [{ count: "0" }] };
    if (sql.includes("FROM mdata.customers")) return { rows: [{ count: "3" }] };
    if (sql.includes("FROM mdata.vendors")) return { rows: [{ count: "4" }] };
    if (sql.includes("FROM mdata.drivers")) return { rows: [{ count: "5" }] };
    if (sql.includes("org.companies")) return { rows: [{ count: "0" }] };
    return { rows: [{ count: "0" }] };
  }
  if (sql.includes("customer_contacts")) {
    return {
      rows: [
        {
          entity_id: "cccccccc-cccc-4ccc-8ccc-cccccccccc01",
          display_name: "Dispatch Contact",
          primary_email: "dispatch@acme.test",
          primary_phone: "555-0100",
          qbo_id: null,
          archived_at: null,
          customer_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
    };
  }
  if (sql.includes("mdata.qbo_vendors")) {
    return { rows: [] };
  }
  if (sql.includes("mdata.qbo_customers")) {
    return { rows: [] };
  }
  if (sql.includes("FROM mdata.customers")) {
    return {
      rows: [
        {
          entity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          display_name: "Acme Corp",
          primary_email: "billing@acme.test",
          primary_phone: "555-0001",
          qbo_id: "QBO-1",
          archived_at: null,
        },
      ],
    };
  }
  if (sql.includes("FROM mdata.vendors")) {
    return {
      rows: [
        {
          entity_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          display_name: "Fuel Vendor",
          primary_email: "ap@vendor.test",
          primary_phone: "555-0002",
          qbo_id: null,
          archived_at: null,
        },
      ],
    };
  }
  if (sql.includes("FROM mdata.drivers")) {
    return {
      rows: [
        {
          entity_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          display_name: "Jane Driver",
          primary_email: "jane@driver.test",
          primary_phone: "555-0003",
          qbo_id: null,
          archived_at: null,
        },
      ],
    };
  }
  if (sql.includes("qbo_customers") || sql.includes("qbo_vendors")) {
    return { rows: [] };
  }
  if (sql.includes("org.companies")) {
    return {
      rows: [
        {
          entity_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          display_name: "IH35 Transport",
          primary_email: null,
          primary_phone: null,
          qbo_id: null,
          archived_at: null,
        },
      ],
    };
  }
  return { rows: [] };
});

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("names master routes (A18)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "11111111-1111-4111-8111-111111111111",
        role: "Owner",
      };
    });
    await registerNamesMasterRoutes(app);
    return app;
  }

  it("search returns unified shape across entity types", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/names/search?operating_company_id=${companyId}&q=acme&type=all`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { rows: Array<Record<string, unknown>> };
    expect(body.rows.length).toBeGreaterThan(0);
    for (const row of body.rows) {
      expect(row).toMatchObject({
        entity_type: expect.any(String),
        entity_id: expect.any(String),
        display_name: expect.any(String),
        link_to_module_page: expect.stringMatching(/^\//),
      });
    }
    const types = new Set(body.rows.map((row) => row.entity_type));
    expect(types.has("customer")).toBe(true);
    expect(types.has("vendor")).toBe(true);
    expect(types.has("driver")).toBe(true);
    expect(types.has("contact")).toBe(true);
    expect(types.has("company")).toBe(true);
  });

  it("counts endpoint matches sum of per-type counts", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/names/counts?operating_company_id=${companyId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      customers: number;
      vendors: number;
      drivers: number;
      contacts: number;
      companies: number;
      total: number;
    };
    expect(body.total).toBe(body.customers + body.vendors + body.drivers + body.contacts + body.companies);
  });

  it("?include_archived=true is accepted on search", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lists/names/search?operating_company_id=${companyId}&include_archived=true`,
    });

    expect(response.statusCode).toBe(200);
    const sqlCalls = queryMock.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("TRUE"))).toBe(true);
  });
});
