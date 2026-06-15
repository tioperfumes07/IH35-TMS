import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type CustomersSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

// Use apiRequest (not raw fetch): it targets the API host via VITE_API_BASE_URL, sends auth
// cookies (credentials: include), and parses JSON. A raw relative fetch resolved against the
// static frontend host in prod, which served index.html (HTML) -> JSON.parse crash / red banner.
async function fetchCustomersStatus(operatingCompanyId: string): Promise<CustomersSyncStatus> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<CustomersSyncStatus>(`/api/v1/qbo-sync/customers/status?${params}`);
}

async function postCustomersAction(path: string, operatingCompanyId: string) {
  return apiRequest(path, { method: "POST", body: { operating_company_id: operatingCompanyId } });
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

function renderStatusLine(status: CustomersSyncStatus) {
  if (status.total_local === 0 && !status.last_pull_at) {
    return "No sync yet — click Sync now to pull customers from QBO";
  }
  return (
    <>
      Synced: {status.synced} of {status.total_local}
      {status.drift_detected > 0 ? ` · Drift: ${status.drift_detected}` : ""}
      {" · "}Last sync: {formatRelative(status.last_pull_at)}
    </>
  );
}

type Props = {
  operatingCompanyId: string;
};

export function CustomersSyncPanel({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["customers-sync-status", operatingCompanyId],
    queryFn: () => fetchCustomersStatus(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
    retry: 1,
  });

  const pullMutation = useMutation({
    mutationFn: () => postCustomersAction("/api/v1/qbo-sync/customers/pull-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers-sync-status", operatingCompanyId] }),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => postCustomersAction("/api/v1/qbo-sync/customers/reconcile-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers-sync-status", operatingCompanyId] }),
  });

  const status = statusQuery.data;
  const busy = pullMutation.isPending || reconcileMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="font-medium">QBO Customers</div>
      {!operatingCompanyId || statusQuery.isLoading ? (
        <span className="text-muted-foreground">Loading sync status…</span>
      ) : statusQuery.isError ? (
        <>
          <span className="text-destructive">
            {statusQuery.error instanceof Error ? statusQuery.error.message : "Unable to load sync status"}
          </span>
          <button
            type="button"
            className="rounded border border-border px-3 py-1"
            onClick={() => statusQuery.refetch()}
          >
            Retry
          </button>
        </>
      ) : status ? (
        <span>{renderStatusLine(status)}</span>
      ) : (
        <span className="text-destructive">Unable to load sync status</span>
      )}
      <button
        type="button"
        className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
        disabled={busy || !operatingCompanyId}
        onClick={() => pullMutation.mutate()}
      >
        {pullMutation.isPending ? "Syncing…" : "Sync now"}
      </button>
      <button
        type="button"
        className="rounded border border-border px-3 py-1 disabled:opacity-50"
        disabled={busy || !operatingCompanyId}
        onClick={() => reconcileMutation.mutate()}
      >
        {reconcileMutation.isPending ? "Reconciling…" : "Reconcile"}
      </button>
    </div>
  );
}
