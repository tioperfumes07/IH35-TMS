import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAnomalies, type SafetyAnomaly, type SafetyAnomalySeverity, type SafetyAnomalyStatus } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AnomalyDetailDrawer } from "./AnomalyDetailDrawer";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

const SEVERITY_FILTERS: Array<SafetyAnomalySeverity | "all"> = ["all", "low", "medium", "high", "critical"];
const STATUS_FILTERS: Array<SafetyAnomalyStatus | "all"> = ["all", "new", "acknowledged", "resolved", "dismissed"];

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
  const [severity, setSeverity] = useState<SafetyAnomalySeverity | "all">("all");
  const [status, setStatus] = useState<SafetyAnomalyStatus | "all">("all");
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
        render: (row) => (
          <>
            {row.subject_type} · {row.subject_id.slice(0, 8)}
          </>
        ),
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-700">Severity</span>
      {SEVERITY_FILTERS.map((item) => (
        <button
          key={item}
          type="button"
          className={`rounded-sm px-2 py-1 text-xs ${severity === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
          onClick={() => setSeverity(item)}
        >
          {item}
        </button>
      ))}
      <span className="ml-3 text-xs font-semibold text-slate-700">Status</span>
      {STATUS_FILTERS.map((item) => (
        <button
          key={item}
          type="button"
          className={`rounded-sm px-2 py-1 text-xs ${status === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
          onClick={() => setStatus(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <ParityTable<SafetyAnomaly>
        columns={columns}
        rows={anomaliesQuery.data?.anomalies ?? []}
        rowKey={(row) => row.id}
        loading={anomaliesQuery.isLoading}
        onRowClick={(row) => setSelected(row)}
        emptyText="No anomalies for selected filters."
        storageKey="safety-anomalies"
        exportFilename="anomalies"
        filterBar={filterBar}
      />

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
