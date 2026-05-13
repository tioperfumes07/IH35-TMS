import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerQboAutocompleteRoutes } from "../qbo-autocomplete.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

async function assertAutocompleteUnauthorized(app: FastifyInstance, path: string, companyId: string) {
  const res = await app.inject({
    method: "GET",
    url: `${path}?operating_company_id=${companyId}`,
  });
  expect(res.statusCode).toBe(401);
}

async function assertAutocompleteForbiddenDriver(app: FastifyInstance, path: string, companyId: string) {
  const res = await app.inject({
    method: "GET",
    url: `${path}?operating_company_id=${companyId}`,
    headers: testAuthHeaders(undefined, "Driver"),
  });
  expect(res.statusCode).toBe(403);
}

async function assertAutocompleteOk(app: FastifyInstance, path: string, companyId: string) {
  const res = await app.inject({
    method: "GET",
    url: `${path}?operating_company_id=${companyId}&q=`,
    headers: testAuthHeaders(undefined, "Owner"),
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { results?: unknown };
  expect(Array.isArray(body.results)).toBe(true);
}

describeIntegration("qbo-autocomplete.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboAutocompleteRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/mdata/qbo/vendors rejects unauthenticated callers", async () => {
    await assertAutocompleteUnauthorized(app, "/api/v1/mdata/qbo/vendors", companyId);
  });

  it("GET /api/v1/mdata/qbo/vendors rejects Driver callers", async () => {
    await assertAutocompleteForbiddenDriver(app, "/api/v1/mdata/qbo/vendors", companyId);
  });

  it("GET /api/v1/mdata/qbo/vendors returns results for office callers", async () => {
    await assertAutocompleteOk(app, "/api/v1/mdata/qbo/vendors", companyId);
  });

  it("GET /api/v1/mdata/qbo/customers rejects unauthenticated callers", async () => {
    await assertAutocompleteUnauthorized(app, "/api/v1/mdata/qbo/customers", companyId);
  });

  it("GET /api/v1/mdata/qbo/customers rejects Driver callers", async () => {
    await assertAutocompleteForbiddenDriver(app, "/api/v1/mdata/qbo/customers", companyId);
  });

  it("GET /api/v1/mdata/qbo/customers returns results for office callers", async () => {
    await assertAutocompleteOk(app, "/api/v1/mdata/qbo/customers", companyId);
  });

  it("GET /api/v1/mdata/qbo/items rejects unauthenticated callers", async () => {
    await assertAutocompleteUnauthorized(app, "/api/v1/mdata/qbo/items", companyId);
  });

  it("GET /api/v1/mdata/qbo/items rejects Driver callers", async () => {
    await assertAutocompleteForbiddenDriver(app, "/api/v1/mdata/qbo/items", companyId);
  });

  it("GET /api/v1/mdata/qbo/items returns results for office callers", async () => {
    await assertAutocompleteOk(app, "/api/v1/mdata/qbo/items", companyId);
  });

  it("GET /api/v1/mdata/qbo/accounts rejects unauthenticated callers", async () => {
    await assertAutocompleteUnauthorized(app, "/api/v1/mdata/qbo/accounts", companyId);
  });

  it("GET /api/v1/mdata/qbo/accounts rejects Driver callers", async () => {
    await assertAutocompleteForbiddenDriver(app, "/api/v1/mdata/qbo/accounts", companyId);
  });

  it("GET /api/v1/mdata/qbo/accounts returns results for office callers", async () => {
    await assertAutocompleteOk(app, "/api/v1/mdata/qbo/accounts", companyId);
  });
});
