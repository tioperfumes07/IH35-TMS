// FIN-23 — QBO reconcile / modify-capture READ-ONLY surfacing service.
//
// SHARED READ MODULE (also imported by CASCADE-14). Every function in this file is
// strictly read-only: it issues SELECT statements only and NEVER writes to the local
// database or to QuickBooks. There is no QBO write-client import here on purpose — this
// module surfaces sync state for human review and performs no resolution/apply.
//
// All functions accept a pg client that is already inside a company-scoped RLS context
// (see accounting/shared.ts -> withCompanyScope), so per-entity isolation is enforced by
// RLS (operating_company_id). QBO is TRANSP-connected today; callers scope to the
// connected operating company and never surface another entity's QBO data.

type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type QboSyncHealthRow = {
  entity: string;
  local_count: number | null;
  qbo_count: number | null;
  pending_count: number | null;
  drift: string | null;
};

export type QboConnectionSummary = {
  realm_id: string | null;
  authorized_at: string | null;
  last_used_at: string | null;
  last_refreshed_at: string | null;
  access_token_expires_at: string | null;
  revoked_at: string | null;
  connected: boolean;
};

export type QboModifyCapture = {
  id: string;
  received_at: string;
  qbo_realm_id: string;
  qbo_event_type: string | null;
  qbo_entity_type: string | null;
  qbo_entity_id: string | null;
  qbo_last_updated_at: string | null;
  status: string;
  webhook_signature_valid: boolean;
  error_message: string | null;
  applied_to_tms_entity_table: string | null;
  applied_to_tms_entity_id: string | null;
  applied_at: string | null;
};

export type QboSyncConflict = {
  id: string;
  entity_type: string;
  entity_id: string;
  qbo_id: string | null;
  tms_snapshot: unknown;
  qbo_snapshot: unknown;
  conflict_fields: string[];
  severity: string;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
  resolution_notes: string | null;
};

export type QboReconAlert = {
  uuid: string;
  run_at: string;
  entity_type: string;
  local_count: number;
  qbo_count: number;
  delta_pct: string;
  severity: string;
  notified_at: string | null;
};

/** Sync-health summary (per entity: local vs QBO counts, queue depth, drift label). */
export async function getQboSyncHealth(client: QueryClient): Promise<QboSyncHealthRow[]> {
  const res = await client.query(
    `SELECT entity, local_count, qbo_count, pending_count, drift
       FROM views.qbo_sync_health
      ORDER BY entity ASC`,
  );
  return res.rows as unknown as QboSyncHealthRow[];
}

/** Active QBO connection summary for the scoped operating company (no secrets exposed). */
export async function getQboConnectionSummary(
  client: QueryClient,
  operatingCompanyId: string,
): Promise<QboConnectionSummary> {
  const res = await client.query(
    `SELECT realm_id,
            authorized_at,
            last_used_at,
            last_refreshed_at,
            access_token_expires_at,
            revoked_at
       FROM integrations.qbo_connections
      WHERE operating_company_id = $1::uuid
        AND revoked_at IS NULL
      ORDER BY authorized_at DESC
      LIMIT 1`,
    [operatingCompanyId],
  );
  const row = res.rows[0];
  if (!row) {
    return {
      realm_id: null,
      authorized_at: null,
      last_used_at: null,
      last_refreshed_at: null,
      access_token_expires_at: null,
      revoked_at: null,
      connected: false,
    };
  }
  return {
    realm_id: (row.realm_id as string) ?? null,
    authorized_at: (row.authorized_at as string) ?? null,
    last_used_at: (row.last_used_at as string) ?? null,
    last_refreshed_at: (row.last_refreshed_at as string) ?? null,
    access_token_expires_at: (row.access_token_expires_at as string) ?? null,
    revoked_at: (row.revoked_at as string) ?? null,
    connected: true,
  };
}

