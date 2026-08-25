import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsuranceClaimRoutes } from "./claim.routes.js";

const requireAuthState = { allowed: true };
const LINKED_ACCIDENT = "aaaaaaaa-1111-4111-8111-111111111111";
const EXISTING_CLAIM = "bbbbbbbb-2222-4222-8222-222222222222";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (
    sql.includes("SELECT id::text, insurance_claim_id::text") &&
    sql.includes("FROM safety.accident_reports") &&
    sql.includes("FOR UPDATE")
  ) {
    return {
      rows: [{ id: String(values?.[0]), insurance_claim_id: values?.[0] === LINKED_ACCIDENT ? EXISTING_CLAIM : null }],
    };
  }

  if (sql.includes("FROM insurance.claim") && sql.includes("ORDER BY c.accident_date DESC")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? ""),
          claim_number: "CLM-001",
          policy_id: String(values?.[1] ?? "22222222-2222-4222-8222-222222222222"),
          asset_id: String(values?.[3] ?? "33333333-3333-4333-8333-333333333333"),
          unit_id: "55555555-5555-4555-8555-555555555555",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          status: String(values?.[2] ?? "open"),
          amount_claimed_cents: 250000,
          amount_paid_cents: 0,
          adjuster_name: "Alice Adjuster",
          adjuster_email: "alice@example.com",
          notes: "Initial claim",
          created_at: "2026-05-03T00:00:00.000Z",
          accident_report_id: null,
          load_id: null,
          driver_id: null,
        },
      ],
    };
  }

  if (sql.includes("FROM insurance.claim c") && sql.includes("c.id = $2")) {
    const claimId = String(values?.[1] ?? "11111111-1111-4111-8111-111111111111");
    const isCreate = claimId === "44444444-4444-4444-8444-444444444444";
    return {
      rows: [
        {
          id: claimId,
          tenant_id: String(values?.[0] ?? ""),
          claim_number: isCreate ? "CLM-100" : "CLM-001",
          policy_id: "22222222-2222-4222-8222-222222222222",
          asset_id: "33333333-3333-4333-8333-333333333333",
          unit_id: null,
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          status: isCreate ? "open" : "investigating",
          amount_claimed_cents: isCreate ? 100000 : 250000,
          amount_paid_cents: 0,
          adjuster_name: isCreate ? null : "Alice Adjuster",
          adjuster_email: isCreate ? null : "alice@example.com",
          notes: isCreate ? null : "Updated",
          created_at: "2026-05-03T00:00:00.000Z",
          accident_report_id: null,
          load_id: null,
          driver_id: null,
        },
      ],
    };
  }

  if (
    sql.includes("FROM safety.accident_reports") ||
    sql.includes("FROM insurance.lawsuit") ||
    sql.includes("FROM legal.matters") ||
    sql.includes("FROM safety.incidents") ||
    sql.includes("FROM safety.damage_continuity_chains")
  ) {
    return { rows: [] };
  }

  if (sql.includes("FROM insurance.policy")) {
    if (String(values?.[1]) === "ffffffff-ffff-4fff-8fff-ffffffffffff") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("FROM mdata.assets")) {
    if (String(values?.[1]) === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") return { rows: [] };
    return { rows: [{ id: String(values?.[1]) }] };
  }

  if (sql.includes("FROM mdata.equipment")) {
    // WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 trailer hub check (assertOptionalHubExists "trailer" branch).
    if (String(values?.[0]) === "dddddddd-dddd-4ddd-8ddd-dddddddddddd") return { rows: [] };
    return { rows: [{ id: String(values?.[0]) }] };
  }

  if (sql.includes("FROM mdata.drivers d")) {
    return { rows: [{ id: String(values?.[0]) }] };
  }

  if (sql.includes("INSERT INTO insurance.claim")) {
    return {
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
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
      rows: [{ id: claimId }],
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

  it("POST rejects a second claim for an accident whose canonical back-pointer is occupied", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/claims",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        claim_number: "CLM-DUPLICATE-ACCIDENT",
        policy_id: "22222222-2222-4222-8222-222222222222",
        accident_date: "2026-05-01",
        reported_date: "2026-05-02",
        accident_report_id: LINKED_ACCIDENT,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "accident_report_already_linked" });
    expect(queryMock.mock.calls.some(([sql]) => sql.includes("INSERT INTO insurance.claim"))).toBe(false);
  });

  it("PATCH rejects stealing an accident back-pointer from another claim", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/claims/11111111-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
      payload: { accident_report_id: LINKED_ACCIDENT },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "accident_report_already_linked" });
    expect(queryMock.mock.calls.some(([sql]) => sql.includes("UPDATE insurance.claim"))).toBe(false);
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

  it("GET applies driver_id and load_id reverse-drill filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/claims?operating_company_id=11111111-1111-4111-8111-111111111111&driver_id=66666666-6666-4666-8666-666666666666&load_id=77777777-7777-4777-8777-777777777777",
    });

    expect(response.statusCode).toBe(200);
    const calls = queryMock.mock.calls.filter(([sql]) => sql.includes("ORDER BY c.accident_date DESC"));
    expect(calls).toHaveLength(1);
    const [sql, values] = calls[0]!;
    expect(sql).toContain("c.driver_id = $");
    expect(sql).toContain("c.load_id = $");
    expect(values).toContain("66666666-6666-4666-8666-666666666666");
    expect(values).toContain("77777777-7777-4777-8777-777777777777");
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

  it("GET claim graph returns reverse fan-out shell", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/claims/11111111-1111-4111-8111-111111111111/graph?operating_company_id=11111111-1111-4111-8111-111111111111",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      claim: { id: string };
      reverse: { accidents: unknown[] };
      gaps: { expense: string };
    };
    expect(body.claim.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.reverse.accidents).toEqual([]);
    expect(body.gaps.expense).toContain("no accounting.expenses.claim_id");
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

  // WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD — schema not yet on prod).
  describe("claim economics fields (slice 2)", () => {
    it("POST accepts a driver actively authorized to the claim company", async () => {
      const app = await buildApp();
      const driverId = "66666666-6666-4666-8666-666666666666";
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/insurance/claims",
        payload: {
          operating_company_id: "11111111-1111-4111-8111-111111111111",
          claim_number: "CLM-SHARED-DRIVER",
          policy_id: "22222222-2222-4222-8222-222222222222",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          amount_claimed_cents: 100000,
          driver_id: driverId,
        },
      });

      expect(response.statusCode).toBe(201);
      const driverCheck = queryMock.mock.calls.find(([sql]) => sql.includes("claim_write_driver_dca"));
      expect(driverCheck?.[0]).toContain("claim_write_driver_dca.is_authorized = true");
      expect(driverCheck?.[0]).toContain("claim_write_driver_dca.deactivated_at IS NULL");
      expect(driverCheck?.[1]).toEqual([driverId, "11111111-1111-4111-8111-111111111111"]);
    });

    it("POST creates a claim with the full economics slice (fault/driver_responsible/trailer/deductible/recovery_rail/repair_books_treatment)", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/insurance/claims",
        payload: {
          operating_company_id: "11111111-1111-4111-8111-111111111111",
          claim_number: "CLM-100",
          policy_id: "22222222-2222-4222-8222-222222222222",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          amount_claimed_cents: 100000,
          trailer_id: "33333333-3333-4333-8333-333333333333",
          fault: "company",
          driver_responsible: false,
          deductible_cents: 250000,
          recovery_rail: "escrow",
          repair_books_treatment: "expense",
        },
      });

      expect(response.statusCode).toBe(201);
      const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO insurance.claim"));
      expect(insertCall).toBeDefined();
      const insertValues = insertCall?.[1] as unknown[];
      // fault, driver_responsible, trailer_id, deductible_cents, recovery_rail, repair_books_treatment
      // are the last 6 bound params (see the INSERT column list in claim.routes.ts).
      expect(insertValues.slice(-6)).toEqual(["company", false, "33333333-3333-4333-8333-333333333333", 250000, "escrow", "expense"]);
    });

    it("POST defaults fault/recovery_rail/repair_books_treatment server-side (COALESCE) when the caller omits them — owner locks never silently skipped", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/insurance/claims",
        payload: {
          operating_company_id: "11111111-1111-4111-8111-111111111111",
          claim_number: "CLM-101",
          policy_id: "22222222-2222-4222-8222-222222222222",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          amount_claimed_cents: 100000,
        },
      });

      expect(response.statusCode).toBe(201);
      const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO insurance.claim"));
      const sql = String(insertCall?.[0] ?? "");
      // COALESCE(..., 'undetermined') / COALESCE(..., 'ask') / COALESCE(..., 'ask') / COALESCE(..., 0)
      // is what makes an omitted owner-locked field land on the safe neutral default in the DB, not on
      // an application-level guess baked into the JS.
      //
      // Matched on the DEFAULT, not on a hardcoded $N. The column list is now built lockstep and is
      // capability-dependent (operating_company_id is only emitted where the column exists), so
      // pinning $16/$19/$20/$21 asserted the parameter ORDER rather than the owner lock, and broke
      // the moment a column was legitimately added ahead of them.
      expect(sql).toMatch(/COALESCE\(\$\d+, 'undetermined'\)/);
      expect(sql).toMatch(/COALESCE\(\$\d+, 0\)/);
      expect(sql).toMatch(/COALESCE\(\$\d+, 'ask'\)[\s\S]*COALESCE\(\$\d+, 'ask'\)/);
      // The owner-locked columns must be the ones carrying those COALESCEs — pair each column with
      // its expression by position in the lockstep lists.
      const columns = sql.match(/INSERT INTO insurance\.claim \(([^)]*)\)/)?.[1].split(",").map((c) => c.trim()) ?? [];
      const expressions = sql.match(/VALUES \(([\s\S]*?)\)\s*\n/)?.[1].split(/,\s*(?![^(]*\))/).map((e) => e.trim()) ?? [];
      expect(columns.length).toBe(expressions.length);
      const exprFor = (col: string) => expressions[columns.indexOf(col)];
      expect(exprFor("fault")).toMatch(/COALESCE\(\$\d+, 'undetermined'\)/);
      expect(exprFor("deductible_cents")).toMatch(/COALESCE\(\$\d+, 0\)/);
      expect(exprFor("recovery_rail")).toMatch(/COALESCE\(\$\d+, 'ask'\)/);
      expect(exprFor("repair_books_treatment")).toMatch(/COALESCE\(\$\d+, 'ask'\)/);
      // Prod RLS keys INSERT on operating_company_id; omitting it silently rejects every claim.
      // Both columns must carry the SAME operating company id (compared on the bound values, since
      // the lockstep builder gives each column its own placeholder).
      expect(columns).toContain("operating_company_id");
      const boundValues = insertCall?.[1] as unknown[];
      expect(boundValues[columns.indexOf("operating_company_id")]).toBe(boundValues[columns.indexOf("tenant_id")]);
      expect(boundValues[columns.indexOf("operating_company_id")]).toBe("11111111-1111-4111-8111-111111111111");
    });

    it("POST returns trailer_not_found for a trailer outside the caller's entity scope", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/insurance/claims",
        payload: {
          operating_company_id: "11111111-1111-4111-8111-111111111111",
          claim_number: "CLM-102",
          policy_id: "22222222-2222-4222-8222-222222222222",
          accident_date: "2026-05-01",
          reported_date: "2026-05-02",
          trailer_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "trailer_not_found" });
    });

    it("GET applies the trailer_id reverse-drill filter", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/insurance/claims?operating_company_id=11111111-1111-4111-8111-111111111111&trailer_id=33333333-3333-4333-8333-333333333333",
      });

      expect(response.statusCode).toBe(200);
      const listCall = queryMock.mock.calls.find(
        ([sql]) => sql.includes("FROM insurance.claim") && sql.includes("ORDER BY c.accident_date DESC")
      );
      expect(String(listCall?.[0])).toContain("c.trailer_id = $");
    });

    it("PATCH updates driver_responsible, recovery_rail, and repair_books_treatment", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/insurance/claims/11111111-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
        payload: {
          driver_responsible: true,
          recovery_rail: "settlement",
          repair_books_treatment: "capitalize",
        },
      });

      expect(response.statusCode).toBe(200);
      const updateCall = queryMock.mock.calls.find(([sql]) => sql.includes("UPDATE insurance.claim"));
      expect(updateCall).toBeDefined();
      const updateSql = String(updateCall?.[0] ?? "");
      expect(updateSql).toContain("driver_responsible = $");
      expect(updateSql).toContain("recovery_rail = $");
      expect(updateSql).toContain("repair_books_treatment = $");
    });

    it("PATCH returns trailer_not_found when reassigning to a trailer outside entity scope", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/insurance/claims/11111111-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
        payload: {
          trailer_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "trailer_not_found" });
    });
  });
});
