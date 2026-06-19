import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { syncSamsaraHosLogs } from "../integrations/samsara/samsara-hos-pull.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;
const CRON_NAME = "samsara.hos_pull_cron";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

async function appendCronAuditEvent(
  client: DbClient,
  eventClass: string,
  severity: "info" | "warning",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "GO-LIVE-HOS-PULL",
  ]);
}

async function listActiveTenantIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ operating_company_id: string }>(
    `SELECT id::text AS operating_company_id
       FROM org.companies
      WHERE is_active = true AND deactivated_at IS NULL
      ORDER BY id`
  );
  return res.rows.map((row) => row.operating_company_id);
}

async function isSamsaraEnabledForTenant(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  const res = await client.query<{ is_enabled: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM integrations.samsara_config
         WHERE operating_company_id = $1::uuid AND is_enabled = true
      ) AS is_enabled`,
    [operatingCompanyId]
  );
  return Boolean(res.rows[0]?.is_enabled);
}

export function initializeSamsaraHosPullCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SAMSARA_HOS_PULL_CRON === "false") {
    app.log.info("Samsara HOS pull cron disabled via ENABLE_SAMSARA_HOS_PULL_CRON=false");
    return;
  }

  cron.schedule(
    "15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          // ARCHITECTURE FIX (mirrors the positions cron #1211): never hold ONE DB transaction across the whole
          // tenant loop + every /fleet/hos/logs network fetch. That shape (connection held across network I/O)
          // stalled/rolled back the whole tick -> hos.duty_status_events stayed empty -> the fleet board showed
          // the 14h "fresh shift" HOS default for every driver (fabricated compliance). Instead: list tenants in
          // one short tx, then run EACH tenant's HOS pull in its OWN short tenant-scoped tx, recording the result
          // to integration_sync_log (sync_kind='samsara_hos_pull') so the probe can verify it committed. One
          // tenant failing can't roll back the others, and the observability row survives.
          const activeTenantIds = await withLuciaBypass((c) => listActiveTenantIds(c));
          if (activeTenantIds.length === 0) {
            await withLuciaBypass((c) => appendCronAuditEvent(c, "cron_no_active_tenants", "info", { cron_name: CRON_NAME })).catch(() => undefined);
            return;
          }

          // Short, tenant-scoped transaction (sets app.operating_company_id for RLS, then runs fn).
          const runScoped = <T>(oci: string, fn: (c: PoolClient) => Promise<T>): Promise<T> =>
            withLuciaBypass(async (c) => {
              await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oci]);
              return fn(c);
            });

          for (const operatingCompanyId of activeTenantIds) {
            try {
              assertTenantContext(operatingCompanyId, CRON_NAME);
            } catch (error) {
              await withLuciaBypass((c) =>
                appendCronAuditEvent(c, "cron_invalid_tenant_context", "warning", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId ?? null,
                  reason: String((error as Error)?.message ?? error),
                })
              ).catch(() => undefined);
              continue;
            }

            let enabled = false;
            try {
              enabled = await runScoped(operatingCompanyId, (c) => isSamsaraEnabledForTenant(c, operatingCompanyId));
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "samsara hos-pull enabled check failed");
            }
            if (!enabled) {
              await runScoped(operatingCompanyId, (c) =>
                appendCronAuditEvent(c, "cron_skipped_samsara_disabled", "info", { cron_name: CRON_NAME, operating_company_id: operatingCompanyId })
              ).catch(() => undefined);
              continue;
            }

            // The HOS pull + its observability row in ONE short tenant tx. syncSamsaraHosLogs never throws
            // (records its own fetch/driver errors), so the sync-log row always commits and the probe can read
            // inserted/mapped/unmapped/error to prove the HOS clocks are real (or pinpoint why they're not).
            try {
              await runScoped(operatingCompanyId, async (c) => {
                const stats = await syncSamsaraHosLogs(c, operatingCompanyId);
                await c.query(
                  `INSERT INTO integrations.integration_sync_log
                     (operating_company_id, integration, sync_kind, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
                   VALUES ($1, 'samsara', 'samsara_hos_pull', now(), $2, $3, 0, 0, $4, $5::jsonb)`,
                  [
                    operatingCompanyId,
                    stats.error == null && stats.driver_errors === 0,
                    stats.inserted,
                    stats.error,
                    JSON.stringify({
                      active_drivers: stats.active_drivers,
                      mapped_drivers: stats.mapped_drivers,
                      unmapped_drivers: stats.unmapped_drivers,
                      driver_errors: stats.driver_errors,
                      inserted: stats.inserted,
                    }),
                  ]
                );
                await appendCronAuditEvent(c, "cron_samsara_hos_pull_tick", "info", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                  ...stats,
                });
              });
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "samsara hos-pull tenant tick failed");
            }
          }
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara HOS pull cron scheduled (hourly at :15, America/Chicago)");
}
