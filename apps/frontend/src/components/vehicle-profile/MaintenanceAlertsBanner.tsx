import { useMemo, useState } from "react";

type Alert = { severity: string; message: string; source: string; created_at: string };

export function MaintenanceAlertsBanner({ alerts, unitId }: { alerts: Alert[]; unitId: string }) {
  const storageKey = `vp-alerts-dismissed-${unitId}`;
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.has(`${a.severity}:${a.message}`)),
    [alerts, dismissed]
  );

  if (visible.length === 0) return null;

  const dismiss = (alert: Alert) => {
    const next = new Set(dismissed);
    next.add(`${alert.severity}:${alert.message}`);
    setDismissed(next);
    sessionStorage.setItem(storageKey, JSON.stringify([...next]));
  };

  return (
    <div className="space-y-1" data-testid="vp-maintenance-alerts-banner">
      {visible.map((alert) => (
        <div
          key={`${alert.severity}-${alert.message}`}
          className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
            alert.severity === "high" ? "bg-red-100 text-red-900" : alert.severity === "medium" ? "bg-yellow-100 text-yellow-900" : "bg-blue-50 text-blue-900"
          }`}
        >
          <span>{alert.message}</span>
          <button type="button" className="text-xs underline" onClick={() => dismiss(alert)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
