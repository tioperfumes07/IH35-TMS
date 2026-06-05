import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

export type VendorsReconcileResult = {
  driftDetected: number;
  createdFromQbo: number;
  healed: number;
  localOnly: number;
  reconciledAt: string;
};

async function markLocalOnlyDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ c: string }>(
    `
      WITH updated AS (
        UPDATE mdata.vendors
        SET
          qbo_sync_status = 'drift_detected',
          qbo_sync_error = 'local row has no qbo_vendor_id link',
          updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND qbo_vendor_id IS NULL
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
          qbo_sync_status
        )
        SELECT
          qv.operating_company_id,
          qv.display_name,
          'Other',
          qv.primary_phone,
          qv.primary_email,
          qv.qbo_id,
          $2,
          CASE WHEN qv.active THEN NULL ELSE now() END,
          now(),
          'synced'
        FROM mdata.qbo_vendors qv
        WHERE qv.operating_company_id = $1::uuid
          AND qv.qbo_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM mdata.vendors v
            WHERE v.operating_company_id = qv.operating_company_id
              AND v.qbo_vendor_id = qv.qbo_id
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
        UPDATE mdata.vendors v
        SET
          vendor_name = qv.display_name,
          phone = qv.primary_phone,
          email = qv.primary_email,
          qbo_sync_status = 'synced',
          qbo_sync_error = NULL,
          qbo_synced_at = now(),
          updated_at = now()
        FROM mdata.qbo_vendors qv
        WHERE qv.operating_company_id = $1::uuid
          AND qv.qbo_id = v.qbo_vendor_id
          AND v.operating_company_id = qv.operating_company_id
          AND (
            v.vendor_name IS DISTINCT FROM qv.display_name
            OR v.phone IS DISTINCT FROM qv.primary_phone
            OR v.email IS DISTINCT FROM qv.primary_email
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
    `
      SELECT COUNT(*)::text AS c
      FROM mdata.vendors
      WHERE operating_company_id = $1::uuid
        AND qbo_sync_status = 'local_only'
        AND deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

export async function reconcileVendors(operatingCompanyId: string): Promise<VendorsReconcileResult> {
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

export type VendorsSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

export async function fetchVendorsSyncStatus(operatingCompanyId: string): Promise<VendorsSyncStatus> {
  return withLuciaBypass(async (client) => {
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
        FROM mdata.vendors
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );
    const meta = await client.query<{ last_pull_at: string | null; last_reconcile_at: string | null }>(
      `
        SELECT
          MAX(qbo_synced_at) FILTER (WHERE qbo_sync_status = 'synced')::text AS last_pull_at,
          MAX(updated_at) FILTER (WHERE qbo_sync_status IN ('synced', 'drift_detected'))::text AS last_reconcile_at
        FROM mdata.vendors
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
