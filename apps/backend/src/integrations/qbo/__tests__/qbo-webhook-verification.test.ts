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

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

async function buildRouteHarness(options: {
  nodeEnv: string;
  verifierToken?: string;
  allowInsecureDev?: boolean;
}) {
  process.env.NODE_ENV = options.nodeEnv;
  process.env.QBO_WEBHOOK_VERIFIER_TOKEN = options.verifierToken ?? "";
  process.env.QBO_WEBHOOK_ALLOW_INSECURE_DEV = options.allowInsecureDev ? "true" : "false";

  const queryMock = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ operating_company_id: "11111111-1111-4111-8111-111111111111" }] })
    .mockResolvedValue({ rows: [] });
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock })
  );
  vi.doMock("../../../auth/db.js", () => ({ withLuciaBypass }));

  const { registerQboWebhookRoutes } = await import("../qbo-webhook.routes.js");
  const app = Fastify({ logger: false });
  const warnSpy = vi.spyOn(app.log, "warn");
  const errorSpy = vi.spyOn(app.log, "error");

  return { app, registerQboWebhookRoutes, queryMock, withLuciaBypass, warnSpy, errorSpy };
}

describe("qbo webhook fail-closed verification", () => {
  it("returns 200 when signature is valid", async () => {
    const token = "verifier-token";
    const { app, registerQboWebhookRoutes, withLuciaBypass } = await buildRouteHarness({
      nodeEnv: "test",
      verifierToken: token,
    });
    await registerQboWebhookRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/qbo/webhook",
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

  it("returns 401 when signature is invalid", async () => {
    const token = "verifier-token";
    const { app, registerQboWebhookRoutes, withLuciaBypass } = await buildRouteHarness({
      nodeEnv: "test",
      verifierToken: token,
    });
    await registerQboWebhookRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/qbo/webhook",
      payload: validPayload,
      headers: {
        "content-type": "application/json",
        "intuit-signature": "bad-signature",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(withLuciaBypass).not.toHaveBeenCalled();
    await app.close();
  });

  it("fails route registration in production when verifier token is missing", async () => {
    const { app, registerQboWebhookRoutes, errorSpy } = await buildRouteHarness({
      nodeEnv: "production",
      verifierToken: "",
    });

    await expect(registerQboWebhookRoutes(app)).rejects.toThrow("qbo_webhook_verifier_token_required_in_production");
    expect(errorSpy).toHaveBeenCalled();
    await app.close();
  });

  it("allows dev/test insecure opt-in with warning when verifier token is missing", async () => {
    const { app, registerQboWebhookRoutes, warnSpy, withLuciaBypass } = await buildRouteHarness({
      nodeEnv: "test",
      verifierToken: "",
      allowInsecureDev: true,
    });
    await registerQboWebhookRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/qbo/webhook",
      payload: validPayload,
      headers: {
        "content-type": "application/json",
      },
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(withLuciaBypass).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
