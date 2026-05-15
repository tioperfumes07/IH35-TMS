import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";

const probeMock = vi.hoisted(() => ({
  runAdminDeepHealthProbe: vi.fn(),
}));

vi.mock("./health-deep.service.js", () => ({
  runAdminDeepHealthProbe: probeMock.runAdminDeepHealthProbe,
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
    probeMock.runAdminDeepHealthProbe.mockResolvedValueOnce({
      checks: [
        { name: "postgres.select1", ok: false, tier: "critical", duration_ms: 12, error: "boom" },
        { name: "redis.ping", ok: true, tier: "critical", duration_ms: 2 },
        { name: "r2.head_bucket", ok: true, tier: "non_critical", duration_ms: 3, skipped: true },
        { name: "plaid.sandbox.public_token.create", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
        { name: "qbo.companyinfo", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
      ],
      total_ms: 20,
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
    const body = res.json() as { ok?: boolean; checks?: unknown[] };
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.checks)).toBe(true);
    await app.close();
  });

  it("GET /api/v1/admin/health/deep returns 200 when critical deps succeed (even if non-critical deps fail)", async () => {
    probeMock.runAdminDeepHealthProbe.mockResolvedValueOnce({
      checks: [
        { name: "postgres.select1", ok: true, tier: "critical", duration_ms: 5 },
        { name: "redis.ping", ok: true, tier: "critical", duration_ms: 2 },
        { name: "r2.head_bucket", ok: false, tier: "non_critical", duration_ms: 30, error: "r2_not_configured" },
        { name: "plaid.sandbox.public_token.create", ok: false, tier: "non_critical", duration_ms: 10, error: "sandbox_failed" },
        { name: "qbo.companyinfo", ok: true, tier: "non_critical", duration_ms: 0, skipped: true },
      ],
      total_ms: 40,
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
    const body = res.json() as { ok?: boolean };
    expect(body.ok).toBe(true);
    await app.close();
  });
});
