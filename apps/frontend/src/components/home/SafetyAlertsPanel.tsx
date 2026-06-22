/**
 * GAP-68 — Safety Officer alerts panel (sorted by severity)
 */

import { useNavigate } from "react-router-dom";

export type SafetyAlertItem = {
  alert_id: string;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  body: string;
  count: number;
  action_url: string;
  action_label: string;
};

type Props = {
  alerts: SafetyAlertItem[];
  loading?: boolean;
  certDataStale?: boolean;
};

const SEVERITY_STYLES: Record<SafetyAlertItem["severity"], string> = {
  critical: "border-red-300 bg-red-50 text-red-900",
  error: "border-orange-300 bg-orange-50 text-orange-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-slate-300 bg-slate-100 text-slate-700",
};

export function SafetyAlertsPanel({ alerts, loading, certDataStale }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <section className="rounded border border-slate-200 bg-white p-3" aria-label="Safety alerts">
        <div className="mb-2 h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded bg-slate-100" />
          <div className="h-16 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded border border-slate-200 bg-white" aria-label="Safety alerts">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Safety Alerts</h2>
        {certDataStale ? (
          <p className="mt-1 text-[10px] text-amber-700">
            Driver cert data may be stale (last sync &gt; 7 days). Verify driver file sync before acting on expiry counts.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No safety alerts right now — fleet compliance looks clear.</p>
        ) : (
          alerts.map((alert) => (
            <article
              key={alert.alert_id}
              className={`rounded border px-3 py-2 ${SEVERITY_STYLES[alert.severity]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{alert.title}</h3>
                  <p className="mt-0.5 text-xs opacity-90">{alert.body}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">
                  {alert.severity}
                </span>
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-semibold underline"
                onClick={() => navigate(alert.action_url)}
              >
                {alert.action_label}
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
