import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerDetailRoutes } from "./detail.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer detail routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerDetailRoutes(a);
      a.get("/api/v1/mdata/customers/:id/detail", async () => {
        return {
          customer: {
            id: "integration-customer",
            name: "Integration Customer",
          },
        };
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/customers/:id/detail returns customer detail for authenticated callers", async () => {
    const customerId = randomUUID();
    const operatingCompanyId = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${customerId}/detail?operating_company_id=${operatingCompanyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });

    expect(res.statusCode).toBe(307);
    expect(res.headers.location).toBe(`/api/v1/mdata/customers/${customerId}/detail?operating_company_id=${operatingCompanyId}`);

    const forwarded = await app.inject({
      method: "GET",
      url: String(res.headers.location),
      headers: testAuthHeaders(undefined, "Owner"),
    });

    expect(forwarded.statusCode).toBe(200);
    const body = forwarded.json() as { customer?: { id?: string; name?: string } };
    expect(body.customer?.id).toBe("integration-customer");
    expect(body.customer?.name).toBe("Integration Customer");
  });

  it("returns 400 when :id is not a UUID", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/not-a-uuid/detail?operating_company_id=${randomUUID()}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_customer_id" });
  });
});

describe("customer detail routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerDetailRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/customers/:id/detail rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/detail?operating_company_id=${randomUUID()}`,
    });

    expect(res.statusCode).toBe(401);
  });
});
