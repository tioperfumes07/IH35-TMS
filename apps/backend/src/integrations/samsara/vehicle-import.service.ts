import { SamsaraClient } from "./samsara-client.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";

type Client = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
};

export async function importSamsaraVehicles(client: Client, operatingCompanyId: string) {
  const cfg = await client.query(
    `SELECT encrypted_api_token, api_token_encrypted, samsara_org_id FROM integrations.samsara_config WHERE operating_company_id = $1 LIMIT 1`,
    [operatingCompanyId]
  );
  const row = cfg.rows[0];
  const enc = (row?.encrypted_api_token ?? row?.api_token_encrypted) as Buffer | undefined;
  if (!enc) return { imported: 0, skipped: true, reason: "not_configured" };
  const token = decryptSamsaraSecret(enc);
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: row?.samsara_org_id ? String(row.samsara_org_id) : null,
  });
  const vehicles = await api.listVehicles();
  let imported = 0;
  for (const v of vehicles) {
    await client.query(
      `INSERT INTO integrations.samsara_vehicles (operating_company_id, samsara_vehicle_id, raw_payload, last_seen_at)
       VALUES ($1::uuid,$2,$3::jsonb,now())
       ON CONFLICT (operating_company_id, samsara_vehicle_id) DO UPDATE SET raw_payload = EXCLUDED.raw_payload, last_seen_at = now()`,
      [operatingCompanyId, v.id, JSON.stringify(v.raw)]
    );
    imported += 1;
  }
  await client.query(
    `UPDATE integrations.samsara_config SET last_health_check_at = now(), last_health_status = 'green' WHERE operating_company_id = $1`,
    [operatingCompanyId]
  );
  return { imported };
}