/** Latest remote-count collection timestamp (proxy for "last QBO poll"). */
export async function getLastRemoteCountAt(client: QueryClient): Promise<string | null> {
  const res = await client.query(
    `SELECT max(collected_at) AS last_collected_at
       FROM accounting.qbo_remote_counts`,
  );
  return (res.rows[0]?.last_collected_at as string) ?? null;
}

/**
 * Modify captures: inbound QBO changes (webhook + CDC). status reveals whether TMS has
 * reflected the change ('applied') or not ('received'/'fetched'/'conflict'/'error').
 */
export async function listQboModifyCaptures(
  client: QueryClient,
  opts: { operatingCompanyId: string; status?: string; entityType?: string; limit: number; offset: number },
): Promise<{ items: QboModifyCapture[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  // FIN-23 hardening (CASCADE-14 discipline): explicit per-entity predicate. RLS alone is
  // NOT sufficient here — the SELECT policy on integrations.qbo_inbound_events scopes by the
  // user's company MEMBERSHIP (every company in org.user_company_access), not the selected
  // app.operating_company_id. For a multi-entity owner that would blend another entity's QBO
  // captures into this view once a 2nd entity connects QBO. Pin every read to the active entity.
  params.push(opts.operatingCompanyId);
  where.push(`operating_company_id = $${params.length}::uuid`);

  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`qbo_entity_type = $${params.length}`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countRes = await client.query(
    `SELECT count(*)::int AS total FROM integrations.qbo_inbound_events ${whereSql}`,
    params,
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const res = await client.query(
    `SELECT id, received_at, qbo_realm_id, qbo_event_type, qbo_entity_type, qbo_entity_id,
            qbo_last_updated_at, status, webhook_signature_valid, error_message,
            applied_to_tms_entity_table, applied_to_tms_entity_id, applied_at
       FROM integrations.qbo_inbound_events
       ${whereSql}
      ORDER BY received_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, opts.limit, opts.offset],
  );
  return { items: res.rows as unknown as QboModifyCapture[], total };
}

/** Open/closed sync conflicts with local (TMS) vs QBO snapshots side by side. */
export async function listQboSyncConflicts(
  client: QueryClient,
  opts: { operatingCompanyId: string; openOnly?: boolean; limit: number; offset: number },
): Promise<{ items: QboSyncConflict[]; total: number }> {
  // FIN-23 hardening (CASCADE-14 discipline): explicit per-entity predicate. The RLS SELECT
  // policy on integrations.qbo_sync_conflicts scopes by the user's company MEMBERSHIP, not the
  // selected app.operating_company_id — so without this an owner with access to multiple
  // entities would see every accessible entity's conflicts. Pin every read to the active entity.
  const where: string[] = ["operating_company_id = $1::uuid"];
  if (opts.openOnly) where.push("resolved_at IS NULL");
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countRes = await client.query(
    `SELECT count(*)::int AS total FROM integrations.qbo_sync_conflicts ${whereSql}`,
    [opts.operatingCompanyId],
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const res = await client.query(
    `SELECT id, entity_type, entity_id, qbo_id, tms_snapshot, qbo_snapshot, conflict_fields,
            severity, detected_at, resolved_at, resolution, resolution_notes
       FROM integrations.qbo_sync_conflicts
       ${whereSql}
      ORDER BY (resolved_at IS NULL) DESC, detected_at DESC
      LIMIT $2 OFFSET $3`,
    [opts.operatingCompanyId, opts.limit, opts.offset],
  );
  return { items: res.rows as unknown as QboSyncConflict[], total };
}

/** Reconciliation alert snapshots (count drift between local and QBO over time). */
export async function listQboReconAlerts(
  client: QueryClient,
  opts: { operatingCompanyId: string; limit: number },
): Promise<QboReconAlert[]> {
  const res = await client.query(
    `SELECT uuid, run_at, entity_type, local_count, qbo_count, delta_pct, severity, notified_at
       FROM qbo.reconciliation_alerts
      WHERE operating_company_id = $1
      ORDER BY run_at DESC
      LIMIT $2`,
    [opts.operatingCompanyId, opts.limit],
  );
  return res.rows as unknown as QboReconAlert[];
}
