import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getNotificationPreferences,
  patchNotificationPreferences,
  type NotificationChannelKey,
} from "../../api/notification-preferences";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { TimePicker } from "../../components/forms/TimePicker";
import { hasInAppHistory } from "../../lib/smart-back";

const CHANNELS: NotificationChannelKey[] = ["email", "sms", "whatsapp", "in_app"];

type EventPrefRow = { event: string };

function labelForChannel(ch: NotificationChannelKey): string {
  if (ch === "in_app") return "In-app";
  return ch.slice(0, 1).toUpperCase() + ch.slice(1);
}

export function NotificationPreferencesPage() {
  const navigate = useNavigate();
  // UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: both back links below were hardcoded to
  // /settings regardless of where the user actually came from -- same smart-back pattern as the
  // rest of the app.
  const goBack = () => {
    if (hasInAppHistory(window.history.state)) {
      navigate(-1);
      return;
    }
    navigate("/settings");
  };
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const prefsQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
  });

  const [channels, setChannels] = useState<Record<NotificationChannelKey, boolean> | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Partial<Record<NotificationChannelKey, boolean>>> | null>(null);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    if (!prefsQuery.data) return;
    setChannels({ ...prefsQuery.data.channels });
    const m: Record<string, Partial<Record<NotificationChannelKey, boolean>>> = {};
    for (const ev of prefsQuery.data.events) {
      m[ev] = { ...prefsQuery.data.effective_by_event[ev] };
    }
    setMatrix(m);
    setQuietStart(prefsQuery.data.quiet_hours_start?.slice(0, 5) ?? "");
    setQuietEnd(prefsQuery.data.quiet_hours_end?.slice(0, 5) ?? "");
    setTimezone(prefsQuery.data.timezone ?? "");
  }, [prefsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!channels || !matrix) throw new Error("not_ready");
      const event_overrides: Record<string, Partial<Record<NotificationChannelKey, boolean>>> = {};
      for (const ev of prefsQuery.data?.events ?? []) {
        const partial: Partial<Record<NotificationChannelKey, boolean>> = {};
        for (const ch of CHANNELS) {
          const cell = matrix[ev]?.[ch];
          if (cell === undefined) continue;
          if (cell !== channels[ch]) partial[ch] = cell;
        }
        if (Object.keys(partial).length > 0) event_overrides[ev] = partial;
      }
      return patchNotificationPreferences({
        channels,
        event_overrides,
        quiet_hours_start: quietStart.trim() ? `${quietStart.trim()}:00` : null,
        quiet_hours_end: quietEnd.trim() ? `${quietEnd.trim()}:00` : null,
        timezone: timezone.trim() || null,
      });
    },
    onSuccess: async () => {
      pushToast("Notification preferences saved.");
      await qc.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: () => pushToast("Could not save preferences.", "error"),
  });

  const resetMutation = useMutation({
    mutationFn: () => patchNotificationPreferences({ reset_to_defaults: true }),
    onSuccess: async () => {
      pushToast("Reset to defaults.");
      await qc.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: () => pushToast("Reset failed.", "error"),
  });

  const events = prefsQuery.data?.events ?? [];

  const masterToggle = useMemo(
    () =>
      function masterToggleChannel(ch: NotificationChannelKey, value: boolean) {
        setChannels((prev) => {
          if (!prev) return prev;
          const next = { ...prev, [ch]: value };
          setMatrix((m) => {
            if (!m) return m;
            const out = { ...m };
            for (const ev of events) {
              out[ev] = { ...out[ev], [ch]: value };
            }
            return out;
          });
          return next;
        });
      },
    [events],
  );

  const setCell = useCallback((ev: string, ch: NotificationChannelKey, value: boolean) => {
    setMatrix((m) => {
      if (!m) return m;
      return { ...m, [ev]: { ...m[ev], [ch]: value } };
    });
  }, []);

  const eventRows = useMemo<EventPrefRow[]>(() => events.map((event) => ({ event })), [events]);

  const eventColumns = useMemo<ParityColumn<EventPrefRow>[]>(() => {
    const checkboxCol = (ch: NotificationChannelKey): ParityColumn<EventPrefRow> => ({
      key: ch,
      label:
        ch === "email"
          ? "Email"
          : ch === "sms"
            ? "Sms"
            : ch === "whatsapp"
              ? "Whatsapp"
              : "In-app",
      className: "text-center",
      cellClass: "text-center",
      render: (row) => (
        <input
          type="checkbox"
          checked={Boolean(matrix?.[row.event]?.[ch])}
          onChange={(e) => setCell(row.event, ch, e.target.checked)}
          aria-label={`${row.event} ${ch}`}
        />
      ),
    });
    return [
      {
        key: "event",
        label: "Event",
        sortable: true,
        render: (row) => <span className="font-mono text-[11px] text-slate-800">{row.event}</span>,
      },
      checkboxCol("email"),
      checkboxCol("sms"),
      checkboxCol("whatsapp"),
      checkboxCol("in_app"),
    ];
  }, [matrix, setCell]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  if (prefsQuery.isError) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-600">Choose channels and quiet hours. Owner timezone applies to quiet hours.</p>
          </div>
          <button type="button" aria-label="Back" onClick={goBack} className="border-0 bg-transparent p-0 text-sm text-slate-700 hover:underline">
            ← Back to profile
          </button>
        </div>
        <ListErrorState
          title="Couldn't load notification preferences"
          status={0}
          message={(prefsQuery.error as Error)?.message}
          onRetry={() => void prefsQuery.refetch()}
        />
      </div>
    );
  }

  if (prefsQuery.isLoading || !channels || !matrix) {
    return <div className="text-sm text-gray-600">Loading notification preferences…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-600">Choose channels and quiet hours. Owner timezone applies to quiet hours.</p>
        </div>
        <button type="button" aria-label="Back" onClick={goBack} className="border-0 bg-transparent p-0 text-sm text-slate-700 hover:underline">
          ← Back to profile
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-sm border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-800">Channels</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {CHANNELS.map((ch) => (
              <label key={ch} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={channels[ch]}
                  onChange={(e) => masterToggle(ch, e.target.checked)}
                  aria-label={labelForChannel(ch)}
                />
                {labelForChannel(ch)}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-sm border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-800">By event type</h2>
          <div className="mt-3">
            <ParityTable
              rows={eventRows}
              columns={eventColumns}
              rowKey={(row) => row.event}
              storageKey="notification-preferences-events"
              emptyText="No notification events configured."
              density="compact"
            />
          </div>
        </section>

        <section className="rounded-sm border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-800">Quiet hours</h2>
          <p className="mt-1 text-xs text-slate-600">External channels (email, SMS, WhatsApp) pause during this window in your timezone.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-700">
              <div className="mb-1 font-medium">Start</div>
              <TimePicker value={quietStart} onChange={setQuietStart} ariaLabel="Quiet hours start" />
            </label>
            <label className="text-xs text-slate-700">
              <div className="mb-1 font-medium">End</div>
              <TimePicker value={quietEnd} onChange={setQuietEnd} ariaLabel="Quiet hours end" />
            </label>
            <label className="min-w-48 text-xs text-slate-700">
              <div className="mb-1 font-medium">Timezone (IANA)</div>
              <input
                className="w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
                placeholder="America/Chicago"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saveMutation.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            Reset to defaults
          </Button>
        </div>
      </form>
    </div>
  );
}
