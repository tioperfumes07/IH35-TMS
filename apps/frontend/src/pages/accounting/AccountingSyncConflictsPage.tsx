import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAccountingSyncConflict, listAccountingSyncConflicts, resolveAccountingSyncConflict } from "../../api/accounting-wave2";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function AccountingSyncConflictsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const listQ = useQuery({
    queryKey: ["accounting", "sync-conflicts", companyId],
    queryFn: () => listAccountingSyncConflicts(companyId, { status: "unresolved", limit: 50 }),
    enabled: Boolean(companyId),
  });

  const items = listQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Sync conflicts" subtitle="Unresolved QuickBooks ↔ TMS mismatches." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      {listQ.isError ? <ListErrorBanner onRetry={() => void listQ.refetch()} /> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Detected</th>
              <th className="px-3 py-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={String(row.id)} className="border-b border-gray-100">
                <td className="px-3 py-2">{String(row.severity ?? "—")}</td>
                <td className="px-3 py-2">
                  {String(row.entity_type ?? "—")} ·{" "}
                  <Link className="text-blue-700 underline" to={`/accounting/sync-conflicts/${row.id}`}>
                    {String(row.entity_id ?? "").slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{String(row.detected_at ?? "—")}</td>
                <td className="px-3 py-2">{row.resolved_at ? "Resolved" : "Open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!listQ.isLoading && items.length === 0 ? <p className="p-4 text-sm text-gray-600">No unresolved conflicts.</p> : null}
      </div>
    </div>
  );
}

export function AccountingSyncConflictDetailPage({ conflictId }: { conflictId: string }) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const q = useQuery({
    queryKey: ["accounting", "sync-conflict", conflictId, companyId],
    queryFn: () => getAccountingSyncConflict(conflictId, companyId),
    enabled: Boolean(companyId) && Boolean(conflictId),
  });

  const resolveMut = useMutation({
    mutationFn: (resolution: "qbo_wins" | "tms_wins" | "manual_merge" | "dismissed") =>
      resolveAccountingSyncConflict(conflictId, { operating_company_id: companyId, resolution, notes: "" }),
    onSuccess: () => {
      pushToast("Conflict resolved", "success");
      void qc.invalidateQueries({ queryKey: ["accounting", "sync-conflicts"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Resolve failed"), "error"),
  });

  const row = q.data ?? {};

  return (
    <div className="space-y-4">
      <PageHeader title="Sync conflict" subtitle={conflictId} />
      <Link to="/accounting/sync-conflicts" className="text-sm text-blue-700 underline">
        ← Back
      </Link>
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <pre className="max-h-96 overflow-auto rounded border bg-gray-50 p-3 text-xs">{JSON.stringify(row, null, 2)}</pre>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          type="button"
          className="border border-gray-200 bg-white"
          aria-label="Resolve using QuickBooks data"
          disabled={resolveMut.isPending}
          onClick={() => void resolveMut.mutateAsync("qbo_wins")}
        >
          Use QBO
        </ActionButton>
        <ActionButton
          type="button"
          className="border border-gray-200 bg-white"
          aria-label="Resolve using TMS data"
          disabled={resolveMut.isPending}
          onClick={() => void resolveMut.mutateAsync("tms_wins")}
        >
          Use TMS
        </ActionButton>
        <ActionButton
          type="button"
          className="border border-gray-200 bg-white"
          aria-label="Dismiss conflict"
          disabled={resolveMut.isPending}
          onClick={() => void resolveMut.mutateAsync("dismissed")}
        >
          Dismiss
        </ActionButton>
      </div>
    </div>
  );
}
