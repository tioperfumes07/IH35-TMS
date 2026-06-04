import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySamsaraWebhookSignature } from "./samsara-webhook-verify.js";

describe("verifySamsaraWebhookSignature", () => {
  it("accepts sha256= HMAC hex from x-samsara-signature", () => {
    const body = Buffer.from(JSON.stringify({ eventType: "ping" }));
    const secret = "test-webhook-secret";
    const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const ok = verifySamsaraWebhookSignature(body, secret, { "x-samsara-signature": `sha256=${digest}` });
    expect(ok).toBe(true);
  });

  it("rejects when secret is missing", () => {
    const body = Buffer.from("{}");
    expect(verifySamsaraWebhookSignature(body, undefined, { "x-samsara-signature": "deadbeef" })).toBe(false);
  });

  it("rejects tampered body", () => {
    const body = Buffer.from("{}");
    const secret = "s";
    const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const tampered = Buffer.from('{"x":1}');
    expect(verifySamsaraWebhookSignature(tampered, secret, { "x-samsara-signature": digest })).toBe(false);
  });
});
