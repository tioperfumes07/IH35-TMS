import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { MobileOptimizedTable } from "../../../components/shared/MobileOptimizedTable";

type Props = { operatingCompanyId: string };

type AlertRow = Record<string, unknown>;

export function AnomalyDashboard({ operatingCompanyId }: Props) {
  const qc = useQueryClient();
  const [severity, setSeverity] = useState("");
  const q = useQuery({
    queryKey: ["anomaly-alerts", operatingCompanyId, severity],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => apiRequest<{ alerts: AlertRow[] }>(
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
  const rows = q.data?.alerts ?? [];
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
      <MobileOptimizedTable
        rows={rows}
        rowKey={(row) => String(row.uuid)}
        emptyMessage="No open anomaly alerts"
        columns={[
          { key: "detected_at", header: "Detected", render: (row) => String(row.detected_at ?? "") },
          { key: "severity", header: "Severity", render: (row) => <span className="font-semibold">{String(row.severity ?? "")}</span> },
          { key: "evidence", header: "Evidence", render: (row) => <span className="font-mono text-xs">{JSON.stringify(row.evidence ?? {})}</span> },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="secondary" onClick={() => ack.mutate(String(row.uuid))}>Ack</Button>
                <Button type="button" onClick={() => resolve.mutate({ uuid: String(row.uuid), notes: "Resolved from dashboard" })}>Resolve</Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
