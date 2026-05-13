import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerQboSyncAlertsRoutes } from "../sync-alerts.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("sync-alerts.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncAlertsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/qbo/sync/alerts rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/qbo/sync/alerts rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/qbo/sync/alerts lists alerts for accounting callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}&limit=10`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { alerts?: unknown };
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/acknowledge rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/acknowledge`,
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/acknowledge returns 404 when alert is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/acknowledge`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/retry-now rejects Accountant callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/retry-now`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Accountant") },
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(403);
  });
});
