import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerPasswordResetRoutes } from "./password-reset.routes.js";

const queryMock = vi.fn();

vi.mock("../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/db.js")>();
  return {
    ...actual,
    withLuciaBypass: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
  };
});

vi.mock("../notifications/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ id: "email-1" })),
}));

const { enforceOfficePasswordResetRequestLimits } = vi.hoisted(() => ({
  enforceOfficePasswordResetRequestLimits: vi.fn(async () => true),
}));

vi.mock("../middleware/rate-limit.js", () => ({
  enforceOfficePasswordResetRequestLimits,
}));

describe("password-reset.routes", () => {
  let app: FastifyInstance | null = null;

  beforeEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    queryMock.mockReset();
    enforceOfficePasswordResetRequestLimits.mockReset();
    enforceOfficePasswordResetRequestLimits.mockResolvedValue(true);
    app = await createIntegrationApp(registerPasswordResetRoutes);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("request returns 429 when email-based limiter rejects", async () => {
    enforceOfficePasswordResetRequestLimits.mockImplementation(async (_req, reply) => {
      await reply.code(429).header("Retry-After", "120").send({ error: "rate_limited" });
      return false;
    });

    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/identity/password-reset/request",
      payload: { email: "ops@example.com" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("rate_limited");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("request returns generic message when user is missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/identity/password-reset/request",
      payload: { email: "nobody@example.com" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/If that email exists/i);
    expect(queryMock).toHaveBeenCalled();
  });

  it("confirm rejects expired token", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: "11111111-1111-1111-1111-111111111111",
          used_at: null,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });

    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/identity/password-reset/confirm",
      payload: {
        token: "22222222-2222-4222-8222-222222222222",
        new_password: "GoodPass!w0rd123",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_or_expired_token");
  });

  it("confirm rejects used token", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: "11111111-1111-1111-1111-111111111111",
          used_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ],
    });

    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/identity/password-reset/confirm",
      payload: {
        token: "22222222-2222-4222-8222-222222222222",
        new_password: "GoodPass!w0rd123",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_or_expired_token");
  });

  it("confirm rejects weak password", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/identity/password-reset/confirm",
      payload: {
        token: "22222222-2222-4222-8222-222222222222",
        new_password: "short",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });
});
