import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditEvents, type AuditEventListItem } from "../../api/audit";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { useListState } from "../../components/list-state";
import { DataTable } from "../../components/DataTable";
import { dataTableErrorState } from "../../lib/tableError";

function bulkCallPreview(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

export { bulkCallPreview };

export function AuditEventsList() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const allowed =
    auth.user?.role === "Owner" ||
    auth.user?.role === "Administrator" ||
    auth.user?.role === "Manager" ||
    auth.user?.role === "Accountant";

  const [bulkCallId, setBulkCallId] = useState("");
  const [appliedBulkCallId, setAppliedBulkCallId] = useState("");

  const queryKey = useMemo(
    () => ["audit-events-list", operatingCompanyId, appliedBulkCallId],
    [operatingCompanyId, appliedBulkCallId]
  );

  const eventsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listAuditEvents({
        operatingCompanyId: operatingCompanyId!,
        bulkCallId: appliedBulkCallId.trim() || undefined,
        limit: 100,
      }),
    enabled: Boolean(allowed && operatingCompanyId),
  });

  const rows = eventsQuery.data?.events ?? [];
  // Empty message renders only once the events query settles, never mid-fetch.
  const listState = useListState(eventsQuery, rows.length === 0);

  if (!allowed) {
    return (
      <div className="space-y-3">
        <PageHeader title="Audit events" subtitle="Bulk operation forensic review" />
        <p className="text-sm text-gray-600">You need Owner, Manager, or Accountant access to view audit events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Audit events" subtitle="Filter by bulk call ID to review one bulk submission" />

      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Bulk call ID
            <input
              className="min-w-[16rem] rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={bulkCallId}
              onChange={(e) => setBulkCallId(e.target.value)}
              placeholder="Paste bulk_call_id from BulkProgressDialog"
            />
          </label>
          <button
            type="button"
            className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
            onClick={() => setAppliedBulkCallId(bulkCallId.trim())}
          >
            Apply filter
          </button>
          {appliedBulkCallId ? (
            <button
              type="button"
              className="text-xs text-slate-700 underline"
              onClick={() => {
                setBulkCallId("");
                setAppliedBulkCallId("");
              }}
            >
              Clear bulk filter
            </button>
          ) : null}
        </div>
      </div>

      <DataTable
        rows={rows}
        tableKey="audit-events-list"
        rowKey={(row) => row.id}
        loading={listState.isLoading}
        errorState={dataTableErrorState(eventsQuery.error, () => void eventsQuery.refetch())}
        // Settled-only empty text (LIST-EMPTY-1): only supplied once listState resolves to "empty",
        // never during loading/error, so DataTable's own gate never flashes a false empty.
        emptyText={listState.isEmpty ? "No audit events found." : undefined}
        columns={[
          {
            key: "created_at",
            label: "When",
            sortable: true,
            numeric: true,
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          { key: "event_type", label: "Event", sortable: true, cellClass: "font-medium text-gray-900" },
          {
            key: "actor_email",
            label: "Actor",
            sortable: true,
            render: (row) => row.actor_email ?? row.actor_user_id ?? "—",
          },
          {
            key: "bulk_call_id",
            label: "Bulk Call",
            sortable: true,
            render: (row: AuditEventListItem) =>
              row.bulk_call_id ? (
                <button
                  type="button"
                  className="font-mono text-slate-700 underline"
                  title={row.bulk_call_id}
                  onClick={() => {
                    setBulkCallId(row.bulk_call_id ?? "");
                    setAppliedBulkCallId(row.bulk_call_id ?? "");
                  }}
                >
                  {bulkCallPreview(row.bulk_call_id)}
                </button>
              ) : (
                "—"
              ),
          },
          { key: "source", label: "Source", sortable: true, render: (row) => row.source ?? "—" },
        ]}
      />
    </div>
  );
}

export default AuditEventsList;
