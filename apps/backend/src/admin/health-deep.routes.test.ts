import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";

const adminJobsMock = vi.hoisted(() => ({
  buildIdempotencyKey: vi.fn(() => "deep-health-key"),
  enqueueAdminJob: vi.fn(async () => "job-123"),
  getLatestCompletedAdminJob: vi.fn(),
  resolveDefaultOperatingCompanyIdForUser: vi.fn(async () => "11111111-1111-1111-1111-111111111111"),
}));

vi.mock("./admin-jobs.service.js", () => ({
  buildIdempotencyKey: adminJobsMock.buildIdempotencyKey,
  enqueueAdminJob: adminJobsMock.enqueueAdminJob,
  getLatestCompletedAdminJob: adminJobsMock.getLatestCompletedAdminJob,
  resolveDefaultOperatingCompanyIdForUser: adminJobsMock.resolveDefaultOperatingCompanyIdForUser,
}));

import { registerHealthDeepRoutes } from "./health-deep.routes.js";

describe("admin/health-deep.routes.ts", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/v1/admin/health/deep returns 401 without auth headers", async () => {
    const app = await createIntegrationApp(async (a) => {
      await registerHealthDeepRoutes(a);
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/admin/health/deep" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET /api/v1/admin/health/deep returns 403 for non-Owner roles", async () => {
    const app = await createIntegrationApp(async (a) => {
      await registerHealthDeepRoutes(a);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/health/deep",
      headers: testAuthHeaders(undefined, "Administrator"),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("GET /api/v1/admin/health/deep returns 503 when any critical dependency fails", async () => {
    adminJobsMock.getLatestCompletedAdminJob.mockResolvedValueOnce({
      id: "a8da2181-e8d9-404e-b173-3dd5eeb5b34f",
      operation: "admin.health.deep.refresh",
      status: "completed",
      result: {
        checks: [
          { name: "postgres.select1", ok: false, tier: "critical", duration_ms: 12, error: "boom" },
          { name: "redis.ping", ok: true, tier: "critical", duration_ms: 2 },
          { name: "r2.head_bucket", ok: true, tier: "non_critical", duration_ms: 3, skipped: true },
          { name: "plaid.sandbox.public_token.create", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
          { name: "qbo.companyinfo", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
        ],
        total_ms: 20,
      },
      completed_at: new Date().toISOString(),
    });

    const app = await createIntegrationApp(async (a) => {
      await registerHealthDeepRoutes(a);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/health/deep",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { ok?: boolean; checks?: unknown[]; last_probed_at?: string | null; cache_age_seconds?: number | null };
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.checks)).toBe(true);
    expect(typeof body.last_probed_at === "string").toBe(true);
    expect(typeof body.cache_age_seconds === "number").toBe(true);
    await app.close();
  });

  it("GET /api/v1/admin/health/deep returns 200 when critical deps succeed (even if non-critical deps fail)", async () => {
    adminJobsMock.getLatestCompletedAdminJob.mockResolvedValueOnce({
      id: "2654cc33-ccf6-4af0-94ae-f623f579d6b2",
      operation: "admin.health.deep.refresh",
      status: "completed",
      result: {
        checks: [
          { name: "postgres.select1", ok: true, tier: "critical", duration_ms: 5 },
          { name: "redis.ping", ok: true, tier: "critical", duration_ms: 2 },
          { name: "r2.head_bucket", ok: false, tier: "non_critical", duration_ms: 30, error: "r2_not_configured" },
          { name: "plaid.sandbox.public_token.create", ok: false, tier: "non_critical", duration_ms: 10, error: "sandbox_failed" },
          { name: "qbo.companyinfo", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
        ],
        total_ms: 40,
      },
      completed_at: new Date().toISOString(),
    });

    const app = await createIntegrationApp(async (a) => {
      await registerHealthDeepRoutes(a);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/health/deep",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok?: boolean; last_probed_at?: string | null; cache_age_seconds?: number | null };
    expect(body.ok).toBe(true);
    expect(typeof body.last_probed_at === "string").toBe(true);
    expect(typeof body.cache_age_seconds === "number").toBe(true);
    await app.close();
  });

  it("GET /api/v1/admin/health/deep enqueues refresh when stale and still returns cached status code", async () => {
    const staleTime = new Date(Date.now() - 11 * 60_000).toISOString();
    adminJobsMock.getLatestCompletedAdminJob.mockResolvedValueOnce({
      id: "5128600f-56af-43fd-aeb2-e0659a9e7c8b",
      operation: "admin.health.deep.refresh",
      status: "completed",
      result: {
        checks: [{ name: "postgres.select1", ok: false, tier: "critical", duration_ms: 10, error: "down" }],
        total_ms: 10,
      },
      completed_at: staleTime,
    });

    const app = await createIntegrationApp(async (a) => {
      await registerHealthDeepRoutes(a);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/health/deep",
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { refresh_enqueued?: boolean; refresh_job_id?: string | null };
    expect(body.refresh_enqueued).toBe(true);
    expect(body.refresh_job_id).toBe("job-123");
    expect(adminJobsMock.enqueueAdminJob).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
