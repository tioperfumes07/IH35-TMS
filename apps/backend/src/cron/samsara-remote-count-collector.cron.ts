import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { collectSamsaraRemoteCounts } from "../integrations/samsara/remote-count-collector.js";

let initialized = false;
const CRON_NAME = "samsara.remote_count_collector";

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
    "DS-REMEDIATE-9",
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

export function initializeSamsaraRemoteCountCollectorCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.SAMSARA_REMOTE_COUNT_COLLECTOR_ENABLED ?? "true").trim() === "false") {
    app.log.info("Samsara remote count collector disabled via SAMSARA_REMOTE_COUNT_COLLECTOR_ENABLED=false");
    return;
  }

  cron.schedule(
    "5 */12 * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await withLuciaBypass(async (client) => {
            const activeTenantIds = await listActiveTenantIds(client);
            if (activeTenantIds.length === 0) {
              await appendCronAuditEvent(client, "cron_no_active_tenants", "info", {
                cron_name: CRON_NAME,
              });
              return;
            }

            for (const operatingCompanyId of activeTenantIds) {
              assertTenantContext(operatingCompanyId, CRON_NAME);
              await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
              const enabled = await isSamsaraEnabledForTenant(client, operatingCompanyId);
              if (!enabled) {
                await appendCronAuditEvent(client, "cron_skipped_samsara_disabled", "info", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                });
                continue;
              }

              const result = await collectSamsaraRemoteCounts(operatingCompanyId, {
                collectionRunId: randomUUID(),
              });
              app.log.info(
                {
                  operating_company_id: result.operating_company_id,
                  collection_run_id: result.collection_run_id,
                  collected_count: result.collected_count,
                  failed_entities: result.failed_entities,
                },
                "[SAMSARA_REMOTE_COUNT_COLLECTOR] company tick finished"
              );
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara remote count collector cron scheduled (every 12h at :05, America/Chicago)");
}
