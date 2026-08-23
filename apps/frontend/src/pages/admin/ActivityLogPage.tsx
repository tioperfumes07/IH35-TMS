import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminActivity, type AdminActivityItem } from "../../api/admin-activity";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useStagedListFilters } from "../../components/table";

function formatEntity(row: AdminActivityItem): string {
  const type = row.entity_type?.trim() ?? "Record";
  const id = row.entity_id?.trim();
  if (!id) return type || "—";
  return `${type} · ${entityLabel(null, id, type) ?? id}`;
}

const EMPTY_FILTERS = { actorUserId: "", action: "", entityType: "", entityId: "", since: "" };

const COLUMNS: Array<ParityColumn<AdminActivityItem>> = [
  {
    key: "created_at",
    label: "Time",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => (
      <span className="whitespace-nowrap text-gray-800">{new Date(row.created_at).toLocaleString()}</span>
    ),
  },
  {
    key: "actor_email",
    label: "Actor",
    sortable: true,
    sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User") ?? "",
    render: (row) => <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_email} noun="User" className="text-gray-800" />,
  },
  {
    key: "action",
    label: "Action",
    sortable: true,
    render: (row) => <span className="font-mono text-[11px] text-gray-900">{row.action}</span>,
  },
  {
    key: "entity_type",
    label: "Entity",
    sortable: true,
    sortValue: (row) => formatEntity(row),
    render: (row) => <span className="text-gray-800">{formatEntity(row)}</span>,
  },
  {
    key: "payload_preview",
    label: "Payload preview",
    sortable: true,
    render: (row) => <span className="font-mono text-[11px] text-gray-700">{row.payload_preview}</span>,
  },
];

export function ActivityLogPage() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner" || auth.user?.role === "SuperAdmin";

  // ADMIN-ACTIVITY-F1 — a caller can deep-link here (e.g. ExpenseCategoryMapPage's "View audit")
  // with ?action=...&entity_type=...&entity_id=...&actor_user_id=... to open pre-filtered to one
  // record's history. Previously these query params were parsed by nothing — every deep link
  // silently opened the generic unfiltered last-100 rows instead, with no error shown. Read once on
  // mount only (useState initializer), matching the page's own "Apply"-committed filter model —
  // typing further doesn't re-read the URL.
  const [searchParams] = useSearchParams();
  const [initialFilters] = useState(() => ({
    actorUserId: searchParams.get("actor_user_id") ?? "",
    action: searchParams.get("action") ?? "",
    entityType: searchParams.get("entity_type") ?? "",
    entityId: searchParams.get("entity_id") ?? "",
    since: "",
  }));

  // LV-ADMIN-ACTIVITY-LOG-FILTER-NO-CANCEL — draft/applied via useStagedListFilters; Cancel restores draft.
  const [applied, setApplied] = useState(initialFilters);
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: setApplied,
  });
  const draft = staged.draft;

  const queryKey = useMemo(
    () => ["admin-activity", applied.actorUserId, applied.action, applied.entityType, applied.entityId, applied.since],
    [applied.actorUserId, applied.action, applied.entityType, applied.entityId, applied.since]
  );

  const activityQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (applied.actorUserId.trim()) params.set("actor_user_id", applied.actorUserId.trim());
      if (applied.action.trim()) params.set("action", applied.action.trim());
      if (applied.entityType.trim()) params.set("entity_type", applied.entityType.trim());
      if (applied.entityId.trim()) params.set("entity_id", applied.entityId.trim());
      if (applied.since.trim()) params.set("since", new Date(applied.since).toISOString());
      return fetchAdminActivity(params);
    },
    enabled: Boolean(allowed),
  });

  if (!allowed) {
    return (
      <div className="space-y-3">
        <PageHeader title="Activity log" subtitle="Owner / SuperAdmin tooling" />
        <p className="text-sm text-gray-600">You need Owner or SuperAdmin access to view the audit activity stream.</p>
      </div>
    );
  }

  const rows = activityQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Activity log" subtitle="Latest audit.append_event rows (newest first)" />

      <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-800" data-testid="activity-log-filters">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user id
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={draft.actorUserId}
              onChange={(e) => staged.setDraft((d) => ({ ...d, actorUserId: e.target.value }))}
              placeholder="UUID"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action contains
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={draft.action}
              onChange={(e) => staged.setDraft((d) => ({ ...d, action: e.target.value }))}
              placeholder="event_class substring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type contains
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={draft.entityType}
              onChange={(e) => staged.setDraft((d) => ({ ...d, entityType: e.target.value }))}
              placeholder="payload.entity_type"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity id equals
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={draft.entityId}
              onChange={(e) => staged.setDraft((d) => ({ ...d, entityId: e.target.value }))}
              placeholder="payload.entity_id (exact)"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Since (local)
            <DateTimePicker
              className="normal-case"
              aria-label="Since (local)"
              value={draft.since}
              onChange={(next) => staged.setDraft((d) => ({ ...d, since: next }))}
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="activity-log-filter-apply"
            className="rounded-sm bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!staged.dirty}
            onClick={staged.apply}
          >
            Apply filters
          </button>
          <button
            type="button"
            data-testid="activity-log-filter-cancel"
            className="rounded-sm border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            disabled={!staged.dirty}
            onClick={staged.cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="activity-log-filter-reset"
            className="rounded-sm border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50"
            onClick={() => {
              staged.cancel();
              setApplied(EMPTY_FILTERS);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {activityQuery.isError ? (
        <ListErrorState
          title="Couldn't load activity log"
          status={0}
          message={(activityQuery.error as Error)?.message}
          onRetry={() => void activityQuery.refetch()}
        />
      ) : (
        <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            loading={activityQuery.isLoading}
            storageKey="admin-activity-log"
            emptyText="No audit rows matched these filters."
            tableTestId="admin-activity-log-table"
            rowTestId={(row) => `admin-activity-log-row-${row.id}`}
            renderExpanded={(row) => (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Full payload (JSON)</div>
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-sm border border-gray-200 bg-white p-3 text-[11px] text-gray-900">
                  {JSON.stringify(row.payload ?? {}, null, 2)}
                </pre>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
