import type { FastifyInstance } from "fastify";
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
          await withLuciaBypass(async (client) => {
            const activeTenantIds = await listActiveTenantIds(client);
            if (activeTenantIds.length === 0) {
              await appendCronAuditEvent(client, "cron_no_active_tenants", "info", { cron_name: CRON_NAME });
              return;
            }
            for (const operatingCompanyId of activeTenantIds) {
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
              const enabled = await isSamsaraEnabledForTenant(client, operatingCompanyId);
              if (!enabled) {
                await appendCronAuditEvent(client, "cron_skipped_samsara_disabled", "info", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                });
                continue;
              }
              const stats = await syncSamsaraHosLogs(client, operatingCompanyId);
              await appendCronAuditEvent(client, "cron_samsara_hos_pull_tick", "info", {
                cron_name: CRON_NAME,
                operating_company_id: operatingCompanyId,
                ...stats,
              });
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara HOS pull cron scheduled (hourly at :15, America/Chicago)");
}
