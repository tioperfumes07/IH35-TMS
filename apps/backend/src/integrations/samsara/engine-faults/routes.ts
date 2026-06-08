import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../../../auth/db.js";
import { extractSamsaraWebhookMeta, resolveSamsaraWebhookSigningSecret } from "../samsara.service.js";
import { verifySamsaraWebhookSignature } from "../samsara-webhook-verify.js";
import { handleEngineFaultEvent, parseEngineFaultWebhookPayload } from "./fault-handler.service.js";

const SAMSARA_FAULT_AUDIT_SOURCE = "GAP-58-ENGINE-FAULT";

const webhookQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const WEBHOOK_PATH = "/api/integrations/samsara/engine-faults/webhook";

async function handleEngineFaultWebhookPost(req: FastifyRequest, reply: FastifyReply) {
  const q = webhookQuerySchema.safeParse(req.query ?? {});
  if (!q.success) {
    return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
  }
  const operatingCompanyId = q.data.operating_company_id;
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    return reply.code(400).send({ error: "invalid_body" });
  }

  let payloadObj: Record<string, unknown> = {};
  try {
    payloadObj = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return reply.code(400).send({ error: "invalid_json" });
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
        "integrations.engine_fault_signature_invalid",
        "warning",
        JSON.stringify({
          operating_company_id: operatingCompanyId,
          event_type: meta.event_type,
          secret_source: secret ? "configured" : "missing",
        }),
        SAMSARA_FAULT_AUDIT_SOURCE,
      ]);
    });
    return reply.code(401).send({ error: "unauthorized" });
  }

  const parsed = parseEngineFaultWebhookPayload(payloadObj);
  if (!parsed) {
    return reply.code(400).send({ error: "invalid_fault_payload" });
  }

  const result = await withLuciaBypass(async (client) =>
    handleEngineFaultEvent(client, operatingCompanyId, parsed)
  );

  req.log.info(
    {
      operating_company_id: operatingCompanyId,
      samsara_event_id: parsed.samsara_event_id,
      spn_code: parsed.spn_code,
      severity: parsed.severity,
      action: result.action,
      auto_wo_uuid: result.auto_wo_uuid,
    },
    "engine_fault_webhook_handled"
  );

  return reply.code(200).send({
    ok: true as const,
    action: result.action,
    event_uuid: result.event_uuid,
    auto_wo_uuid: result.auto_wo_uuid,
  });
}

export async function registerSamsaraEngineFaultRoutes(app: FastifyInstance) {
  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });
    scoped.post(WEBHOOK_PATH, handleEngineFaultWebhookPost);
  });
}
