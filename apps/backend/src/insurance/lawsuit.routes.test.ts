import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceLawsuitRoutes } from "./lawsuit.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  // ENG-60: list query now reads legal.matters type=lawsuit ORDER BY created_at DESC.
  if (sql.includes("FROM legal.matters AS lawsuit") && sql.includes("ORDER BY lawsuit.created_at DESC")) {
    return {
      rows: [
        {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          operating_company_id: String(values?.[0] ?? ""),
          case_number: "CASE-001",
          plaintiff: null,
          defendant: null,
          court_name: null,
          filed_date: "2026-05-01T00:00:00.000Z",
          status: "filed",
          claim_id: "11111111-1111-4111-8111-111111111111",
          claim_number: "CLM-001",
          driver_id: "22222222-2222-4222-8222-222222222222",
          driver_name: "Jordan Driver",
          unit_id: "33333333-3333-4333-8333-333333333333",
          unit_number: "TRK-333",
          demand_cents: null,
          settlement_cents: null,
          attorney_name: null,
          attorney_email: null,
          notes: null,
          created_at: "2026-05-05T00:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("FROM insurance.claim")) {
    if (String(values?.[1]) === "ffffffff-ffff-4fff-8fff-ffffffffffff") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  // ENG-60: INSERT/UPDATE paths are retired (POST/PATCH return 410 before hitting DB).
  // No dead mocks for insurance.lawsuit here.

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
    // ENG-60: list query reads legal.matters type=lawsuit ORDER BY created_at DESC.
    const listSql = queryMock.mock.calls.find(([sql]) => String(sql).includes("ORDER BY lawsuit.created_at DESC"))?.[0];
    expect(listSql).toContain("FROM legal.matters AS lawsuit");
    expect(listSql).toContain("LEFT JOIN insurance.claim AS claim");
    expect(listSql).toContain("asset.unit_id::text AS unit_id");
    expect(listSql).toContain("driver.operating_company_id = lawsuit.operating_company_id");
    expect(listSql).toContain("COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = lawsuit.operating_company_id");
  });

  it("GET applies the exact policy reverse filter through the tenant-matched claim", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/lawsuits?operating_company_id=11111111-1111-4111-8111-111111111111&policy_id=44444444-4444-4444-8444-444444444444",
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("ORDER BY lawsuit.created_at DESC"));
    expect(String(listCall?.[0])).toContain("claim.policy_id = $2::uuid");
    expect(listCall?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "44444444-4444-4444-8444-444444444444",
    ]);
  });

  it("POST is 410 Gone — ENG-60 insurance.lawsuit retired", async () => {
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

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: "insurance_lawsuit_retired",
      redirect: "/legal/lawsuits",
    });
  });

  it("PATCH is 410 Gone — ENG-60 insurance.lawsuit retired", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/lawsuits/aaaaaaaa-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "active",
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: "insurance_lawsuit_retired",
      redirect: "/legal/lawsuits",
    });
  });
});
