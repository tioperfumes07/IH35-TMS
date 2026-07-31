import { createHash, createPublicKey, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt, { type Algorithm } from "jsonwebtoken";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { getPlaidClient } from "./plaid-client.js";
import { handleItemError, handlePlaidItemLoginRequiredWebhook, syncTransactions } from "./plaid.service.js";

export const plaidWebhookBodySchema = z.object({
  webhook_type: z.string().trim().min(1),
  webhook_code: z.string().trim().min(1),
  item_id: z.string().trim().min(1).optional(),
  // Plaid sends `"error": null` on normal (non-error) webhooks, e.g. TRANSACTIONS updates. `.optional()`
  // accepts undefined but NOT null, so every such webhook was rejected as invalid_body (233 events) and
  // sync never fired. `.nullish()` = nullable + optional → accepts the object, null, and absent.
  error: z
    .object({
      error_code: z.string().trim().optional(),
    })
    .nullish(),
});

async function appendSystemAudit(eventClass: string, payload: Record<string, unknown>, severity: "info" | "warning" = "info") {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "P5-T1.2-PLAID",
    ]);
  });
}

function plaidVerificationHeader(headers: Record<string, unknown>) {
  const raw = headers["plaid-verification"] ?? headers["Plaid-Verification"];
  if (!raw) return null;
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return String(raw);
}

// Plaid recommends rejecting webhook JWTs whose `iat` is more than 5 minutes old to defeat replay
// attacks. See https://plaid.com/docs/api/webhooks/webhook-verification/ — the JWT payload carries
// `request_body_sha256` (SHA-256 hex of the RAW request body, whitespace-sensitive) and `iat`.
export const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

type PlaidWebhookJwtClaims = {
  iat?: unknown;
  request_body_sha256?: unknown;
};

function verifyWithStaticKey(token: string, staticKey: string): PlaidWebhookJwtClaims | null {
  try {
    const jwk = JSON.parse(staticKey) as Record<string, unknown>;
    const keyObject = createPublicKey({ key: jwk as never, format: "jwk" as never });
    return jwt.verify(token, keyObject, { algorithms: ["ES256"] }) as PlaidWebhookJwtClaims;
  } catch {
    try {
      const keyObject = createPublicKey(staticKey);
      return jwt.verify(token, keyObject, { algorithms: ["ES256"] }) as PlaidWebhookJwtClaims;
    } catch {
      return null;
    }
  }
}

// Freshness (replay protection): the JWT must carry an `iat` within ±MAX_WEBHOOK_AGE_SECONDS of now.
// Reject stale tokens (older than 5 min) and implausibly future-dated ones (clock-skew tolerance).
function isWebhookFresh(iat: unknown): boolean {
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - iat;
  return ageSeconds <= MAX_WEBHOOK_AGE_SECONDS && ageSeconds >= -MAX_WEBHOOK_AGE_SECONDS;
}

// Body integrity: SHA-256 of the RAW body bytes must equal the JWT's `request_body_sha256` claim.
// Constant-time comparison per Plaid guidance to prevent timing attacks.
function bodyMatchesClaim(rawBody: string | Buffer, expected: unknown): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  const actual = createHash("sha256").update(bodyBuffer).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

// Full Plaid webhook verification: (1) ES256 signature, (2) `iat` freshness (replay protection),
// (3) `request_body_sha256` bound to the RAW request body. All three must pass. Requires the RAW
// body bytes because the hash is whitespace-sensitive — never re-serialize the parsed JSON.
export async function verifyPlaidWebhookJwt(token: string, rawBody: string | Buffer): Promise<boolean> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded !== "object" || !decoded.header) {
    return false;
  }
  const header = decoded.header as { kid?: string; alg?: string };
  if (header.alg && header.alg !== "ES256") {
    return false;
  }

  let claims: PlaidWebhookJwtClaims | null = null;

  const staticKey = process.env.PLAID_WEBHOOK_VERIFICATION_KEY?.trim();
  if (staticKey) {
    claims = verifyWithStaticKey(token, staticKey);
  } else {
    if (!header.kid) return false;
    const plaid = getPlaidClient();
    const keyResponse = await plaid.webhookVerificationKeyGet({ key_id: header.kid });
    const jwk = keyResponse.data.key as unknown as Record<string, unknown>;
    const keyObject = createPublicKey({ key: jwk as never, format: "jwk" as never });
    const algorithm = (keyResponse.data.key.alg || header.alg || "ES256") as Algorithm;
    try {
      claims = jwt.verify(token, keyObject, { algorithms: [algorithm] }) as PlaidWebhookJwtClaims;
    } catch {
      return false;
    }
  }

  if (!claims) return false;

  // (b) freshness — reject replayed/stale webhooks (iat older than 5 minutes)
  if (!isWebhookFresh(claims.iat)) return false;

  // (a) body integrity — SHA-256 of the raw body must match the request_body_sha256 claim (constant-time)
  if (!bodyMatchesClaim(rawBody, claims.request_body_sha256)) return false;

  return true;
}

