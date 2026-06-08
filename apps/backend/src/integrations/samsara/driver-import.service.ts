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
