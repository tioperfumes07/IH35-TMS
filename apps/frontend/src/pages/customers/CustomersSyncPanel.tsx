import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

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

// Decision #5 (parallel-books lock): TMS holds its own CLONE of QBO and reconciles daily — there is NO
// two-way sync. Retire the "Synced X of Y" parallel counter; show QBO-sourced count + open exceptions +
// last-reconciled instead. Empty-state marker "Not cloned yet" is pinned by the status-endpoint guard.
//
// LV-002: never label TMS-only rows (USMCA / local_only) as "Cloned from QBO". Provenance count is
// `synced` (+ drift that still carries a QBO id), never `total_local`.
export function renderCustomersQboStatusLine(status: CustomersSyncStatus) {
  const exceptions = status.drift_detected + status.sync_error;
  const exceptionBit = exceptions > 0 ? ` · ${exceptions} exception${exceptions === 1 ? "" : "s"}` : "";
  const lastBit = ` · Last reconciled: ${formatRelative(status.last_reconcile_at ?? status.last_pull_at)}`;
  const qboSourced = status.synced + status.drift_detected;

  if (status.total_local === 0 && !status.last_pull_at && qboSourced === 0) {
    return "Not cloned yet — click Refresh from QBO to clone the current customers";
  }

  // Entity with TMS customers but zero QBO-sourced rows (e.g. USMCA — TMS-only, 0 QBO).
  if (qboSourced === 0) {
    return (
      <>
        TMS customers: {status.total_local} (no QBO provenance)
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

function renderStatusLine(status: CustomersSyncStatus) {
  return renderCustomersQboStatusLine(status);
}

type Props = {
  operatingCompanyId: string;
};

export function CustomersSyncPanel({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const statusQuery = useQuery({
    queryKey: ["customers-sync-status", operatingCompanyId],
    queryFn: () => fetchCustomersStatus(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
    // VEND-2/CUST: a transient status failure must not park the banner until a manual retry — retry with
    // exponential backoff so it self-recovers (the manual Retry affordance below remains as a fallback).
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  const pullMutation = useMutation({
    mutationFn: () => postCustomersAction("/api/v1/qbo-sync/customers/pull-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers-sync-status", operatingCompanyId] }),
    onError: (err) => pushToast(userFacingApiError(err, "Could not refresh customers from QBO"), "error"),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => postCustomersAction("/api/v1/qbo-sync/customers/reconcile-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers-sync-status", operatingCompanyId] }),
    onError: (err) => pushToast(userFacingApiError(err, "Could not reconcile customers"), "error"),
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
