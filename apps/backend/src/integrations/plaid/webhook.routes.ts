import { createPublicKey } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt, { type Algorithm } from "jsonwebtoken";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { getPlaidClient } from "./plaid-client.js";
import { handleItemError, syncTransactions } from "./plaid.service.js";

const webhookBodySchema = z.object({
  webhook_type: z.string().trim().min(1),
  webhook_code: z.string().trim().min(1),
  item_id: z.string().trim().min(1).optional(),
  error: z
    .object({
      error_code: z.string().trim().optional(),
    })
    .optional(),
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
  const token = headers["plaid-verification"];
  if (!token) return null;
  if (Array.isArray(token)) return String(token[0] ?? "");
  return String(token);
}

async function verifyPlaidWebhookJwt(token: string) {
  const plaid = getPlaidClient();
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded !== "object" || !decoded.header) {
    return false;
  }
  const header = decoded.header as { kid?: string; alg?: string };
  if (!header.kid) return false;

  const keyResponse = await plaid.webhookVerificationKeyGet({ key_id: header.kid });
  const jwk = keyResponse.data.key as unknown as Record<string, unknown>;
  const keyObject = createPublicKey({ key: jwk as never, format: "jwk" as never });
  const algorithm = (keyResponse.data.key.alg || header.alg || "ES256") as Algorithm;
  jwt.verify(token, keyObject, { algorithms: [algorithm] });
  return true;
}

async function processWebhookAsync(body: z.infer<typeof webhookBodySchema>, logger: FastifyInstance["log"]) {
  const webhookType = body.webhook_type.toUpperCase();
  const webhookCode = body.webhook_code.toUpperCase();
  const itemId = body.item_id ?? "";

  try {
    if (webhookType === "TRANSACTIONS" && ["DEFAULT_UPDATE", "INITIAL_UPDATE", "SYNC_UPDATES_AVAILABLE"].includes(webhookCode)) {
      if (itemId) await syncTransactions(itemId);
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
    logger.info({ webhookType, webhookCode }, "Unhandled Plaid webhook event");
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

export async function registerPlaidWebhookRoutes(app: FastifyInstance) {
  app.post("/api/v1/webhooks/plaid", async (req, reply) => {
    const token = plaidVerificationHeader(req.headers as Record<string, unknown>);
    if (!token) {
      await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "missing_plaid_verification_header" }, "warning");
      return reply.code(401).send({ error: "invalid_plaid_webhook_signature" });
    }

    try {
      const valid = await verifyPlaidWebhookJwt(token);
      if (!valid) {
        await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_decode_or_key_failure" }, "warning");
        return reply.code(401).send({ error: "invalid_plaid_webhook_signature" });
      }
    } catch {
      await appendSystemAudit("banking.plaid.webhook_invalid", { reason: "jwt_verification_failed" }, "warning");
      return reply.code(401).send({ error: "invalid_plaid_webhook_signature" });
    }

    const parsed = webhookBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    await appendSystemAudit(
      "banking.plaid.webhook_received",
      {
        webhook_type: payload.webhook_type,
        webhook_code: payload.webhook_code,
        item_id: payload.item_id ?? null,
      },
      "info"
    );

    setImmediate(() => {
      void processWebhookAsync(payload, app.log);
    });

    return reply.code(200).send({ ok: true });
  });
}

