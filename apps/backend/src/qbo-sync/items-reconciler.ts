import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

export type ItemsReconcileResult = {
  driftDetected: number;
  createdFromQbo: number;
  healed: number;
  localOnly: number;
  reconciledAt: string;
};

async function markLocalOnlyDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  // Entity-scoped: runs under lucia-bypass (RLS off), so without operating_company_id this would
  // drift-flag EVERY entity's items. Same fix the COA reconciler already carries.
  const res = await client.query<{ c: string }>(
    `
      WITH updated AS (
        UPDATE catalogs.items
        SET
          qbo_sync_status = 'drift_detected',
          qbo_sync_error = 'local row has no qbo_item_id link',
          updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND qbo_item_id IS NULL
          AND deactivated_at IS NULL
          AND COALESCE(qbo_sync_status, '') <> 'local_only'
        RETURNING 1
      )
      SELECT COUNT(*)::text AS c FROM updated
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function createMissingFromMirror(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ c: string }>(
    `
      WITH inserted AS (
        INSERT INTO catalogs.items (
          operating_company_id,
          item_name,
          item_code,
          item_type,
          unit_price_cents,
          qbo_item_id,
          notes,
          deactivated_at,
          qbo_synced_at,
          qbo_sync_status
        )
        SELECT
          qi.operating_company_id,
          qi.name,
          COALESCE(qi.sku, CONCAT('QBO-', qi.qbo_id)),
          CASE
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'inventory' THEN 'Inventory'
            WHEN lower(replace(trim(coalesce(qi.item_type, '')), ' ', '')) = 'noninventory' THEN 'NonInventory'
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'bundle' THEN 'Bundle'
            WHEN lower(trim(coalesce(qi.item_type, ''))) = 'discount' THEN 'Discount'
            ELSE 'Service'
          END,
          qi.unit_price_cents,
          qi.qbo_id,
          $2,
          CASE WHEN qi.active THEN NULL ELSE now() END,
          now(),
          'synced'
        FROM mdata.qbo_items qi
        WHERE qi.operating_company_id = $1::uuid
          AND qi.qbo_id IS NOT NULL
          AND NOT EXISTS (
            -- dedup MUST be entity-scoped: the same qbo_id can legitimately exist in another entity's
            -- catalogs.items; without ci.operating_company_id = qi.operating_company_id a colliding
            -- qbo_id in a DIFFERENT entity would suppress this entity's insert.
            SELECT 1 FROM catalogs.items ci
            WHERE ci.qbo_item_id = qi.qbo_id
              AND ci.operating_company_id = qi.operating_company_id
          )
        RETURNING 1
      )
      SELECT COUNT(*)::text AS c FROM inserted
    `,
    [operatingCompanyId, `Reconciled from QBO mirror (${operatingCompanyId})`]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function healFieldDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ c: string }>(
    `
      WITH healed AS (
        UPDATE catalogs.items ci
        SET
          item_name = qi.name,
          item_code = COALESCE(qi.sku, ci.item_code),
          unit_price_cents = qi.unit_price_cents,
          qbo_sync_status = 'synced',
          qbo_sync_error = NULL,
          qbo_synced_at = now(),
          updated_at = now()
        FROM mdata.qbo_items qi
        WHERE qi.operating_company_id = $1::uuid
          AND ci.operating_company_id = qi.operating_company_id
          AND qi.qbo_id = ci.qbo_item_id
          AND (
            ci.item_name IS DISTINCT FROM qi.name
            OR ci.unit_price_cents IS DISTINCT FROM qi.unit_price_cents
          )
        RETURNING 1
      )
      SELECT COUNT(*)::text AS c FROM healed
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function countLocalOnly(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM catalogs.items WHERE operating_company_id = $1::uuid AND qbo_sync_status = 'local_only' AND deactivated_at IS NULL`,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

export async function reconcileItems(operatingCompanyId: string): Promise<ItemsReconcileResult> {
  const reconciledAt = new Date().toISOString();
  let driftDetected = 0;
  let createdFromQbo = 0;
  let healed = 0;
  let localOnly = 0;

  await withLuciaBypass(async (client) => {
    driftDetected = await markLocalOnlyDrift(client, operatingCompanyId);
    createdFromQbo = await createMissingFromMirror(client, operatingCompanyId);
    healed = await healFieldDrift(client, operatingCompanyId);
    localOnly = await countLocalOnly(client, operatingCompanyId);
  });

  return { driftDetected, createdFromQbo, healed, localOnly, reconciledAt };
}

export type ItemsSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

export async function fetchItemsSyncStatus(operatingCompanyId: string): Promise<ItemsSyncStatus> {
  return withLuciaBypass(async (client) => {
    // Entity-scoped: the status API takes an operating_company_id and must report THAT entity's counts,
    // not the whole fleet's (was returning aggregate across all entities under lucia-bypass).
    const counts = await client.query<{
      total_local: string;
      synced: string;
      drift_detected: string;
      local_only: string;
      sync_error: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE deactivated_at IS NULL)::text AS total_local,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'synced' AND deactivated_at IS NULL)::text AS synced,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'drift_detected' AND deactivated_at IS NULL)::text AS drift_detected,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'local_only' AND deactivated_at IS NULL)::text AS local_only,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'sync_error' AND deactivated_at IS NULL)::text AS sync_error
        FROM catalogs.items
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );
    const meta = await client.query<{ last_pull_at: string | null; last_reconcile_at: string | null }>(
      `
        SELECT
          MAX(qbo_synced_at) FILTER (WHERE qbo_sync_status = 'synced')::text AS last_pull_at,
          MAX(updated_at) FILTER (WHERE qbo_sync_status IN ('synced', 'drift_detected'))::text AS last_reconcile_at
        FROM catalogs.items
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );
    const row = counts.rows[0];
    const metaRow = meta.rows[0];
    return {
      total_local: Number(row?.total_local ?? 0),
      synced: Number(row?.synced ?? 0),
      drift_detected: Number(row?.drift_detected ?? 0),
      local_only: Number(row?.local_only ?? 0),
      sync_error: Number(row?.sync_error ?? 0),
      last_pull_at: metaRow?.last_pull_at ?? null,
      last_reconcile_at: metaRow?.last_reconcile_at ?? null,
    };
  });
}
