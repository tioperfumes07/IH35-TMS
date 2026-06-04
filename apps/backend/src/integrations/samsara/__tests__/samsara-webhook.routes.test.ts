import crypto from "node:crypto";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const { queryMock, withLuciaBypassMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [] });
  const withLuciaBypassMock = vi.fn(async <T>(fn: (client: { query: typeof queryMock }) => Promise<T>) =>
    fn({ query: queryMock })
  );
  return { queryMock, withLuciaBypassMock };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../samsara.service.js", async () => {
  const actual = await vi.importActual<typeof import("../samsara.service.js")>("../samsara.service.js");
  return {
    ...actual,
    resolveSamsaraWebhookSigningSecret: vi.fn(async () => "route-test-secret"),
    extractSamsaraWebhookMeta: actual.extractSamsaraWebhookMeta,
  };
});

import { registerSamsaraWebhookRoutes } from "../samsara-webhook.routes.js";

const OC = "00000000-0000-4000-8000-000000000001";

function sign(body: Buffer, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("registerSamsaraWebhookRoutes", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
    withLuciaBypassMock.mockClear();
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function buildApp() {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerSamsaraWebhookRoutes(app);
    await app.ready();
    return app;
  }

  it.each([
    "/api/v1/integrations/samsara/webhook",
    "/api/v1/samsara/webhooks",
  ])("accepts signed POST on %s", async (urlPath) => {
    const app = await buildApp();
    const payload = { eventType: "vehicle.updated", id: "evt-1" };
    const body = Buffer.from(JSON.stringify(payload));
    const res = await app.inject({
      method: "POST",
      url: `${urlPath}?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": sign(body, "route-test-secret"),
      },
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(withLuciaBypassMock).toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalled();
  });
});
