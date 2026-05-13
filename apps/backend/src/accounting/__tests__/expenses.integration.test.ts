import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerExpenseRoutes } from "../expenses.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expenses.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerExpenseRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/expenses rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/expenses rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Dispatcher") },
      payload: {
        operating_company_id: companyId,
        driver_id: randomUUID(),
        expense_date: "2026-01-01",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/expenses validates driver_id presence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        expense_date: "2026-01-01",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/expenses validates expense_date format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: randomUUID(),
        expense_date: "01/02/2026",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/expenses validates amount_cents is positive", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: randomUUID(),
        expense_date: "2026-01-01",
        amount_cents: 0,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/expenses validates operating_company_id shape", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: "not-a-uuid",
        driver_id: randomUUID(),
        expense_date: "2026-01-01",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/expenses validates driver_id uuid shape", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: "bad",
        expense_date: "2026-01-01",
        amount_cents: 100,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/expenses/:id/reattribute rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/expenses/${randomUUID()}/reattribute`,
      payload: {
        operating_company_id: companyId,
        new_load_id: randomUUID(),
        reason: "integration coverage path",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
