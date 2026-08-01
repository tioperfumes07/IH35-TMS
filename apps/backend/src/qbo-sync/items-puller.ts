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
  // ACCT-F68 — ADOPT BEFORE INSERT.
  //
  // The upsert arbiter below is PARTIAL: (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT
  // NULL. A locally-created item has qbo_item_id NULL, so it can never match that arbiter — the
  // statement falls through to a fresh INSERT, which then collides with uq_items_company_item_name
  // (operating_company_id, item_name), a NON-partial unique index. That is the exact prod failure:
  // qbo_sync.step.items_pull and .items_reconcile both showed last_successful_run_at = NULL with
  // "duplicate key value violates unique constraint \"uq_items_company_item_name\"", so NO QBO item
  // has ever reached catalogs.items for TRANSP. Live shape confirming the setup: 190 items, 180 with
  // a qbo_item_id, 190 distinct names — the 10 rows without a qbo_item_id are the collision surface.
  //
  // ADOPT rather than rename-and-insert. The local row is the SAME product the operator already
  // created by hand; QBO is simply now the system of record for it.
  //
  // WHY ADOPTION IS THE CORRECT MOVE — stated from the VERIFIED linkage, not an assumed FK.
  // accounting.invoice_lines has NO foreign key to catalogs.items and stores no item id at all. Its
  // only item link is qbo_item_id (text); its account_id is the explicit GL revenue override and FKs
  // to catalogs.accounts, NOT to an item. Verified on the prod branch 2026-08-01 via pg_constraint:
  // invoice_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES catalogs.accounts(id).
  // Revenue is resolved in posting-engine.service.ts by joining
  //   catalogs.items it ON it.qbo_item_id = il.qbo_item_id
  // and reading that row's default_income_account_id.
  //
  // Revenue therefore follows whichever row HOLDS the qbo_item_id — the row's id is irrelevant to
  // invoice lines. Adoption puts the QBO id on the operator's existing row instead of minting a second
  // row for the same product, and preserves whatever mapping that row already carries. Inserting a twin
  // would instead hand the qbo_item_id to a brand-new row whose default_income_account_id is NULL (the
  // INSERT below never sets that column), pointing every invoice line keyed to that item at an item
  // with no income mapping. The posting engine fails closed with ACCOUNT_MAPPING_MISSING rather than
  // defaulting, so that is a billing outage, not a cosmetic duplicate.
  //
  // The converse — why the twin check below makes adoption STAND DOWN rather than fight for the id —
  // is the same argument run the other way, and prod data settles it. Where a '[QBO n]' twin already
  // exists, the twin is the row QBO has been feeding: 'Fuel Surcharge [QBO 24]' and 'Layover Charge
  // [QBO 26]' both carry an income account, while the identically-named local rows carry none (all 10
  // unclaimed TRANSP rows have default_income_account_id NULL, verified on prod 2026-08-01). Adopting
  // the unclaimed row would move the QBO id onto the WORSE-mapped of the two. The twin is already the
  // correct carrier on accounting grounds, not merely on constraint grounds.
  //
  // Renaming to dodge the constraint would also silently diverge the operator's catalogue from
  // QuickBooks.
  //
  // Only an UNCLAIMED row is adoptable (qbo_item_id IS NULL). A row already bound to a different QBO
  // item is never touched, so two QBO items sharing a name still surface as a real, visible error
  // instead of silently stealing each other's binding.
  const adopted = await client.query<{ id: string }>(
    `
      UPDATE catalogs.items
         SET qbo_item_id = $3,
             item_type = COALESCE($4, item_type),
             unit_price_cents = COALESCE($5, unit_price_cents),
             default_expense_account_id = COALESCE($6::uuid, default_expense_account_id),
             deactivated_at = CASE WHEN $7::boolean THEN NULL ELSE COALESCE(deactivated_at, now()) END,
             qbo_synced_at = now(),
             qbo_sync_status = 'synced',
             qbo_sync_error = NULL,
             updated_at = now()
       WHERE operating_company_id = $1
         AND item_name = $2
         AND qbo_item_id IS NULL
         -- ACCT-F77: a hole in the first version of this adopt. If ANOTHER row already claims this
         -- QBO id (the '<name> [QBO n]' twin created by an earlier import), stamping it here violates
         -- uq_items_company_qbo_item_id and aborts the pull. In that case the twin is already the
         -- correct carrier and the normal upsert below handles it — adoption must stand down.
         AND NOT EXISTS (
           SELECT 1 FROM catalogs.items other
            WHERE other.operating_company_id = $1
              AND other.qbo_item_id = $3
         )
      RETURNING id::text
    `,
    [operatingCompanyId, name, qboId, itemType, unitPrice, defaultExpenseAccountId, active]
  );
  if ((adopted.rowCount ?? 0) > 0) return;

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
        -- ACCT-F77 — item_name is DELIBERATELY NOT overwritten on update.
        --
        -- This single line was the whole defect. On update the upsert renamed the local twin to QBO's
        -- bare short name ('Fuel Surcharge [QBO 24]' -> 'Fuel Surcharge'), colliding with a native row
        -- of that name under uq_items_company_item_name — which is UNIQUE(operating_company_id,
        -- item_name) and NOT partial. items_pull and items_reconcile therefore aborted on EVERY run and
        -- had never once succeeded.
        --
        -- The '[QBO nn]' suffix is INTENTIONAL disambiguation, not drift: it is how a QBO-sourced row
        -- coexists with a same-named local row. QBO owns the item's identity (qbo_item_id) and its
        -- economics (price, type, income account) — all still synced below. It does not own the local
        -- display name once that name is already taken.
        --
        -- Fixing this in code rather than by renaming/retiring catalogs rows is the correct call: it
        -- makes the sync green with ZERO data mutation, is reversible, and does not presume a naming
        -- convention the owner has not ruled on. A rename would also have been unsafe to ship blind —
        -- non-enforced references (invoice/expense lines, jsonb item ids, ps_item_qbo_id) have not been
        -- swept. item_name is still set on a genuine first INSERT of a never-seen qbo_item_id above.
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
