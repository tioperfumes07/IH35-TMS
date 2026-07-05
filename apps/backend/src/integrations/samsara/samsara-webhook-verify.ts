import crypto from "node:crypto";

/**
 * Samsara webhook signature verification — documented "v1" scheme.
 *
 * Source (verified against Samsara's live developer docs, 2026-07):
 *   https://developers.samsara.com/docs/webhooks — "Webhook Signature Verification"
 *   - Algorithm: HMAC-SHA256.
 *   - Signed message: the string  `v1:<timestamp>:<body>`  where <timestamp> is the
 *     `X-Samsara-Timestamp` header (Unix epoch seconds) and <body> is the RAW request body,
 *     concatenated exactly as received (no re-encoding / special-char post-processing).
 *   - Signature header: `X-Samsara-Signature`, formatted `v1=<hex>`. `v1` is the only
 *     current version; any other prefix means the request is NOT from Samsara.
 *   - The secret displayed on the Samsara webhook config page is Base64-encoded and must be
 *     Base64-decoded before use as the HMAC key.
 *
 * Timestamp freshness / replay protection: Samsara's docs do not mandate a window, so we add
 * our own ±MAX_SKEW window (repo hardening) to reject stale/replayed and far-future timestamps.
 */

/** Replay window (seconds). Reject if |now - X-Samsara-Timestamp| exceeds this. Repo hardening. */
export const SAMSARA_WEBHOOK_MAX_SKEW_SECONDS = 300;

export type SamsaraVerifyReason =
  | "missing_secret"
  | "missing_signature"
  | "missing_timestamp"
  | "bad_timestamp"
  | "stale_timestamp"
  | "bad_signature";

export type SamsaraVerifyResult = { ok: true } | { ok: false; reason: SamsaraVerifyReason };

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v)) {
    for (const p of v) {
      if (typeof p === "string" && p.trim()) return p.trim();
    }
  }
  return undefined;
}

/** Extract the hex digest from a `v1=<hex>` signature header. Only `v1` is accepted. */
function extractV1Signature(header: string): string | undefined {
  for (const token of header.split(/[\s,]+/).filter(Boolean)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const version = token.slice(0, eq).toLowerCase();
    const value = token.slice(eq + 1);
    if (version === "v1" && /^[0-9a-fA-F]+$/.test(value)) return value.toLowerCase();
  }
  return undefined;
}

/**
 * Candidate HMAC keys for the shared secret. Samsara's displayed secret is Base64; we compute
 * over the Base64-decoded bytes (canonical) and also fall back to the raw UTF-8 bytes so an
 * operator-stored / env-provided secret that was NOT the raw Base64 blob still verifies. Trying
 * both interpretations of OUR OWN secret does not weaken security (an attacker cannot forge a
 * digest without the secret regardless of which representation we use).
 */
function secretKeyCandidates(secret: string): Buffer[] {
  const keys: Buffer[] = [];
  const trimmed = secret.trim();
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      if (decoded.length > 0 && decoded.toString("base64") === trimmed) keys.push(decoded);
    } catch {
      /* not valid base64 — skip */
    }
  }
  keys.push(Buffer.from(secret, "utf8"));
  return keys;
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify a Samsara webhook request per the documented v1 scheme, including timestamp freshness.
 * Returns a structured result so callers can log the rejection reason without leaking secrets.
 */
export function verifySamsaraWebhookSignature(
  rawBody: Buffer,
  secret: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  opts?: { nowMs?: number; maxSkewSeconds?: number }
): SamsaraVerifyResult {
  if (!secret || !secret.trim()) return { ok: false, reason: "missing_secret" };

  const sigHeader = firstHeader(headers, "x-samsara-signature");
  if (!sigHeader) return { ok: false, reason: "missing_signature" };

  const tsHeader = firstHeader(headers, "x-samsara-timestamp");
  if (!tsHeader) return { ok: false, reason: "missing_timestamp" };

  const tsSeconds = Number(tsHeader);
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return { ok: false, reason: "bad_timestamp" };

  const nowSeconds = (opts?.nowMs ?? Date.now()) / 1000;
  const maxSkew = opts?.maxSkewSeconds ?? SAMSARA_WEBHOOK_MAX_SKEW_SECONDS;
  if (Math.abs(nowSeconds - tsSeconds) > maxSkew) return { ok: false, reason: "stale_timestamp" };

  const provided = extractV1Signature(sigHeader);
  if (!provided) return { ok: false, reason: "bad_signature" };

  // Signed message = "v1:<timestamp>:" + RAW body bytes (body appended without re-encoding).
  const prefix = Buffer.from(`v1:${tsHeader}:`, "utf8");
  const message = Buffer.concat([prefix, rawBody]);

  for (const key of secretKeyCandidates(secret)) {
    const expected = crypto.createHmac("sha256", key).update(message).digest("hex");
    if (timingSafeHexEqual(provided, expected)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}
