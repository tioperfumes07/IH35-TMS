import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getDispatchPreferences,
  updateDispatchPreferences,
  type DispatchV2View,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

export const DISPATCH_LOCAL_SETTINGS_KEY = "ih35.dispatch.local_settings";

export type DispatchLocalSettings = {
  default_sort: string;
  alert_yellow_minutes: number;
  alert_red_minutes: number;
  auto_routing_enabled: boolean;
  auto_routing_respect_hos: boolean;
  auto_routing_respect_equipment: boolean;
};

export const DEFAULT_DISPATCH_LOCAL_SETTINGS: DispatchLocalSettings = {
  default_sort: "created_at:desc",
  alert_yellow_minutes: 1,
  alert_red_minutes: 30,
  auto_routing_enabled: true,
  auto_routing_respect_hos: true,
  auto_routing_respect_equipment: true,
};

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Created (newest first)" },
  { value: "created_at:asc", label: "Created (oldest first)" },
  { value: "load_number:asc", label: "Load number (A→Z)" },
  { value: "load_number:desc", label: "Load number (Z→A)" },
  { value: "status:asc", label: "Status (A→Z)" },
  { value: "rate_total_cents:desc", label: "Rate (high→low)" },
] as const;

function readDispatchLocalSettings(): DispatchLocalSettings {
  if (typeof window === "undefined") return DEFAULT_DISPATCH_LOCAL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DISPATCH_LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_DISPATCH_LOCAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DispatchLocalSettings>;
    return { ...DEFAULT_DISPATCH_LOCAL_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_DISPATCH_LOCAL_SETTINGS;
  }
}

function writeDispatchLocalSettings(partial: Partial<DispatchLocalSettings>) {
  const next = { ...readDispatchLocalSettings(), ...partial };
  window.localStorage.setItem(DISPATCH_LOCAL_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function PrefToggle({
  label,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function DispatchSettingsPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [localSettings, setLocalSettings] = useState<DispatchLocalSettings>(() => readDispatchLocalSettings());

  const prefsQuery = useQuery({
    queryKey: ["dispatch-preferences"],
    queryFn: getDispatchPreferences,
  });

  const saveViewM = useMutation({
    mutationFn: (view: DispatchV2View) => updateDispatchPreferences(view),
    onSuccess: (data) => {
      queryClient.setQueryData(["dispatch-preferences"], data);
      pushToast("Default dispatch view saved.");
    },
    onError: () => pushToast("Could not save dispatch view.", "error"),
  });

  const defaultView = prefsQuery.data?.dispatch_default_view ?? "home";

  useEffect(() => {
    setLocalSettings(readDispatchLocalSettings());
  }, []);

  function patchLocal(partial: Partial<DispatchLocalSettings>) {
    const next = writeDispatchLocalSettings(partial);
    setLocalSettings(next);
    pushToast("Dispatcher defaults updated.");
  }

  return (
    <div className="space-y-4 p-4" data-testid="dispatch-settings-page">
      <PageHeader
        title="Dispatch settings"
        subtitle="Dispatcher defaults — landing view, sort, alert thresholds, auto-routing (B21-D11)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-4" data-testid="dispatch-settings-default-view">
          <h2 className="mb-3 font-semibold">Default landing view</h2>
          <p className="mb-3 text-sm text-slate-600">
            Choose which dispatch surface opens when you visit Dispatch Home without a view override.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="dispatch_default_view"
                value="home"
                checked={defaultView === "home"}
                disabled={prefsQuery.isLoading || saveViewM.isPending}
                data-testid="dispatch-default-view-home"
                onChange={() => saveViewM.mutate("home")}
              />
              Dispatch Home (dashboard + load board)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="dispatch_default_view"
                value="loads"
                checked={defaultView === "loads"}
                disabled={prefsQuery.isLoading || saveViewM.isPending}
                data-testid="dispatch-default-view-loads"
                onChange={() => saveViewM.mutate("loads")}
              />
              Loads full list
            </label>
          </div>
        </section>

        <section className="rounded border p-4" data-testid="dispatch-settings-default-sort">
          <h2 className="mb-3 font-semibold">Default sort</h2>
          <p className="mb-3 text-sm text-slate-600">Applied when opening the loads list until you change sort in the board.</p>
          <select
            className="w-full rounded border px-2 py-1 text-sm"
            value={localSettings.default_sort}
            data-testid="dispatch-default-sort-select"
            onChange={(e) => patchLocal({ default_sort: e.target.value })}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded border p-4" data-testid="dispatch-settings-alert-thresholds">
          <h2 className="mb-3 font-semibold">Alert thresholds</h2>
          <p className="mb-3 text-sm text-slate-600">
            Minutes past scheduled arrival before load rows show yellow (barely making it) or red (late) indicators.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Yellow after (minutes)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border px-2 py-1"
                value={localSettings.alert_yellow_minutes}
                data-testid="dispatch-alert-yellow-minutes"
                onChange={(e) => patchLocal({ alert_yellow_minutes: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="text-sm">
              Red after (minutes)
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border px-2 py-1"
                value={localSettings.alert_red_minutes}
                data-testid="dispatch-alert-red-minutes"
                onChange={(e) => patchLocal({ alert_red_minutes: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
        </section>

        <section className="rounded border p-4" data-testid="dispatch-settings-auto-routing">
          <h2 className="mb-3 font-semibold">Auto-routing rules</h2>
          <p className="mb-3 text-sm text-slate-600">
            Controls for optimal-driver suggestions in Book Load and reassignment flows.
          </p>
          <div className="space-y-2">
            <PrefToggle
              label="Enable optimal driver suggestions"
              checked={localSettings.auto_routing_enabled}
              testId="dispatch-auto-routing-enabled"
              onChange={(v) => patchLocal({ auto_routing_enabled: v })}
            />
            <PrefToggle
              label="Respect HOS remaining hours"
              checked={localSettings.auto_routing_respect_hos}
              disabled={!localSettings.auto_routing_enabled}
              testId="dispatch-auto-routing-hos"
              onChange={(v) => patchLocal({ auto_routing_respect_hos: v })}
            />
            <PrefToggle
              label="Respect equipment / trailer eligibility"
              checked={localSettings.auto_routing_respect_equipment}
              disabled={!localSettings.auto_routing_enabled}
              testId="dispatch-auto-routing-equipment"
              onChange={(v) => patchLocal({ auto_routing_respect_equipment: v })}
            />
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-500" data-testid="dispatch-settings-footnote">
        Default view persists per user via <code>/api/v1/dispatch/preferences</code>. Sort, thresholds, and auto-routing
        defaults are stored in this browser until backend fields ship.
      </p>
    </div>
  );
}
