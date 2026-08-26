import { useEffect, useRef, useState } from "react";
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
  const actionGenerationRef = useRef(0);
  const [actionError, setActionError] = useState<unknown>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const severity = parseSeverity(searchParams.get("severity"));
  const setSeverity = (next: string | null) => {
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
    mutationFn: (input: { uuid: string; companyId: string; severity: string; generation: number }) =>
      apiRequest(`/api/safety/anomaly/alerts/${input.uuid}/acknowledge`, { method: "PATCH", body: { operating_company_id: input.companyId } }),
    onMutate: () => setActionError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await qc.invalidateQueries({ queryKey: ["anomaly-alerts", input.companyId, input.severity] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setActionError(error);
    },
  });
  const resolve = useMutation({
    mutationFn: (input: { uuid: string; companyId: string; severity: string; generation: number; notes: string }) =>
      apiRequest(`/api/safety/anomaly/alerts/${input.uuid}/resolve`, { method: "PATCH", body: { operating_company_id: input.companyId, status: "resolved", notes: input.notes } }),
    onMutate: () => setActionError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await qc.invalidateQueries({ queryKey: ["anomaly-alerts", input.companyId, input.severity] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setActionError(error);
    },
  });
  useEffect(() => {
    actionGenerationRef.current += 1;
    setActionError(null);
    ack.reset();
    resolve.reset();
  }, [operatingCompanyId]); // Company transitions own a fresh anomaly-action lifecycle.
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
                  <Button type="button" variant="secondary" onClick={() => ack.mutate({ uuid: String(row.uuid), companyId: operatingCompanyId, severity, generation: actionGenerationRef.current })}>Ack</Button>
                  <Button type="button" onClick={() => resolve.mutate({ uuid: String(row.uuid), companyId: operatingCompanyId, severity, generation: actionGenerationRef.current, notes: "Resolved from dashboard" })}>Resolve</Button>
                </div>
              ),
            },
          ]}
        />
      )}
      {actionError ? (
        <p className="text-xs text-red-700" data-testid="anomaly-dashboard-action-error">
          {userFacingApiError(actionError, "Could not update the anomaly alert.")}
        </p>
      ) : null}
    </div>
  );
}
