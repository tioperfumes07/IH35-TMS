import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { userFacingApiError } from "../../lib/api-error-message";

type EntitySummary = {
  entity_type: string;
  label: string;
  synced: number;
  drift: number;
  total_local: number;
  last_sync: string | null;
  unresolved_drift_log: number;
};

type DriftLogRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  qbo_id: string | null;
  drift_type: string;
  local_snapshot: Record<string, unknown> | null;
  qbo_snapshot: Record<string, unknown> | null;
  detected_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
};

type DashboardPayload = {
  entities: EntitySummary[];
  last_alert: { entity_type: string; alert_day: string; drift_count: number } | null;
  drift_log: DriftLogRow[];
};

async function fetchDashboard(operatingCompanyId: string): Promise<DashboardPayload> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  // Use apiRequest (credentials: "include") so the session cookie is sent — a raw fetch()
  // omits credentials and the authed route returns 401, leaving the page body empty.
  return apiRequest<DashboardPayload>(`/api/v1/qbo-sync/drift-dashboard?${params}`);
}

async function resolveDrift(
  driftId: string,
  operatingCompanyId: string,
  resolution_action: "accept_local" | "accept_qbo" | "manual_merge_recorded"
) {
  return apiRequest(`/api/v1/qbo-sync/drift-log/${driftId}/resolve`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, resolution_action },
  });
}

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

function driftTypeLabel(type: string) {
  if (type === "missing_qbo") return "Missing in QBO";
  if (type === "missing_local") return "Missing locally";
  if (type === "field_mismatch") return "Field mismatch";
  return type;
}

function driftEntityKind(entityType: string): EntityKind | null {
  switch (entityType) {
    case "chart_of_accounts":
      return "account";
    case "customers":
      return "customer";
    case "vendors":
      return "vendor";
    default:
      return null;
  }
}

export function QBOSyncDriftDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const dashboardQuery = useQuery({
    queryKey: ["qbo-sync-drift-dashboard", companyId],
    queryFn: () => fetchDashboard(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { id: string; action: "accept_local" | "accept_qbo" | "manual_merge_recorded" }) =>
      resolveDrift(input.id, companyId, input.action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qbo-sync-drift-dashboard", companyId] }),
    onError: (error) => pushToast(userFacingApiError(error, "Failed to resolve drift"), "error"),
  });

  const data = dashboardQuery.data;

  // Display-only ParityTable migration: same 5 columns in the same order, same cell renderers,
  // same resolve-action buttons (handlers unchanged) as the former hand-rolled table markup.
  const driftColumns: Array<ParityColumn<DriftLogRow>> = [
    {
      key: "entity_type",
      label: "Entity",
      sortable: true,
      render: (row) => row.entity_type.replace(/_/g, " "),
    },
    {
      key: "entity_id",
      label: "Local record",
      sortable: true,
      sortValue: (row) => row.entity_id ?? "",
      render: (row) => {
        const kind = driftEntityKind(row.entity_type);
        if (!kind || !row.entity_id) {
          return <span className="text-xs text-muted-foreground">{row.entity_id ? entityLabel(null, row.entity_id, "Entity") : "—"}</span>;
        }
        return <EntityLink kind={kind} id={row.entity_id} label={entityLabel(null, row.entity_id, "Entity")} />;
      },
    },
    {
      key: "drift_type",
      label: "Type",
      sortable: true,
      render: (row) => driftTypeLabel(row.drift_type),
      sortValue: (row) => driftTypeLabel(row.drift_type),
    },
    {
      key: "detected_at",
      label: "Detected",
      sortable: true,
      render: (row) => formatRelative(row.detected_at),
      sortValue: (row) => row.detected_at,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (row.resolved_at ? `Resolved (${row.resolution_action ?? "—"})` : "Open"),
      sortValue: (row) => (row.resolved_at ? `Resolved (${row.resolution_action ?? "—"})` : "Open"),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) =>
        !row.resolved_at ? (
          <div className="flex flex-wrap gap-1">
            {(["accept_local", "accept_qbo", "manual_merge_recorded"] as const).map((action) => (
              <button
                key={action}
                type="button"
                className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-50"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: row.id, action })}
              >
                {action.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <AccountingSubNavWrapper title="QBO Sync Drift" subtitle="Daily reconciliation health across master data entities (clone-and-reconcile, not two-way sync)">

      {!companyId ? (
        <p className="text-muted-foreground">Select an operating company to view sync drift.</p>
      ) : dashboardQuery.isLoading ? (
        <p className="text-muted-foreground">Loading drift dashboard…</p>
      ) : dashboardQuery.isError ? (
        <ListErrorState
          title="Unable to load drift dashboard."
          status={(dashboardQuery.error as ApiError | undefined)?.status ?? 0}
          message={(dashboardQuery.error as Error | undefined)?.message}
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : data ? (
        <>
          {data.last_alert ? (
            <div className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-800">
              Last alert: {data.last_alert.entity_type.replace(/_/g, " ")} on {data.last_alert.alert_day} (
              {data.last_alert.drift_count} drifts)
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.entities.map((entity) => (
              <div key={entity.entity_type} className="rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className="text-xs font-medium text-muted-foreground">{entity.label}</div>
                <div className="mt-2 text-page-title font-semibold">
                  {entity.synced} / {entity.total_local}
                </div>
                <div className="mt-1 text-xs">
                  Drift: <span className={entity.drift > 0 ? "text-slate-600 font-medium" : ""}>{entity.drift}</span>
                  {" · "}Log: {entity.unresolved_drift_log}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Last sync: {formatRelative(entity.last_sync)}</div>
              </div>
            ))}
          </div>

          <ParityTable
            columns={driftColumns}
            rows={data.drift_log}
            rowKey={(row) => row.id}
            emptyText="No drift entries logged yet."
            storageKey="qbo-sync-drift-log"
            tableTestId="qbo-sync-drift-log-table"
          />
        </>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
