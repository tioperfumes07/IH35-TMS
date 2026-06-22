import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

  const { data, isLoading } = useQuery<{ data: Finding[] }>({
    queryKey: ["geofence-recon", operatingCompanyId, date],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/integrations/samsara/geofences/reconciliation?operating_company_id=${encodeURIComponent(operatingCompanyId)}&date=${date}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load reconciliation");
      return res.json();
    },
    enabled: !!operatingCompanyId,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ uuid, note }: { uuid: string; note: string }) => {
      const res = await fetch(
        `/api/v1/integrations/samsara/geofences/reconciliation/anomaly/${uuid}/resolve`,
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

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Geofence Reconciliation Report</h1>
      <div className="flex items-center gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Report Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {isLoading && <p className="text-gray-500">Loading...</p>}
      {!isLoading && findings.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded p-4 text-green-700">
          No anomalies found for {date}.
        </div>
      )}
      {Object.entries(byClass).map(([cls, items]) => (
        <div key={cls} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ANOMALY_COLORS[cls]}`}>
              {ANOMALY_LABELS[cls] ?? cls}
            </span>
            <span className="text-sm text-gray-500">{items.length} finding{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 border-b">Unit</th>
                <th className="text-left px-3 py-2 border-b">Geofence</th>
                <th className="text-left px-3 py-2 border-b">Time</th>
                <th className="text-left px-3 py-2 border-b">Status</th>
                <th className="text-left px-3 py-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.uuid} className={`border-b ${f.resolved ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2">{f.unit_id ?? "—"}</td>
                  <td className="px-3 py-2">{f.geofence_id ?? "—"}</td>
                  <td className="px-3 py-2">{f.occurred_at ? new Date(f.occurred_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">
                    {f.resolved
                      ? <span className="text-green-600">Resolved</span>
                      : <span className="text-yellow-600">Open</span>}
                  </td>
                  <td className="px-3 py-2">
                    {!f.resolved && (
                      <button
                        onClick={() => resolveMutation.mutate({ uuid: f.uuid, note: "Resolved via UI" })}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default GeofenceReconciliationReport;
