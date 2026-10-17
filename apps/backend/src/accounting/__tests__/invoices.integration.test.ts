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

// LEAD 443.199 — the list's filter branches (multi-status incl. the active/posted pseudo-statuses, customer, source load,
// search, date window, open balance, A/R aging window and its non-contiguous refusal), the next-number preview with its
// `check`, and the load → invoices drill had no test. These run the real SQL against the CI database.
describeIntegration("invoices.routes integration — list filters, aging window, next-number, load drill", () => {
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

  it("every list filter composes into one valid query (count + list) and an unknown load returns nothing", async () => {
    const qs = new URLSearchParams({
      operating_company_id: companyId,
      customer_id: randomUUID(),
      source_load_id: randomUUID(),
      search: "INV",
      from_date: "2020-01-01",
      to_date: "2030-12-31",
      has_balance: "true",
      as_of: "2026-10-17",
      limit: "5",
    });
    for (const st of ["active", "posted", "sent"]) qs.append("status", st);
    for (const b of ["current", "d1_30"]) qs.append("aging_bucket", b);
    const res = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices?${qs}`, headers: testAuthHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { invoices?: unknown[]; total?: number };
    expect(Array.isArray(body.invoices)).toBe(true);
    expect(body.invoices).toHaveLength(0);
  });

  it("a single status and a single aging bucket are accepted", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&status=draft&aging_bucket=d90_plus&limit=5`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("a non-contiguous aging selection is a 400, never a silently widened window", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices?operating_company_id=${companyId}&aging_bucket=current&aging_bucket=d61_90&limit=5`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error?: string }).error).toBe("invalid_aging_bucket");
  });

  it("next-number previews a number; `check` reports whether a typed number is taken", async () => {
    const base = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices/next-number?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
    });
    expect(base.statusCode).toBe(200);
    const preview = base.json() as Record<string, unknown>;
    expect(preview).not.toHaveProperty("taken");

    const checked = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices/next-number?operating_company_id=${companyId}&check=ZZ-NEVER-${Date.now()}`,
      headers: testAuthHeaders(),
    });
    expect(checked.statusCode).toBe(200);
    expect((checked.json() as { taken?: unknown }).taken).toBe(false);

    const bad = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices/next-number?operating_company_id=nope`, headers: testAuthHeaders() });
    expect(bad.statusCode).toBe(400);
  });

  it("load → invoices drill: an unknown load has zero invoices and no next page; a bad id is a 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/loads/${randomUUID()}/invoices?operating_company_id=${companyId}&limit=10&offset=0`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ invoices: [], total: 0, limit: 10, offset: 0, has_more: false });

    const bad = await app.inject({ method: "GET", url: `/api/v1/loads/not-a-uuid/invoices?operating_company_id=${companyId}`, headers: testAuthHeaders() });
    expect(bad.statusCode).toBe(400);
    const badQuery = await app.inject({ method: "GET", url: `/api/v1/loads/${randomUUID()}/invoices?operating_company_id=nope`, headers: testAuthHeaders() });
    expect(badQuery.statusCode).toBe(400);
  });

  it("detail: a bad id or company is a 400; an unknown invoice is a 404", async () => {
    const badId = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices/not-a-uuid?operating_company_id=${companyId}`, headers: testAuthHeaders() });
    expect(badId.statusCode).toBe(400);
    const badCo = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices/${randomUUID()}?operating_company_id=nope`, headers: testAuthHeaders() });
    expect(badCo.statusCode).toBe(400);
    const missing = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices/${randomUUID()}?operating_company_id=${companyId}`, headers: testAuthHeaders() });
    expect(missing.statusCode).toBe(404);
  });
});
