import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";
import { withSavepoint } from "../../auth/db.js";

// GO-LIVE-HOS — read-only diagnostics for the Samsara HOS feed. Tells the operator WHICH of the 3
// gates is closed (flag / token / driver-mapping) so the empty `hos.duty_status_events` can be fixed
// without guessing. NO SECRETS: token state is a boolean only — the token value is never read or
// returned. Per-entity scoped via withCompanyScope (assertCompanyMembership + app.operating_company_id),
// so TRANSP only ever sees TRANSP. Pure read; no writes.

const querySchema = z.object({ operating_company_id: z.string().uuid() });

// Env-token fallback used by SamsaraClient.effectiveToken (SAMSARA_API_TOKEN/_API_KEY/_TOKEN).
// Presence only — never the value.
function envTokenPresent(): boolean {
  return Boolean(
    process.env.SAMSARA_API_TOKEN?.trim() ||
      process.env.SAMSARA_API_KEY?.trim() ||
      process.env.SAMSARA_TOKEN?.trim()
  );
}

type ReadinessClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function registerSamsaraHosReadinessRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/hos-readiness", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const oci = q.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, oci, async (client: ReadinessClient) => {
      // Gate 1 (flag) + Gate 2 (token presence). The token columns are bytea — we SELECT only a
      // boolean IS NOT NULL, never the bytes, so no secret can leak through this endpoint.
      const cfg = await client.query<{ is_enabled?: boolean; has_tenant_token?: boolean }>(
        `SELECT is_enabled,
                (encrypted_api_token IS NOT NULL OR api_token_encrypted IS NOT NULL) AS has_tenant_token
           FROM integrations.samsara_config
          WHERE operating_company_id = $1::uuid
          LIMIT 1`,
        [oci]
      );
      const cfgRow = cfg.rows[0];
      const isEnabled = Boolean(cfgRow?.is_enabled);
      const tokenPresent = Boolean(cfgRow?.has_tenant_token) || envTokenPresent();

      // Gate 3 (driver mapping): how many Samsara drivers are linked to a local mdata.drivers row.
      const drv = await client.query<{ mapped?: number; unmapped?: number }>(
        `SELECT count(*) FILTER (WHERE local_driver_id IS NOT NULL)::int AS mapped,
                count(*) FILTER (WHERE local_driver_id IS NULL)::int  AS unmapped
           FROM integrations.samsara_drivers
          WHERE operating_company_id = $1::uuid`,
        [oci]
      );
      const drvRow = drv.rows[0];

      // Latest cron tick / disabled-skip for this tenant (read-only; degrade to null on any error).
      const lastPull = await withSavepoint(
        client,
        "hos_readiness_last_pull",
        async () => {
          const last = await client.query<{ created_at?: string; event_class?: string; payload?: Record<string, unknown> }>(
            `SELECT created_at, event_class, payload
               FROM audit.audit_events
              WHERE event_class IN ('cron_samsara_hos_pull_tick', 'cron_skipped_samsara_disabled')
                AND payload->>'operating_company_id' = $1
              ORDER BY created_at DESC
              LIMIT 1`,
            [oci]
          );
          const row = last.rows[0];
          if (!row) return null;
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          return {
            ran_at: row.created_at ?? null,
            inserted: Number(payload.inserted ?? 0),
            mapped_drivers: Number(payload.mapped_drivers ?? 0),
            unmapped_drivers: Number(payload.unmapped_drivers ?? 0),
            skip_reason: row.event_class === "cron_skipped_samsara_disabled" ? "samsara_disabled" : null,
          };
        },
        null
      );

      return {
        operating_company_id: oci,
        is_enabled: isEnabled,
        token_present: tokenPresent,
        mapped_driver_count: Number(drvRow?.mapped ?? 0),
        unmapped_driver_count: Number(drvRow?.unmapped ?? 0),
        last_pull: lastPull,
      };
    });

    return reply.send(result);
  });
}
