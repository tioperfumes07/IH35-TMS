import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("google oauth env guard", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ih35",
      DATABASE_DIRECT_URL: "postgres://postgres:postgres@localhost:5432/ih35",
    };
    delete process.env.OAUTH_GOOGLE_CLIENT_ID;
    delete process.env.OAUTH_GOOGLE_CLIENT_SECRET;
    delete process.env.OAUTH_REDIRECT_URI;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("GET /api/v1/auth/google/login returns 503 when oauth env is missing", async () => {
    const { registerAuthRoutes } = await import("../routes.js");
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

  it("GET /api/v1/auth/google/callback returns 503 when oauth env is missing", async () => {
    const { registerAuthRoutes } = await import("../routes.js");
    const app = Fastify({ logger: false });
    await app.register(cookie);
    await registerAuthRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/google/callback?code=fake&state=fake",
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: "google_oauth_not_configured" });
    await app.close();
  });
});
