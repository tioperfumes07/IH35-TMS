import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminActivity, type AdminActivityItem } from "../../api/admin-activity";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";

function formatEntity(row: AdminActivityItem): string {
  const type = row.entity_type?.trim();
  const id = row.entity_id?.trim();
  if (type && id) return `${type} · ${id}`;
  if (type) return type;
  if (id) return id;
  return "—";
}

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-800">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user id
            <input
              className="rounded border border-gray-300 px-2 py-1 text-sm normal-case"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              placeholder="UUID"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action contains
            <input
              className="rounded border border-gray-300 px-2 py-1 text-sm normal-case"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="event_class substring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type contains
            <input
              className="rounded border border-gray-300 px-2 py-1 text-sm normal-case"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="payload.entity_type"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Since (local)
            <input
              type="datetime-local"
              className="rounded border border-gray-300 px-2 py-1 text-sm normal-case"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-800"
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
            className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50"
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
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Failed to load activity log.</div>
      ) : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Payload preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const open = Boolean(expanded[row.id]);
              return (
                <Fragment key={row.id}>
                  <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !open }))}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-800">{row.actor_email ?? row.actor_user_id ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-900">{row.action}</td>
                    <td className="px-3 py-2 text-gray-800">{formatEntity(row)}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.payload_preview}</td>
                  </tr>
                  {open ? (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Full payload (JSON)</div>
                        <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded border border-gray-200 bg-white p-3 text-[11px] text-gray-900">
                          {JSON.stringify(row.payload ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!activityQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-600" colSpan={5}>
                  No audit rows matched these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
