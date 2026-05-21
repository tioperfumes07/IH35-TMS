import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;
const CRON_NAME = "qbo.sync_alerts_cron";

async function appendCronAuditEvent(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  eventClass: string,
  severity: "info" | "warning",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "DS-REMEDIATE-6",
  ]);
}

export function initializeQboSyncAlertsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.QBO_SYNC_RETRY_ENABLED !== "true") {
    app.log.info("QBO sync alerts retry cron disabled (set QBO_SYNC_RETRY_ENABLED=true to enable)");
    return;
  }

  cron.schedule("*/5 * * * *", async () => {
    await wrapBackgroundJobTick(
      CRON_NAME,
      async () => {
        await withLuciaBypass(async (client) => {
          const exists = await client.query(`SELECT to_regclass('qbo.sync_alerts') IS NOT NULL AS ok`);
          if (!exists.rows[0]?.ok) return;

          const due = await client.query<{
            id: string;
            operating_company_id: string;
            retry_count: number;
            max_retries: number;
          }>(
            `
            SELECT id, operating_company_id, retry_count, max_retries
            FROM qbo.sync_alerts
            WHERE resolved_at IS NULL
              AND next_retry_at IS NOT NULL
              AND next_retry_at <= now()
              AND retry_count < max_retries
            ORDER BY next_retry_at ASC
            LIMIT 50
            FOR UPDATE SKIP LOCKED
          `
          );

          for (const row of due.rows) {
            const operatingCompanyId = row.operating_company_id;
            try {
              assertTenantContext(operatingCompanyId, CRON_NAME);
            } catch (error) {
              await appendCronAuditEvent(client, "cron_invalid_tenant_context", "warning", {
                cron_name: CRON_NAME,
                operating_company_id: operatingCompanyId ?? null,
                reason: String((error as Error)?.message ?? error),
              });
              throw error;
            }
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

            const nextRetryCount = Number(row.retry_count ?? 0) + 1;
            const baseMinutes = 5 * 2 ** Math.max(0, nextRetryCount - 1);

            if (nextRetryCount >= Number(row.max_retries ?? 3)) {
              await client.query(
                `
                UPDATE qbo.sync_alerts
                SET retry_count = $2,
                    next_retry_at = NULL,
                    severity = 'critical',
                    resolved_at = NULL
                WHERE id = $1
              `,
                [row.id, nextRetryCount]
              );

              await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
                "qbo.sync.escalated",
                JSON.stringify({ alert_id: row.id, operating_company_id: operatingCompanyId }),
              ]);
              continue;
            }

            await client.query(
              `
              UPDATE qbo.sync_alerts
              SET retry_count = $2,
                  next_retry_at = now() + ($3::int * interval '1 minute')
              WHERE id = $1
            `,
              [row.id, nextRetryCount, baseMinutes]
            );

            await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
              "qbo.sync.retry_scheduled",
              JSON.stringify({
                alert_id: row.id,
                operating_company_id: operatingCompanyId,
                retry_count: nextRetryCount,
                next_backoff_minutes: baseMinutes,
              }),
            ]);
          }
        });
      },
      app.log
    );
  });

  app.log.info("QBO sync alerts cron scheduled (every 5 minutes; retry bookkeeping only unless extended)");
}
