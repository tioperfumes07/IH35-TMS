import { AlertTriangle, Bell, Info, Link as LinkIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { UserNotification } from "../../hooks/useNotifications";

type Props = {
  notifications: UserNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical" || severity === "high") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (severity === "medium") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (severity === "low") return <Info className="h-4 w-4 text-blue-500" />;
  return <Bell className="h-4 w-4 text-slate-500" />;
}

export function NotificationDropdown({ notifications, onClose, onMarkRead, onDismiss, onMarkAllRead }: Props) {
  return (
    <div
      className="absolute right-0 top-9 z-40 w-[min(420px,92vw)] rounded border border-gray-200 bg-white shadow-lg"
      data-testid="notification-dropdown"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">Notifications</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-medium text-blue-700 hover:underline"
            onClick={() => void onMarkAllRead()}
          >
            Mark all read
          </button>
          <button type="button" className="rounded p-1 hover:bg-gray-100" aria-label="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ul className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-gray-500">No notifications</li>
        ) : (
          notifications.slice(0, 20).map((item) => (
            <li
              key={item.id}
              className={`border-b px-3 py-2 ${item.read_at ? "bg-white" : "bg-blue-50/40"}`}
              data-testid="notification-item"
            >
              <div className="flex gap-2">
                <SeverityIcon severity={item.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <span className="shrink-0 text-[11px] text-gray-500">{relativeTime(item.created_at)}</span>
                  </div>
                  {item.body ? <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{item.body}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {!item.read_at ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-blue-700 hover:underline"
                        onClick={() => void onMarkRead(item.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-[11px] font-medium text-gray-600 hover:underline"
                      onClick={() => void onDismiss(item.id)}
                    >
                      Dismiss
                    </button>
                    {item.action_link ? (
                      <Link
                        to={item.action_link}
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-700 hover:underline"
                        onClick={onClose}
                      >
                        <LinkIcon className="h-3 w-3" />
                        Open
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
      <div className="border-t px-3 py-2 text-right">
        <Link to="/notifications" className="text-xs font-medium text-blue-700 hover:underline" onClick={onClose}>
          View all
        </Link>
      </div>
    </div>
  );
}
