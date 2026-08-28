/**
 * LEDGER-HEALTH — cross-integration reconciliation findings dashboard (READ-ONLY).
 *
 * GO-2228/GO-2050 launch-safe directive: "books cannot silently lie." Detectors write findings to
 * the ALREADY-EXISTING `_system.reconciliation_findings` / `_system.reconciliation_state` tables
 * (built for QBO reconciliation, `db/migrations/0200_ds_remediate_reconciliation_findings.sql` /
 * `0202_ds_remediate_reconciliation_state.sql`); this module reads them for ALL integrations, not
 * just 'qbo' — the same tables' `integration` CHECK constraint today allows only
 * ('qbo','samsara','plaid','fmcsa'); a 'ledger' value is a separate, tracked schema change (not
 * built here — see docs/lockdown/CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md §1 "Monitor").
 * This dashboard needs no further FE/BE work once that lands: any new integration value just
 * starts appearing in the SAME grouped summary and findings list below.
 *
 * SELF-CLOSE ONLY / NO HUMAN RESOLVE: this module — and the route that calls it — issues SELECT
 * statements ONLY. There is no PATCH/POST endpoint anywhere in this file or its route to change a
 * finding's status. Findings self-close (the detector/cron re-checks and flips status itself, the
 * same UPDATE pattern reconciliation-worker.service.ts already uses for its own re-detection
 * pass) or stay open until a human explicitly builds a separate, audited resolve action — this
 * dashboard is display-only by construction, enforced by
 * scripts/verify-ledger-health-no-human-resolve.mjs.
 *
 * Per-entity: scoped via withCompanyScope's RLS GUC plus an explicit operating_company_id
 * predicate on every read, mirroring qbo-recon-reads.ts exactly.
 */

export type LedgerHealthClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type LedgerHealthFinding = {
  id: string;
  integration: string;
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

export type LedgerHealthIntegrationSummary = {
  integration: string;
  open_count: number;
  critical_open_count: number;
  last_successful_tick_at: string | null;
  last_run_status: string | null;
};

export type LedgerHealthResult = {
  generated_at: string;
  findings: LedgerHealthFinding[];
  open_findings_count: number;
  critical_open_count: number;
  important_open_count: number;
  cleanup_open_count: number;
  by_integration: LedgerHealthIntegrationSummary[];
};

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

export async function fetchLedgerHealth(
  client: LedgerHealthClient,
  operatingCompanyId: string
): Promise<LedgerHealthResult> {
  // ── 1) Findings across every integration — open first, newest first, display-only. ──
  const findingsRes = await client.query<LedgerHealthFinding>(
    `
    SELECT
      id::text, integration, finding_type, mirror_category, severity, status,
      drift_metric_abs, drift_metric_pct,
      resource_scope, local_value, remote_value,
      detected_at, first_seen_at, last_seen_at
    FROM _system.reconciliation_findings
    WHERE operating_company_id = $1::uuid
    ORDER BY (status = 'open') DESC, severity = 'critical' DESC, detected_at DESC
    LIMIT 200
    `,
    [operatingCompanyId]
  );
  const findings: LedgerHealthFinding[] = findingsRes.rows.map((f) => ({
    ...f,
    drift_metric_abs: toNum(f.drift_metric_abs),
    drift_metric_pct: toNum(f.drift_metric_pct),
  }));

  const openFindings = findings.filter((f) => f.status === "open");
  const open_findings_count = openFindings.length;
  const critical_open_count = openFindings.filter((f) => f.severity === "critical").length;
  const important_open_count = openFindings.filter((f) => f.severity === "important").length;
  const cleanup_open_count = openFindings.filter((f) => f.severity === "cleanup").length;

  // ── 2) Per-integration open/critical counts + last successful tick, from the same tables. ──
  const stateRes = await client.query<{
    integration: string;
    last_run_status: string | null;
    last_successful_tick_at: string | null;
  }>(
    `
    SELECT DISTINCT ON (integration) integration, last_run_status, last_successful_tick_at
    FROM _system.reconciliation_state
    WHERE operating_company_id = $1::uuid
    ORDER BY integration, last_successful_tick_at DESC NULLS LAST, updated_at DESC
    `,
    [operatingCompanyId]
  );
  const stateByIntegration = new Map(stateRes.rows.map((r) => [r.integration, r]));

  const integrations = new Set<string>([
    ...openFindings.map((f) => f.integration),
    ...stateRes.rows.map((r) => r.integration),
  ]);
  const by_integration: LedgerHealthIntegrationSummary[] = Array.from(integrations)
    .sort()
    .map((integration) => {
      const st = stateByIntegration.get(integration);
      const integrationOpen = openFindings.filter((f) => f.integration === integration);
      return {
        integration,
        open_count: integrationOpen.length,
        critical_open_count: integrationOpen.filter((f) => f.severity === "critical").length,
        last_successful_tick_at: st?.last_successful_tick_at ?? null,
        last_run_status: st?.last_run_status ?? null,
      };
    });

  return {
    generated_at: new Date().toISOString(),
    findings,
    open_findings_count,
    critical_open_count,
    important_open_count,
    cleanup_open_count,
    by_integration,
  };
}
