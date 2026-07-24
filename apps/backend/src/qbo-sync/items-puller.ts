import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";

export type ItemsPullResult = {
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

function mapItemType(raw: string | null): string {
  const normalized = String(raw ?? "Service").trim();
  if (normalized === "Inventory") return "Inventory";
  if (normalized === "NonInventory") return "NonInventory";
  if (normalized === "Bundle") return "Bundle";
  if (normalized === "Discount") return "Discount";
  if (normalized === "Group") return "Bundle";
  return "Service";
}

async function upsertMirror(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const name = String(row.Name ?? "");
  if (!name) return;
  const sku = row.Sku != null ? String(row.Sku) : null;
  const itemType = row.Type != null ? String(row.Type) : null;
  const rawPrice = row.UnitPrice;
  const unitPrice =
    typeof rawPrice === "number" ? Math.round(rawPrice * 100) : rawPrice != null ? Math.round(Number(rawPrice) * 100) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_items (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        name,
        sku,
        item_type,
        unit_price_cents,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        name = EXCLUDED.name,
        sku = EXCLUDED.sku,
        item_type = EXCLUDED.item_type,
        unit_price_cents = EXCLUDED.unit_price_cents,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json
    `,
    [operatingCompanyId, id, syncToken, name, sku, itemType, unitPrice, active, updated, JSON.stringify(row)]
  );
}

/**
 * QBO Item.ExpenseAccountRef.value → catalogs.accounts.id via qbo_account_id (entity-scoped).
 * Used so ItemBased bill lines can resolve CoA without inventing accounts.
 */
export async function resolveDefaultExpenseAccountId(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<string | null> {
  const expenseRef = row.ExpenseAccountRef as Record<string, unknown> | undefined;
  const qboAccountId = expenseRef?.value != null ? String(expenseRef.value).trim() : "";
  if (!qboAccountId) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND qbo_account_id = $2
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, qboAccountId]
  );
  return res.rows[0]?.id ?? null;
}

async function upsertCatalogItem(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const name = String(row.Name ?? "");
  if (!name) return;
  const sku = row.Sku != null ? String(row.Sku) : null;
  const itemType = mapItemType(row.Type != null ? String(row.Type) : null);
  const rawPrice = row.UnitPrice;
  const unitPrice =
    typeof rawPrice === "number" ? Math.round(rawPrice * 100) : rawPrice != null ? Math.round(Number(rawPrice) * 100) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const defaultExpenseAccountId = await resolveDefaultExpenseAccountId(client, operatingCompanyId, row);

  // AF-2 made catalogs.items per-entity: operating_company_id is NOT NULL and the single-col unique on
  // qbo_item_id was replaced by (operating_company_id, qbo_item_id). This write must carry
  // operating_company_id and conflict on the composite arbiter, or it 500s AND cross-entity clobbers.
  await client.query(
    `
      INSERT INTO catalogs.items (
        operating_company_id,
        item_name,
        item_code,
        item_type,
        unit_price_cents,
        qbo_item_id,
        default_expense_account_id,
        notes,
        deactivated_at,
        qbo_synced_at,
        qbo_sync_status,
        qbo_sync_error
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9,now(),'synced',NULL)
      ON CONFLICT (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL
      DO UPDATE SET
        item_name = EXCLUDED.item_name,
        item_code = EXCLUDED.item_code,
        item_type = EXCLUDED.item_type,
        unit_price_cents = EXCLUDED.unit_price_cents,
        default_expense_account_id = COALESCE(EXCLUDED.default_expense_account_id, catalogs.items.default_expense_account_id),
        deactivated_at = CASE WHEN $10::boolean THEN NULL ELSE COALESCE(catalogs.items.deactivated_at, now()) END,
        qbo_synced_at = now(),
        qbo_sync_status = 'synced',
        qbo_sync_error = NULL,
        updated_at = now()
    `,
    [
      operatingCompanyId,
      name,
      sku ?? `QBO-${qboId}`,
      itemType,
      unitPrice,
      qboId,
      defaultExpenseAccountId,
      `Synced from QBO (${operatingCompanyId})`,
      active ? null : new Date(),
      active,
    ]
  );
}

export async function pullItemsFromQbo(operatingCompanyId: string): Promise<ItemsPullResult> {
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
  for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Item", "", { pageSize: 1000 })) {
    for (const row of page) {
      rowsPulled += 1;
      pulledRows.push(row);
    }
  }

  await withLuciaBypass(async (client) => {
    for (const row of pulledRows) {
      await upsertMirror(client, operatingCompanyId, row);
      await upsertCatalogItem(client, operatingCompanyId, row);
      rowsUpserted += 1;
    }
  });

  return { rowsPulled, rowsUpserted, pulledAt };
}
