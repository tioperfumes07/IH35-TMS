import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("google oauth env guard runtime behavior", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ih35",
      DATABASE_DIRECT_URL: "postgres://postgres:postgres@localhost:5432/ih35",
    };
    delete process.env.OAUTH_GOOGLE_CLIENT_ID;
    delete process.env.OAUTH_GOOGLE_CLIENT_SECRET;
    delete process.env.OAUTH_REDIRECT_URI;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("imports auth routes without crashing when oauth env is absent", async () => {
    await expect(import("../../auth/routes.js")).resolves.toBeDefined();
  });

  it("returns 503 for google login when oauth env is absent", async () => {
    const { registerAuthRoutes } = await import("../../auth/routes.js");
    const app = Fastify({ logger: false });
    await app.register(cookie);
    await registerAuthRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/google/login",
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: "google_oauth_not_configured" });
    await app.close();
  });
});
