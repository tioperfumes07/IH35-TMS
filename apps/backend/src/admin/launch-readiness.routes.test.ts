import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerLaunchReadinessRoutes } from "./launch-readiness.routes.js";

describe("launch-readiness.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerLaunchReadinessRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/launch-readiness" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/launch-readiness",
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("launch-readiness production wiring", () => {
  it("registers launch readiness in apps/backend/src/index.ts (Block E regression guard)", () => {
    const indexSrc = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
    expect(indexSrc).toContain("registerLaunchReadinessRoutes");
    expect(indexSrc).toContain("await registerLaunchReadinessRoutes(app)");
  });
});
