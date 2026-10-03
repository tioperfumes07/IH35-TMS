import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractRelayWebhookRows,
  RELAY_WEBHOOK_MAX_SKEW_SECONDS,
  verifyRelayWebhookSignature,
} from "./relay-fuel-webhook.routes.js";

const SECRET = "test-secret-not-real";
const NOW = 1_790_000_000;
const sign = (body: Buffer, ts: number, secret = SECRET) =>
  createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");

describe("Relay webhook signature (reject before persist)", () => {
  const body = Buffer.from(JSON.stringify({ transaction_id: "t1", created_at: "2026-10-03T05:00:00Z" }));

  it("accepts a fresh, correctly signed body (with or without the sha256= prefix)", () => {
    expect(verifyRelayWebhookSignature(body, SECRET, { "x-relay-timestamp": String(NOW), "x-relay-signature": sign(body, NOW) }, NOW)).toEqual({ ok: true });
    expect(verifyRelayWebhookSignature(body, SECRET, { "x-relay-timestamp": String(NOW), "x-relay-signature": `sha256=${sign(body, NOW)}` }, NOW)).toEqual({ ok: true });
  });

  it("refuses when no secret is configured — the receiver never runs unsigned", () => {
    expect(verifyRelayWebhookSignature(body, null, { "x-relay-timestamp": String(NOW), "x-relay-signature": sign(body, NOW) }, NOW)).toEqual({ ok: false, reason: "no_secret" });
  });

  it("refuses a tampered body, a wrong secret, and missing headers", () => {
    const tampered = Buffer.from(body.toString().replace("t1", "t2"));
    expect(verifyRelayWebhookSignature(tampered, SECRET, { "x-relay-timestamp": String(NOW), "x-relay-signature": sign(body, NOW) }, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRelayWebhookSignature(body, SECRET, { "x-relay-timestamp": String(NOW), "x-relay-signature": sign(body, NOW, "other") }, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyRelayWebhookSignature(body, SECRET, {}, NOW)).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("refuses a replay outside the freshness window", () => {
    const old = NOW - RELAY_WEBHOOK_MAX_SKEW_SECONDS - 1;
    expect(verifyRelayWebhookSignature(body, SECRET, { "x-relay-timestamp": String(old), "x-relay-signature": sign(body, old) }, NOW)).toEqual({ ok: false, reason: "stale" });
  });
});

describe("Relay webhook body shapes", () => {
  it("reads one object, an array, { transactions } and { data }", () => {
    expect(extractRelayWebhookRows({ transaction_id: "a" })).toHaveLength(1);
    expect(extractRelayWebhookRows([{ transaction_id: "a" }, { transaction_id: "b" }])).toHaveLength(2);
    expect(extractRelayWebhookRows({ transactions: [{ transaction_id: "a" }] })).toHaveLength(1);
    expect(extractRelayWebhookRows({ data: [{ transaction_id: "a" }, { transaction_id: "b" }] })).toHaveLength(2);
    expect(extractRelayWebhookRows("x")).toHaveLength(0);
  });
});
