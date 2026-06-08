import { fetchTier3FiveMinutes } from "./cache/tier3-5min.js";
import { syncSamsaraVehiclesMaster } from "./samsara-master-sync.service.js";

type Client = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
};

/** DS-4: Import Samsara vehicles into integrations.samsara_vehicles via master sync + projection upsert. */
export async function importSamsaraVehicles(client: Client, operatingCompanyId: string) {
  const { value: stats } = await fetchTier3FiveMinutes(`ds4:vehicles:${operatingCompanyId}`, async () =>
    syncSamsaraVehiclesMaster(client, operatingCompanyId)
  );
  const mirror = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM integrations.samsara_vehicles WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  let imported = Number(mirror.rows[0]?.cnt ?? 0);
  if (imported === 0) {
    const equip = await client.query<{ samsara_vehicle_id: string; raw: Record<string, unknown> }>(
      `SELECT samsara_vehicle_id, jsonb_build_object('id', samsara_vehicle_id) AS raw
       FROM mdata.equipment
       WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
         AND samsara_vehicle_id IS NOT NULL
       LIMIT 500`,
      [operatingCompanyId]
    );
    for (const row of equip.rows) {
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
    `UPDATE integrations.samsara_config SET last_health_check_at = now(), last_health_status = 'green' WHERE operating_company_id = $1`,
    [operatingCompanyId]
  );
  return { imported, master_sync: stats };
}
