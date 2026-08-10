import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminActivity, type AdminActivityItem } from "../../api/admin-activity";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function formatEntity(row: AdminActivityItem): string {
  const type = row.entity_type?.trim() ?? "Record";
  const id = row.entity_id?.trim();
  if (!id) return type || "—";
  return `${type} · ${entityLabel(null, id, type) ?? id}`;
}

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
    render: (row) => <span className="text-gray-800">{entityLabel(row.actor_email, row.actor_user_id, "User") ?? "—"}</span>,
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

  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [since, setSince] = useState("");
  const [applied, setApplied] = useState({
    actorUserId: "",
    action: "",
    entityType: "",
    since: "",
  });

  const queryKey = useMemo(
    () => ["admin-activity", applied.actorUserId, applied.action, applied.entityType, applied.since],
    [applied.actorUserId, applied.action, applied.entityType, applied.since]
  );

  const activityQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (applied.actorUserId.trim()) params.set("actor_user_id", applied.actorUserId.trim());
      if (applied.action.trim()) params.set("action", applied.action.trim());
      if (applied.entityType.trim()) params.set("entity_type", applied.entityType.trim());
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

      <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-800">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user id
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              placeholder="UUID"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action contains
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="event_class substring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type contains
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm normal-case"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="payload.entity_type"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Since (local)
            <DateTimePicker
              className="normal-case"
              aria-label="Since (local)"
              value={since}
              onChange={setSince}
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-sm bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-800"
            onClick={() =>
              setApplied({
                actorUserId,
                action,
                entityType,
                since,
              })
            }
          >
            Apply filters
          </button>
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setActorUserId("");
              setAction("");
              setEntityType("");
              setSince("");
              setApplied({ actorUserId: "", action: "", entityType: "", since: "" });
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
