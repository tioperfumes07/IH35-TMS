import { createPublicKey } from "node:crypto";
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

export async function verifyPlaidWebhookJwt(token: string): Promise<boolean> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded !== "object" || !decoded.header) {
    return false;
  }
  const header = decoded.header as { kid?: string; alg?: string };
  if (header.alg && header.alg !== "ES256") {
    return false;
  }

  const staticKey = process.env.PLAID_WEBHOOK_VERIFICATION_KEY?.trim();
  if (staticKey) {
    try {
      const jwk = JSON.parse(staticKey) as Record<string, unknown>;
      const keyObject = createPublicKey({ key: jwk as never, format: "jwk" as never });
      jwt.verify(token, keyObject, { algorithms: ["ES256"] });
      return true;
    } catch {
      try {
        const keyObject = createPublicKey(staticKey);
        jwt.verify(token, keyObject, { algorithms: ["ES256"] });
        return true;
      } catch {
        return false;
      }
    }
  }

  if (!header.kid) return false;

  const plaid = getPlaidClient();
  const keyResponse = await plaid.webhookVerificationKeyGet({ key_id: header.kid });
  const jwk = keyResponse.data.key as unknown as Record<string, unknown>;
  const keyObject = createPublicKey({ key: jwk as never, format: "jwk" as never });
  const algorithm = (keyResponse.data.key.alg || header.alg || "ES256") as Algorithm;
  jwt.verify(token, keyObject, { algorithms: [algorithm] });
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

export function registerPlaidWebhookReceiver(app: FastifyInstance, mountPath: string) {
  app.post(mountPath, async (req, reply) => {
    const token = plaidVerificationHeader(req.headers as Record<string, unknown>);
    if (!token) {
      await appendSystemAudit(
        "banking.plaid.webhook_invalid",
        { reason: "missing_plaid_verification_header", path: mountPath },
        "warning"
      );
      return reply.code(200).send({ ok: true, ignored: true, reason: "missing_signature" });
    }

    try {
      const valid = await verifyPlaidWebhookJwt(token);
      if (!valid) {
        await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_decode_or_key_failure", path: mountPath }, "warning");
        return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_signature" });
      }
    } catch {
      await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_verification_failed", path: mountPath }, "warning");
      return reply.code(200).send({ ok: true, ignored: true, reason: "invalid_signature" });
    }

    const parsed = plaidWebhookBodySchema.safeParse(req.body ?? {});
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
}
