import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRosterIntegrity, runRosterIntegrity, voidRosterFinding, type RosterFinding } from "../../api/fleetRoster";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatDateTimeUS } from "../../lib/formatDate";
import { formatQueryErrorDetail } from "../../lib/tableError";

/**
 * ROUND 313 E-17 — fleet roster integrity: every active unit reconciled against Samsara, the insurance
 * schedule, IRP and the lease. One row per mismatch; a mismatch that clears is resolved by the engine, never
 * deleted; a person may void one with a reason.
 */
const SEVERITY_LABEL: Record<RosterFinding["severity"], string> = { critical: "Critical", warning: "Warning", info: "Info" };

export function RosterIntegrityPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [showClosed, setShowClosed] = useState(false);
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const query = useQuery({
    queryKey: ["fleet", "roster-integrity", companyId, showClosed],
    queryFn: () => getRosterIntegrity(companyId, showClosed),
    enabled: Boolean(companyId),
  });
  const run = useMutation({
    mutationFn: () => runRosterIntegrity(companyId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fleet", "roster-integrity", companyId] }),
  });
  const voidMut = useMutation({
    mutationFn: (v: { id: string; reason: string }) => voidRosterFinding(companyId, v.id, v.reason),
    onSuccess: () => {
      setVoiding(null);
      void qc.invalidateQueries({ queryKey: ["fleet", "roster-integrity", companyId] });
    },
  });
  const rules = query.data?.rules ?? {};

  const columns = useMemo<ParityColumn<RosterFinding>[]>(
    () => [
      { key: "severity", label: "Severity", alwaysVisible: true, sortValue: (r) => ({ critical: 0, warning: 1, info: 2 })[r.severity], render: (r) => SEVERITY_LABEL[r.severity] },
      { key: "rule_code", label: "Check", render: (r) => rules[r.rule_code]?.label ?? r.rule_code },
      {
        key: "unit_number",
        label: "Unit",
        sortValue: (r) => r.unit_number,
        render: (r) => (r.unit_id ? <EntityLink kind="unit" id={r.unit_id} label={r.unit_number ?? "Unit"} className="underline" /> : r.samsara_vehicle_id ? `Samsara ${r.samsara_vehicle_id}` : "—"),
      },
      { key: "detail", label: "Finding", render: (r) => r.detail },
      {
        key: "policy_number",
        label: "Policy",
        render: (r) => (r.policy_id ? <EntityLink kind="insurance_policy" id={r.policy_id} label={r.policy_number ?? "Policy"} className="underline" /> : "—"),
      },
      {
        key: "insurer_vendor_id",
        label: "Insurer",
        render: (r) => (r.insurer_vendor_id ? <EntityLink kind="vendor" id={r.insurer_vendor_id} label="Insurer" className="underline" /> : "—"),
      },
      { key: "first_detected_at", label: "First seen", sortValue: (r) => r.first_detected_at, render: (r) => formatDateTimeUS(r.first_detected_at) },
      {
        key: "state",
        label: "State",
        render: (r) =>
          r.voided_at ? `Voided — ${r.void_reason}` : r.resolved_at ? `Resolved ${formatDateTimeUS(r.resolved_at)}` : (
            <Button size="sm" variant="secondary" onClick={() => setVoiding({ id: r.id, reason: "" })}>Void…</Button>
          ),
      },
    ],
    [rules]
  );

  return (
    <div className="space-y-3 p-3">
      <PageHeader
        title="Fleet roster integrity"
        subtitle="Units reconciled against Samsara, the insurance schedule, IRP and the lease — one row per mismatch"
        breadcrumb={["Fleet", "Roster integrity"]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show resolved / voided
            </label>
            <Button size="sm" onClick={() => run.mutate()} disabled={!companyId || run.isPending}>{run.isPending ? "Running…" : "Run now"}</Button>
          </div>
        }
      />
      <p className="text-xs text-gray-600">
        Last run: {query.data?.last_run_at ? formatDateTimeUS(query.data.last_run_at) : "not yet run for this entity"}
        {run.data ? ` · this run: ${run.data.open} open, ${run.data.resolved} resolved` : ""}
      </p>
      {voiding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-white p-2" data-testid="roster-void-box">
          <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
            Reason for voiding this finding
            <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} />
          </label>
          <Button size="sm" disabled={voiding.reason.trim().length < 3 || voidMut.isPending} onClick={() => voidMut.mutate(voiding)}>Void finding</Button>
          <Button size="sm" variant="secondary" onClick={() => setVoiding(null)}>Cancel</Button>
          {voidMut.error ? <ListErrorState {...formatQueryErrorDetail(voidMut.error)} onRetry={() => voidMut.reset()} /> : null}
        </div>
      ) : null}
      {query.isError ? (
        <ListErrorState {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable
          rows={query.data?.findings ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          storageKey="fleet-roster-integrity"
          exportFilename="fleet-roster-integrity"
          tableTestId="fleet-roster-integrity-table"
          emptyText="No roster mismatches for this entity."
        />
      )}
    </div>
  );
}
