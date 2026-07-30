/**
 * Relay fuel → mdata.drivers matcher.
 *
 * Primary key (existing): drivers.integration_id = Relay driver.integration_id
 * (often a 16-digit fuel card / external id). Prod historically has integration_id
 * NULL on every driver, so ingest left matched_driver_id = 0.
 *
 * Fallbacks (unique within operating company only — never guess on collision):
 * 1) phone last-10 digits
 * 2) trimmed lower first_name + last_name
 *
 * Read-only against mdata.drivers (no writes) — avoids Drivers-module data thrash.
 */
import type { DbClient } from "./db-client.type.js";

export type RelayDriverMatchHints = {
  integration_id: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function normalizePersonName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  return t.length > 0 ? t : null;
}

async function uniqueDriverId(
  client: DbClient,
  sql: string,
  params: unknown[],
): Promise<string | null> {
  const res = await client.query<{ id: string }>(sql, params);
  if (res.rows.length !== 1) return null;
  return res.rows[0]?.id ?? null;
}

async function resolveByIntegrationId(
  client: DbClient,
  operatingCompanyId: string,
  integrationId: string | null,
): Promise<string | null> {
  if (!integrationId || integrationId.trim() === "" || integrationId === "0000000000000000") {
    return null;
  }
  return uniqueDriverId(
    client,
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND integration_id = $2
        AND deactivated_at IS NULL
        AND archived_at IS NULL
      LIMIT 2
    `,
    [operatingCompanyId, integrationId],
  );
}

async function resolveByPhone(
  client: DbClient,
  operatingCompanyId: string,
  phone: string | null,
): Promise<string | null> {
  const phone10 = normalizePhoneDigits(phone);
  if (!phone10) return null;
  return uniqueDriverId(
    client,
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND archived_at IS NULL
        AND length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
      LIMIT 2
    `,
    [operatingCompanyId, phone10],
  );
}

async function resolveByName(
  client: DbClient,
  operatingCompanyId: string,
  firstName: string | null,
  lastName: string | null,
): Promise<string | null> {
  const fn = normalizePersonName(firstName);
  const ln = normalizePersonName(lastName);
  if (!fn || !ln) return null;
  return uniqueDriverId(
    client,
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND archived_at IS NULL
        AND lower(trim(first_name)) = $2
        AND lower(trim(last_name)) = $3
      LIMIT 2
    `,
    [operatingCompanyId, fn, ln],
  );
}

/**
 * Resolve a single driver id for a Relay fuel txn. Order: integration_id → phone → name.
 * Returns null when ambiguous or missing — never picks among multiples.
 */
export async function resolveMatchedDriverId(
  client: DbClient,
  operatingCompanyId: string,
  hints: RelayDriverMatchHints,
): Promise<string | null> {
  const byIntegration = await resolveByIntegrationId(client, operatingCompanyId, hints.integration_id);
  if (byIntegration) return byIntegration;

  const byPhone = await resolveByPhone(client, operatingCompanyId, hints.phone);
  if (byPhone) return byPhone;

  return resolveByName(client, operatingCompanyId, hints.first_name, hints.last_name);
}
