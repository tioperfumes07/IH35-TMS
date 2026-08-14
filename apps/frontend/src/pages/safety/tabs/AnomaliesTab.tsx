import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAnomalies, type SafetyAnomaly, type SafetyAnomalySeverity, type SafetyAnomalyStatus } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AnomalyDetailDrawer } from "./AnomalyDetailDrawer";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";

const SEVERITY_FILTERS: Array<SafetyAnomalySeverity | "all"> = ["all", "low", "medium", "high", "critical"];
const STATUS_FILTERS: Array<SafetyAnomalyStatus | "all"> = ["all", "new", "acknowledged", "resolved", "dismissed"];

function subjectEntityKind(subjectType: SafetyAnomaly["subject_type"]): EntityKind | null {
  if (subjectType === "driver" || subjectType === "unit" || subjectType === "customer" || subjectType === "invoice") {
    return subjectType;
  }
  return null;
}

function subjectLabel(subjectType: SafetyAnomaly["subject_type"]): string {
  if (subjectType === "driver") return "Driver";
  if (subjectType === "unit") return "Unit";
  if (subjectType === "customer") return "Customer";
  if (subjectType === "invoice") return "Invoice";
  return "Subject";
}

function severityBadgeClass(severity: SafetyAnomalySeverity) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "high") return "bg-slate-100 text-slate-700";
  if (severity === "medium") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export function AnomaliesTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [severity, setSeverity] = useState<SafetyAnomalySeverity | "all">("all");
  const [status, setStatus] = useState<SafetyAnomalyStatus | "all">("all");
  const staged = useStagedListFilters({
    applied: { severity, status },
    empty: { severity: "all" as const, status: "all" as const },
    onApply: (next) => { setSeverity(next.severity); setStatus(next.status); },
  });
  const [selected, setSelected] = useState<SafetyAnomaly | null>(null);

  const anomaliesQuery = useQuery({
    queryKey: ["safety", "anomalies", companyId, severity, status],
    queryFn: () =>
      listAnomalies(companyId, {
        severity: severity === "all" ? undefined : severity,
        status: status === "all" ? undefined : status,
      }),
    enabled: Boolean(companyId),
  });
  const rows = anomaliesQuery.data?.anomalies ?? [];
  const anomalyId = searchParams.get("anomaly_id");
  useEffect(() => {
    if (!anomalyId) return;
    const match = rows.find((row) => row.id === anomalyId);
    if (match) setSelected(match);
  }, [anomalyId, rows]);

  const columns = useMemo<ParityColumn<SafetyAnomaly>[]>(
    () => [
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => <span className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${severityBadgeClass(row.severity)}`}>{row.severity}</span>,
      },
      { key: "anomaly_type", label: "Type", sortable: true },
      {
        key: "subject",
        label: "Subject",
        render: (row) => {
          const kind = subjectEntityKind(row.subject_type);
          if (!kind) {
            return <span>{row.subject_type}</span>;
          }
          return (
            <span className="inline-flex items-center gap-1">
              <span>{row.subject_type}</span>
              <span>·</span>
              <EntityLink kind={kind} id={row.subject_id} label={subjectLabel(row.subject_type)} />
            </span>
          );
        },
      },
      {
        key: "detected_at",
        label: "Detected At",
        sortable: true,
        render: (row) => new Date(row.detected_at).toLocaleString(),
      },
      { key: "status", label: "Status", sortable: true },
      {
        key: "action",
        label: "Actions",
        render: (row) => (
          <button
            type="button"
            className="text-slate-700 underline"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row);
            }}
          >
            Open
          </button>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={(severity !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0)}
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      applyDisabled={!staged.dirty}
      testIdPrefix="anomalies"
      dataAttributes={{ "data-anomalies-filter-toolbar": "collapsed" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">Severity</span>
        {SEVERITY_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-sm px-2 py-1 text-xs ${staged.draft.severity === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => staged.setDraft({ ...staged.draft, severity: item })}
          >
            {item}
          </button>
        ))}
        <span className="ml-3 text-xs font-semibold text-slate-700">Status</span>
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
          className={`rounded-sm px-2 py-1 text-xs ${staged.draft.status === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => staged.setDraft({ ...staged.draft, status: item })}
          >
            {item}
          </button>
        ))}
      </div>
    </CollapsedListFilters>
  );

  return (
    <div className="space-y-3">
      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No anomalies for selected filters." — an outage
          presenting as a fleet with nothing anomalous. */}
      {anomaliesQuery.isError ? (
        <ListErrorState
          title="Couldn't load anomalies"
          status={0}
          message={(anomaliesQuery.error as Error)?.message}
          onRetry={() => void anomaliesQuery.refetch()}
        />
      ) : (
      <ParityTable<SafetyAnomaly>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={anomaliesQuery.isLoading}
        onRowClick={(row) => setSelected(row)}
        emptyText="No anomalies for selected filters."
        storageKey="safety-anomalies"
        exportFilename="anomalies"
        filterBar={filterBar}
      />
      )}

      <AnomalyDetailDrawer
        open={Boolean(selected)}
        anomalyId={selected?.id ?? null}
        operatingCompanyId={companyId}
        initialAnomaly={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", companyId] })}
      />
    </div>
  );
}
