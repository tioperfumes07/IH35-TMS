import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerBillingRoutes } from "./customer-billing.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer billing summary routes", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerBillingRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/mdata/customers/:customer_id/billing-summary returns 200 for an existing customer", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers?operating_company_id=${companyId}&limit=1`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(listRes.statusCode).toBe(200);
    const customers = (listRes.json() as { customers?: Array<{ id: string }> }).customers ?? [];
    const customerId = customers[0]?.id;
    if (!customerId) return;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${customerId}/billing-summary?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status?: string; aging_buckets?: Record<string, unknown> };
    expect(body.status).toBe("real");
    expect(body.aging_buckets).toBeTruthy();
  });

  it("GET /api/v1/mdata/customers/:customer_id/billing-summary returns 404 for unknown customers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/billing-summary?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "mdata_customer_not_found" });
  });
});

describe("customer billing summary routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerBillingRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/mdata/customers/:customer_id/billing-summary rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/billing-summary?operating_company_id=${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/mdata/customers/:customer_id/billing-summary returns 404 for unknown customers without DB fixtures", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/customers/${randomUUID()}/billing-summary?operating_company_id=${randomUUID()}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });
});
