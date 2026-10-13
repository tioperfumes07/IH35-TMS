import { withLuciaBypass } from "../auth/db.js";
import { refuseQboNativeWrite } from "./qbo-native-write-refused.js";

export type CustomersReconcileResult = {
  driftDetected: number;
  createdFromQbo: number;
  healed: number;
  localOnly: number;
  reconciledAt: string;
};

/**
 * ACCT-F4431380 (Lead 443.137 item 9e) — REFUSED BY NAME. This formerly created, healed and drift-flagged
 * native mdata.customers rows from the QuickBooks mirror (mdata.qbo_customers). QuickBooks is a read-only archive: a QBO
 * reconciler never writes a native master table. Throws QboNativeWriteRefusedError (QBO_NATIVE_WRITE_REFUSED)
 * instead of reporting a reconcile that did nothing. The read-only sync status below is unchanged.
 */
export async function reconcileCustomers(operatingCompanyId: string): Promise<CustomersReconcileResult> {
  return refuseQboNativeWrite("qbo-sync/customers-reconciler#reconcileCustomers", ["mdata.customers"], operatingCompanyId);
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
