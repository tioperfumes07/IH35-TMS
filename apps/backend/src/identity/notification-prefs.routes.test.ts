import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerNotificationPreferenceRoutes } from "./notification-prefs.routes.js";

describe("notification-prefs.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerNotificationPreferenceRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated GET", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/identity/me/notification-preferences" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects unauthenticated PATCH", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/identity/me/notification-preferences",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ reset_to_defaults: true }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns validation error on bad PATCH body", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/identity/me/notification-preferences",
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: JSON.stringify({ channels: { email: "nope" } }),
    });
    expect(res.statusCode).toBe(400);
  });
});
