import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerHomeWidgetRoutes } from "./home-widgets.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

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
