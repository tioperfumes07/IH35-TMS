import { useMemo, useState } from "react";
import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { listAuditEvents, type AuditEventListItem } from "../../api/audit";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { useListState } from "../../components/list-state";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CappedListNotice } from "../../components/CappedListNotice";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

function bulkCallPreview(id: string | null | undefined): string {
  if (!id) return "—";
  // bulk_call_id is a literal batch-operation token being matched for a filter, not a linked
  // entity to resolve a name for — entityLabel(null, id, "Record") always renders "Record — not
  // visible" here (there is never a name to pass), which broke both this column's cell text AND
  // the click-to-filter button's own visible label on every row with a bulk_call_id. Show a short
  // id preview instead, same shape this file's own pre-existing test already expected.
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
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

  const columns = useMemo<Array<ParityColumn<AuditEventListItem>>>(
    () => [
      {
        key: "created_at",
        label: "When",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        render: (row) => new Date(row.created_at).toLocaleString(),
      },
      {
        key: "event_type",
        label: "Event",
        sortable: true,
        render: (row) => <span className="font-medium text-gray-900">{row.event_type}</span>,
      },
      {
        key: "actor_email",
        label: "Actor",
        sortable: true,
        sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User") ?? "",
        render: (row) => <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_email} noun="User" />,
      },
      {
        key: "bulk_call_id",
        label: "Bulk Call",
        sortable: true,
        sortValue: (row) => row.bulk_call_id ?? "",
        render: (row) =>
          row.bulk_call_id ? (
            <button
              type="button"
              className="font-mono text-slate-700 underline"
              title={row.bulk_call_id}
              onClick={(e) => {
                e.stopPropagation();
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
      {
        key: "source",
        label: "Source",
        sortable: true,
        render: (row) => row.source ?? "—",
      },
    ],
    []
  );

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

      {eventsQuery.isError ? (
        <ListErrorState
          title="Couldn't load audit events"
          status={0}
          message={(eventsQuery.error as Error)?.message}
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : (
        <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={listState.isLoading}
            storageKey="audit-events-list"
            // Settled-only empty text (LIST-EMPTY-1): only supplied once listState resolves to "empty",
            // never during loading/error, so ParityTable's own gate never flashes a false empty.
            emptyText={listState.isEmpty ? "No audit events found." : undefined}
            tableTestId="audit-events-list-table"
            renderExpanded={(row) => (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Payload (JSON)</div>
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-sm border border-gray-200 bg-white p-3 text-[11px] text-gray-900">
                  {JSON.stringify(row.payload ?? {}, null, 2)}
                </pre>
              </div>
            )}
          />
          <CappedListNotice
            shown={rows.length}
            limit={100}
            total={eventsQuery.data?.total_count}
            hint="Narrow filters or export for the full audit trail."
            className="mt-2 text-xs text-slate-600"
          />
        </div>
      )}
    </div>
  );
}

export default AuditEventsList;
