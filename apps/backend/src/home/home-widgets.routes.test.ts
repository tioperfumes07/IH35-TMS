import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerHomeWidgetRoutes } from "./home-widgets.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// 0280-02 static guard: today/weekly revenue must call dual-basis linkage (not raw invoice SUM).
describe("home-widgets revenue GL linkage (0280-02)", () => {
  const routesSrc = readFileSync(
    fileURLToPath(new URL("./home-widgets.routes.ts", import.meta.url)),
    "utf8"
  );

  it("delegates today/weekly revenue to computeRevenueGlLinkage", () => {
    expect(routesSrc).toContain("computeRevenueGlLinkage");
    expect(routesSrc).toContain("todayRevenueWindow");
    expect(routesSrc).toContain("weeklyRevenueWindow");
    expect(routesSrc).toContain("invoice_basis_cents");
    expect(routesSrc).toContain("gl_posted_revenue_cents");
  });

  it("does not silently fabricate revenue_cents: 0 on catch", () => {
    expect(routesSrc).not.toMatch(/today-revenue[\s\S]{0,800}catch\s*\{\s*return\s*\{\s*revenue_cents:\s*0\s*\}/);
    expect(routesSrc).toContain("revenue_gl_linkage_unverifiable");
  });

  it("surfaces unverifiable as typed 200 body (not 422 conflated with transport)", () => {
    // Must not reply.code(422) for schema unverifiable — that conflates with client/transport errors.
    expect(routesSrc).not.toMatch(/unverifiable[\s\S]{0,120}reply\.code\(422\)/);
    expect(routesSrc).toContain("revenue_gl_linkage_failed");
  });
});

// FACTOR-1 static guard: the factoring-balance widget must read its reserve/advanced
// figures from the real populated source (views.factoring_summary), never from the
// never-created / never-written factoring.company_balances table.
describe("home-widgets factoring-balance reserve source (FACTOR-1)", () => {
  const routesSrc = readFileSync(
    fileURLToPath(new URL("./home-widgets.routes.ts", import.meta.url)),
    "utf8"
  );

  it("reads the reserve figure from the populated views.factoring_summary source", () => {
    expect(routesSrc).toContain("FROM views.factoring_summary");
    expect(routesSrc).toMatch(/COALESCE\(reserve_balance, 0\)/);
  });

  it("does not read the dead factoring.company_balances table / columns", () => {
    expect(routesSrc).not.toContain("factoring.company_balances");
    expect(routesSrc).not.toMatch(/SUM\(reserve_cents\)/);
    expect(routesSrc).not.toMatch(/SUM\(advanced_cents\)/);
  });
});

describe("home-widgets.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerHomeWidgetRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/home/weekly-revenue?operating_company_id=00000000-0000-0000-0000-000000000001&days=7",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Driver callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/home/weekly-revenue?operating_company_id=00000000-0000-0000-0000-000000000001&days=7",
      headers: testAuthHeaders(undefined, "Driver"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describeIntegration("home-widgets.routes integration (happy paths)", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerHomeWidgetRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const urls = (id: string) =>
    [
      `/api/v1/home/weekly-revenue?operating_company_id=${id}&days=7`,
      `/api/v1/home/wo-status-counts?operating_company_id=${id}`,
      `/api/v1/home/fleet-utilization?operating_company_id=${id}`,
      `/api/v1/home/today-revenue?operating_company_id=${id}`,
      `/api/v1/home/open-loads-count?operating_company_id=${id}`,
      `/api/v1/home/drivers-on-duty?operating_company_id=${id}`,
      `/api/v1/home/wos-open-count?operating_company_id=${id}`,
      `/api/v1/home/cash-position?operating_company_id=${id}`,
      `/api/v1/home/factoring-balance?operating_company_id=${id}`,
    ] as const;

  it("returns 200 JSON for each widget endpoint", async () => {
    for (const url of urls(companyId)) {
      const res = await app.inject({ method: "GET", url, headers: testAuthHeaders() });
      expect(res.statusCode, url).toBe(200);
      expect(() => res.json()).not.toThrow();
    }
  });
});
