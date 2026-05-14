import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerLaunchReadinessRoutes } from "./launch-readiness.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("launch-readiness integration (DB)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerLaunchReadinessRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/admin/launch-readiness returns payload for Owner", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/launch-readiness",
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { system_status?: unknown; migrations?: { applied_count?: number } };
    expect(body.system_status).toBeTruthy();
    expect(typeof body.migrations?.applied_count).toBe("number");
  });
});
