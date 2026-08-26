import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { MobileOptimizedTable } from "../../../components/shared/MobileOptimizedTable";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Combobox } from "../../../components/Combobox";

type Props = { operatingCompanyId: string };

type AlertRow = Record<string, unknown>;

const SEVERITY_VALUES = new Set(["critical", "high", "warn"]);

function parseSeverity(raw: string | null): string {
  return raw && SEVERITY_VALUES.has(raw) ? raw : "";
}

export function AnomalyDashboard({ operatingCompanyId }: Props) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const severity = parseSeverity(searchParams.get("severity"));
  const setSeverity = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!next) params.delete("severity");
        else params.set("severity", next);
        return params;
      },
      { replace: true },
    );
  };
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
      apiRequest(`/api/safety/anomaly/alerts/${uuid}/resolve`, { method: "PATCH", body: { status: "resolved", notes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomaly-alerts"] }),
  });
  const rows = q.data?.alerts ?? [];
  return (
    <div className="space-y-3 p-3" data-testid="anomaly-dashboard">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Anomaly Alerts</h1>
        <label htmlFor="anomaly-severity-filter" className="sr-only">Severity</label>
        <Combobox
          id="anomaly-severity-filter"
          dataTestId="anomaly-severity-filter"
          value={severity}
          options={[
            { value: "", label: "All severities" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "warn", label: "Warn" },
          ]}
          onChange={setSeverity}
          ariaLabel="Severity"
          className="min-w-40"
        />
      </div>
      {q.isError ? (
        <p className="text-xs text-red-700" data-testid="anomaly-dashboard-query-error">
          {userFacingApiError(q.error, "Could not load anomaly alerts.")}
        </p>
      ) : (
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
      )}
      {(ack.isError || resolve.isError) ? (
        <p className="text-xs text-red-700" data-testid="anomaly-dashboard-action-error">
          {userFacingApiError(ack.error ?? resolve.error, "Could not update the anomaly alert.")}
        </p>
      ) : null}
    </div>
  );
}
