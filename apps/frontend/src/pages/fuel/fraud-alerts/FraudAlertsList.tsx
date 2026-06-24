import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type FraudAlertRow = {
  uuid: string;
  fuel_transaction_uuid: string;
  rule_id: string;
  severity: "info" | "warn" | "critical";
  detected_at: string;
  evidence: Record<string, unknown>;
  status: string;
  transaction_at: string;
  gallons: number | null;
  location_city: string | null;
  location_state: string | null;
};

type SortKey = "detected_at" | "severity" | "rule_id" | "status";

function severityClass(severity: FraudAlertRow["severity"]) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

async function listAlerts(companyId: string, status?: string, severity?: string) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  return apiRequest<{ alerts: FraudAlertRow[] }>(`/api/v1/fuel/fraud-alerts?${params.toString()}`);
}

export function FraudAlertsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");
  const [sortKey, setSortKey] = useState<SortKey>("detected_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const alertsQuery = useQuery({
    queryKey: ["fuel", "fraud-alerts", companyId, statusFilter],
    queryFn: () => listAlerts(companyId, statusFilter),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fuel", "fraud-alerts"] });
  };

  const investigateMut = useMutation({
    mutationFn: (uuid: string) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/investigate`, {
        method: "PATCH",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Alert marked investigating.", "success");
      invalidate();
    },
  });

  const confirmMut = useMutation({
    mutationFn: (uuid: string) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/confirm-fraud`, {
        method: "PATCH",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Alert confirmed as fraud.", "error");
      invalidate();
    },
  });

  const dismissMut = useMutation({
    mutationFn: ({ uuid, reason }: { uuid: string; reason: string }) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/dismiss`, {
        method: "PATCH",
        body: { operating_company_id: companyId, reason },
      }),
    onSuccess: () => {
      pushToast("Alert dismissed.", "success");
      invalidate();
    },
  });

  const sorted = useMemo(() => {
    const rows = [...(alertsQuery.data?.alerts ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [alertsQuery.data?.alerts, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fuel fraud alerts"
        subtitle="CAP-11 real-time fuel card fraud monitoring"
        actions={
          <Link to="/fuel" className="text-xs font-semibold text-slate-700 hover:underline">
            Back to Fuel Home
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {["open", "investigating", "dismissed", "confirmed_fraud"].map((status) => (
          <button
            key={status}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${statusFilter === status ? "border-slate-300 bg-slate-100" : "border-gray-300"}`}
            onClick={() => setStatusFilter(status)}
          >
            {status.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("detected_at")}>
                Detected
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("severity")}>
                Severity
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("rule_id")}>
                Rule
              </th>
              <th className="px-2 py-2">Location</th>
              <th className="px-2 py-2">Gallons</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("status")}>
                Status
              </th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.uuid} className="border-t border-gray-100">
                <td className="px-2 py-2">{new Date(row.detected_at).toLocaleString()}</td>
                <td className="px-2 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(row.severity)}`}>
                    {row.severity}
                  </span>
                </td>
                <td className="px-2 py-2 font-mono text-[10px]">{row.rule_id}</td>
                <td className="px-2 py-2">
                  {[row.location_city, row.location_state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-2 py-2">{row.gallons != null ? row.gallons.toFixed(1) : "—"}</td>
                <td className="px-2 py-2">{row.status}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <ActionButton disabled={investigateMut.isPending} onClick={() => investigateMut.mutate(row.uuid)}>
                      Investigate
                    </ActionButton>
                    <ActionButton disabled={confirmMut.isPending} onClick={() => confirmMut.mutate(row.uuid)}>
                      Confirm fraud
                    </ActionButton>
                    <ActionButton
                      disabled={dismissMut.isPending}
                      onClick={() => {
                        const reason = window.prompt("Dismiss reason");
                        if (reason?.trim()) dismissMut.mutate({ uuid: row.uuid, reason: reason.trim() });
                      }}
                    >
                      Dismiss
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-gray-500">
                  No fraud alerts for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
