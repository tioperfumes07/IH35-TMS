import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";

export type VendorsPullResult = {
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

function metaUpdatedAt(row: Record<string, unknown>): Date | null {
  const meta = row.MetaData as Record<string, unknown> | undefined;
  const raw = meta?.LastUpdatedTime;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function qboEmail(row: Record<string, unknown>): string | null {
  const addr = row.PrimaryEmailAddr as Record<string, unknown> | undefined;
  const raw = addr?.Address;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function qboPhone(row: Record<string, unknown>): string | null {
  const phone = row.PrimaryPhone as Record<string, unknown> | undefined;
  const raw = phone?.FreeFormNumber;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function displayName(row: Record<string, unknown>): string {
  const display = row.DisplayName;
  if (typeof display === "string" && display.trim()) return display.trim();
  const fqn = row.FullyQualifiedName;
  if (typeof fqn === "string" && fqn.trim()) return fqn.trim();
  return String(row.Id ?? "");
}

async function upsertMirror(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const name = displayName(row);
  if (!name) return;
  const companyName = row.CompanyName != null ? String(row.CompanyName) : null;
  const primaryEmail = qboEmail(row);
  const primaryPhone = qboPhone(row);
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_vendors (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json,
        raw_payload,
        last_seen_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb,$10::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        display_name = EXCLUDED.display_name,
        company_name = EXCLUDED.company_name,
        primary_email = EXCLUDED.primary_email,
        primary_phone = EXCLUDED.primary_phone,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json,
        raw_payload = EXCLUDED.raw_payload,
        last_seen_at = now()
    `,
    [operatingCompanyId, id, syncToken, name, companyName, primaryEmail, primaryPhone, active, updated, JSON.stringify(row)]
  );
}

async function upsertLocalVendor(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const name = displayName(row);
  if (!name) return;
  const primaryEmail = qboEmail(row);
  const primaryPhone = qboPhone(row);
  const active = row.Active === undefined ? true : Boolean(row.Active);

  await client.query(
    `
      INSERT INTO mdata.vendors (
        operating_company_id,
        vendor_name,
        vendor_type,
        phone,
        email,
        qbo_vendor_id,
        notes,
        deactivated_at,
        qbo_synced_at,
        qbo_sync_status,
        qbo_sync_error,
        source_system,
        source
      )
      VALUES ($1,$2,'Other',$3,$4,$5,$6,$7,now(),'synced',NULL,'qbo','qbo_clone')
      ON CONFLICT (operating_company_id, qbo_vendor_id)
      DO UPDATE SET
        source_system = 'qbo',
        source = 'qbo_clone',
        vendor_name = EXCLUDED.vendor_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        deactivated_at = CASE WHEN $8::boolean THEN NULL ELSE COALESCE(mdata.vendors.deactivated_at, now()) END,
        qbo_synced_at = now(),
        qbo_sync_status = 'synced',
        qbo_sync_error = NULL,
        updated_at = now()
    `,
    [
      operatingCompanyId,
      name,
      primaryPhone,
      primaryEmail,
      qboId,
      `Synced from QBO (${operatingCompanyId})`,
      active ? null : new Date(),
      active,
    ]
  );
}

export async function pullVendorsFromQbo(operatingCompanyId: string): Promise<VendorsPullResult> {
  const pulledAt = new Date().toISOString();
  let rowsPulled = 0;
  let rowsUpserted = 0;

  const pulledQboIds: string[] = [];

  // G5-2: fetch ALL QBO pages over HTTP with NO pooled DB connection or open transaction held.
  // qboCompanyContext (token fetch) and qboPaginateEntity (the outbound QuickBooks REST calls) manage
  // their own short-lived reads; the prior structure ran this pagination *inside* withLuciaBypass, which
  // checked out a connection and kept a write transaction (BEGIN…COMMIT) open for the full duration of
  // every QuickBooks round-trip — exhausting the pool and risking long-held locks under load. Gather
  // first (no tx), then persist in one short transaction opened only after all HTTP has completed.
  const ctx = await qboCompanyContext(operatingCompanyId);
  const pulledRows: Record<string, unknown>[] = [];
  for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Vendor", "", { pageSize: 1000 })) {
    for (const row of page) {
      rowsPulled += 1;
      const qboId = String(row.Id ?? "");
      if (qboId) pulledQboIds.push(qboId);
      pulledRows.push(row);
    }
  }

  await withLuciaBypass(async (client) => {
    for (const row of pulledRows) {
      await upsertMirror(client, operatingCompanyId, row);
      await upsertLocalVendor(client, operatingCompanyId, row);
      rowsUpserted += 1;
    }

    // MD-2 void-gone-from-QBO (mirror of MD-1): a cloned vendor absent from the FULL pull was deleted in
    // QBO → deactivate (never delete). Guarded on a non-empty pull; only touches origin='qbo_clone' rows.
    if (pulledQboIds.length > 0) {
      await client.query(
        `
          UPDATE mdata.vendors
          SET deactivated_at = COALESCE(deactivated_at, now()),
              updated_at = now()
          WHERE operating_company_id = $1::uuid
            AND source = 'qbo_clone'
            AND deactivated_at IS NULL
            AND qbo_vendor_id IS NOT NULL
            AND NOT (qbo_vendor_id = ANY($2::text[]))
        `,
        [operatingCompanyId, pulledQboIds]
      );
    }
  });

  return { rowsPulled, rowsUpserted, pulledAt };
}
