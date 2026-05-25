import crypto from "node:crypto";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

function signPayload(token: string, payload: Buffer) {
  return crypto.createHmac("sha256", token).update(payload).digest("base64");
}

const validPayload = Buffer.from(
  JSON.stringify({
    eventNotifications: [
      {
        realmId: "realm-1",
        dataChangeEvent: {
          entities: [{ name: "Invoice", id: "42", operation: "Create", lastUpdated: "2026-05-24T12:00:00Z" }],
        },
      },
    ],
  }),
  "utf8"
);

const ORIGINAL_ENV = { ...process.env };

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
  const env = await import("../../../config/required-env.js");
  env.setDisabledFeatures(new Set());
});

async function buildRouteHarness(options: { verifierToken?: string; disabledFeatures?: Set<string> }) {
  process.env.QBO_WEBHOOK_VERIFIER_TOKEN = options.verifierToken ?? "";

  const queryMock = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ operating_company_id: "11111111-1111-4111-8111-111111111111" }] })
    .mockResolvedValue({ rows: [] });

  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }));
  vi.doMock("../../../auth/db.js", () => ({ withLuciaBypass }));

  const requiredEnv = await import("../../../config/required-env.js");
  requiredEnv.setDisabledFeatures(options.disabledFeatures ?? new Set());

  const { registerQboWebhookRoutes } = await import("../qbo-webhook.routes.js");
  const app = Fastify({ logger: false });
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  const errorSpy = vi.spyOn(app.log, "error");

  await registerQboWebhookRoutes(app);
  await app.ready();

  return { app, withLuciaBypass, errorSpy };
}

describe("qbo webhook fail-closed verification", () => {
  it("valid signed payload returns 200", async () => {
    const token = "verifier-token";
    const { app, withLuciaBypass } = await buildRouteHarness({ verifierToken: token });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/qbo/webhook",
      payload: validPayload,
      headers: {
        "content-type": "application/json",
        "intuit-signature": signPayload(token, validPayload),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(withLuciaBypass).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("invalid signature returns 401", async () => {
    const token = "verifier-token";
    const { app, withLuciaBypass } = await buildRouteHarness({ verifierToken: token });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/qbo/webhook",
      payload: validPayload,
      headers: {
        "content-type": "application/json",
        "intuit-signature": "bad-signature",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("qbo_webhook_signature_invalid");
    expect(withLuciaBypass).not.toHaveBeenCalled();
    await app.close();
  });

  it("missing env returns 503, logs error, and backend health remains healthy", async () => {
    const { app, withLuciaBypass, errorSpy } = await buildRouteHarness({ verifierToken: "" });

    const webhook = await app.inject({
      method: "POST",
      url: "/api/v1/qbo/webhook",
      payload: Buffer.from("{}", "utf8"),
      headers: { "content-type": "application/json" },
    });
    expect(webhook.statusCode).toBe(503);
    expect(JSON.parse(webhook.body).error).toBe("qbo_webhook_verifier_not_configured");
    expect(errorSpy).toHaveBeenCalled();
    expect(withLuciaBypass).not.toHaveBeenCalled();

    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(health.statusCode).toBe(200);
    await app.close();
  });
});
