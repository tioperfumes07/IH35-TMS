import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerHomeWidgetRoutes } from "./home-widgets.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("home drivers-on-duty selected-company roster", () => {
  const routesSrc = readFileSync(fileURLToPath(new URL("./home-widgets.routes.ts", import.meta.url)), "utf8");

  it("counts active authorized shared drivers in the denominator", () => {
    expect(routesSrc).toContain("driver_company_authorizations home_duty_roster_dca");
    expect(routesSrc).toContain("home_duty_roster_dca.company_id = $1::uuid");
    expect(routesSrc).toContain("home_duty_roster_dca.is_authorized = true");
    expect(routesSrc).toContain("home_duty_roster_dca.deactivated_at IS NULL");
  });
});

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

// 0280-05 / FACTOR-1: factoring-balance must use invoice-grain linkage service — never
// superseded views.factoring_summary (0124 dead companies.current_reserve_balance) and never
// silent catch → fabricated $0.
describe("home-widgets factoring-balance invoice linkage (0280-05)", () => {
  const routesSrc = readFileSync(
    fileURLToPath(new URL("./home-widgets.routes.ts", import.meta.url)),
    "utf8"
  );

  it("calls computeFactoringBalanceInvoiceLinkage (not views.factoring_summary)", () => {
    expect(routesSrc).toContain("computeFactoringBalanceInvoiceLinkage");
    expect(routesSrc).not.toContain("FROM views.factoring_summary");
  });

  it("does not read the dead factoring.company_balances table / columns", () => {
    expect(routesSrc).not.toContain("factoring.company_balances");
    expect(routesSrc).not.toMatch(/SUM\(reserve_cents\)/);
    expect(routesSrc).not.toMatch(/SUM\(advanced_cents\)/);
  });

  it("surfaces unverifiable + accounting_exception + failed errors (no silent zero catch)", () => {
    expect(routesSrc).toContain("factoring_balance_invoice_linkage_unverifiable");
    expect(routesSrc).toContain("factoring_balance_invoice_linkage_accounting_exception");
    expect(routesSrc).toContain("factoring_balance_invoice_linkage_failed");
    expect(routesSrc).toContain("accounting_exception");
    expect(routesSrc).not.toMatch(
      /factoring-balance[\s\S]{0,800}catch\s*\{\s*return\s*\{\s*reserveCents:\s*0/
    );
  });

  it("headlines outstanding Faro liability (never reserve+liability net)", () => {
    expect(routesSrc).toContain("outstanding_liability_cents");
    expect(routesSrc).toContain("reserve_receivable_cents");
    expect(routesSrc).toContain("totalCents: result.outstanding_liability_cents");
    expect(routesSrc).not.toMatch(/totalCents:\s*.*reserve.*\+.*outstanding|totalCents:\s*.*reserve.*\+.*advanced/);
  });
});

// GO-0027-HOME-F: wo-status-counts/open-loads-count/drivers-on-duty/wos-open-count/cash-position
// each caught a genuine DB query failure with a bare `catch { return <zeros> }`, indistinguishable
// on the Home dashboard from "legitimately empty" — a real outage silently presented as $0 cash /
// 0 drivers / 0 open loads. Must propagate (throw) so it surfaces as a 500, same as the already-fixed
// revenue/factoring-balance siblings above and fleet-utilization's own `catch (error) { ...; throw error; }`.
describe("home-widgets query failures propagate, never fabricate zeros (GO-0027-HOME-F)", () => {
  const routesSrc = readFileSync(
    fileURLToPath(new URL("./home-widgets.routes.ts", import.meta.url)),
    "utf8"
  );

  const zeroCatchPatterns: Array<[string, RegExp]> = [
    ["wo-status-counts", /catch\s*\{\s*return\s+out;?\s*\}/],
    ["open-loads-count", /catch\s*\{\s*return\s*\{\s*total:\s*0/],
    ["drivers-on-duty", /catch\s*\{\s*return\s*\{\s*active:\s*0/],
    ["wos-open-count", /catch\s*\{\s*return\s*\{\s*open:\s*0/],
    ["cash-position", /catch\s*\{\s*return\s*\{\s*totalCents:\s*0/],
  ];

  it("no bare catch-block fabricates a zero-shaped payload", () => {
    for (const [label, pattern] of zeroCatchPatterns) {
      expect(routesSrc, `${label} must not silently swallow a query error into zeros`).not.toMatch(pattern);
    }
  });

  it("each fixed handler logs and re-throws its real query error", () => {
    expect(routesSrc).toContain('"home.wo-status-counts query failed"');
    expect(routesSrc).toContain('"home.open-loads-count query failed"');
    expect(routesSrc).toContain('"home.drivers-on-duty query failed"');
    expect(routesSrc).toContain('"home.wos-open-count query failed"');
    expect(routesSrc).toContain('"home.cash-position query failed"');
    // Each of the 5 fixed labels must be immediately followed by a re-throw, not a swallow.
    for (const label of [
      "home.wo-status-counts query failed",
      "home.open-loads-count query failed",
      "home.drivers-on-duty query failed",
      "home.wos-open-count query failed",
      "home.cash-position query failed",
    ]) {
      const idx = routesSrc.indexOf(`"${label}"`);
      expect(idx, `${label} label must be present`).toBeGreaterThan(-1);
      const tail = routesSrc.slice(idx, idx + 80);
      expect(tail, `${label} must re-throw, not swallow`).toContain("throw err;");
    }
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
