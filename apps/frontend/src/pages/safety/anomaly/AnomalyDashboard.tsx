import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";

type Props = { operatingCompanyId: string };

export function AnomalyDashboard({ operatingCompanyId }: Props) {
  const qc = useQueryClient();
  const [severity, setSeverity] = useState("");
  const q = useQuery({
    queryKey: ["anomaly-alerts", operatingCompanyId, severity],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => apiRequest<{ alerts: Array<Record<string, unknown>> }>(
      `/api/safety/anomaly/alerts?operating_company_id=${encodeURIComponent(operatingCompanyId)}&status=open${severity ? `&severity=${severity}` : ""}`
    ),
  });
  const ack = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/api/safety/anomaly/alerts/${uuid}/acknowledge`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomaly-alerts"] }),
  });
  const resolve = useMutation({
    mutationFn: ({ uuid, notes }: { uuid: string; notes: string }) =>
      apiRequest(`/api/safety/anomaly/alerts/${uuid}/resolve`, { method: "PATCH", body: JSON.stringify({ status: "resolved", notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomaly-alerts"] }),
  });
  return (
    <div className="space-y-3 p-3" data-testid="anomaly-dashboard">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Anomaly Alerts</h1>
        <select className="rounded border px-2 py-1 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="warn">Warn</option>
        </select>
      </div>
      <div className="overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Detected</th><th className="p-2 text-left">Severity</th><th className="p-2 text-left">Evidence</th><th className="p-2">Actions</th></tr></thead>
          <tbody>
            {(q.data?.alerts ?? []).map((row) => (
              <tr key={String(row.uuid)} className="border-t">
                <td className="p-2">{String(row.detected_at ?? "")}</td>
                <td className="p-2 font-semibold">{String(row.severity ?? "")}</td>
                <td className="p-2 font-mono text-xs">{JSON.stringify(row.evidence ?? {})}</td>
                <td className="p-2 space-x-1">
                  <Button type="button" variant="secondary" onClick={() => ack.mutate(String(row.uuid))}>Ack</Button>
                  <Button type="button" onClick={() => resolve.mutate({ uuid: String(row.uuid), notes: "Resolved from dashboard" })}>Resolve</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
