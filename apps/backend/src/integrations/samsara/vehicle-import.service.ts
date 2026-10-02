/**
 * ENGINE: DS-4 Samsara vehicle import — links Samsara vehicles to mdata.units (master sync), seeds the samsara_vehicles mirror from mdata.equipment when empty, stamps config health
 * SCHEDULE: on demand — integrations/samsara/daily-sync-job.ts (setTimeout ~10:00 UTC daily, first run 120s after boot)
 * WRITES: mdata.units + integrations.integration_sync_log (via samsara-master-sync.service.ts:syncSamsaraVehiclesMaster), integrations.samsara_vehicles, integrations.samsara_config; external: Samsara list vehicles (read)
 * IDEMPOTENCY: UNIQUE(operating_company_id, samsara_vehicle_id) ON CONFLICT (samsara_vehicles UNIQUE, migration 0137); master sync under ADVISORY LOCK samsara_master_sync:vehicles:<company>
 * OVERLAP: the second master sync fails pg_try_advisory_xact_lock and skips; fallback upserts converge on the same mirror rows
 * REVERSE: NOT-A-DOCUMENT — a master-data link / mirror refresh; the next sync re-derives it
 * NEVER: must never create mdata.units or mdata.equipment rows and never overwrite a unit's set samsara_vehicle_id — link-only
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import { fetchTier3FiveMinutes } from "./cache/tier3-5min.js";
import { syncSamsaraVehiclesMaster } from "./samsara-master-sync.service.js";
import type { PgClient } from "./samsara.service.js";

/** DS-4: Import Samsara vehicles into integrations.samsara_vehicles via master sync + projection upsert. */
export async function importSamsaraVehicles(client: PgClient, operatingCompanyId: string) {
  const { value: stats } = await fetchTier3FiveMinutes(`ds4:vehicles:${operatingCompanyId}`, async () =>
    syncSamsaraVehiclesMaster(client, operatingCompanyId)
  );
  const mirror = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  let imported = Number((mirror.rows[0] as { cnt?: number })?.cnt ?? 0);
  if (imported === 0) {
    const equip = await client.query(
      `SELECT samsara_vehicle_id, jsonb_build_object('id', samsara_vehicle_id) AS raw
       FROM mdata.equipment
       WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
         AND samsara_vehicle_id IS NOT NULL
       LIMIT 500`,
      [operatingCompanyId]
    );
    for (const row of equip.rows as Array<{ samsara_vehicle_id: string; raw: Record<string, unknown> }>) {
      if (!row.samsara_vehicle_id) continue;
      await client.query(
        `INSERT INTO integrations.samsara_vehicles (operating_company_id, samsara_vehicle_id, raw_payload, last_seen_at)
         VALUES ($1::uuid,$2,$3::jsonb,now())
         ON CONFLICT (operating_company_id, samsara_vehicle_id) DO UPDATE SET last_seen_at = now()`,
        [operatingCompanyId, row.samsara_vehicle_id, JSON.stringify(row.raw)]
      );
      imported += 1;
    }
  }
  await client.query(
    // ROUND 337: 'ok', not 'green' — samsara_config_last_health_status_check allows ok / auth_failed / rate_limited /
    // transient_error / not_configured; 'green' failed the CHECK and rolled back the whole daily sync on both instances
    // (prod log 2026-10-02 23:13Z, every run).
    `UPDATE integrations.samsara_config SET last_health_check_at = now(), last_health_status = 'ok' WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  return { imported, master_sync: stats };
}
