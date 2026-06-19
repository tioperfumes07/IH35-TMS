import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
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
          // ARCHITECTURE FIX: never hold ONE DB transaction across the whole tick + all Samsara network
          // I/O (the old shape — connection-pool exhaustion / idle-in-transaction termination → the whole
          // tick rolled back → nothing persisted, last_samsara_sync + heartbeat frozen). Instead: list
          // tenants in a short tx, then run EACH operation in its OWN short, tenant-scoped transaction.
          // Network fetches are bounded by samsaraFetch() timeouts, so no tx is held long. One operation
          // failing can't roll back the others, and committed writes (incl. the heartbeat) survive.
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

            // Heartbeat + enabled check in ONE committed tx — the heartbeat proves the */5 tick fired and
            // reached this tenant even if every sync below fails (it can't be lost to a later rollback).
            let enabled = false;
            try {
              enabled = await runScoped(operatingCompanyId, async (c) => {
                await c.query(
                  `INSERT INTO integrations.integration_sync_log
                     (operating_company_id, integration, sync_kind, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
                   VALUES ($1, 'samsara', 'samsara_cron_tick', now(), true, 0, 0, 0, NULL, '{}'::jsonb)`,
                  [operatingCompanyId]
                );
                return isSamsaraEnabledForTenant(c, operatingCompanyId);
              });
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "samsara cron heartbeat/enabled tx failed");
            }
            if (!enabled) {
              await runScoped(operatingCompanyId, (c) =>
                appendCronAuditEvent(c, "cron_skipped_samsara_disabled", "info", { cron_name: CRON_NAME, operating_company_id: operatingCompanyId })
              ).catch(() => undefined);
              continue;
            }

            // Each Samsara sync in its OWN short tx — fetch bounded by timeout, writes commit independently.
            try {
              const r = await runScoped(operatingCompanyId, (c) => syncSamsaraVehicleLocations(c, operatingCompanyId));
              if (r.errors.length > 0) {
                await runScoped(operatingCompanyId, (c) =>
                  appendCronAuditEvent(c, "cron_samsara_positions_fetch_failed", "warning", { cron_name: CRON_NAME, operating_company_id: operatingCompanyId, errors: r.errors })
                ).catch(() => undefined);
                app.log.warn({ operating_company_id: operatingCompanyId, errors: r.errors }, "Samsara lat/lng poll errors; stats + pairing still attempted");
              }
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "Samsara lat/lng poll failed; stats + pairing still attempted");
            }
            try {
              const r = await runScoped(operatingCompanyId, (c) => syncSamsaraVehicleStats(c, operatingCompanyId));
              if (r.errors.length > 0) {
                await runScoped(operatingCompanyId, (c) =>
                  appendCronAuditEvent(c, "cron_samsara_stats_enrich_failed", "warning", { cron_name: CRON_NAME, operating_company_id: operatingCompanyId, errors: r.errors })
                ).catch(() => undefined);
                app.log.warn({ operating_company_id: operatingCompanyId, errors: r.errors }, "Samsara stats enrichment errors; pairing still attempted");
              }
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "Samsara stats enrichment failed; pairing still attempted");
            }
            try {
              const pairing = await runScoped(operatingCompanyId, (c) => syncFromSamsara(c, operatingCompanyId, { lookbackHours: 1 }));
              app.log.info({ operating_company_id: operatingCompanyId, drivers_paired: pairing.inserted + pairing.updated }, "Samsara positions cron tick complete");
            } catch (err) {
              app.log.warn({ operating_company_id: operatingCompanyId, err }, "driver pairing sync failed");
            }
          }
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Samsara positions cron scheduled (every 5 minutes, America/Chicago)");
}
