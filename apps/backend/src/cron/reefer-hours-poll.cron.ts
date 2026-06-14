import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { ingestReeferHoursFromSamsaraForCompany } from "../maintenance/reefer-hours.routes.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

// Block F — 15-minute poller that pulls reefer engine hours from Samsara for every
// active tenant. The ingest itself (ingestReeferHoursFromSamsaraForCompany) already
// existed and was only reachable via a manual POST; this wires it to a schedule.

let initialized = false;
const CRON_NAME = "maintenance.reefer_hours_poll_cron";

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
    "BLOCK-F-REEFER-POLL",
  ]);
}

async function listActiveTenantIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ operating_company_id: string }>(
    `
      SELECT id::text AS operating_company_id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return res.rows.map((row) => row.operating_company_id);
}

async function isSamsaraEnabledForTenant(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  const res = await client.query<{ is_enabled: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM integrations.samsara_config
        WHERE operating_company_id = $1::uuid
          AND is_enabled = true
      ) AS is_enabled
    `,
    [operatingCompanyId]
  );
  return Boolean(res.rows[0]?.is_enabled);
}

export function initializeReeferHoursPollCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_REEFER_HOURS_POLL_CRON === "false") {
    app.log.info("Reefer hours poll cron disabled via ENABLE_REEFER_HOURS_POLL_CRON=false");
    return;
  }

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await withLuciaBypass(async (client) => {
            const dbClient = client as unknown as DbClient;
            const activeTenantIds = await listActiveTenantIds(dbClient);
            if (activeTenantIds.length === 0) {
              await appendCronAuditEvent(dbClient, "cron_no_active_tenants", "info", { cron_name: CRON_NAME });
              return;
            }

            for (const operatingCompanyId of activeTenantIds) {
              try {
                assertTenantContext(operatingCompanyId, CRON_NAME);
              } catch (error) {
                await appendCronAuditEvent(dbClient, "cron_invalid_tenant_context", "warning", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId ?? null,
                  reason: String((error as Error)?.message ?? error),
                });
                throw error;
              }

              await dbClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
              const enabled = await isSamsaraEnabledForTenant(dbClient, operatingCompanyId);
              if (!enabled) {
                await appendCronAuditEvent(dbClient, "cron_skipped_samsara_disabled", "info", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                });
                continue;
              }

              try {
                const stats = await ingestReeferHoursFromSamsaraForCompany(dbClient, operatingCompanyId);
                await appendCronAuditEvent(dbClient, "cron_reefer_hours_ingested", "info", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                  ingested: stats.ingested,
                  skipped: stats.skipped,
                });
                app.log.info(
                  { operating_company_id: operatingCompanyId, ingested: stats.ingested, skipped: stats.skipped },
                  "Reefer hours poll cron tick complete"
                );
              } catch (error) {
                await appendCronAuditEvent(dbClient, "cron_reefer_hours_ingest_failed", "warning", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                  reason: String((error as Error)?.message ?? error),
                });
                app.log.warn(
                  { operating_company_id: operatingCompanyId, err: error },
                  "Reefer hours poll cron ingest failed for tenant; will retry on next tick"
                );
                continue;
              }
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Reefer hours poll cron scheduled (every 15 minutes, America/Chicago)");
}