export async function processPlaidWebhookAsync(body: z.infer<typeof plaidWebhookBodySchema>, logger: FastifyInstance["log"]) {
  const webhookType = body.webhook_type.toUpperCase();
  const webhookCode = body.webhook_code.toUpperCase();
  const itemId = body.item_id ?? "";

  try {
    if (
      webhookType === "TRANSACTIONS" &&
      ["DEFAULT_UPDATE", "INITIAL_UPDATE", "SYNC_UPDATES_AVAILABLE", "HISTORICAL_UPDATE"].includes(webhookCode)
    ) {
      // BANK-F15: Plaid webhooks have no authenticated user — sync tags via CHAIN-05 rules only;
      // maybePostBankCategorizationToGl is skipped (no invented system user). Admin manual sync passes actor.
      if (itemId) await syncTransactions(itemId);
      return;
    }

    if (webhookType === "ITEM" && webhookCode === "LOGIN_REQUIRED") {
      if (itemId) await handlePlaidItemLoginRequiredWebhook(itemId);
      return;
    }

    if (webhookType === "ITEM" && webhookCode === "ERROR") {
      const errorCode = body.error?.error_code ?? "UNKNOWN";
      if (itemId) await handleItemError(itemId, errorCode);
      return;
    }

    if (webhookType === "ITEM" && webhookCode === "WEBHOOK_UPDATE_ACKNOWLEDGED") {
      return;
    }

    if (webhookType === "AUTH" && webhookCode === "AUTOMATICALLY_VERIFIED") {
      logger.info({ webhookType, webhookCode, itemId }, "Plaid AUTH webhook (informational)");
      return;
    }

    logger.info({ webhookType, webhookCode, itemId }, "Unhandled Plaid webhook event");
  } catch (error) {
    logger.error({ err: error, webhookType, webhookCode, itemId }, "Plaid webhook processing failed");
    await appendSystemAudit(
      "banking.plaid.error",
      {
        webhook_type: webhookType,
        webhook_code: webhookCode,
        item_id: itemId || null,
        reason: "webhook_processing_failed",
      },
      "warning"
    );
  }
}

export async function registerPlaidWebhookReceiver(app: FastifyInstance, mountPath: string) {
  // Parse the body as a raw Buffer so we can (a) verify the ES256 JWT signature and (b) bind the JWT's
  // `request_body_sha256` claim to the exact bytes Plaid signed — the hash is whitespace-sensitive, so
  // the parsed/re-serialized JSON would not match. Scoped so it does not affect other routes.
  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post(mountPath, async (req, reply) => {
      const token = plaidVerificationHeader(req.headers as Record<string, unknown>);
      if (!token) {
        await appendSystemAudit(
          "banking.plaid.webhook_invalid",
          { reason: "missing_plaid_verification_header", path: mountPath },
          "warning"
        );
        return reply.code(200).send({ ok: true, ignored: true, reason: "missing_signature" });
      }

      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody)) {
        await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "missing_raw_body", path: mountPath }, "warning");
        return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_body" });
      }

      try {
        // Verifies ES256 signature + iat freshness + request_body_sha256 bound to the raw body.
        const valid = await verifyPlaidWebhookJwt(token, rawBody);
        if (!valid) {
          await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_decode_or_key_failure", path: mountPath }, "warning");
          return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_signature" });
        }
      } catch {
        await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_verification_failed", path: mountPath }, "warning");
        return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_signature" });
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawBody.toString("utf8"));
      } catch {
        await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "invalid_json", path: mountPath }, "warning");
        return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_body" });
      }

      const parsed = plaidWebhookBodySchema.safeParse(parsedJson ?? {});
      if (!parsed.success) {
        await appendSystemAudit(
          "banking.plaid.webhook_invalid",
          { reason: "invalid_body", path: mountPath, details: parsed.error.flatten() },
          "warning"
        );
        return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_body" });
      }

      const payload = parsed.data;
      await appendSystemAudit(
        "banking.plaid.webhook_received",
        {
          webhook_type: payload.webhook_type,
          webhook_code: payload.webhook_code,
          item_id: payload.item_id ?? null,
          path: mountPath,
        },
        "info"
      );

      setImmediate(() => {
        void processPlaidWebhookAsync(payload, app.log);
      });

      return reply.code(200).send({ ok: true });
    });
  });
}
