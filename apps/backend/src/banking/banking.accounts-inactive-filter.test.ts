import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerBankingRoutes } from "./banking.routes.js";

const describeIntegration = describe.skipIf(process.env.CI === "true" && process.env.DATABASE_URL == null);

describeIntegration("banking accounts inactive filtering", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerBankingRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/banking/accounts/all accepts include_inactive flag", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/banking/accounts/all?operating_company_id=${companyId}&include_inactive=true`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accounts?: unknown };
    expect(Array.isArray(body.accounts)).toBe(true);
  });
});
