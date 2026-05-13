import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerWorkOrdersV1Routes } from "../work-orders.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("work-orders.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerWorkOrdersV1Routes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/work-orders rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/work-orders?operating_company_id=${companyId}` });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/work-orders rejects invalid operating_company_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders?operating_company_id=not-a-uuid",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/work-orders lists rows for Owner callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-orders?operating_company_id=${companyId}&limit=5`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows?: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it("GET /api/v1/work-orders supports supertest + authenticated callers", async () => {
    const res = await supertest(app.server)
      .get(`/api/v1/work-orders?operating_company_id=${companyId}&limit=5`)
      .set(testAuthHeaders());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it("GET /api/v1/work-orders/:id returns 404 for unknown IDs", async () => {
    const id = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-orders/${id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/work-orders rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      payload: {
        operating_company_id: companyId,
        wo_billing_type: "internal",
        wo_service_class: "corrective",
        description: "integration-create-unauth",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/work-orders rejects Accountant callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: {
        "content-type": "application/json",
        ...testAuthHeaders(undefined, "Accountant"),
      },
      payload: {
        operating_company_id: companyId,
        wo_billing_type: "internal",
        wo_service_class: "corrective",
        description: "integration-create-role-gate",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/work-orders validates payloads before persistence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        wo_billing_type: "internal",
        wo_service_class: "corrective",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/work-orders creates internal corrective maintenance orders", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        wo_billing_type: "internal",
        wo_service_class: "corrective",
        description: `integration-create-${randomUUID()}`,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { work_order?: { id?: string } };
    expect(body.work_order?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("GET /api/v1/work-orders/:id/pdf returns 404 when the WO does not exist", async () => {
    const id = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-orders/${id}/pdf?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /api/v1/work-orders/:id rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/work-orders/${randomUUID()}?operating_company_id=${companyId}`,
      payload: { description: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH /api/v1/work-orders/:id rejects Accountant callers", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/work-orders/${randomUUID()}?operating_company_id=${companyId}`,
      headers: {
        "content-type": "application/json",
        ...testAuthHeaders(undefined, "Accountant"),
      },
      payload: { description: "role gate patch" },
    });
    expect(res.statusCode).toBe(403);
  });
});
