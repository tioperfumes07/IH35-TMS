import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  fetchNotificationPreferences,
  patchNotificationPreferences,
  useNotifications,
  type NotificationPreferences,
} from "../../hooks/useNotifications";

const TYPE_OPTIONS = [
  "compliance_expiring",
  "compliance_expired",
  "maintenance_alert",
  "load_status",
  "driver_alert",
  "system",
  "message",
];

const SEVERITY_OPTIONS = ["info", "low", "medium", "high", "critical"];

export function NotificationCenterPage() {
  const { notifications, loading, markRead, dismiss, markAllRead, refresh } = useNotifications({ pollIntervalMs: 15_000 });
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    void fetchNotificationPreferences().then((res) => setPrefs(res.preferences));
  }, []);

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (severityFilter && item.severity !== severityFilter) return false;
      if (readFilter === "unread" && item.read_at) return false;
      if (readFilter === "read" && !item.read_at) return false;
      return true;
    });
  }, [notifications, typeFilter, severityFilter, readFilter]);

  const savePrefs = async () => {
    if (!prefs) return;
    setPrefsSaving(true);
    try {
      const res = await patchNotificationPreferences({
        channels_per_type: prefs.channels_per_type,
        quiet_hours_start: prefs.quiet_hours_start,
        quiet_hours_end: prefs.quiet_hours_end,
        email_digest_enabled: prefs.email_digest_enabled,
        email_digest_frequency: prefs.email_digest_frequency,
      });
      setPrefs(res.preferences);
    } finally {
      setPrefsSaving(false);
    }
  };

  return (
    <div data-testid="notification-center-page" className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Notification Center"
        subtitle="In-app alerts from compliance, maintenance, loads, and system events"
        actions={
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void refresh()}>
              Refresh
            </button>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void markAllRead()}>
              Mark all read
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={readFilter}
              onChange={(e) => setReadFilter(e.target.value as "all" | "unread" | "read")}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>

          {loading ? <p className="text-sm text-gray-500">Loading notifications…</p> : null}
          {!loading && filtered.length === 0 ? <p className="text-sm text-gray-500">No notifications match filters.</p> : null}
          <ul className="divide-y">
            {filtered.map((item) => (
              <li key={item.id} className="py-3" data-testid="notification-center-item">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.title}</p>
                    {item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}
                    <p className="mt-1 text-xs text-gray-500">
                      {item.type} · {item.severity} · {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!item.read_at ? (
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => void markRead(item.id)}>
                        Mark read
                      </button>
                    ) : null}
                    <button type="button" className="text-xs text-gray-600 hover:underline" onClick={() => void dismiss(item.id)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded border border-gray-200 bg-white p-4" data-testid="notification-preferences-panel">
          <h2 className="text-sm font-semibold text-gray-900">Preferences</h2>
          {prefs ? (
            <div className="mt-3 space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.email_digest_enabled)}
                  onChange={(e) => setPrefs({ ...prefs, email_digest_enabled: e.target.checked })}
                />
                Daily email digest
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Quiet hours start</span>
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={prefs.quiet_hours_start ?? ""}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_start: e.target.value || null })}
                  placeholder="22:00"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Quiet hours end</span>
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={prefs.quiet_hours_end ?? ""}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_end: e.target.value || null })}
                  placeholder="06:00"
                />
              </label>
              <button
                type="button"
                className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={prefsSaving}
                onClick={() => void savePrefs()}
              >
                {prefsSaving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Loading preferences…</p>
          )}
        </aside>
      </div>
    </div>
  );
}
