import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { syncSamsaraVehicleLocations, syncSamsaraVehicleStats } from "../integrations/samsara/samsara-positions.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

let initialized = false;
const CRON_NAME = "samsara.positions_cron";

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

export function initializeSamsaraPositionsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SAMSARA_POSITIONS_CRON === "false") {
    app.log.info("Samsara positions cron disabled via ENABLE_SAMSARA_POSITIONS_CRON=false");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
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

              const stats = await syncSamsaraVehicleLocations(client, operatingCompanyId);
              if (stats.errors.length > 0) {
                await appendCronAuditEvent(client, "cron_samsara_positions_fetch_failed", "warning", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                  errors: stats.errors,
                });
                app.log.warn(
                  { operating_company_id: operatingCompanyId, errors: stats.errors },
                  "Samsara positions cron fetch failed for tenant; will retry on next tick"
                );
                continue;
              }

              // Enrich with reverseGeo city/state + current driver pairing from /fleet/vehicles/stats.
              // Best-effort: a stats failure must NOT fail the proven lat/lng poll above. Runs after it so
              // the city/state-bearing event is the freshest in vehicle_latest_position.
              const statsEnrich = await syncSamsaraVehicleStats(client, operatingCompanyId);
              if (statsEnrich.errors.length > 0) {
                await appendCronAuditEvent(client, "cron_samsara_stats_enrich_failed", "warning", {
                  cron_name: CRON_NAME,
                  operating_company_id: operatingCompanyId,
                  errors: statsEnrich.errors,
                });
                app.log.warn(
                  { operating_company_id: operatingCompanyId, errors: statsEnrich.errors },
                  "Samsara stats enrichment failed for tenant; lat/lng poll still succeeded"
                );
              }

              app.log.info(
                {
                  operating_company_id: operatingCompanyId,
                  fetched: stats.fetched,
                  inserted: stats.inserted,
                  skipped_no_unit: stats.skipped_no_unit,
                  stats_fetched: statsEnrich.fetched,
                  stats_positions_inserted: statsEnrich.positions_inserted,
                  drivers_paired: statsEnrich.drivers_paired,
                },
                "Samsara positions cron tick complete"
              );
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara positions cron scheduled (every 5 minutes, America/Chicago)");
}
