import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerDataImportAdminRoutes } from "./data-import.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

function buildMultipartCsv(body: string, boundary = "----ih35testboundary"): { payload: string; contentType: string } {
  const payload =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="import.csv"\r\n` +
    `Content-Type: text/csv\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--\r\n`;
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("data-import.routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await a.register(multipart);
      await registerDataImportAdminRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated upload", async () => {
    const { payload, contentType } = buildMultipartCsv("x\n1");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/data-import?entity_type=drivers&company_code=TRK",
      headers: { "content-type": contentType },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Dispatcher upload", async () => {
    const { payload, contentType } = buildMultipartCsv("x\n1");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/data-import?entity_type=drivers&company_code=TRK",
      headers: { "content-type": contentType, ...testAuthHeaders(undefined, "Dispatcher") },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 when entity_type is missing", async () => {
    const { payload, contentType } = buildMultipartCsv("x\n1");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/data-import?company_code=TRK",
      headers: { "content-type": contentType, ...testAuthHeaders(undefined, "Owner") },
      payload,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toBe("entity_type_required");
  });

  it("returns CSV template for Owner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/data-import/template/drivers",
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"] ?? "")).toContain("text/csv");
    expect(String(res.headers["content-disposition"] ?? "")).toContain('filename="drivers-template.csv"');
    expect(res.body).toContain("first_name");
  });

  it("rejects template download for Dispatcher", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/data-import/template/drivers",
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describeIntegration("data-import.routes (database integration)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await a.register(multipart);
      await registerDataImportAdminRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns preview JSON for header-only drivers CSV (no data rows)", async () => {
    const header =
      "first_name,last_name,email,phone,cdl_number,cdl_state,cdl_class,cdl_expires_at,hire_date,status\n";
    const { payload, contentType } = buildMultipartCsv(header);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/data-import?entity_type=drivers&company_code=TRK",
      headers: { "content-type": contentType, ...testAuthHeaders(undefined, "Administrator") },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      valid_rows?: number;
      invalid_rows?: number;
      sample_valid?: unknown[];
    };
    expect(body.valid_rows).toBe(0);
    expect(body.invalid_rows).toBe(0);
    expect(Array.isArray(body.sample_valid)).toBe(true);
  });

  it("returns 400 when commit=true and import has row errors (no partial commit)", async () => {
    const header =
      "first_name,last_name,email,phone,cdl_number,cdl_state,cdl_class,cdl_expires_at,hire_date,status\n";
    const badRow = "Bad,,,not-a-phone,CDL1,TX,A,2030-01-01,2019-01-01,Active\n";
    const { payload, contentType } = buildMultipartCsv(header + badRow);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/data-import?entity_type=drivers&company_code=TRK&commit=true",
      headers: { "content-type": contentType, ...testAuthHeaders(undefined, "Owner") },
      payload,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string; errors?: unknown[] };
    expect(body.error).toBe("import_failed");
    expect(Array.isArray(body.errors)).toBe(true);
  });
});
