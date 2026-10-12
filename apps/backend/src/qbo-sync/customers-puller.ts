// ACCT-F4431380 (Lead 443.137 item 9e) — QuickBooks is a READ-ONLY ARCHIVE. This puller writes ONLY the
// mirror (mdata.qbo_customers). The former native write (mdata.customers) is REMOVED: a QBO pull never creates,
// heals or deactivates a native master row. Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs.
import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { repairUtf8Mojibake } from "../lib/repair-utf8-mojibake.js";

export type CustomersPullResult = {
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
  if (typeof display === "string" && display.trim()) return repairUtf8Mojibake(display.trim());
  const fqn = row.FullyQualifiedName;
  if (typeof fqn === "string" && fqn.trim()) return repairUtf8Mojibake(fqn.trim());
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
      INSERT INTO mdata.qbo_customers (
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
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
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
        payload_json = EXCLUDED.payload_json
    `,
    [operatingCompanyId, id, syncToken, name, companyName, primaryEmail, primaryPhone, active, updated, JSON.stringify(row)]
  );
}

export async function pullCustomersFromQbo(operatingCompanyId: string): Promise<CustomersPullResult> {
  const pulledAt = new Date().toISOString();
  let rowsPulled = 0;
  let rowsUpserted = 0;

  // G5-2: fetch ALL QBO pages over HTTP with NO pooled DB connection or open transaction held.
  // qboCompanyContext (token fetch) and qboPaginateEntity (the outbound QuickBooks REST calls) manage
  // their own short-lived reads; the prior structure ran this pagination *inside* withLuciaBypass, which
  // checked out a connection and kept a write transaction (BEGIN…COMMIT) open for the full duration of
  // every QuickBooks round-trip — exhausting the pool and risking long-held locks under load. Gather
  // first (no tx), then persist in one short transaction opened only after all HTTP has completed.
  const ctx = await qboCompanyContext(operatingCompanyId);
  const pulledRows: Record<string, unknown>[] = [];
  for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Customer", "", { pageSize: 1000 })) {
    for (const row of page) {
      rowsPulled += 1;
      pulledRows.push(row);
    }
  }

  await withLuciaBypass(async (client) => {
    for (const row of pulledRows) {
      await upsertMirror(client, operatingCompanyId, row);
      rowsUpserted += 1;
    }
  });

  return { rowsPulled, rowsUpserted, pulledAt };
}
