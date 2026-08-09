import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ReportsSubNav } from "./ReportsSubNav";
import { formatDateTimeUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";

interface Finding {
  uuid: string;
  anomaly_class: "orphan_entry" | "orphan_exit" | "duplicate_fire" | "expected_missing";
  geofence_id: string | null;
  unit_id: string | null;
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
  const [operatingCompanyId] = useState(() => sessionStorage.getItem("operating_company_id") ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(yesterday);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: Finding[] }>({
    queryKey: ["geofence-recon", operatingCompanyId, date],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/integrations/samsara/geofences/reconciliation?operating_company_id=${encodeURIComponent(operatingCompanyId)}&date=${date}`),
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

  const findings = data?.data ?? [];
  const byClass = findings.reduce((acc, f) => {
    (acc[f.anomaly_class] = acc[f.anomaly_class] ?? []).push(f);
    return acc;
  }, {} as Record<string, Finding[]>);

  const findingColumns = useMemo<ParityColumn<Finding>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (f) => <EntityLink kind="unit" id={f.unit_id ?? undefined} label={f.unit_id ? entityLabel(null, f.unit_id, "Unit") : "—"} /> },
      { key: "geofence_id", label: "Geofence", render: (f) => f.geofence_id ?? "—" },
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
      <div className="flex items-center gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Report Date</label>
          <DatePicker
            value={date}
            onChange={setDate}
            max={today}
            className="border rounded-sm px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && (
        <ListErrorState
          title="Couldn't load reconciliation"
          status={0}
          message={userFacingApiError(error, "Request failed")}
          onRetry={() => void refetch()}
        />
      )}
      {!isLoading && !isError && findings.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm p-4 text-green-700">
          No anomalies found for {date}.
        </div>
      )}
      {Object.entries(byClass).map(([cls, items]) => (
        <div key={cls} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${ANOMALY_COLORS[cls]}`}>
              {ANOMALY_LABELS[cls] ?? cls}
            </span>
            <span className="text-sm text-gray-500">{items.length} finding{items.length !== 1 ? "s" : ""}</span>
          </div>
          <ParityTable
            rows={items}
            columns={findingColumns}
            rowKey={(f) => f.uuid}
            loading={false}
            storageKey={`geofence-recon-${cls}`}
            emptyText="No findings."
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
        </div>
      ))}
    </div>
  );
}

export default GeofenceReconciliationReport;
