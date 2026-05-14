import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerPaymentsRoutes } from "./customer-payments.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer payments routes", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerCustomerPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/customers/:id/payments rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/payments?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/customers/:id/payments returns 404 for unknown customers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/payments?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/customers/:id/payments rejects apply totals greater than payment amount", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/customers/${randomUUID()}/payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        received_at: "2026-01-02",
        amount_cents: 100,
        payment_method: "ach",
        applications: [{ invoice_id: randomUUID(), amount_cents: 200 }],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("payment_apply_exceeds_total");
  });

  it("POST /api/v1/customers/:id/payments rejects duplicate invoice allocations", async () => {
    const invoiceId = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/customers/${randomUUID()}/payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        received_at: "2026-01-02",
        amount_cents: 500,
        payment_method: "ach",
        applications: [
          { invoice_id: invoiceId, amount_cents: 100 },
          { invoice_id: invoiceId, amount_cents: 100 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("duplicate_invoice_in_applications");
  });
});

describe("customer payments routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/customers/:id/payments rejects unauthenticated callers without DATABASE fixtures", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/payments?operating_company_id=${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
