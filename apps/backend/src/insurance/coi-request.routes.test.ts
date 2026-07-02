import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceCoiRequestRoutes } from "./coi-request.routes.js";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("FROM insurance.coi_request") && sql.includes("ORDER BY requested_at DESC")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? ""),
          customer_id: "22222222-2222-4222-8222-222222222222",
          policy_id: "33333333-3333-4333-8333-333333333333",
          requested_at: "2026-05-30T12:00:00.000Z",
          requested_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "pending",
          notes: "Need updated COI",
          document_url: null,
          expires_at: null,
          responded_at: null,
          created_at: "2026-05-30T12:00:00.000Z",
          updated_at: "2026-05-30T12:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("FROM mdata.customers")) {
    if (String(values?.[1]) === "ffffffff-ffff-4fff-8fff-ffffffffffff") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("FROM insurance.policy")) {
    if (String(values?.[1]) === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("INSERT INTO insurance.coi_request")) {
    return {
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          tenant_id: String(values?.[0]),
          customer_id: String(values?.[1]),
          policy_id: values?.[2] ? String(values?.[2]) : null,
          requested_at: "2026-05-30T12:10:00.000Z",
          requested_by: String(values?.[3]),
          status: "pending",
          notes: values?.[4] ? String(values?.[4]) : null,
          document_url: null,
          expires_at: values?.[5] ? String(values?.[5]) : null,
          responded_at: null,
          created_at: "2026-05-30T12:10:00.000Z",
          updated_at: "2026-05-30T12:10:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("UPDATE insurance.coi_request")) {
    if (String(values?.[1]) === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id: String(values?.[1]),
          tenant_id: String(values?.[0]),
          customer_id: "22222222-2222-4222-8222-222222222222",
          policy_id: "33333333-3333-4333-8333-333333333333",
          requested_at: "2026-05-30T12:00:00.000Z",
          requested_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "received",
          notes: "Updated and received",
          document_url: "https://docs.example.com/coi.pdf",
          expires_at: "2027-01-01",
          responded_at: "2026-05-30T14:00:00.000Z",
          created_at: "2026-05-30T12:00:00.000Z",
          updated_at: "2026-05-30T14:00:00.000Z",
        },
      ],
    };
  }

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("insurance coi request routes", () => {
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
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Owner",
      };
    });
    await registerInsuranceCoiRequestRoutes(app);
    return app;
  }

  it("lists requests with tenant scope", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/coi-requests?operating_company_id=11111111-1111-4111-8111-111111111111&customer_id=22222222-2222-4222-8222-222222222222&status=pending",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { requests: Array<{ id: string }> };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("creates a new coi request", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/coi-requests",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "22222222-2222-4222-8222-222222222222",
        policy_id: "33333333-3333-4333-8333-333333333333",
        notes: "Need renewal before next load",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      status: "pending",
    });
  });

  it("returns 404 when customer is missing during create", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/coi-requests",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "customer_not_found" });
  });

  it("updates request status/details", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/coi-requests/44444444-4444-4444-8444-444444444444?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "received",
        notes: "Updated and received",
        document_url: "https://docs.example.com/coi.pdf",
        expires_at: "2027-01-01",
        responded_at: "2026-05-30T14:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      status: "received",
      document_url: "https://docs.example.com/coi.pdf",
    });
  });

  it("returns 404 when request is outside tenant scope", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/coi-requests/99999999-9999-4999-8999-999999999999?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "dismissed",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "coi_request_not_found" });
  });
});
