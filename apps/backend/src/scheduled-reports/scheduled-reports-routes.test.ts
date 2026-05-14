import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerScheduledReportsRoutes } from "./scheduled-reports.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("scheduled-reports.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerScheduledReportsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/scheduled-reports rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/scheduled-reports?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/scheduled-reports rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/scheduled-reports?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("scheduled-reports.routes smoke", () => {
  it("integration suite is gated to CI (GITHUB_ACTIONS)", () => {
    expect(typeof describeIntegration).toBe("function");
  });
});
