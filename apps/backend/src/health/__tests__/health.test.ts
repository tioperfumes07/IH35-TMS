import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerHealthRoutes } from "../health.routes.js";
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
    const body = JSON.parse(res.body) as { ok: boolean; uptime_seconds: number };
    expect(body.ok).toBe(true);
    expect(Number.isFinite(body.uptime_seconds)).toBe(true);
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
