import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";

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

export function QBOSyncDriftDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

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
  });

  const data = dashboardQuery.data;

  return (
    <div className="space-y-6 p-4">
      <PageHeader title="QBO Sync Drift" subtitle="Ongoing two-way sync health across master data entities" />

      {!companyId ? (
        <p className="text-muted-foreground">Select an operating company to view sync drift.</p>
      ) : dashboardQuery.isLoading ? (
        <p className="text-muted-foreground">Loading drift dashboard…</p>
      ) : dashboardQuery.isError ? (
        <p className="text-destructive">Unable to load drift dashboard.</p>
      ) : data ? (
        <>
          {data.last_alert ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Last alert: {data.last_alert.entity_type.replace(/_/g, " ")} on {data.last_alert.alert_day} (
              {data.last_alert.drift_count} drifts)
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.entities.map((entity) => (
              <div key={entity.entity_type} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="text-sm font-medium text-muted-foreground">{entity.label}</div>
                <div className="mt-2 text-2xl font-semibold">
                  {entity.synced} / {entity.total_local}
                </div>
                <div className="mt-1 text-sm">
                  Drift: <span className={entity.drift > 0 ? "text-amber-700 font-medium" : ""}>{entity.drift}</span>
                  {" · "}Log: {entity.unresolved_drift_log}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Last sync: {formatRelative(entity.last_sync)}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Entity</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Detected</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.drift_log.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No drift entries logged yet.
                    </td>
                  </tr>
                ) : (
                  data.drift_log.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">{row.entity_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">{driftTypeLabel(row.drift_type)}</td>
                      <td className="px-3 py-2">{formatRelative(row.detected_at)}</td>
                      <td className="px-3 py-2">
                        {row.resolved_at ? `Resolved (${row.resolution_action ?? "—"})` : "Open"}
                      </td>
                      <td className="px-3 py-2">
                        {!row.resolved_at ? (
                          <div className="flex flex-wrap gap-1">
                            {(["accept_local", "accept_qbo", "manual_merge_recorded"] as const).map((action) => (
                              <button
                                key={action}
                                type="button"
                                className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-50"
                                disabled={resolveMutation.isPending}
                                onClick={() => resolveMutation.mutate({ id: row.id, action })}
                              >
                                {action.replace(/_/g, " ")}
                              </button>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
