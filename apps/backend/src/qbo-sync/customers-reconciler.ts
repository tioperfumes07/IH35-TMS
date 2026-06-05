import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

export type CustomersReconcileResult = {
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
        UPDATE mdata.customers
        SET
          qbo_sync_status = 'drift_detected',
          qbo_sync_error = 'local row has no qbo_customer_id link',
          updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND qbo_customer_id IS NULL
          AND deactivated_at IS NULL
          AND archived_at IS NULL
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
          qbo_sync_status
        )
        SELECT
          qc.operating_company_id,
          qc.display_name,
          qc.primary_email,
          qc.primary_phone,
          qc.qbo_id,
          CASE WHEN qc.active THEN 'active'::mdata.customer_status ELSE 'inactive'::mdata.customer_status END,
          $2,
          CASE WHEN qc.active THEN NULL ELSE now() END,
          now(),
          'synced'
        FROM mdata.qbo_customers qc
        WHERE qc.operating_company_id = $1::uuid
          AND qc.qbo_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM mdata.customers c
            WHERE c.operating_company_id = qc.operating_company_id
              AND c.qbo_customer_id = qc.qbo_id
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
        UPDATE mdata.customers c
        SET
          customer_name = qc.display_name,
          billing_email = qc.primary_email,
          billing_phone = qc.primary_phone,
          qbo_sync_status = 'synced',
          qbo_sync_error = NULL,
          qbo_synced_at = now(),
          updated_at = now()
        FROM mdata.qbo_customers qc
        WHERE qc.operating_company_id = $1::uuid
          AND qc.qbo_id = c.qbo_customer_id
          AND c.operating_company_id = qc.operating_company_id
          AND (
            c.customer_name IS DISTINCT FROM qc.display_name
            OR c.billing_email IS DISTINCT FROM qc.primary_email
            OR c.billing_phone IS DISTINCT FROM qc.primary_phone
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
      FROM mdata.customers
      WHERE operating_company_id = $1::uuid
        AND qbo_sync_status = 'local_only'
        AND deactivated_at IS NULL
        AND archived_at IS NULL
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

export async function reconcileCustomers(operatingCompanyId: string): Promise<CustomersReconcileResult> {
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

export type CustomersSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

export async function fetchCustomersSyncStatus(operatingCompanyId: string): Promise<CustomersSyncStatus> {
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
          COUNT(*) FILTER (WHERE deactivated_at IS NULL AND archived_at IS NULL)::text AS total_local,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'synced' AND deactivated_at IS NULL AND archived_at IS NULL)::text AS synced,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'drift_detected' AND deactivated_at IS NULL AND archived_at IS NULL)::text AS drift_detected,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'local_only' AND deactivated_at IS NULL AND archived_at IS NULL)::text AS local_only,
          COUNT(*) FILTER (WHERE qbo_sync_status = 'sync_error' AND deactivated_at IS NULL AND archived_at IS NULL)::text AS sync_error
        FROM mdata.customers
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );
    const meta = await client.query<{ last_pull_at: string | null; last_reconcile_at: string | null }>(
      `
        SELECT
          MAX(qbo_synced_at) FILTER (WHERE qbo_sync_status = 'synced')::text AS last_pull_at,
          MAX(updated_at) FILTER (WHERE qbo_sync_status IN ('synced', 'drift_detected'))::text AS last_reconcile_at
        FROM mdata.customers
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
