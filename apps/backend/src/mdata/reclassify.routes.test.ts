import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerReclassifyRoutes } from "./reclassify.routes.js";

describe("customer reclassification history scope boundary", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(registerReclassifyRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated reads", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/reclassification-history?operating_company_id=${randomUUID()}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires an explicit selected company before opening the reverse history query", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/customers/${randomUUID()}/reclassification-history`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "validation_error" });
  });
});
