import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAnomalies, type SafetyAnomaly, type SafetyAnomalySeverity, type SafetyAnomalyStatus } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AnomalyDetailDrawer } from "./AnomalyDetailDrawer";

const SEVERITY_FILTERS: Array<SafetyAnomalySeverity | "all"> = ["all", "low", "medium", "high", "critical"];
const STATUS_FILTERS: Array<SafetyAnomalyStatus | "all"> = ["all", "new", "acknowledged", "resolved", "dismissed"];

function severityBadgeClass(severity: SafetyAnomalySeverity) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "high") return "bg-amber-100 text-amber-800";
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-3">
        <span className="text-xs font-semibold text-slate-700">Severity</span>
        {SEVERITY_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded px-2 py-1 text-xs ${severity === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
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
            className={`rounded px-2 py-1 text-xs ${status === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => setStatus(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Severity</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Subject</th>
              <th className="px-2 py-1 text-left">Detected At</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(anomaliesQuery.data?.anomalies ?? []).map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                onClick={() => setSelected(row)}
              >
                <td className="px-2 py-1">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${severityBadgeClass(row.severity)}`}>{row.severity}</span>
                </td>
                <td className="px-2 py-1">{row.anomaly_type}</td>
                <td className="px-2 py-1">
                  {row.subject_type} · {row.subject_id.slice(0, 8)}
                </td>
                <td className="px-2 py-1">{new Date(row.detected_at).toLocaleString()}</td>
                <td className="px-2 py-1">{row.status}</td>
                <td className="px-2 py-1">
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
                </td>
              </tr>
            ))}
            {anomaliesQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                  Loading anomalies...
                </td>
              </tr>
            ) : null}
            {!anomaliesQuery.isLoading && (anomaliesQuery.data?.anomalies ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                  No anomalies for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
