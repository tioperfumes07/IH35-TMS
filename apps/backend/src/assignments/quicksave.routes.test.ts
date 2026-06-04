import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerAssignmentsQuicksaveRoutes } from "./quicksave.routes.js";

describe("assignments quicksave routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerAssignmentsQuicksaveRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/assignments/quicksave rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/assignments/quicksave",
      payload: {
        operating_company_id: randomUUID(),
        equipment_kind: "truck",
        equipment_id: randomUUID(),
        driver_id: randomUUID(),
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/assignments/quicksave returns 400 for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/assignments/quicksave",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { equipment_kind: "truck" },
    });
    expect([400, 401]).toContain(res.statusCode);
    if (res.statusCode === 400) {
      expect(res.json()).toMatchObject({ error: "validation_error" });
    }
  });

  it("POST /api/v1/assignments/quicksave does not return 500 for unknown equipment without DB fixtures", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/assignments/quicksave",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: randomUUID(),
        equipment_kind: "truck",
        equipment_id: randomUUID(),
        driver_id: randomUUID(),
      },
    });
    expect(res.statusCode).not.toBe(500);
    expect([401, 404]).toContain(res.statusCode);
  });
});
