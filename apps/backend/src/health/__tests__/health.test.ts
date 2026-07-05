import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import { registerHealthRoutes, resolveBackendVersion, backgroundJobRule } from "../health.routes.js";
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

// A1-1 guard: the QBO master-data mirror-staleness alarm must not self-disable when the
// sync-enabled flag is OFF — it must fire whenever a QBO realm is connected, and stay silent
// only when no realm is connected. Regression guard for the self-disabling health gate.
describe("A1-1 backgroundJobRule — QBO mirror-staleness arms on connected realm", () => {
  const prior = process.env.QBO_MASTERDATA_SYNC_ENABLED;
  beforeEach(() => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
  });
  afterAll(() => {
    if (prior === undefined) delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    else process.env.QBO_MASTERDATA_SYNC_ENABLED = prior;
  });

  it("sync flag OFF + realm CONNECTED → alarm armed (was silently skipped)", () => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    const rule = backgroundJobRule("qbo.master_data_sync.delta", true);
    expect(rule).not.toBeNull();
    expect(rule?.enabled).toBe(true);
    expect(rule?.maxStaleMinutes).toBe(30);
  });

  it("sync flag OFF + NO realm connected → alarm stays silent (correct)", () => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    const rule = backgroundJobRule("qbo.master_data_sync.delta", false);
    expect(rule?.enabled).toBe(false);
  });

  it("sync flag ON → alarm armed regardless of realm connection", () => {
    process.env.QBO_MASTERDATA_SYNC_ENABLED = "true";
    expect(backgroundJobRule("qbo.master_data_sync.delta", false)?.enabled).toBe(true);
    expect(backgroundJobRule("qbo.master_data_sync.delta", true)?.enabled).toBe(true);
  });

  it("realm connection does not spuriously arm unrelated jobs", () => {
    expect(backgroundJobRule("qbo.sync_alerts_cron", true)?.enabled).toBe(false);
    expect(backgroundJobRule("email.queue_processor", true)?.enabled).toBe(false);
  });
});
