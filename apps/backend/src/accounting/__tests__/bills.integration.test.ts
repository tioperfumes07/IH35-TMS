import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerBillsRoutes } from "../bills.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("bills.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerBillsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/accounting/vendor-balances rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-balances?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/accounting/vendor-balances rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-balances?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/accounting/vendor-balances returns vendor rows for accounting roles", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/vendor-balances?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Accountant"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown };
    expect(body).toHaveProperty("rows");
  });

  it("GET /api/v1/accounting/bills lists bills for accounting callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/bills?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown };
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it("GET /api/v1/accounting/bills/:id returns 404 for unknown bills", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/bills/${randomUUID()}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/accounting/bills rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/bills?operating_company_id=${companyId}`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/accounting/bills validates payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/bills?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: {
        bill_date: "2026-01-01",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/accounting/bill-payments lists payments for accounting callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/bill-payments?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(undefined, "Accountant"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown };
    expect(Array.isArray(body.rows)).toBe(true);
  });
});
