import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../../auth/db.js";
import { getEnvStatus, getRequiredEnvSpec, isFeatureDisabled } from "../../config/required-env.js";
import { verifyIntuitWebhookSignature } from "./qbo-webhook-signature.js";

type EventNotification = {
  realmId?: string;
  dataChangeEvent?: {
    entities?: Array<{ name?: string; id?: string; operation?: string; lastUpdated?: string }>;
  };
};

const DISABLED_RESPONSE = {
  error: "qbo_webhook_verifier_not_configured",
  detail:
    "QBO webhook signature verification is not configured. Set QBO_WEBHOOK_VERIFIER_TOKEN in production. Endpoint disabled per fail-closed policy.",
} as const;

function resolveVerifierToken() {
  const spec = getRequiredEnvSpec("QBO_WEBHOOK_VERIFIER_TOKEN");
  if (!spec) return "";
  const status = getEnvStatus(spec);
  return status.state === "present" ? status.value : "";
}

/** Scoped webhook routes — JSON parsed as Buffer for HMAC verification (matches Plaid/Samsara pattern). */
export async function registerQboWebhookRoutes(app: FastifyInstance) {
  const verifierToken = resolveVerifierToken();
  const featureDisabled = isFeatureDisabled("qbo_webhook_signature_verification");
  const endpointDisabled = featureDisabled || verifierToken.length === 0;

  if (endpointDisabled) {
    app.log.error(
      {
        event: "qbo_webhook_verifier_missing",
        env_name: "QBO_WEBHOOK_VERIFIER_TOKEN",
        feature: "qbo_webhook_signature_verification",
      },
      "QBO webhook route registered in fail-closed disabled mode"
    );
  }

  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post("/api/v1/qbo/webhook", async (req, reply) => {
      if (endpointDisabled) {
        return reply.code(503).send(DISABLED_RESPONSE);
      }

      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody)) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const signatureHeaderRaw = req.headers["intuit-signature"] ?? req.headers["Intuit-Signature"];
      const signatureHeader = Array.isArray(signatureHeaderRaw) ? signatureHeaderRaw[0] : signatureHeaderRaw;
      const verified = verifyIntuitWebhookSignature(rawBody, verifierToken, signatureHeader);
      if (!verified) {
        return reply.code(401).send({ error: "qbo_webhook_signature_invalid" });
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
                  true,
                  $3,
                  $4,
                  $5,
                  COALESCE($6::timestamptz, NULL),
                  'received',
                  $7::jsonb,
                  now(),
                  now()
                )
              `,
              [
                operatingCompanyId,
                realmId,
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
