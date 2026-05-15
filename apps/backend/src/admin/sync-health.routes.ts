import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass, withCurrentUser } from "../auth/db.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { getLastCdcPollAtPerRealm } from "../integrations/qbo/qbo-cdc-poll-state.js";

const ownerAdmin = new Set(["Owner", "Administrator"]);

function gate(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { role?: string; uuid?: string } | undefined;
  if (!user?.role || !ownerAdmin.has(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { role: string; uuid: string };
}

const cache = createTtlCache<Record<string, unknown>>();
const CACHE_MS = 30_000;

export async function registerAdminSyncHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/sync/health", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const cached = cache.get("sync-health-dashboard");
    if (cached) return cached;

    const payload = await withLuciaBypass(async (client) => {
      const realmsRes = await client.query<{
        realm_id: string;
        operating_company_name: string | null;
        operating_company_id: string;
        token_expires_at: string | null;
        token_revoked_at: string | null;
        last_used_at: string | null;
      }>(
        `
          SELECT
            qc.realm_id::text AS realm_id,
            c.display_name AS operating_company_name,
            qc.operating_company_id::text AS operating_company_id,
            qc.access_token_expires_at::text AS token_expires_at,
            qc.revoked_at::text AS token_revoked_at,
            qc.last_used_at::text AS last_used_at
          FROM integrations.qbo_connections qc
          INNER JOIN org.companies c ON c.id = qc.operating_company_id
          WHERE qc.revoked_at IS NULL
          ORDER BY qc.realm_id ASC
        `
      );

      const realms = [];
      for (const row of realmsRes.rows) {
        const oc = row.operating_company_id;
        const realm = row.realm_id;

        const wh = await client.query<{ t: string | null }>(
          `
            SELECT MAX(received_at)::text AS t
            FROM integrations.qbo_inbound_events
            WHERE qbo_realm_id = $1 AND webhook_signature_valid = true
          `,
          [realm]
        );
        const applied = await client.query<{ t: string | null }>(
          `
            SELECT MAX(applied_at)::text AS t
            FROM integrations.qbo_inbound_events
            WHERE qbo_realm_id = $1 AND status = 'applied'
          `,
          [realm]
        );
        const outbound = await client.query<{ t: string | null }>(
          `
            SELECT MAX(synced_at)::text AS t
            FROM integrations.qbo_sync_queue
            WHERE qbo_realm_id = $1 AND sync_status = 'synced'
          `,
          [realm]
        );
        const pend = await client.query<{ c: string }>(
          `
            SELECT COUNT(*)::text AS c
            FROM integrations.qbo_sync_queue
            WHERE qbo_realm_id = $1 AND sync_status IN ('pending','in_flight')
          `,
          [realm]
        );
        const dead = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM integrations.qbo_sync_queue WHERE operating_company_id = $1::uuid AND sync_status = 'dead_letter'`,
          [oc]
        );
        const conflicts = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM integrations.qbo_sync_conflicts WHERE operating_company_id = $1::uuid AND resolved_at IS NULL`,
          [oc]
        );
        const conflictsHi = await client.query<{ c: string }>(
          `
            SELECT COUNT(*)::text AS c
            FROM integrations.qbo_sync_conflicts
            WHERE operating_company_id = $1::uuid AND resolved_at IS NULL AND severity = 'high'
          `,
          [oc]
        );

        realms.push({
          realm_id: realm,
          operating_company_name: row.operating_company_name,
          token_expires_at: row.token_expires_at,
          token_revoked_at: row.token_revoked_at,
          last_used_at: row.last_used_at,
          last_webhook_received_at: wh.rows[0]?.t ?? null,
          last_inbound_applied_at: applied.rows[0]?.t ?? null,
          last_outbound_synced_at: outbound.rows[0]?.t ?? null,
          pending_outbound_count: Number(pend.rows[0]?.c ?? 0),
          dead_letter_count: Number(dead.rows[0]?.c ?? 0),
          unresolved_conflicts_count: Number(conflicts.rows[0]?.c ?? 0),
          conflict_severity_high_count: Number(conflictsHi.rows[0]?.c ?? 0),
        });
      }

      const recurringDue = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM accounting.recurring_templates WHERE is_active = true AND next_run_at <= now()`
      );

      const nextClose = await client.query<{
        operating_company_id: string | null;
        operating_company_name: string | null;
        period_end: string | null;
        fiscal_year: number | null;
      }>(
        `
          SELECT
            p.operating_company_id::text AS operating_company_id,
            c.display_name AS operating_company_name,
            p.period_end::text AS period_end,
            p.fiscal_year::int AS fiscal_year
          FROM accounting.periods p
          INNER JOIN org.companies c ON c.id = p.operating_company_id
          WHERE p.status = 'open'
          ORDER BY p.period_end ASC
          LIMIT 1
        `
      );

      const nextPeriodCloseCompany = nextClose.rows[0]
        ? {
            operating_company_id: nextClose.rows[0].operating_company_id,
            operating_company_name: nextClose.rows[0].operating_company_name,
            period_end: nextClose.rows[0].period_end,
            fiscal_year: nextClose.rows[0].fiscal_year,
          }
        : null;

      return {
        realms,
        last_cdc_poll_at_per_realm: getLastCdcPollAtPerRealm(),
        recurring_templates_due_now: Number(recurringDue.rows[0]?.c ?? 0),
        next_period_close_company: nextPeriodCloseCompany,
      };
    });

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`, [
        "integrations.admin.sync_health_viewed",
        "info",
        JSON.stringify({ realm_count: (payload.realms as unknown[]).length }),
        user.uuid,
        "P7-W2-SYNC-ADMIN",
      ]);
    });

    cache.set("sync-health-dashboard", payload, CACHE_MS);
    return payload;
  });
}
