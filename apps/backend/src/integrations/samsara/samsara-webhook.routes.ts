import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { extractSamsaraWebhookMeta } from "./samsara.service.js";
import { verifySamsaraWebhookSignature } from "./samsara-webhook-verify.js";

const SAMSARA_AUDIT_SOURCE = "P8C-M-SAMSARA-STUB";

const webhookQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerSamsaraWebhookRoutes(app: FastifyInstance) {
  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post("/api/v1/integrations/samsara/webhook", async (req, reply) => {
      const q = webhookQuerySchema.safeParse(req.query ?? {});
      if (!q.success) {
        return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
      }
      const operatingCompanyId = q.data.operating_company_id;
      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody)) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const secret = process.env.SAMSARA_WEBHOOK_SECRET?.trim();
      const sigOk = verifySamsaraWebhookSignature(rawBody, secret, req.headers as Record<string, string | string[] | undefined>);

      let payloadObj: Record<string, unknown> = {};
      try {
        payloadObj = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      } catch {
        payloadObj = { _parse_error: true };
      }

      const meta = extractSamsaraWebhookMeta(payloadObj);

      if (!sigOk) {
        await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
          await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "integrations.samsara_webhook_signature_invalid",
            "warning",
            JSON.stringify({ operating_company_id: operatingCompanyId, event_type: meta.event_type }),
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

      return reply.code(200).send({ ok: true as const });
    });
  });
}
