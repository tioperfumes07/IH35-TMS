import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerInvoiceRoutes } from "../invoices.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("invoices.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerInvoiceRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/accounting/invoices rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&limit=5`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/accounting/invoices rejects invalid operating_company_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounting/invoices?operating_company_id=bad&limit=5",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/accounting/invoices lists invoices for authenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { invoices?: unknown };
    expect(Array.isArray(body.invoices)).toBe(true);
  });

  it("GET /api/v1/accounting/invoices/:id returns 404 for unknown invoices", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices/${randomUUID()}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/accounting/invoices rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/accounting/invoices validates payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/accounting/invoices/from-load rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${companyId}`,
      payload: { load_id: randomUUID() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH /api/v1/accounting/invoices/:id rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/accounting/invoices/${randomUUID()}?operating_company_id=${companyId}`,
      payload: { internal_notes: "hello" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/accounting/invoices/:id/send rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${randomUUID()}/send?operating_company_id=${companyId}`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/accounting/invoices/:id/void rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${randomUUID()}/void?operating_company_id=${companyId}`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});
