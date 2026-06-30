import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

export type CoaReconcileResult = {
  driftDetected: number;
  createdFromQbo: number;
  healed: number;
  localOnly: number;
  reconciledAt: string;
};

async function markLocalOnlyDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  // Entity-scope (Tier-1 RLS fix): this runs under withLuciaBypass (RLS OFF), so the
  // operating_company_id predicate is the ONLY thing keeping this drift-flag UPDATE from
  // mutating another entity's catalogs.accounts rows. catalogs.accounts IS partitioned by
  // operating_company_id (migrations 202606161000 stage1 + 202606272100 af1).
  const res = await client.query<{ c: string }>(
    `
      WITH updated AS (
        UPDATE catalogs.accounts
        SET
          qbo_sync_status = 'drift_detected',
          qbo_sync_error = 'local row has no qbo_account_id link',
          updated_at = now()
        WHERE qbo_account_id IS NULL
          AND operating_company_id = $1::uuid
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
        INSERT INTO catalogs.accounts (
          operating_company_id,
          account_number,
          account_name,
          account_type,
          account_subtype,
          qbo_account_id,
          notes,
          deactivated_at,
          qbo_synced_at,
          qbo_sync_status
        )
        SELECT
          qa.operating_company_id,
          CONCAT('QBO-', qa.qbo_id),
          qa.name,
          CASE
            WHEN qa.account_type IN ('Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset') THEN 'Asset'
            WHEN qa.account_type IN ('Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability') THEN 'Liability'
            WHEN qa.account_type = 'Equity' THEN 'Equity'
            WHEN qa.account_type = 'Income' THEN 'Income'
            WHEN qa.account_type = 'Expense' THEN 'Expense'
            WHEN qa.account_type = 'Cost of Goods Sold' THEN 'CostOfGoodsSold'
            WHEN qa.account_type = 'Other Income' THEN 'OtherIncome'
            WHEN qa.account_type = 'Other Expense' THEN 'OtherExpense'
            ELSE 'Expense'
          END,
          qa.account_sub_type,
          qa.qbo_id,
          $2,
          CASE WHEN qa.active THEN NULL ELSE now() END,
          now(),
          'synced'
        FROM mdata.qbo_accounts qa
        WHERE qa.operating_company_id = $1::uuid
          AND qa.qbo_id IS NOT NULL
          AND NOT EXISTS (
            -- dedup must be entity-scoped: the same qbo_id can legitimately exist in another
            -- entity's catalogs.accounts; without ca.operating_company_id = qa.operating_company_id
            -- a colliding qbo_id in a DIFFERENT entity would suppress this entity's insert.
            SELECT 1 FROM catalogs.accounts ca
            WHERE ca.qbo_account_id = qa.qbo_id
              AND ca.operating_company_id = qa.operating_company_id
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
        UPDATE catalogs.accounts ca
        SET
          account_name = qa.name,
          account_type = CASE
            WHEN qa.account_type IN ('Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset') THEN 'Asset'
            WHEN qa.account_type IN ('Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability') THEN 'Liability'
            WHEN qa.account_type = 'Equity' THEN 'Equity'
            WHEN qa.account_type = 'Income' THEN 'Income'
            WHEN qa.account_type = 'Expense' THEN 'Expense'
            WHEN qa.account_type = 'Cost of Goods Sold' THEN 'CostOfGoodsSold'
            WHEN qa.account_type = 'Other Income' THEN 'OtherIncome'
            WHEN qa.account_type = 'Other Expense' THEN 'OtherExpense'
            ELSE 'Expense'
          END,
          account_subtype = qa.account_sub_type,
          qbo_sync_status = 'synced',
          qbo_sync_error = NULL,
          qbo_synced_at = now(),
          updated_at = now()
        FROM mdata.qbo_accounts qa
        WHERE qa.operating_company_id = $1::uuid
          -- ca is NOT otherwise entity-bound here; without this predicate a colliding qbo_id in
          -- another entity's catalogs.accounts gets overwritten with THIS entity's QBO field values.
          AND ca.operating_company_id = $1::uuid
          AND qa.qbo_id = ca.qbo_account_id
          AND (
            ca.account_name IS DISTINCT FROM qa.name
            OR ca.account_subtype IS DISTINCT FROM qa.account_sub_type
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
    `SELECT COUNT(*)::text AS c FROM catalogs.accounts WHERE qbo_sync_status = 'local_only' AND operating_company_id = $1::uuid AND deactivated_at IS NULL`,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

export async function reconcileChartOfAccounts(operatingCompanyId: string): Promise<CoaReconcileResult> {
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

export type CoaSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

export async function fetchChartOfAccountsSyncStatus(operatingCompanyId: string): Promise<CoaSyncStatus> {
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
        FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );
    const meta = await client.query<{ last_pull_at: string | null; last_reconcile_at: string | null }>(
      `
        SELECT
          MAX(qbo_synced_at) FILTER (WHERE qbo_sync_status = 'synced')::text AS last_pull_at,
          MAX(updated_at) FILTER (WHERE qbo_sync_status IN ('synced', 'drift_detected'))::text AS last_reconcile_at
        FROM catalogs.accounts
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
