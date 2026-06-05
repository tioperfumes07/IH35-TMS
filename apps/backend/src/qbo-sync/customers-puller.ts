import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";

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

async function upsertLocalCustomer(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const name = displayName(row);
  if (!name) return;
  const primaryEmail = qboEmail(row);
  const primaryPhone = qboPhone(row);
  const active = row.Active === undefined ? true : Boolean(row.Active);

  await client.query(
    `
      INSERT INTO mdata.customers (
        operating_company_id,
        customer_name,
        billing_email,
        billing_phone,
        qbo_customer_id,
        status,
        notes,
        deactivated_at,
        qbo_synced_at,
        qbo_sync_status,
        qbo_sync_error
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),'synced',NULL)
      ON CONFLICT (operating_company_id, qbo_customer_id)
      DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        billing_email = EXCLUDED.billing_email,
        billing_phone = EXCLUDED.billing_phone,
        status = CASE
          WHEN $9::boolean THEN
            CASE WHEN mdata.customers.status = 'inactive'::mdata.customer_status THEN 'active'::mdata.customer_status ELSE mdata.customers.status END
          ELSE 'inactive'::mdata.customer_status
        END,
        deactivated_at = CASE WHEN $9::boolean THEN NULL ELSE COALESCE(mdata.customers.deactivated_at, now()) END,
        qbo_synced_at = now(),
        qbo_sync_status = 'synced',
        qbo_sync_error = NULL,
        updated_at = now()
    `,
    [
      operatingCompanyId,
      name,
      primaryEmail,
      primaryPhone,
      qboId,
      active ? "active" : "inactive",
      `Synced from QBO (${operatingCompanyId})`,
      active ? null : new Date(),
      active,
    ]
  );
}

export async function pullCustomersFromQbo(operatingCompanyId: string): Promise<CustomersPullResult> {
  const pulledAt = new Date().toISOString();
  let rowsPulled = 0;
  let rowsUpserted = 0;

  await withLuciaBypass(async (client) => {
    const ctx = await qboCompanyContext(operatingCompanyId);
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Customer", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        await upsertMirror(client, operatingCompanyId, row);
        await upsertLocalCustomer(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    }
  });

  return { rowsPulled, rowsUpserted, pulledAt };
}
