import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerFuelFraudAlertRoutes } from "../../apps/backend/src/integrations/fuel/fraud-detector/routes";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture";

// CI GUARD (2026-06-24) — fuel fraud-alerts 404. The route was defined but unmounted AND used a v1-less
// /api/fuel/ prefix, so GET /api/v1/fuel/fraud-alerts/summary 404'd (the "Open Fraud Alerts" KPI showed 0).
// This mounts the routes and asserts the v1 summary endpoint returns 200 with the open-counts shape.
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("fuel fraud-alerts summary — E2E (404→200 mount + v1 guard)", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerFuelFraudAlertRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /api/v1/fuel/fraud-alerts/summary returns 200 with open-count fields (was 404)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/fuel/fraud-alerts/summary?operating_company_id=${companyId}`,
      headers: { ...testAuthHeaders() },
    });
    expect(res.statusCode, `expected 200, got ${res.statusCode}: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { open_critical?: number; open_total?: number };
    expect(typeof body.open_critical).toBe("number");
    expect(typeof body.open_total).toBe("number");
  });
});
