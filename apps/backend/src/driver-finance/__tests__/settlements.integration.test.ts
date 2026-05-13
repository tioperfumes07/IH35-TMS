import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerDriverFinanceSettlementRoutes } from "../settlements.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("settlements.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerDriverFinanceSettlementRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/driver-finance/settlements rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlements?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/driver-finance/settlements rejects invalid operating_company_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/driver-finance/settlements?operating_company_id=bad",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/driver-finance/settlements lists settlements for authenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlements?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { settlements?: unknown };
    expect(Array.isArray(body.settlements)).toBe(true);
  });

  it("GET /api/v1/driver-finance/settlements/:id returns 404 for unknown settlements", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlements/${randomUUID()}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/driver-finance/settlements rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/settlements",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/driver-finance/settlements validates payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/driver-finance/settlements",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /api/v1/driver-finance/settlements/:id/acknowledge rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/driver-finance/settlements/${randomUUID()}/acknowledge`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH /api/v1/driver-finance/settlements/:id/finalize rejects missing operating_company_id", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/driver-finance/settlements/${randomUUID()}/finalize`,
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /api/v1/driver-finance/settlements/:id/finalize returns 404 when settlement is unknown", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/driver-finance/settlements/${randomUUID()}/finalize?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/driver-finance/settlements/:id/pdf returns 404 for unknown settlements", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/driver-finance/settlements/${randomUUID()}/pdf?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });
});
