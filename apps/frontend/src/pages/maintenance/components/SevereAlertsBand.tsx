type Props = {
  alerts: Array<Record<string, unknown>>;
};

export function SevereAlertsBand({ alerts }: Props) {
  const total = alerts.reduce((sum, row) => sum + Number(row.total_estimated_cost ?? 0), 0);
  return (
    <div className="rounded border border-red-300 bg-red-50">
      <div className="border-b border-red-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
        Severe Repair / Out of Service
      </div>
      <div className="max-h-40 overflow-y-auto">
        {alerts.map((alert) => (
          <div key={String(alert.id)} className="flex items-center justify-between border-b border-red-100 px-2 py-1 text-xs">
            <span className="font-semibold">{String(alert.unit_display_id ?? "-")}</span>
            <span>{String(alert.severity ?? "-")}</span>
            <span className="font-semibold">${Number(alert.total_estimated_cost ?? 0).toLocaleString()}</span>
          </div>
        ))}
        {alerts.length === 0 ? <div className="px-2 py-2 text-xs text-red-600">No severe alerts.</div> : null}
      </div>
      <div className="px-2 py-1 text-xs font-semibold text-red-700">Total: ${total.toLocaleString()}</div>
    </div>
  );
}
