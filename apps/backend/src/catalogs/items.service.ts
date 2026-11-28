/**
 * The one catalog-item (Products & Services) writer: insert + CRUD audit row + the TMS item push request (gated OFF under the
 * parallel-books architecture — enqueue only). The POST /api/v1/catalogs/items route and the ScentsX "Make ScentsX item" bulk
 * (scentsx/item-links.service.ts) both call it, so an item is created the same way from every surface.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueTmsItemPushRequested } from "../qbo/tms-item-push-chain.service.js";

export type CatalogItemInsert = {
  item_name: string; item_code?: string | null; item_type: "Service" | "Inventory" | "NonInventory" | "Bundle" | "Discount" | "Charge";
  description?: string | null; unit_price_cents?: number | null; default_income_account_id?: string | null; default_expense_account_id?: string | null;
  default_class_id?: string | null; qbo_item_id?: string | null; taxable: boolean; notes?: string | null; category_id?: string | null;
};

/** Caller has already scoped the client to `operatingCompanyId` (catalogs.items is FORCE RLS). */
export async function insertCatalogItemInClientTx(client: Pick<PoolClient, "query">, uid: string, operatingCompanyId: string, b: CatalogItemInsert) {
  const res = await client.query(
    `
      INSERT INTO catalogs.items (
        operating_company_id,
        item_name, item_code, item_type, description, unit_price_cents,
        default_income_account_id, default_expense_account_id, default_class_id,
        qbo_item_id, taxable, notes, created_by_user_id, updated_by_user_id, category_id
      ) VALUES (
        $13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$14
      )
      RETURNING
        id, item_name, item_code, item_type, description, unit_price_cents,
        default_income_account_id, default_expense_account_id, default_class_id,
        qbo_item_id, taxable, notes,
        created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
    `,
    [
      b.item_name, b.item_code ?? null, b.item_type, b.description ?? null, b.unit_price_cents ?? null,
      b.default_income_account_id ?? null, b.default_expense_account_id ?? null, b.default_class_id ?? null,
      b.qbo_item_id ?? null, b.taxable, b.notes ?? null, uid, operatingCompanyId, b.category_id ?? null,
    ]
  );
  const row = res.rows[0];
  await appendCrudAudit(client as PoolClient, uid, "catalogs.items.created", {
    resource_id: row.id, resource_type: "catalogs.items", id: row.id, item_name: row.item_name, item_code: row.item_code, item_type: row.item_type,
  });
  await enqueueTmsItemPushRequested(client as PoolClient, { operating_company_id: operatingCompanyId, item_id: String(row.id), operation: "create" });
  return row;
}
