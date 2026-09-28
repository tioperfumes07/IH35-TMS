// HTTP-level smoke test for checks.routes.ts -- boots a real fastify instance with ONLY this file's
// routes registered (same pattern as expenses.integration.test.ts) so a wiring mistake (bad zod
// schema, bad import, duplicate route) fails here instead of at full-app boot in CI/prod.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../../test-helpers/http-app.js";
import { registerCheckRoutes } from "../checks.routes.js";

describe("checks.routes integration (route wiring, no real writes)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCheckRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("boots cleanly -- no duplicate-route crash, no bad import", () => {
    expect(app).toBeDefined();
  });

  it("POST /api/v1/checks rejects unauthenticated callers", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/checks", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/checks rejects a Dispatcher (not an accounting role)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/checks",
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Dispatcher") },
      payload: { operating_company_id: randomUUID() },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/checks 400s a malformed body before touching the database", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/checks",
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { operating_company_id: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/checks rejects unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/checks?operating_company_id=" + randomUUID() });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/checks/next-number 400s without bank_account_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/checks/next-number?operating_company_id=" + randomUUID(),
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/checks/:id 400s a non-uuid id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/checks/not-a-uuid?operating_company_id=" + randomUUID(),
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(400);
  });
});
