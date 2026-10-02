/**
 * ENGINE: Samsara config bootstrap — seeds a company's integrations.samsara_config row with an encrypted API token
 * SCHEDULE: on demand — no caller in src (exported bootstrapSamsaraConfig / bootstrapSamsaraConfigFromPlainToken only; ORPHAN)
 * WRITES: integrations.samsara_config
 * IDEMPOTENCY: UNIQUE(operating_company_id) ON CONFLICT DO NOTHING (table UNIQUE, migration 0137)
 * OVERLAP: the second call inserts nothing; the first row and its token win
 * REVERSE: NOT-A-DOCUMENT — integration config (disabled by integrations/samsara/samsara.service.ts:disableSamsaraConfig)
 * NEVER: must never overwrite an existing company's token or config, and never store the token unencrypted
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
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
