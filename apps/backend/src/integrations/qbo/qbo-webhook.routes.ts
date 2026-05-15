import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../../auth/db.js";
import { verifyIntuitWebhookSignature } from "./qbo-webhook-signature.js";

type EventNotification = {
  realmId?: string;
  dataChangeEvent?: {
    entities?: Array<{ name?: string; id?: string; operation?: string; lastUpdated?: string }>;
  };
};

/** Scoped webhook routes — JSON parsed as Buffer for HMAC verification (matches Plaid/Samsara pattern). */
export async function registerQboWebhookRoutes(app: FastifyInstance) {
  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post("/api/v1/integrations/qbo/webhook", async (req, reply) => {
      const verifier = (process.env.QBO_WEBHOOK_VERIFIER ?? "").trim();
      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody)) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const signatureHeaderRaw = req.headers["intuit-signature"] ?? req.headers["Intuit-Signature"];
      const signatureHeader = Array.isArray(signatureHeaderRaw) ? signatureHeaderRaw[0] : signatureHeaderRaw;

      const verified = verifier ? verifyIntuitWebhookSignature(rawBody, verifier, signatureHeader) : false;
      if (verifier && !verified) {
        return reply.code(401).send({ error: "invalid_signature" });
      }

      let parsed: { eventNotifications?: EventNotification[] };
      try {
        parsed = JSON.parse(rawBody.toString("utf8")) as { eventNotifications?: EventNotification[] };
      } catch {
        return reply.code(400).send({ error: "invalid_json" });
      }

      const notifications = parsed.eventNotifications ?? [];
      await withLuciaBypass(async (client) => {
        for (const n of notifications) {
          const realmId = String(n.realmId ?? "").trim();
          if (!realmId) continue;

          const companyRes = await client.query<{ operating_company_id: string }>(
            `
              SELECT operating_company_id
              FROM integrations.qbo_connections
              WHERE realm_id = $1
                AND revoked_at IS NULL
              ORDER BY COALESCE(last_used_at, last_refreshed_at, created_at) DESC NULLS LAST
              LIMIT 1
            `,
            [realmId]
          );
          const operatingCompanyId = companyRes.rows[0]?.operating_company_id;
          if (!operatingCompanyId) continue;

          for (const ent of n.dataChangeEvent?.entities ?? []) {
            const entityType = ent.name ?? null;
            const entityId = ent.id ?? null;
            if (!entityType || !entityId) continue;
            await client.query(
              `
                INSERT INTO integrations.qbo_inbound_events (
                  operating_company_id,
                  qbo_realm_id,
                  webhook_signature_valid,
                  qbo_event_type,
                  qbo_entity_type,
                  qbo_entity_id,
                  qbo_last_updated_at,
                  status,
                  payload_raw,
                  created_at,
                  updated_at
                )
                VALUES (
                  $1::uuid,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  COALESCE($7::timestamptz, NULL),
                  'received',
                  $8::jsonb,
                  now(),
                  now()
                )
              `,
              [
                operatingCompanyId,
                realmId,
                verifier ? verified : false,
                ent.operation ?? null,
                entityType,
                entityId,
                ent.lastUpdated ? String(ent.lastUpdated) : null,
                JSON.stringify({ envelope: ent, realm_id: realmId }),
              ]
            );
          }
        }
      });

      return reply.code(200).send({ ok: true });
    });
  });
}
