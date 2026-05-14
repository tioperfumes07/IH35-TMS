import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerQboSyncRunsListRoutes } from "./sync-runs-list.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("sync-runs-list.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncRunsListRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/qbo/sync/runs lists runs for Owner callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/runs?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs?: unknown };
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it("GET /api/v1/qbo/sync/runs rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/runs?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });
});
