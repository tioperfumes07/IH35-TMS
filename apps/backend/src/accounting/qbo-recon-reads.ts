/**
 * CASCADE-14 — TMS↔QBO daily reconciliation: QBO read module (READ-ONLY).
 *
 * Single clearly-named place for the QBO-side reads used by the daily reconciliation
 * screen: per-object counts (TMS native vs QBO mirror vs QBO remote-API count), AR/AP
 * balance totals, sync state, and existing reconciliation findings.
 *
 * NOTE FOR DE-DUPE (overlaps FIN-23): FIN-23 also reads the QBO sync surfaces
 * (views.qbo_sync_health, accounting.qbo_remote_counts, _system.reconciliation_findings).
 * FIN-23 is on a separate branch so we cannot import its shared module here; when both land,
 * collapse this module and FIN-23's QBO-read module into ONE shared reader. This file performs
 * ZERO writes — SELECT only. Scoping is enforced by withCompanyScope's RLS GUC plus an explicit
 * operating_company_id = $1 predicate on every query (per-entity, no cross-entity recon).
 */

export type ReconClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ReconBalance = {
  label: string;
  tms_cents: number;
  qbo_cents: number;
  in_sync: boolean;
  delta_cents: number;
};

export type ReconObject = {
  object: string;
  label: string;
  tms_count: number;
  qbo_mirror_count: number;
  qbo_remote_count: number | null;
  remote_collected_at: string | null;
  /** Reference side used for the in-sync verdict: 'remote' (authoritative) or 'mirror' fallback. */
  reference: "remote" | "mirror";
  count_in_sync: boolean;
  count_delta: number;
  balance: ReconBalance | null;
};

