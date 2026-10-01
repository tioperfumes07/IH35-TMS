import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../../auth/db.js";
import { extractSamsaraWebhookMeta, resolveSamsaraWebhookSigningSecret } from "./samsara.service.js";
import { verifySamsaraWebhookSignature } from "./samsara-webhook-verify.js";

const SAMSARA_AUDIT_SOURCE = "SMS-FIX-2-WEBHOOKS";

const webhookQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

/**
 * ROUND 313 E-13 — 0 rows EVER: Samsara's webhook "IH35-TMS" (GeofenceEntry/GeofenceExit) posts to
 * /api/v1/integrations/samsara/webhook WITHOUT ?operating_company_id=, so every delivery got a 400 before the
 * signature was even read. One Samsara org = one webhook, so the tenant comes from the payload when the URL has
 * none: payload.orgId matched to integrations.samsara_config.samsara_org_id, else the ONE enabled Samsara config.
 * The orgId read here is untrusted -- it only selects whose signing secret to check; nothing is stored unless the
 * signature verifies against that company's secret.
 */
async function resolveWebhookCompany(rawBody: Buffer, fromQuery: string | undefined): Promise<string | null> {
  if (fromQuery) return fromQuery;
  let orgId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    orgId = parsed.orgId != null ? String(parsed.orgId) : null;
  } catch {
    orgId = null;
  }
  return withLuciaBypass(async (client) => {
    const rows = await client.query<{ operating_company_id: string; samsara_org_id: string | null }>(
      `SELECT operating_company_id::text, samsara_org_id::text FROM integrations.samsara_config WHERE is_enabled = true`
    );
    const byOrg = orgId ? rows.rows.filter((r) => r.samsara_org_id === orgId) : [];
    if (byOrg.length === 1) return byOrg[0].operating_company_id;
    return rows.rows.length === 1 ? rows.rows[0].operating_company_id : null;
  });
}

const WEBHOOK_PATHS = [
  "/api/v1/integrations/samsara/webhook",
  "/api/v1/samsara/webhooks",
] as const;

// Per-IP rate limit (H4-2): webhook endpoints are unauthenticated ingress; cap request volume so a
// forged/replayed flood cannot DoS the DB or audit log. Generous enough for Samsara's real event rate.
const SAMSARA_WEBHOOK_RATE_LIMIT = { max: 240, timeWindow: "1 minute" } as const;

async function handleSamsaraWebhookPost(req: FastifyRequest, reply: FastifyReply) {
  const q = webhookQuerySchema.safeParse(req.query ?? {});
  if (!q.success) {
    return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
  }
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    return reply.code(400).send({ error: "invalid_body" });
  }
  const operatingCompanyId = await resolveWebhookCompany(rawBody, q.data.operating_company_id);
  if (!operatingCompanyId) {
    return reply.code(400).send({ error: "samsara_org_not_configured" });
  }

  req.log.info(
    {
      operating_company_id: operatingCompanyId,
      path: req.url,
      bytes: rawBody.length,
    },
    "samsara_webhook_ingress"
  );

  // H4-2 REJECT-BEFORE-PERSIST: verify the Samsara v1 signature + timestamp freshness against the
  // RAW body BEFORE parsing or writing anything. An unverified request must never have its
  // attacker-supplied payload persisted to integrations.samsara_webhook_events.
  const secret = await withLuciaBypass((client) =>
    resolveSamsaraWebhookSigningSecret(client, operatingCompanyId)
  );
  const verify = verifySamsaraWebhookSignature(
    rawBody,
    secret,
    req.headers as Record<string, string | string[] | undefined>
  );

  if (!verify.ok) {
    // Bounded security audit ONLY — no attacker payload is stored, and it is best-effort so a
    // failed audit write never turns a rejected request into a 500.
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
        "integrations.samsara_webhook_signature_invalid",
        "warning",
        JSON.stringify({
          operating_company_id: operatingCompanyId,
          reason: verify.reason,
          secret_source: secret ? "configured" : "missing",
          bytes: rawBody.length,
        }),
        SAMSARA_AUDIT_SOURCE,
      ]);
    }).catch((err) => {
      req.log.warn({ err, operating_company_id: operatingCompanyId }, "samsara_webhook_reject_audit_failed");
    });
    return reply.code(401).send({ error: "unauthorized" });
  }

  // Signature + freshness verified — now it is safe to parse and persist the payload.
  let payloadObj: Record<string, unknown> = {};
  try {
    payloadObj = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    payloadObj = { _parse_error: true };
  }
  const meta = extractSamsaraWebhookMeta(payloadObj);

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
      scoped.post(mountPath, { config: { rateLimit: SAMSARA_WEBHOOK_RATE_LIMIT } }, handleSamsaraWebhookPost);
    }
  });
}
