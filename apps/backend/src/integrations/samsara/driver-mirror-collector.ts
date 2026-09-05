import { randomUUID } from "node:crypto";
import { withLuciaBypass } from "../../auth/db.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraClient } from "./samsara-client.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

/**
 * ROW-39 (owner 2026-09-05 15:04Z): "Samsara holds 732 deactivated drivers; the TMS mirror
 * `integrations.samsara_drivers` holds 78 rows, all `active`, last synced 2026-05-31 — the
 * collector calls the Samsara drivers endpoint with the default filter (active only) and has not
 * run in 3 months." Root cause fixed in samsara-client.ts (listDriversAllActivationStatuses() fetches
 * BOTH `driverActivationStatus=active` and `=deactivated`, since Samsara has no combined "all"
 * value and omitting the param silently defaults to active-only).
 *
 * This collector: upserts every fetched driver into `integrations.samsara_drivers` (raw_payload
 * kept verbatim), then links `local_driver_id` to `mdata.drivers` by license number (Samsara's
 * `licenseNumber` field against `cdl_number` then `mexican_license_number`) and falls back to an
 * exact first+last name match — NEVER creating a duplicate `mdata.drivers` row (this collector only
 * writes to the mirror table; it is not the master-sync that creates driver masters).
 */

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type CollectorResult = {
  operating_company_id: string;
  collection_run_id: string;
  fetched_count: number;
  upserted_count: number;
  linked_count: number;
  skipped_not_configured: boolean;
};

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

function readString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function normalizeLicense(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeName(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

async function appendAuditEvent(client: DbClient, eventClass: string, severity: "info" | "warning", payload: Record<string, unknown>) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "ROW39-SAMSARA-DRIVER-MIRROR",
  ]);
}

export async function collectSamsaraDriverMirror(
  operatingCompanyId: string,
  options?: { collectionRunId?: string }
): Promise<CollectorResult> {
  if (!operatingCompanyId || !operatingCompanyId.trim()) {
    throw new Error("samsara driver-mirror collector requires operating_company_id");
  }
  const collectionRunId = options?.collectionRunId ?? randomUUID();

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    const config = await getSamsaraConfigForCompany(client, operatingCompanyId);
    if (!config || !Boolean(config.is_enabled)) {
      await appendAuditEvent(client, "cron_skipped_samsara_disabled", "info", {
        operating_company_id: operatingCompanyId,
        cron_name: "samsara.driver_mirror_collector",
      });
      return {
        operating_company_id: operatingCompanyId,
        collection_run_id: collectionRunId,
        fetched_count: 0,
        upserted_count: 0,
        linked_count: 0,
        skipped_not_configured: true,
      };
    }

    const token = decryptSamsaraSecret(readEncryptedToken(config));
    const samsara = new SamsaraClient({
      apiToken: token,
      samsaraOrgId: config.samsara_org_id ? String(config.samsara_org_id) : null,
    });

    const drivers = await samsara.listDriversAllActivationStatuses();

    let upserted = 0;
    let linked = 0;

    // Pre-load the local roster once (never a re-query per row) for the license/name match — matches
    // the R2/resolveOrCreate convention elsewhere in this repo of never guessing among ambiguous rows.
    const roster = await client.query<{ id: string; cdl_number: string | null; mexican_license_number: string | null; first_name: string | null; last_name: string | null }>(
      `SELECT id::text, cdl_number, mexican_license_number, first_name, last_name
         FROM mdata.drivers WHERE operating_company_id = $1::uuid`,
      [operatingCompanyId]
    );
    const byLicense = new Map<string, string>();
    const byName = new Map<string, string[]>();
    for (const row of roster.rows) {
      const cdl = normalizeLicense(row.cdl_number);
      const mex = normalizeLicense(row.mexican_license_number);
      if (cdl) byLicense.set(cdl, row.id);
      if (mex) byLicense.set(mex, row.id);
      const name = normalizeName(`${row.first_name ?? ""} ${row.last_name ?? ""}`);
      if (name) {
        const existing = byName.get(name) ?? [];
        existing.push(row.id);
        byName.set(name, existing);
      }
    }

    for (const driver of drivers) {
      const raw = driver.raw;
      const licenseNumber = normalizeLicense(readString(raw, "licenseNumber", "license_number"));
      const name = normalizeName(readString(raw, "name") ?? `${readString(raw, "firstName") ?? ""} ${readString(raw, "lastName") ?? ""}`);

      let localDriverId: string | null = licenseNumber ? byLicense.get(licenseNumber) ?? null : null;
      if (!localDriverId && name) {
        const candidates = byName.get(name) ?? [];
        // Never guess among ambiguous name matches (R2 convention) — link only when exactly one.
        if (candidates.length === 1) localDriverId = candidates[0]!;
      }

      const res = await client.query<{ inserted: boolean }>(
        `
          INSERT INTO integrations.samsara_drivers (operating_company_id, samsara_driver_id, local_driver_id, raw_payload, last_seen_at)
          VALUES ($1::uuid, $2, $3::uuid, $4::jsonb, '-infinity'::timestamptz)
          ON CONFLICT (operating_company_id, samsara_driver_id) DO UPDATE
            SET raw_payload = EXCLUDED.raw_payload,
                local_driver_id = COALESCE(integrations.samsara_drivers.local_driver_id, EXCLUDED.local_driver_id),
                updated_at = now()
          RETURNING (xmax = 0) AS inserted
        `,
        [operatingCompanyId, driver.id, localDriverId, JSON.stringify(raw)]
      );
      upserted += 1;
      if (localDriverId) linked += 1;
      void res;
    }

    await appendAuditEvent(client, "samsara.driver_mirror_collected", "info", {
      operating_company_id: operatingCompanyId,
      collection_run_id: collectionRunId,
      fetched_count: drivers.length,
      upserted_count: upserted,
      linked_count: linked,
    });

    return {
      operating_company_id: operatingCompanyId,
      collection_run_id: collectionRunId,
      fetched_count: drivers.length,
      upserted_count: upserted,
      linked_count: linked,
      skipped_not_configured: false,
    };
  });
}
