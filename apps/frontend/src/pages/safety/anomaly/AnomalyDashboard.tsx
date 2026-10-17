import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { ParityTable } from "../../../components/parity/ParityTable";
import { userFacingApiError } from "../../../lib/api-error-message";
import { Combobox } from "../../../components/Combobox";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";

type Props = { operatingCompanyId: string };

type AlertRow = Record<string, unknown>;

const SEVERITY_VALUES = new Set(["critical", "high", "warn"]);
const LINKABLE_SUBJECT_KINDS = new Set<EntityKind>(["driver", "unit", "load", "geofence"]);

function anomalySubjectKind(row: AlertRow): EntityKind | null {
  const kind = String(row.subject_kind ?? "") as EntityKind;
  return LINKABLE_SUBJECT_KINDS.has(kind) ? kind : null;
}

function parseSeverity(raw: string | null): string {
  return raw && SEVERITY_VALUES.has(raw) ? raw : "";
}

export function AnomalyDashboard({ operatingCompanyId }: Props) {
  const qc = useQueryClient();
  const actionGenerationRef = useRef(0);
  const [actionError, setActionError] = useState<unknown>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const severity = parseSeverity(searchParams.get("severity"));
  const [page, setPage] = useState(0);
  const pageSize = 50;
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
    queryKey: ["anomaly-alerts", operatingCompanyId, severity, page],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => apiRequest<{ alerts: AlertRow[]; total_count: number }>(
      `/api/safety/anomaly/alerts?operating_company_id=${encodeURIComponent(operatingCompanyId)}&status=open&limit=${pageSize}&offset=${page * pageSize}${severity ? `&severity=${severity}` : ""}`
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
    setPage(0);
  }, [operatingCompanyId]); // Company transitions own a fresh anomaly-action lifecycle.
  useEffect(() => setPage(0), [severity]);
  const rows = q.data?.alerts ?? [];
  const totalCount = q.data?.total_count ?? 0;
  return (
    <div className="space-y-3 p-3" data-testid="anomaly-dashboard">
      <div className="flex items-center gap-2">
        <h1 className="text-page-title font-semibold">Anomaly Alerts</h1>
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
        // LEAD 443.181 — the app's one table. A row opens its subject (driver / unit / load / geofence) through the
        // Subject EntityLink; rows with no linkable subject stay un-clickable. Rows are server-paged — the external
        // pager below owns paging, so the built-in pager is hidden.
        <ParityTable<AlertRow>
          title="Open anomaly alerts"
          tableTestId="anomaly-alerts-table"
          storageKey="ih35.safety.anomaly-alerts.v1"
          rows={rows}
          rowKey={(row) => String(row.uuid)}
          loading={q.isPending}
          emptyText="No open anomaly alerts"
          pageSize={Math.max(1, rows.length)}
          hidePager
          suppressToolbarSearch
          suppressToolbarRange
          columns={[
            { key: "detected_at", label: "Detected", sortValue: (row) => String(row.detected_at ?? ""), render: (row) => String(row.detected_at ?? "") },
            { key: "severity", label: "Severity", sortValue: (row) => String(row.severity ?? ""), render: (row) => <span className="font-semibold">{String(row.severity ?? "")}</span> },
            { key: "rule_name", label: "Rule", sortValue: (row) => String(row.rule_name ?? "Anomaly"), render: (row) => String(row.rule_name ?? "Anomaly") },
            {
              key: "subject",
              label: "Subject",
              sortValue: (row) => String(row.subject_label ?? ""),
              render: (row) => {
                const kind = anomalySubjectKind(row);
                const id = String(row.resolved_subject_uuid ?? row.subject_uuid ?? "") || null;
                const label = String(row.subject_label ?? "") || (id ? "Related record unavailable" : "No related record");
                return kind && id ? <EntityLink kind={kind} id={id} label={label} /> : <span>{label}</span>;
              },
            },
            {
              key: "evidence",
              label: "Evidence",
              sortValue: (row) => JSON.stringify(row.evidence ?? {}),
              render: (row) => <span className="font-mono text-xs">{JSON.stringify(row.evidence ?? {})}</span>,
            },
          ]}
          rowActions={(row) => (
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="secondary" onClick={() => ack.mutate({ uuid: String(row.uuid), companyId: operatingCompanyId, severity, generation: actionGenerationRef.current })}>Ack</Button>
              <Button type="button" onClick={() => resolve.mutate({ uuid: String(row.uuid), companyId: operatingCompanyId, severity, generation: actionGenerationRef.current, notes: "Resolved from dashboard" })}>Resolve</Button>
            </div>
          )}
        />
      )}
      {!q.isError && totalCount > pageSize ? (
        <div className="flex items-center justify-between text-xs text-[#4B5563]" data-testid="anomaly-alerts-server-pager">
          <Button type="button" variant="secondary" disabled={page === 0 || q.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}</span>
          <Button type="button" variant="secondary" disabled={(page + 1) * pageSize >= totalCount || q.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      ) : null}
      {actionError ? (
        <p className="text-xs text-red-700" data-testid="anomaly-dashboard-action-error">
          {userFacingApiError(actionError, "Could not update the anomaly alert.")}
        </p>
      ) : null}
    </div>
  );
}
