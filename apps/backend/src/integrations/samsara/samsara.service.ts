import type { QueryResult } from "pg";
import { decryptSamsaraSecret, encryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraClient } from "./samsara-client.js";

export type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult<Record<string, unknown>>>;
};

export function rowIsConfigured(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  return row.api_token_encrypted != null && Buffer.isBuffer(row.api_token_encrypted) && row.api_token_encrypted.length > 0;
}

export function toPublicConfig(row: Record<string, unknown> | null): {
  is_configured: boolean;
  is_enabled: boolean;
  samsara_org_id: string | null;
  last_health_check_at: string | null;
  last_health_status: string | null;
  last_error: string | null;
} {
  if (!row) {
    return {
      is_configured: false,
      is_enabled: false,
      samsara_org_id: null,
      last_health_check_at: null,
      last_health_status: "not_configured",
      last_error: null,
    };
  }
  return {
    is_configured: rowIsConfigured(row),
    is_enabled: Boolean(row.is_enabled),
    samsara_org_id: row.samsara_org_id ? String(row.samsara_org_id) : null,
    last_health_check_at: row.last_health_check_at ? new Date(String(row.last_health_check_at)).toISOString() : null,
    last_health_status: row.last_health_status ? String(row.last_health_status) : "not_configured",
    last_error: row.last_error ? String(row.last_error) : null,
  };
}

export async function getSamsaraConfigForCompany(client: PgClient, operatingCompanyId: string) {
  const res = await client.query(
    `SELECT * FROM integrations.samsara_config WHERE operating_company_id = $1 LIMIT 1`,
    [operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

export async function upsertSamsaraConfig(
  client: PgClient,
  operatingCompanyId: string,
  input: { api_token: string; webhook_secret: string; samsara_org_id: string | null }
) {
  const encToken = encryptSamsaraSecret(input.api_token);
  const encWh = encryptSamsaraSecret(input.webhook_secret);
  await client.query(
    `
      INSERT INTO integrations.samsara_config (
        operating_company_id, samsara_org_id, api_token_encrypted, webhook_secret_encrypted, is_enabled
      ) VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (operating_company_id) DO UPDATE SET
        samsara_org_id = EXCLUDED.samsara_org_id,
        api_token_encrypted = EXCLUDED.api_token_encrypted,
        webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
        is_enabled = true
    `,
    [operatingCompanyId, input.samsara_org_id, encToken, encWh]
  );
}

export async function disableSamsaraConfig(client: PgClient, operatingCompanyId: string) {
  await client.query(
    `
      UPDATE integrations.samsara_config
      SET
        is_enabled = false,
        api_token_encrypted = NULL,
        webhook_secret_encrypted = NULL,
        samsara_org_id = NULL,
        last_health_check_at = NULL,
        last_health_status = 'not_configured',
        last_error = NULL
      WHERE operating_company_id = $1
    `,
    [operatingCompanyId]
  );
}

export function extractSamsaraWebhookMeta(payload: Record<string, unknown>): {
  event_type: string;
  samsara_event_id: string | null;
} {
  const eventType =
    (typeof payload.eventType === "string" && payload.eventType) ||
    (typeof payload.type === "string" && payload.type) ||
    (typeof payload.event === "string" && payload.event) ||
    "unknown";
  let eventId: string | null = null;
  if (typeof payload.id === "string") eventId = payload.id;
  else if (typeof payload.eventId === "string") eventId = payload.eventId;
  else if (payload.data && typeof payload.data === "object" && payload.data !== null) {
    const d = payload.data as Record<string, unknown>;
    if (typeof d.id === "string") eventId = d.id;
  }
  return { event_type: eventType, samsara_event_id: eventId };
}

export async function runSamsaraHealthCheckForRow(client: PgClient, operatingCompanyId: string): Promise<void> {
  const row = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!row || !Boolean(row.is_enabled)) return;

  let token: string | null = null;
  try {
    token = row.api_token_encrypted ? decryptSamsaraSecret(row.api_token_encrypted as Buffer) : null;
  } catch (e) {
    await client.query(
      `
        UPDATE integrations.samsara_config
        SET
          last_health_check_at = now(),
          last_health_status = 'error',
          last_error = $2
        WHERE operating_company_id = $1
      `,
      [operatingCompanyId, `decrypt_failed: ${e instanceof Error ? e.message : "unknown"}`]
    );
    return;
  }

  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: row.samsara_org_id ? String(row.samsara_org_id) : null,
  });

  try {
    await api.testConnection();
    await client.query(
      `
        UPDATE integrations.samsara_config
        SET last_health_check_at = now(), last_health_status = 'ok', last_error = NULL
        WHERE operating_company_id = $1
      `,
      [operatingCompanyId]
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    await client.query(
      `
        UPDATE integrations.samsara_config
        SET
          last_health_check_at = now(),
          last_health_status = 'error',
          last_error = $2
        WHERE operating_company_id = $1
      `,
      [operatingCompanyId, msg]
    );
  }
}
