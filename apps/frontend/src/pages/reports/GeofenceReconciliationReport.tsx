import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { formatDateTimeUS, formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { useCompanyContext } from "../../contexts/CompanyContext";

interface Finding {
  uuid: string;
  anomaly_class: "orphan_entry" | "orphan_exit" | "duplicate_fire" | "expected_missing";
  geofence_id: string | null;
  geofence_label: string | null;
  unit_id: string | null;
  unit_number: string | null;
  load_uuid: string | null;
  occurred_at: string | null;
  resolved: boolean;
  details: Record<string, unknown>;
}

const ANOMALY_LABELS: Record<string, string> = {
  orphan_entry: "Entry without Exit",
  orphan_exit: "Exit without Entry",
  duplicate_fire: "Duplicate Fire (<60s)",
  expected_missing: "Missing Expected Event",
};

const ANOMALY_COLORS: Record<string, string> = {
  orphan_entry: "bg-yellow-100 text-yellow-800",
  orphan_exit: "bg-orange-100 text-orange-800",
  duplicate_fire: "bg-slate-100 text-slate-700",
  expected_missing: "bg-red-100 text-red-800",
};

export function GeofenceReconciliationReport() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const today = companyToday();
  const yesterday = addDaysIso(today, -1);
  const [appliedDate, setAppliedDate] = useState(yesterday);
  const staged = useStagedListFilters({
    applied: { reportDate: appliedDate },
    empty: { reportDate: yesterday },
    onApply: (next) => setAppliedDate(next.reportDate),
  });
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: Finding[] }>({
    queryKey: ["geofence-recon", operatingCompanyId, appliedDate],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/integrations/samsara/geofences/reconciliation?operating_company_id=${encodeURIComponent(operatingCompanyId)}&date=${appliedDate}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load reconciliation");
      return res.json();
    },
    enabled: !!operatingCompanyId,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ uuid, note }: { uuid: string; note: string }) => {
      const res = await fetch(resolveApiUrl(`/api/v1/integrations/samsara/geofences/reconciliation/anomaly/${uuid}/resolve`),
        { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ note }) }
      );
      if (!res.ok) throw new Error("Failed to resolve");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["geofence-recon"] }),
  });

  // RPT-F3524: always feed one ParityTable (never green-only bypass) so Search+Range+gear mount on 0-row too.
  const findings = data?.data ?? [];

  const findingColumns = useMemo<ParityColumn<Finding>[]>(
    () => [
      {
        key: "anomaly_class",
        label: "Class",
        render: (f) => (
          <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${ANOMALY_COLORS[f.anomaly_class] ?? "bg-slate-100 text-slate-700"}`}>
            {ANOMALY_LABELS[f.anomaly_class] ?? f.anomaly_class}
          </span>
        ),
      },
      { key: "unit_id", label: "Unit", render: (f) => <EntityLink kind="unit" id={f.unit_id ?? undefined} label={f.unit_id ? entityLabel(f.unit_number, f.unit_id, "Unit") : "—"} /> },
      { key: "geofence_id", label: "Geofence", render: (f) => <EntityLink kind="geofence" id={f.geofence_id ?? undefined} label={entityLabel(f.geofence_label, f.geofence_id, "Geofence")} /> },
      { key: "occurred_at", label: "Time", sortable: true, render: (f) => (f.occurred_at ? `${formatDateTimeUS(f.occurred_at)} CT` : "—") },
      {
        key: "resolved",
        label: "Status",
        render: (f) => (f.resolved ? <span className="text-green-600">Resolved</span> : <span className="text-yellow-600">Open</span>),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        backHref="/reports"
        breadcrumb={["Reports", "Geofence Reconciliation Report"]}
        title="Geofence Reconciliation Report"
      />
      <CollapsedListFilters
        activeFilterCount={appliedDate !== yesterday ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-geofence-recon"
        className="mb-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Report Date</label>
          <DatePicker value={staged.draft.reportDate} onChange={(next) => staged.setDraft({ reportDate: next })} max={today} className="" />
        </div>
      </CollapsedListFilters>
      {isError && (
        <ListErrorState
          title="Couldn't load reconciliation"
          status={0}
          message={userFacingApiError(error, "Request failed")}
          onRetry={() => void refetch()}
        />
      )}
      {!isError && (
        <ParityTable
          rows={findings}
          columns={findingColumns}
          rowKey={(f) => f.uuid}
          loading={isLoading}
          storageKey="geofence-recon"
          emptyText={`No anomalies found for ${formatDateUS(appliedDate)}.`}
          exportFilename={`geofence-recon-${appliedDate}`}
          rowClassName={(f) => (f.resolved ? "opacity-50" : "")}
          rowActions={(f) =>
            !f.resolved ? (
              <button
                onClick={() => resolveMutation.mutate({ uuid: f.uuid, note: "Resolved via UI" })}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-sm"
              >
                Mark Resolved
              </button>
            ) : null
          }
        />
      )}
    </div>
  );
}

export default GeofenceReconciliationReport;
