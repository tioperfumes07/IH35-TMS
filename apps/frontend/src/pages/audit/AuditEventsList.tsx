import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditEvents } from "../../api/audit";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";

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

  if (!allowed) {
    return (
      <div className="space-y-3">
        <PageHeader title="Audit events" subtitle="Bulk operation forensic review" />
        <p className="text-sm text-gray-600">You need Owner, Manager, or Accountant access to view audit events.</p>
      </div>
    );
  }

  const rows = eventsQuery.data?.events ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Audit events" subtitle="Filter by bulk call ID to review one bulk submission" />

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Bulk call ID
            <input
              className="min-w-[16rem] rounded border border-gray-300 px-2 py-1 text-sm normal-case"
              value={bulkCallId}
              onChange={(e) => setBulkCallId(e.target.value)}
              placeholder="Paste bulk_call_id from BulkProgressDialog"
            />
          </label>
          <button
            type="button"
            className="rounded border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
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

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Event</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">Bulk Call</th>
              <th className="px-2 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-2 text-gray-700">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-2 py-2 font-medium text-gray-900">{row.event_type}</td>
                <td className="px-2 py-2 text-gray-700">{row.actor_email ?? row.actor_user_id ?? "—"}</td>
                <td className="px-2 py-2">
                  {row.bulk_call_id ? (
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
                  )}
                </td>
                <td className="px-2 py-2 text-gray-600">{row.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!eventsQuery.isLoading && rows.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">No audit events found.</div>
        ) : null}
      </div>
    </div>
  );
}

export default AuditEventsList;
