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
const SECRET = "route-test-secret";

/** Sign per Samsara's documented v1 scheme: HMAC-SHA256 over `v1:<timestamp>:<rawBody>`. */
function signV1(body: Buffer, tsSeconds: number, secret: string) {
  const message = Buffer.concat([Buffer.from(`v1:${tsSeconds}:`, "utf8"), body]);
  return `v1=${crypto.createHmac("sha256", secret).update(message).digest("hex")}`;
}

function insertPayloadWrites() {
  // DB writes that persist the (potentially attacker-supplied) webhook payload.
  return queryMock.mock.calls.filter((c) => String(c[0]).includes("INSERT INTO integrations.samsara_webhook_events"));
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
  ])("accepts a valid v1-signed, fresh POST on %s and persists it", async (urlPath) => {
    const app = await buildApp();
    const payload = { eventType: "vehicle.updated", id: "evt-1" };
    const body = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: "POST",
      url: `${urlPath}?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": signV1(body, ts, SECRET),
        "x-samsara-timestamp": String(ts),
      },
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(insertPayloadWrites().length).toBe(1);
  });

  it("REJECTS an invalid signature with 401 and does NOT persist the payload (reject-before-persist)", async () => {
    const app = await buildApp();
    const body = Buffer.from(JSON.stringify({ eventType: "evil", id: "attacker" }));
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/samsara/webhooks?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": "v1=deadbeefdeadbeef",
        "x-samsara-timestamp": String(ts),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    // The core H4-2 guarantee: no webhook-event row is written for an unverified request.
    expect(insertPayloadWrites().length).toBe(0);
  });

  it("REJECTS a replayed (stale-timestamp) request with 401 and no payload write", async () => {
    const app = await buildApp();
    const body = Buffer.from(JSON.stringify({ eventType: "vehicle.updated", id: "evt-replay" }));
    const staleTs = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/samsara/webhooks?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": signV1(body, staleTs, SECRET), // valid digest, but stale
        "x-samsara-timestamp": String(staleTs),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(insertPayloadWrites().length).toBe(0);
  });

  it("REJECTS a missing-timestamp request (the old bare-body scheme) with 401 and no payload write", async () => {
    const app = await buildApp();
    const body = Buffer.from(JSON.stringify({ eventType: "vehicle.updated", id: "evt-old" }));
    // Old broken scheme: bare HMAC of the body, no v1= prefix, no timestamp header.
    const bareHex = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/samsara/webhooks?operating_company_id=${OC}`,
      headers: {
        "content-type": "application/json",
        "x-samsara-signature": bareHex,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(insertPayloadWrites().length).toBe(0);
  });
});
