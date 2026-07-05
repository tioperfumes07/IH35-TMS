import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SAMSARA_WEBHOOK_MAX_SKEW_SECONDS,
  verifySamsaraWebhookSignature,
} from "./samsara-webhook-verify.js";

const NOW_MS = 1_700_000_000_000; // fixed clock
const NOW_S = Math.floor(NOW_MS / 1000);

/** Sign per Samsara's documented v1 scheme: HMAC-SHA256 over `v1:<timestamp>:<rawBody>`. */
function signV1(rawBody: Buffer, tsSeconds: number, secret: string): string {
  const message = Buffer.concat([Buffer.from(`v1:${tsSeconds}:`, "utf8"), rawBody]);
  const hex = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return `v1=${hex}`;
}

describe("verifySamsaraWebhookSignature (Samsara v1 scheme)", () => {
  const secret = "test-webhook-secret";
  const body = Buffer.from(JSON.stringify({ eventType: "ping", id: "evt-1" }));

  it("accepts a valid v1 signature with a fresh timestamp", () => {
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      {
        "x-samsara-signature": signV1(body, NOW_S, secret),
        "x-samsara-timestamp": String(NOW_S),
      },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: true });
  });

  it("accepts a base64-encoded secret (Samsara displays the key base64-encoded)", () => {
    const rawKey = crypto.randomBytes(32);
    const b64 = rawKey.toString("base64");
    // Samsara signs with the DECODED key bytes; our verifier must decode the stored base64 secret.
    const message = Buffer.concat([Buffer.from(`v1:${NOW_S}:`, "utf8"), body]);
    const hex = crypto.createHmac("sha256", rawKey).update(message).digest("hex");
    const res = verifySamsaraWebhookSignature(
      body,
      b64,
      { "x-samsara-signature": `v1=${hex}`, "x-samsara-timestamp": String(NOW_S) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: true });
  });

  it("rejects when secret is missing", () => {
    const res = verifySamsaraWebhookSignature(
      body,
      undefined,
      { "x-samsara-signature": "v1=deadbeef", "x-samsara-timestamp": String(NOW_S) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("rejects when the signature header is missing", () => {
    const res = verifySamsaraWebhookSignature(body, secret, { "x-samsara-timestamp": String(NOW_S) }, { nowMs: NOW_MS });
    expect(res).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects when the timestamp header is missing", () => {
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": signV1(body, NOW_S, secret) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("rejects a REPLAY: a stale timestamp beyond the skew window (even with a valid digest)", () => {
    const staleTs = NOW_S - (SAMSARA_WEBHOOK_MAX_SKEW_SECONDS + 60);
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": signV1(body, staleTs, secret), "x-samsara-timestamp": String(staleTs) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a far-future timestamp beyond the skew window", () => {
    const futureTs = NOW_S + (SAMSARA_WEBHOOK_MAX_SKEW_SECONDS + 60);
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": signV1(body, futureTs, secret), "x-samsara-timestamp": String(futureTs) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a tampered body (digest no longer matches)", () => {
    const sig = signV1(body, NOW_S, secret);
    const tampered = Buffer.from(JSON.stringify({ eventType: "ping", id: "evt-EVIL" }));
    const res = verifySamsaraWebhookSignature(
      tampered,
      secret,
      { "x-samsara-signature": sig, "x-samsara-timestamp": String(NOW_S) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a non-v1 signature version prefix (only v1 is trusted)", () => {
    const message = Buffer.concat([Buffer.from(`v1:${NOW_S}:`, "utf8"), body]);
    const hex = crypto.createHmac("sha256", secret).update(message).digest("hex");
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": `v2=${hex}`, "x-samsara-timestamp": String(NOW_S) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a non-numeric timestamp", () => {
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": signV1(body, NOW_S, secret), "x-samsara-timestamp": "not-a-number" },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("rejects a bare-hex signature with no v1= prefix (old broken scheme no longer accepted)", () => {
    const message = Buffer.concat([Buffer.from(`v1:${NOW_S}:`, "utf8"), body]);
    const hex = crypto.createHmac("sha256", secret).update(message).digest("hex");
    const res = verifySamsaraWebhookSignature(
      body,
      secret,
      { "x-samsara-signature": hex, "x-samsara-timestamp": String(NOW_S) },
      { nowMs: NOW_MS }
    );
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });
});
