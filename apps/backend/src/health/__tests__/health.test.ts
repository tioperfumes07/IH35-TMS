import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerHealthRoutes, resolveBackendVersion } from "../health.routes.js";
import { setAppReady } from "../../lib/startup-ready.js";

describe("health routes", () => {
  beforeEach(() => {
    setAppReady(false);
  });

  it("GET /api/v1/healthz/shallow returns ok + uptime", async () => {
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/shallow" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; uptime_seconds: number; version: string };
    expect(body.ok).toBe(true);
    expect(Number.isFinite(body.uptime_seconds)).toBe(true);
    expect(body.version).toBe(resolveBackendVersion());
  });

  it("resolveBackendVersion prefers RENDER_GIT_COMMIT then GITHUB_SHA", () => {
    const priorRender = process.env.RENDER_GIT_COMMIT;
    const priorGithub = process.env.GITHUB_SHA;
    try {
      delete process.env.RENDER_GIT_COMMIT;
      delete process.env.GITHUB_SHA;
      expect(resolveBackendVersion()).toBe("dev");

      process.env.GITHUB_SHA = "abcdef1234567890";
      expect(resolveBackendVersion()).toBe("abcdef1");

      process.env.RENDER_GIT_COMMIT = "1234567890abcdef";
      expect(resolveBackendVersion()).toBe("1234567");
    } finally {
      if (priorRender === undefined) delete process.env.RENDER_GIT_COMMIT;
      else process.env.RENDER_GIT_COMMIT = priorRender;
      if (priorGithub === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = priorGithub;
    }
  });

  it("GET /api/v1/healthz/readyz returns 503 before app ready", async () => {
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/readyz" });
    expect(res.statusCode).toBe(503);
  });

  it("GET /api/v1/healthz/readyz returns 200 after ready", async () => {
    setAppReady(true);
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/readyz" });
    expect(res.statusCode).toBe(200);
  });
});
