import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyIntuitWebhookSignature } from "./qbo-webhook-signature.js";

describe("verifyIntuitWebhookSignature", () => {
  it("accepts matching intuit-signature header", () => {
    const token = "test-verifier";
    const body = Buffer.from(JSON.stringify({ ok: true }), "utf8");
    const sig = crypto.createHmac("sha256", token).update(body).digest("base64");
    expect(verifyIntuitWebhookSignature(body, token, sig)).toBe(true);
  });

  it("rejects tampered body", () => {
    const token = "test-verifier";
    const body = Buffer.from("a", "utf8");
    const other = Buffer.from("b", "utf8");
    const sig = crypto.createHmac("sha256", token).update(body).digest("base64");
    expect(verifyIntuitWebhookSignature(other, token, sig)).toBe(false);
  });
});
