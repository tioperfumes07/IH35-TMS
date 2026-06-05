import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createStructuredLogger, formatStructuredLog } from "./structured-logger.js";
import { captureSlowQuery, isSentryConfigured } from "./sentry.js";
import { registerDeepHealthRoutes } from "./health-deep.routes.js";

describe("observability structured logger", () => {
  it("formats JSON log entries with required fields", () => {
    const entry = formatStructuredLog("info", "request_complete", {
      request_id: "req-1",
      route: "/api/v1/health",
      latency_ms: 12,
    });
    expect(entry.timestamp).toMatch(/^\d{4}-/);
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("request_complete");
    expect(entry.request_id).toBe("req-1");
    expect(entry.latency_ms).toBe(12);
  });

  it("createStructuredLogger merges base context", () => {
    const log = createStructuredLogger({ request_id: "r2", user_id: "u1", company_id: "oc1", route: "/test" });
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
  });
});

describe("observability sentry helpers", () => {
  const prev = process.env.SENTRY_DSN;

  afterEach(() => {
    if (prev === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = prev;
  });

  it("isSentryConfigured reflects env", () => {
    delete process.env.SENTRY_DSN;
    expect(isSentryConfigured()).toBe(false);
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/0";
    expect(isSentryConfigured()).toBe(true);
  });

  it("captureSlowQuery is no-op without DSN", () => {
    delete process.env.SENTRY_DSN;
    expect(() => captureSlowQuery("/api/v1/reports", 5000)).not.toThrow();
  });
});

describe("observability health/deep route", () => {
  it("registers /api/v1/health/deep and returns check shape", async () => {
    const app = Fastify();
    registerDeepHealthRoutes(app);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/health/deep" });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json() as { ok: boolean; checks: { name: string; status: string }[] };
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.map((c) => c.name).sort()).toEqual(["plaid", "postgres", "quickbooks", "samsara"]);
    await app.close();
  });
});
