import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createStructuredLogger, formatStructuredLog } from "./structured-logger.js";
import { captureSlowQuery, isSentryConfigured } from "./sentry.js";
import { ARCHIVED_DEEP_HEALTH_ERROR, registerDeepHealthRoutes } from "./health-deep.routes.js";

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

// ARCHIVED 2026-07-25 (SECURITY). This suite used to assert that the module REGISTERS an
// unauthenticated /api/v1/health/deep returning quickbooks/samsara/plaid state — i.e. it pinned the
// defect in place. It now asserts the archived contract: the registrar refuses, and no route is
// mounted. Successor: the Owner-gated GET /api/v1/admin/health/deep.
describe("observability health/deep route — ARCHIVED", () => {
  it("registerDeepHealthRoutes throws instead of registering the unauthenticated route", async () => {
    const app = Fastify();
    expect(() => registerDeepHealthRoutes(app)).toThrow(/ARCHIVED/);
    expect(() => registerDeepHealthRoutes(app)).toThrow(ARCHIVED_DEEP_HEALTH_ERROR);
    await app.close();
  });

  it("leaves /api/v1/health/deep unmounted — an anonymous caller gets 404, not integration state", async () => {
    const app = Fastify();
    try {
      registerDeepHealthRoutes(app);
    } catch {
      /* expected — the registrar refuses */
    }
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/health/deep" });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toMatch(/quickbooks|samsara|plaid/i);
    await app.close();
  });
});
