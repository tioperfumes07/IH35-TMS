import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type InAppNotificationRow } from "../api/notifications";
import { PageHeader } from "../components/layout/PageHeader";
import { useCompanyContext } from "../contexts/CompanyContext";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";

function NotificationRow({
  row,
  companyId,
  onRead,
}: {
  row: InAppNotificationRow;
  companyId: string;
  onRead: () => void;
}) {
  const markMu = useMutation({
    mutationFn: () => markNotificationRead(row.id, companyId),
    onSuccess: onRead,
  });
  return (
    <div className={`rounded border px-3 py-2 text-sm ${row.read_at ? "border-gray-100 bg-gray-50" : "border-sky-200 bg-sky-50"}`}>
      <div className="font-semibold text-gray-900">{row.title}</div>
      <div className="mt-1 text-gray-700">{row.body}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>{new Date(row.created_at).toLocaleString()}</span>
        {row.href ? (
          <Link className="text-sky-700 underline" to={row.href}>
            Open
          </Link>
        ) : null}
        {!row.read_at ? (
          <button type="button" className="text-sky-800 underline" onClick={() => void markMu.mutateAsync()}>
            Mark read
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", "all", companyId],
    queryFn: () => listNotifications(companyId, { limit: 100 }),
    enabled: Boolean(companyId),
  });

  useRealtimeChannel({
    enabled: Boolean(companyId),
    topics: [`company:${companyId}:notifications`],
    onMessage: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMu = useMutation({
    mutationFn: () => markAllNotificationsRead(companyId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const rows = q.data?.notifications ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Notifications"
        actions={
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            disabled={!companyId || markAllMu.isPending || rows.every((r) => r.read_at)}
            onClick={() => void markAllMu.mutateAsync()}
          >
            Mark all as read
          </button>
        }
      />
      {!companyId ? <p className="text-sm text-gray-600">Select a company.</p> : null}
      {q.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      <div className="space-y-2">
        {rows.map((row) => (
          <NotificationRow key={row.id} row={row} companyId={companyId} onRead={() => void qc.invalidateQueries({ queryKey: ["notifications"] })} />
        ))}
        {q.isSuccess && rows.length === 0 ? <p className="text-sm text-gray-500">No notifications yet.</p> : null}
      </div>
    </div>
  );
}
