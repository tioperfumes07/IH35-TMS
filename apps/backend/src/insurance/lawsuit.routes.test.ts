import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceLawsuitRoutes } from "./lawsuit.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("FROM insurance.lawsuit") && sql.includes("ORDER BY lawsuit.filed_date DESC")) {
    return {
      rows: [
        {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? ""),
          case_number: "CASE-001",
          plaintiff: "Acme Logistics",
          defendant: "RoadRunner Inc",
          court_name: "Harris County District Court",
          filed_date: "2026-05-01",
          status: String(values?.[1] ?? "filed"),
          claim_id: String(values?.[2] ?? "11111111-1111-4111-8111-111111111111"),
          claim_number: "CLM-001",
          driver_id: "22222222-2222-4222-8222-222222222222",
          driver_name: "Jordan Driver",
          unit_id: "33333333-3333-4333-8333-333333333333",
          unit_number: "TRK-333",
          demand_cents: 500000,
          settlement_cents: 0,
          attorney_name: "Taylor Counsel",
          attorney_email: "taylor@example.com",
          notes: "Initial filing",
          created_at: "2026-05-05T00:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("FROM insurance.claim")) {
    if (String(values?.[1]) === "ffffffff-ffff-4fff-8fff-ffffffffffff") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("INSERT INTO insurance.lawsuit")) {
    return {
      rows: [
        {
          id: "bbbbbbbb-2222-4222-8222-222222222222",
          tenant_id: String(values?.[0]),
          case_number: String(values?.[1]),
          plaintiff: String(values?.[2]),
          defendant: String(values?.[3]),
          court_name: String(values?.[4]),
          filed_date: String(values?.[5]),
          status: String(values?.[6]),
          claim_id: values?.[7] ? String(values?.[7]) : null,
          demand_cents: Number(values?.[8]),
          settlement_cents: Number(values?.[9]),
          attorney_name: values?.[10] ? String(values?.[10]) : null,
          attorney_email: values?.[11] ? String(values?.[11]) : null,
          notes: values?.[12] ? String(values?.[12]) : null,
          created_at: "2026-05-06T00:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("SELECT status") && sql.includes("FROM insurance.lawsuit")) {
    const lawsuitId = String(values?.[1] ?? "");
    if (lawsuitId === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    if (lawsuitId === "77777777-7777-4777-8777-777777777777") return { rows: [{ status: "settled" }] };
    return { rows: [{ status: "filed" }] };
  }

  if (sql.includes("UPDATE insurance.lawsuit")) {
    const lawsuitId = String(values?.[1] ?? "");
    if (lawsuitId === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id: lawsuitId,
          tenant_id: String(values?.[0]),
          case_number: "CASE-001",
          plaintiff: "Acme Logistics",
          defendant: "RoadRunner Inc",
          court_name: "Harris County District Court",
          filed_date: "2026-05-01",
          status: String(values?.[2] ?? "active"),
          claim_id: "11111111-1111-4111-8111-111111111111",
          demand_cents: 500000,
          settlement_cents: 0,
          attorney_name: "Taylor Counsel",
          attorney_email: "taylor@example.com",
          notes: "Updated",
          created_at: "2026-05-05T00:00:00.000Z",
        },
      ],
    };
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

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("insurance lawsuit routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerInsuranceLawsuitRoutes(app);
    return app;
  }

  it("GET applies status and claim filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/lawsuits?operating_company_id=11111111-1111-4111-8111-111111111111&status=filed&claim_id=11111111-1111-4111-8111-111111111111",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { lawsuits: Array<{ id: string; claim_number: string; driver_id: string; driver_name: string; unit_id: string; unit_number: string }> };
    expect(body.lawsuits).toHaveLength(1);
    expect(body.lawsuits[0]?.id).toBe("aaaaaaaa-1111-4111-8111-111111111111");
    expect(body.lawsuits[0]).toMatchObject({
      driver_id: "22222222-2222-4222-8222-222222222222",
      driver_name: "Jordan Driver",
      unit_id: "33333333-3333-4333-8333-333333333333",
      unit_number: "TRK-333",
      claim_number: "CLM-001",
    });
    const listSql = queryMock.mock.calls.find(([sql]) => String(sql).includes("ORDER BY lawsuit.filed_date DESC"))?.[0];
    expect(listSql).toContain("LEFT JOIN insurance.claim AS claim");
    expect(listSql).toContain("asset.unit_id::text AS unit_id");
    expect(listSql).toContain("driver.operating_company_id = lawsuit.tenant_id");
    expect(listSql).toContain("COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = lawsuit.tenant_id");
  });

  it("GET applies the exact policy reverse filter through the tenant-matched claim", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/lawsuits?operating_company_id=11111111-1111-4111-8111-111111111111&policy_id=44444444-4444-4444-8444-444444444444",
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("ORDER BY lawsuit.filed_date DESC"));
    expect(String(listCall?.[0])).toContain("claim.policy_id = $2::uuid");
    expect(listCall?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "44444444-4444-4444-8444-444444444444",
    ]);
  });

  it("POST creates lawsuit and links claim", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/lawsuits",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        case_number: "CASE-100",
        plaintiff: "Acme Logistics",
        defendant: "RoadRunner Inc",
        court_name: "Harris County District Court",
        filed_date: "2026-05-01",
        claim_id: "11111111-1111-4111-8111-111111111111",
        demand_cents: 250000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      case_number: "CASE-100",
      claim_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("POST returns 404 when claim does not exist", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/lawsuits",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        case_number: "CASE-200",
        plaintiff: "Acme Logistics",
        defendant: "RoadRunner Inc",
        court_name: "Harris County District Court",
        filed_date: "2026-05-01",
        claim_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "claim_not_found" });
  });

  it("PATCH allows valid status transition", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/lawsuits/aaaaaaaa-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "active",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "active" });
  });

  it("PATCH rejects invalid status transition", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/lawsuits/77777777-7777-4777-8777-777777777777?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "active",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_status_transition", from: "settled", to: "active" });
  });

  it("PATCH enforces tenant isolation", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/lawsuits/99999999-9999-4999-8999-999999999999?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "active",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "lawsuit_not_found" });
  });
});
