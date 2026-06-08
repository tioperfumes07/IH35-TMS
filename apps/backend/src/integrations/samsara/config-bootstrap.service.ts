import { encryptSamsaraSecret } from "../../lib/samsara-crypto.js";

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number }> };

export async function bootstrapSamsaraConfig(client: Client, operatingCompanyId: string, encryptedToken: Buffer) {
  await client.query(
    `INSERT INTO integrations.samsara_config (operating_company_id, encrypted_api_token, api_token_encrypted, is_enabled, connected_at, token_key_version)
     VALUES ($1, $2, $2, true, now(), 1) ON CONFLICT (operating_company_id) DO NOTHING`,
    [operatingCompanyId, encryptedToken]
  );
}

export async function bootstrapSamsaraConfigFromPlainToken(client: Client, operatingCompanyId: string, apiToken: string) {
  const enc = encryptSamsaraSecret(apiToken);
  return bootstrapSamsaraConfig(client, operatingCompanyId, enc);
}