export type ReconFinding = {
  id: string;
  finding_type: string;
  mirror_category: string;
  severity: string;
  status: string;
  drift_metric_abs: number | null;
  drift_metric_pct: number | null;
  resource_scope: unknown;
  local_value: unknown;
  remote_value: unknown;
  detected_at: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type ReconSyncState = {
  last_run_status: string | null;
  last_successful_tick_at: string | null;
  last_error_message: string | null;
  remote_counts_last_success_at: string | null;
  remote_counts_last_failure_at: string | null;
  remote_counts_consecutive_failures: number | null;
  remote_counts_available: boolean;
};

export type QboReconResult = {
  generated_at: string;
  objects: ReconObject[];
  findings: ReconFinding[];
  sync_state: ReconSyncState;
  open_findings_count: number;
};

const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Maps a recon object key to the entity_type string used by accounting.qbo_remote_counts
 * (the authoritative QBO-API count collector). Mirrors the convention used by views.qbo_sync_health.
 */
const REMOTE_ENTITY_KEY: Record<string, string> = {
  customers: "qbo_customers",
  vendors: "qbo_vendors",
  accounts: "qbo_accounts",
  invoices: "qbo_invoices",
  bills: "qbo_bills",
};

export async function fetchQboReconciliation(
  client: ReconClient,
  operatingCompanyId: string
): Promise<QboReconResult> {
  // ── 1) Per-object counts + AR/AP balance totals (one round trip, scalar subqueries). ──
  const countsRes = await client.query<Record<string, string | number | null>>(
    `
    SELECT
      (SELECT count(*) FROM mdata.customers
         WHERE operating_company_id = $1 AND deactivated_at IS NULL AND archived_at IS NULL) AS tms_customers,
      (SELECT count(*) FROM mdata.qbo_customers WHERE operating_company_id = $1)              AS mirror_customers,
      (SELECT count(*) FROM mdata.vendors
         WHERE operating_company_id = $1 AND deactivated_at IS NULL)                          AS tms_vendors,
      (SELECT count(*) FROM mdata.qbo_vendors WHERE operating_company_id = $1)                AS mirror_vendors,
      (SELECT count(*) FROM catalogs.accounts
         WHERE operating_company_id = $1 AND deactivated_at IS NULL)                          AS tms_accounts,
      (SELECT count(*) FROM mdata.qbo_accounts WHERE operating_company_id = $1)               AS mirror_accounts,
      (SELECT count(*) FROM accounting.invoices
         WHERE operating_company_id = $1 AND voided_at IS NULL)                               AS tms_invoices,
      (SELECT count(*) FROM mdata.qbo_invoices WHERE operating_company_id = $1)               AS mirror_invoices,
      (SELECT count(*) FROM accounting.bills WHERE operating_company_id = $1)                 AS tms_bills,
      (SELECT count(*) FROM mdata.qbo_bills WHERE operating_company_id = $1)                  AS mirror_bills,
      (SELECT COALESCE(SUM(total_cents), 0) FROM accounting.invoices
         WHERE operating_company_id = $1 AND voided_at IS NULL)                               AS tms_ar_cents,
      (SELECT COALESCE(SUM(total_cents), 0) FROM mdata.qbo_invoices
         WHERE operating_company_id = $1)                                                     AS qbo_ar_cents,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM accounting.bills
         WHERE operating_company_id = $1)                                                     AS tms_ap_cents,
      (SELECT COALESCE(SUM(total_cents), 0) FROM mdata.qbo_bills
         WHERE operating_company_id = $1)                                                     AS qbo_ap_cents
    `,
    [operatingCompanyId]
  );
  const c = countsRes.rows[0] ?? {};

  // ── 2) Latest QBO-API remote counts per entity_type. ──
  const remoteRes = await client.query<{ entity_type: string; remote_count: number; collected_at: string }>(
    `
    SELECT DISTINCT ON (entity_type) entity_type, remote_count, collected_at
    FROM accounting.qbo_remote_counts
    WHERE operating_company_id = $1
    ORDER BY entity_type, collected_at DESC
    `,
    [operatingCompanyId]
  );
  const remoteByEntity = new Map<string, { count: number; collected_at: string }>();
  for (const r of remoteRes.rows) {
    remoteByEntity.set(r.entity_type, { count: toNum(r.remote_count), collected_at: r.collected_at });
  }

  const buildObject = (
    object: string,
    label: string,
    tmsCount: number,
    mirrorCount: number,
    balance: ReconBalance | null
  ): ReconObject => {
    const remote = remoteByEntity.get(REMOTE_ENTITY_KEY[object]);
    const remoteCount = remote ? remote.count : null;
    const reference: "remote" | "mirror" = remoteCount != null ? "remote" : "mirror";
    const refValue = remoteCount != null ? remoteCount : mirrorCount;
    return {
      object,
      label,
      tms_count: tmsCount,
      qbo_mirror_count: mirrorCount,
      qbo_remote_count: remoteCount,
      remote_collected_at: remote ? remote.collected_at : null,
      reference,
      count_in_sync: tmsCount === refValue,
      count_delta: tmsCount - refValue,
      balance,
    };
  };

  const mkBalance = (label: string, tms: number, qbo: number): ReconBalance => ({
    label,
    tms_cents: tms,
    qbo_cents: qbo,
    in_sync: tms === qbo,
    delta_cents: tms - qbo,
  });

  const objects: ReconObject[] = [
    buildObject("customers", "Customers", toNum(c.tms_customers), toNum(c.mirror_customers), null),
    buildObject("vendors", "Vendors", toNum(c.tms_vendors), toNum(c.mirror_vendors), null),
    buildObject("accounts", "Chart of Accounts", toNum(c.tms_accounts), toNum(c.mirror_accounts), null),
    buildObject(
      "invoices",
      "Invoices",
      toNum(c.tms_invoices),
      toNum(c.mirror_invoices),
      mkBalance("AR — total invoiced", toNum(c.tms_ar_cents), toNum(c.qbo_ar_cents))
    ),
    buildObject(
      "bills",
      "Bills",
      toNum(c.tms_bills),
      toNum(c.mirror_bills),
      mkBalance("AP — total billed", toNum(c.tms_ap_cents), toNum(c.qbo_ap_cents))
    ),
  ];

  // ── 3) Existing reconciliation findings (drill-down source — display only). ──
  const findingsRes = await client.query<ReconFinding>(
    `
    SELECT
      id::text, finding_type, mirror_category, severity, status,
      drift_metric_abs, drift_metric_pct,
      resource_scope, local_value, remote_value,
      detected_at, first_seen_at, last_seen_at
    FROM _system.reconciliation_findings
    WHERE operating_company_id = $1 AND integration = 'qbo'
    ORDER BY (status = 'open') DESC, detected_at DESC
    LIMIT 200
    `,
    [operatingCompanyId]
  );
  const findings: ReconFinding[] = findingsRes.rows.map((f) => ({
    ...f,
    drift_metric_abs: f.drift_metric_abs != null ? Number(f.drift_metric_abs) : null,
    drift_metric_pct: f.drift_metric_pct != null ? Number(f.drift_metric_pct) : null,
  }));
  const openFindings = findings.filter((f) => f.status === "open").length;

  // ── 4) Sync state: last reconciliation tick + remote-count collector health. ──
  const stateRes = await client.query<{
    last_run_status: string | null;
    last_successful_tick_at: string | null;
    last_error_message: string | null;
  }>(
    `
    SELECT last_run_status, last_successful_tick_at, last_error_message
    FROM _system.reconciliation_state
    WHERE operating_company_id = $1 AND integration = 'qbo'
    ORDER BY last_successful_tick_at DESC NULLS LAST, updated_at DESC
    LIMIT 1
    `,
    [operatingCompanyId]
  );
  const collectorRes = await client.query<{
    last_success_at: string | null;
    last_failure_at: string | null;
    consecutive_failures: number | null;
  }>(
    `
    SELECT last_success_at, last_failure_at, consecutive_failures
    FROM accounting.qbo_remote_count_collection_state
    WHERE operating_company_id = $1
    LIMIT 1
    `,
    [operatingCompanyId]
  );
  const st = stateRes.rows[0];
  const col = collectorRes.rows[0];

  const sync_state: ReconSyncState = {
    last_run_status: st?.last_run_status ?? null,
    last_successful_tick_at: st?.last_successful_tick_at ?? null,
    last_error_message: st?.last_error_message ?? null,
    remote_counts_last_success_at: col?.last_success_at ?? null,
    remote_counts_last_failure_at: col?.last_failure_at ?? null,
    remote_counts_consecutive_failures: col?.consecutive_failures ?? null,
    remote_counts_available: remoteByEntity.size > 0,
  };

  return {
    generated_at: new Date().toISOString(),
    objects,
    findings,
    sync_state,
    open_findings_count: openFindings,
  };
}
