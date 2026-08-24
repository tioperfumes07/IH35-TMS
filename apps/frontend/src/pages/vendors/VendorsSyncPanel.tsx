import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

type VendorsSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

// VENDOR-401: use apiRequest (not raw fetch): it targets the API host via VITE_API_BASE_URL, sends
// auth cookies (credentials: include), and parses JSON. A raw fetch omits credentials, so the
// cross-origin ih35_session cookie is never sent → backend requireAuth returns 401 on a valid
// session → "Unable to load sync status". This mirrors the CustomersSyncPanel fix (#1535 route family).
async function fetchVendorsStatus(operatingCompanyId: string): Promise<VendorsSyncStatus> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<VendorsSyncStatus>(`/api/v1/qbo-sync/vendors/status?${params}`);
}

async function postVendorsAction(path: string, operatingCompanyId: string) {
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

// Decision #5 (parallel-books lock): TMS holds its own CLONE of QBO and reconciles daily — there is NO
// two-way sync. Retire the "Synced X of Y" parallel counter; show QBO-sourced count + open exceptions +
// last-reconciled instead. Empty-state marker "Not cloned yet" is pinned by the status-endpoint guard.
//
// LV-002 companion: never label TMS-only rows (USMCA / local_only) as "Cloned from QBO".
function renderStatusLine(status: VendorsSyncStatus) {
  const exceptions = status.drift_detected + status.sync_error;
  const exceptionBit = exceptions > 0 ? ` · ${exceptions} exception${exceptions === 1 ? "" : "s"}` : "";
  const lastBit = ` · Last reconciled: ${formatRelative(status.last_reconcile_at ?? status.last_pull_at)}`;
  const qboSourced = status.synced + status.drift_detected;

  if (status.total_local === 0 && !status.last_pull_at && qboSourced === 0) {
    return "Not cloned yet — click Refresh from QBO to clone the current vendors";
  }
  if (qboSourced === 0) {
    return (
      <>
        TMS vendors: {status.total_local} (no QBO provenance)
        {exceptionBit}
        {lastBit}
      </>
    );
  }
  return (
    <>
      Cloned from QBO: {status.synced}
      {status.local_only > 0 ? ` · ${status.local_only} TMS-only` : ""}
      {exceptionBit}
      {lastBit}
    </>
  );
}

type Props = {
  operatingCompanyId: string;
};

export function VendorsSyncPanel({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const statusQuery = useQuery({
    queryKey: ["vendors-sync-status", operatingCompanyId],
    queryFn: () => fetchVendorsStatus(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
    // VEND-2: a transient status failure must not park the banner until a manual retry — retry with
    // exponential backoff so it self-recovers (the manual Retry affordance below remains as a fallback).
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const pullMutation = useMutation({
    mutationFn: () => postVendorsAction("/api/v1/qbo-sync/vendors/pull-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors-sync-status", operatingCompanyId] }),
    onError: (err) => pushToast(userFacingApiError(err, "Could not refresh vendors from QBO"), "error"),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => postVendorsAction("/api/v1/qbo-sync/vendors/reconcile-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors-sync-status", operatingCompanyId] }),
    onError: (err) => pushToast(userFacingApiError(err, "Could not reconcile vendors"), "error"),
  });

  const status = statusQuery.data;
  const busy = pullMutation.isPending || reconcileMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="font-medium">QBO Vendors</div>
      {!operatingCompanyId || statusQuery.isLoading ? (
        <span className="text-muted-foreground">Loading sync status…</span>
      ) : statusQuery.isError ? (
        <>
          <span className="text-destructive">
            {statusQuery.error instanceof Error ? statusQuery.error.message : "Unable to load sync status"}
          </span>
          <button
            type="button"
            className="rounded-sm border border-border px-3 py-1"
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
        className="rounded-sm bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
        disabled={busy || !operatingCompanyId}
        onClick={() => pullMutation.mutate()}
      >
        {pullMutation.isPending ? "Refreshing…" : "Refresh from QBO"}
      </button>
      <button
        type="button"
        className="rounded-sm border border-border px-3 py-1 disabled:opacity-50"
        disabled={busy || !operatingCompanyId}
        onClick={() => reconcileMutation.mutate()}
      >
        {reconcileMutation.isPending ? "Reconciling…" : "Reconcile"}
      </button>
    </div>
  );
}
