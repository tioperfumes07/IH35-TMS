import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { extractSamsaraWebhookMeta, resolveSamsaraWebhookSigningSecret } from "./samsara.service.js";
import { verifySamsaraWebhookSignature } from "./samsara-webhook-verify.js";

const SAMSARA_AUDIT_SOURCE = "SMS-FIX-2-WEBHOOKS";

const webhookQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const WEBHOOK_PATHS = [
  "/api/v1/integrations/samsara/webhook",
  "/api/v1/samsara/webhooks",
] as const;

async function handleSamsaraWebhookPost(req: FastifyRequest, reply: FastifyReply) {
  const q = webhookQuerySchema.safeParse(req.query ?? {});
  if (!q.success) {
    return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
  }
  const operatingCompanyId = q.data.operating_company_id;
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    return reply.code(400).send({ error: "invalid_body" });
  }

  req.log.info(
    {
      operating_company_id: operatingCompanyId,
      path: req.url,
      bytes: rawBody.length,
    },
    "samsara_webhook_ingress"
  );

  let payloadObj: Record<string, unknown> = {};
  try {
    payloadObj = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    payloadObj = { _parse_error: true };
  }
  const meta = extractSamsaraWebhookMeta(payloadObj);

  const secret = await withLuciaBypass((client) =>
    resolveSamsaraWebhookSigningSecret(client, operatingCompanyId)
  );
  const sigOk = verifySamsaraWebhookSignature(
    rawBody,
    secret,
    req.headers as Record<string, string | string[] | undefined>
  );

  if (!sigOk) {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
        "integrations.samsara_webhook_signature_invalid",
        "warning",
        JSON.stringify({
          operating_company_id: operatingCompanyId,
          event_type: meta.event_type,
          secret_source: secret ? "configured" : "missing",
        }),
        SAMSARA_AUDIT_SOURCE,
      ]);
      await client.query(
        `
          INSERT INTO integrations.samsara_webhook_events (
            operating_company_id, event_type, samsara_event_id, signature_valid, payload
          ) VALUES ($1, $2, $3, false, $4::jsonb)
        `,
        [operatingCompanyId, meta.event_type || "unknown", meta.samsara_event_id, JSON.stringify(payloadObj)]
      );
    });
    return reply.code(401).send({ error: "unauthorized" });
  }

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(
      `
        INSERT INTO integrations.samsara_webhook_events (
          operating_company_id, event_type, samsara_event_id, signature_valid, payload
        ) VALUES ($1, $2, $3, true, $4::jsonb)
      `,
      [operatingCompanyId, meta.event_type, meta.samsara_event_id, JSON.stringify(payloadObj)]
    );
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "integrations.samsara_webhook_received",
      "info",
      JSON.stringify({
        operating_company_id: operatingCompanyId,
        event_type: meta.event_type,
        samsara_event_id: meta.samsara_event_id,
      }),
      SAMSARA_AUDIT_SOURCE,
    ]);
  });

  req.log.info(
    { operating_company_id: operatingCompanyId, event_type: meta.event_type, samsara_event_id: meta.samsara_event_id },
    "samsara_webhook_accepted"
  );

  return reply.code(200).send({ ok: true as const });
}

export async function registerSamsaraWebhookRoutes(app: FastifyInstance) {
  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    for (const mountPath of WEBHOOK_PATHS) {
      scoped.post(mountPath, handleSamsaraWebhookPost);
    }
  });
}
