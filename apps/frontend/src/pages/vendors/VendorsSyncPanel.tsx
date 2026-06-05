import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type VendorsSyncStatus = {
  total_local: number;
  synced: number;
  drift_detected: number;
  local_only: number;
  sync_error: number;
  last_pull_at: string | null;
  last_reconcile_at: string | null;
};

async function fetchVendorsStatus(operatingCompanyId: string): Promise<VendorsSyncStatus> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  const res = await fetch(`/api/v1/qbo-sync/vendors/status?${params}`);
  if (!res.ok) throw new Error("Failed to load vendors sync status");
  return res.json() as Promise<VendorsSyncStatus>;
}

async function postVendorsAction(path: string, operatingCompanyId: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: operatingCompanyId }),
  });
  if (!res.ok) throw new Error(`Vendors sync action failed (${res.status})`);
  return res.json();
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

type Props = {
  operatingCompanyId: string;
};

export function VendorsSyncPanel({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["vendors-sync-status", operatingCompanyId],
    queryFn: () => fetchVendorsStatus(operatingCompanyId),
    refetchInterval: 30_000,
  });

  const pullMutation = useMutation({
    mutationFn: () => postVendorsAction("/api/v1/qbo-sync/vendors/pull-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors-sync-status", operatingCompanyId] }),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => postVendorsAction("/api/v1/qbo-sync/vendors/reconcile-now", operatingCompanyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors-sync-status", operatingCompanyId] }),
  });

  const status = statusQuery.data;
  const busy = pullMutation.isPending || reconcileMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="font-medium">QBO Vendors</div>
      {statusQuery.isLoading ? (
        <span className="text-muted-foreground">Loading sync status…</span>
      ) : status ? (
        <span>
          Synced: {status.synced} of {status.total_local}
          {status.drift_detected > 0 ? ` · Drift: ${status.drift_detected}` : ""}
          {" · "}Last sync: {formatRelative(status.last_pull_at)}
        </span>
      ) : (
        <span className="text-destructive">Unable to load sync status</span>
      )}
      <button
        type="button"
        className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => pullMutation.mutate()}
      >
        {pullMutation.isPending ? "Syncing…" : "Sync now"}
      </button>
      <button
        type="button"
        className="rounded border border-border px-3 py-1 disabled:opacity-50"
        disabled={busy}
        onClick={() => reconcileMutation.mutate()}
      >
        {reconcileMutation.isPending ? "Reconciling…" : "Reconcile"}
      </button>
    </div>
  );
}
