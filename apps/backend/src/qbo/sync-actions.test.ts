import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerQboSyncActionsRoutes } from "./sync-actions.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("sync-actions.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncActionsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST retry rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/runs/${randomUUID()}/retry`,
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST dismiss rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/runs/${randomUUID()}/dismiss`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Dispatcher") },
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(403);
  });
});
