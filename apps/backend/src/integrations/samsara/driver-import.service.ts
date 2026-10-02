/**
 * ENGINE: DS-5 Samsara driver import — runs the link-only driver master sync, and seeds the integrations.samsara_drivers mirror from mdata.drivers.samsara_driver_id when the mirror is empty
 * SCHEDULE: daily ~04:00 CT (setTimeout to 10:00 UTC; first run 120 s after boot) via integrations/samsara/daily-sync-job.ts
 * WRITES: integrations.samsara_drivers; via syncSamsaraDriversMaster: mdata.drivers (fill-empty email / phone), integrations.integration_sync_log
 * IDEMPOTENCY: UNIQUE(operating_company_id, samsara_driver_id) ON CONFLICT DO UPDATE (migration 0137) on the mirror; master sync ADVISORY LOCK samsara_master_sync:drivers:<company>
 * OVERLAP: the twin's master sync fails the try-lock and skips; mirror seeding upserts the same rows (last_seen_at refreshed)
 * REVERSE: NOT-A-DOCUMENT — Samsara mirror rows and fill-empty contact fields
 * NEVER: must never create an mdata.drivers row or overwrite a non-empty driver name, phone or email
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import { fetchTier3FiveMinutes } from "./cache/tier3-5min.js";
import { syncSamsaraDriversMaster } from "./samsara-master-sync.service.js";
import type { PgClient } from "./samsara.service.js";

/** DS-5: Import Samsara drivers into integrations.samsara_drivers via master sync + projection upsert. */
export async function importSamsaraDrivers(client: PgClient, operatingCompanyId: string) {
  const { value: stats } = await fetchTier3FiveMinutes(`ds5:drivers:${operatingCompanyId}`, async () =>
    syncSamsaraDriversMaster(client, operatingCompanyId)
  );
  const mirror = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  let imported = Number((mirror.rows[0] as { cnt?: number })?.cnt ?? 0);
  if (imported === 0) {
    const drivers = await client.query(
      `SELECT samsara_driver_id FROM mdata.drivers
       WHERE operating_company_id = $1::uuid AND samsara_driver_id IS NOT NULL LIMIT 500`,
      [operatingCompanyId]
    );
    for (const row of drivers.rows as Array<{ samsara_driver_id: string }>) {
      if (!row.samsara_driver_id) continue;
      await client.query(
        `INSERT INTO integrations.samsara_drivers (operating_company_id, samsara_driver_id, raw_payload, last_seen_at)
         VALUES ($1::uuid,$2,$3::jsonb,now())
         ON CONFLICT (operating_company_id, samsara_driver_id) DO UPDATE SET last_seen_at = now()`,
        [operatingCompanyId, row.samsara_driver_id, JSON.stringify({ id: row.samsara_driver_id })]
      );
      imported += 1;
    }
  }
  return { imported, master_sync: stats };
}
