import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceClaimRoutes } from "./claim.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("FROM insurance.claim") && sql.includes("ORDER BY accident_date DESC")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? ""),
          claim_number: "CLM-001",
          policy_id: String(values?.[1] ?? "22222222-2222-4222-8222-222222222222"),
          asset_id: String(values?.[3] ?? "33333333-3333-4333-8333-333333333333"),
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          status: String(values?.[2] ?? "open"),
          amount_claimed_cents: 250000,
          amount_paid_cents: 0,
          adjuster_name: "Alice Adjuster",
          adjuster_email: "alice@example.com",
          notes: "Initial claim",
          created_at: "2026-05-03T00:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("FROM insurance.policy")) {
    if (String(values?.[1]) === "ffffffff-ffff-4fff-8fff-ffffffffffff") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("FROM mdata.assets")) {
    if (String(values?.[1]) === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("INSERT INTO insurance.claim")) {
    return {
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          tenant_id: String(values?.[0]),
          claim_number: String(values?.[1]),
          policy_id: String(values?.[2]),
          asset_id: values?.[3] ? String(values?.[3]) : null,
          accident_date: String(values?.[4]),
          reported_date: String(values?.[5]),
          status: String(values?.[6]),
          amount_claimed_cents: Number(values?.[7]),
          amount_paid_cents: Number(values?.[8]),
          adjuster_name: values?.[9] ? String(values?.[9]) : null,
          adjuster_email: values?.[10] ? String(values?.[10]) : null,
          notes: values?.[11] ? String(values?.[11]) : null,
          created_at: "2026-05-04T00:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("SELECT status") && sql.includes("FROM insurance.claim")) {
    const claimId = String(values?.[1] ?? "");
    if (claimId === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    if (claimId === "77777777-7777-4777-8777-777777777777") return { rows: [{ status: "closed" }] };
    return { rows: [{ status: "open" }] };
  }

  if (sql.includes("UPDATE insurance.claim")) {
    const claimId = String(values?.[1] ?? "");
    if (claimId === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id: claimId,
          tenant_id: String(values?.[0]),
          claim_number: "CLM-001",
          policy_id: "22222222-2222-4222-8222-222222222222",
          asset_id: "33333333-3333-4333-8333-333333333333",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          status: String(values?.[2] ?? "investigating"),
          amount_claimed_cents: 250000,
          amount_paid_cents: 0,
          adjuster_name: "Alice Adjuster",
          adjuster_email: "alice@example.com",
          notes: "Updated",
          created_at: "2026-05-03T00:00:00.000Z",
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


describe("insurance claim routes", () => {
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
    await registerInsuranceClaimRoutes(app);
    return app;
  }

  it("GET applies policy/status/asset filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/claims?operating_company_id=11111111-1111-4111-8111-111111111111&policy_id=22222222-2222-4222-8222-222222222222&status=open&asset_id=33333333-3333-4333-8333-333333333333",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { claims: Array<{ id: string }> };
    expect(body.claims).toHaveLength(1);
    expect(body.claims[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("POST creates claim", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/claims",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        claim_number: "CLM-100",
        policy_id: "22222222-2222-4222-8222-222222222222",
        asset_id: "33333333-3333-4333-8333-333333333333",
        accident_date: "2026-05-01",
        reported_date: "2026-05-02",
        amount_claimed_cents: 100000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      claim_number: "CLM-100",
      status: "open",
    });
  });

  it("PATCH allows a valid status transition", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/claims/11111111-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "investigating",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "investigating" });
  });

  it("PATCH rejects an invalid status transition", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/claims/77777777-7777-4777-8777-777777777777?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "investigating",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_status_transition", from: "closed", to: "investigating" });
  });

  it("PATCH enforces tenant isolation", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/claims/99999999-9999-4999-8999-999999999999?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: {
        status: "investigating",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "claim_not_found" });
  });
});
