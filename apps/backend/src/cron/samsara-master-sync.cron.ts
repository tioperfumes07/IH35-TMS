import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { syncSamsaraDriversMaster, syncSamsaraVehiclesMaster, syncSamsaraTrailersMaster } from "../integrations/samsara/samsara-master-sync.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;
const CRON_NAME = "samsara.master_sync_cron";

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
    "DS-REMEDIATE-6",
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

export function initializeSamsaraMasterSyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SAMSARA_MASTER_SYNC_CRON === "false") {
    app.log.info("Samsara master sync cron disabled via ENABLE_SAMSARA_MASTER_SYNC_CRON=false");
    return;
  }

  cron.schedule(
    "30 * * * *",
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
              // The whole tick runs inside one withLuciaBypass BEGIN..COMMIT, so a DB
              // error in any single sync (e.g. a VIN collision in the vehicle upsert)
              // would abort the transaction and skip the rest. Isolate each sync in a
              // SAVEPOINT so one failure can't take down the others.
              const syncs: Array<{ name: string; run: () => Promise<unknown> }> = [
                { name: "drivers", run: () => syncSamsaraDriversMaster(client, operatingCompanyId) },
                { name: "vehicles", run: () => syncSamsaraVehiclesMaster(client, operatingCompanyId) },
                { name: "trailers", run: () => syncSamsaraTrailersMaster(client, operatingCompanyId) },
              ];
              for (const sync of syncs) {
                await client.query(`SAVEPOINT samsara_${sync.name}`);
                try {
                  await sync.run();
                  await client.query(`RELEASE SAVEPOINT samsara_${sync.name}`);
                } catch (error) {
                  await client.query(`ROLLBACK TO SAVEPOINT samsara_${sync.name}`).catch(() => {});
                  await appendCronAuditEvent(client, "cron_sync_failed", "warning", {
                    cron_name: CRON_NAME,
                    operating_company_id: operatingCompanyId,
                    sync: sync.name,
                    reason: String((error as Error)?.message ?? error),
                  });
                }
              }
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara master sync cron scheduled (hourly at :30, America/Chicago)");
}
