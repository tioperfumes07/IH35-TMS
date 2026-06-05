import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPerfMetrics,
  recordResponseTime,
  registerPerfMetricsRoute,
  registerResponseTimeMiddleware,
  resetPerfMetrics,
} from "./response-time.js";

describe("response-time middleware", () => {
  afterEach(() => {
    resetPerfMetrics();
  });

  it("computes p50/p95/p99 from recorded samples", () => {
    for (let i = 1; i <= 100; i += 1) {
      recordResponseTime("GET /test", i);
    }
    const metrics = getPerfMetrics()["GET /test"];
    expect(metrics.count).toBe(100);
    expect(metrics.p50).toBe(50);
    expect(metrics.p95).toBe(95);
    expect(metrics.p99).toBe(99);
  });

  it("registerResponseTimeMiddleware records route timings", async () => {
    const app = Fastify();
    await registerResponseTimeMiddleware(app);
    app.get("/ping", async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/ping" });
    expect(res.statusCode).toBe(200);
    const metrics = getPerfMetrics();
    expect(Object.keys(metrics).some((k) => k.includes("/ping"))).toBe(true);
    await app.close();
  });

  it("registerPerfMetricsRoute requires auth", async () => {
    const app = Fastify();
    await registerPerfMetricsRoute(app, async () => false);
    await app.ready();
    const denied = await app.inject({ method: "GET", url: "/api/v1/internal/perf-metrics" });
    expect(denied.statusCode).toBe(401);
    await app.close();
  });

  it("registerPerfMetricsRoute returns metrics when authorized", async () => {
    recordResponseTime("GET /authorized", 42);
    const app = Fastify();
    await registerPerfMetricsRoute(app, async () => true);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/internal/perf-metrics" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, { p50: number }>;
    expect(body["GET /authorized"]?.p50).toBe(42);
    await app.close();
  });
});
