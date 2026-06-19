import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { syncSamsaraVehicleLocations, syncSamsaraVehicleStats } from "../integrations/samsara/samsara-positions.service.js";
import { syncFromSamsara } from "../integrations/samsara/vehicle-driver-pairing/pairing.service.js";
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
                continue; // one bad tenant must not abort the whole tick (every later tenant + all syncs)
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

              // HEARTBEAT — proves the */5 tick is actually FIRING and reached this enabled tenant,
              // independent of any Samsara call succeeding. A fresh integration_sync_log row (kind
              // 'samsara_cron_tick') => the scheduler is alive; a stale one => the cron itself isn't firing
              // (a deploy/registration problem, upstream of any sync-body fix). Best-effort; never aborts.
              await client
                .query(
                  `
                    INSERT INTO integrations.integration_sync_log
                      (operating_company_id, integration, sync_kind, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
                    VALUES ($1, 'samsara', 'samsara_cron_tick', now(), true, 0, 0, 0, NULL, '{}'::jsonb)
                  `,
                  [operatingCompanyId]
                )
                .catch((err) => app.log.warn({ operating_company_id: operatingCompanyId, err }, "samsara cron heartbeat write failed"));

              // Each Samsara call is INDEPENDENT — a failure in one must never skip the others. The lat/lng
              // call is wrapped too: an unwrapped throw here would abort the whole tick (and every later
              // tenant) before stats/pairing ran — invisibly, via wrapBackgroundJobTick.
              let stats = { fetched: 0, inserted: 0, skipped_no_unit: 0, errors: [] as string[] };
              try {
                stats = await syncSamsaraVehicleLocations(client, operatingCompanyId);
                if (stats.errors.length > 0) {
                  await appendCronAuditEvent(client, "cron_samsara_positions_fetch_failed", "warning", {
                    cron_name: CRON_NAME,
                    operating_company_id: operatingCompanyId,
                    errors: stats.errors,
                  });
                  app.log.warn(
                    { operating_company_id: operatingCompanyId, errors: stats.errors },
                    "Samsara positions cron fetch failed for tenant; stats + pairing still attempted"
                  );
                }
              } catch (err) {
                app.log.warn({ operating_company_id: operatingCompanyId, err }, "Samsara lat/lng poll threw; stats + pairing still attempted");
              }

              // Enrich with reverseGeo city/state. Wrapped so a throw can't abort the tick before pairing.
              let statsEnrich = { fetched: 0, positions_inserted: 0, drivers_paired: 0, skipped_no_unit: 0, errors: [] as string[] };
              try {
                statsEnrich = await syncSamsaraVehicleStats(client, operatingCompanyId);
                if (statsEnrich.errors.length > 0) {
                  await appendCronAuditEvent(client, "cron_samsara_stats_enrich_failed", "warning", {
                    cron_name: CRON_NAME,
                    operating_company_id: operatingCompanyId,
                    errors: statsEnrich.errors,
                  });
                  app.log.warn(
                    { operating_company_id: operatingCompanyId, errors: statsEnrich.errors },
                    "Samsara stats enrichment failed for tenant; pairing still attempted"
                  );
                }
              } catch (err) {
                app.log.warn({ operating_company_id: operatingCompanyId, err }, "Samsara stats enrichment threw; pairing still attempted");
              }

              // Current logged-in driver per vehicle (Jorge's rule) — ALWAYS runs (independent of the above),
              // from /fleet/vehicles/driver-assignments, persisted into telematics.vehicle_driver_assignments.
              // syncFromSamsara now logs success/error to integration_sync_log so this is never silent again.
              let driversPaired = 0;
              try {
                const pairing = await syncFromSamsara(client, operatingCompanyId, { lookbackHours: 1 });
                driversPaired = pairing.inserted + pairing.updated;
              } catch (err) {
                app.log.warn({ operating_company_id: operatingCompanyId, err }, "driver pairing sync failed; positions still succeeded");
              }

              app.log.info(
                {
                  operating_company_id: operatingCompanyId,
                  fetched: stats.fetched,
                  inserted: stats.inserted,
                  skipped_no_unit: stats.skipped_no_unit,
                  stats_fetched: statsEnrich.fetched,
                  stats_positions_inserted: statsEnrich.positions_inserted,
                  drivers_paired: driversPaired,
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
