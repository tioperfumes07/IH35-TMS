import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

type Props = {
  alerts: Array<Record<string, unknown>>;
  totalCount: number;
};

export function SevereAlertsBand({ alerts, totalCount }: Props) {
  const total = alerts.reduce((sum, row) => sum + Number(row.total_estimated_cost ?? 0), 0);
  return (
    <div className="rounded-sm border border-red-300 bg-red-50">
      <div className="border-b border-red-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
        Severe Repair / Out of Service
      </div>
      <div className="max-h-40 overflow-y-auto">
        {totalCount > alerts.length ? (
          <div className="border-b border-red-100 px-2 py-1 text-xs text-red-700" data-testid="severe-alerts-range">
            Showing {alerts.length} of {totalCount} severe alerts.
          </div>
        ) : null}
        {alerts.map((alert) => (
          <div key={String(alert.id)} className="flex items-center justify-between border-b border-red-100 px-2 py-1 text-xs">
            <span className="flex items-center gap-1 font-semibold">
              <EntityLinkOrTombstone kind="unit" id={typeof alert.unit_id === "string" ? alert.unit_id : null} name={alert.unit_display_id} noun="Unit" />
              ·
              <EntityLinkOrTombstone kind="work_order" id={typeof alert.id === "string" ? alert.id : null} name={alert.wo_display_id} noun="Work order" />
            </span>
            <span>{String(alert.severity ?? "-")}</span>
            <span className="font-semibold">${Number(alert.total_estimated_cost ?? 0).toLocaleString()}</span>
          </div>
        ))}
        {alerts.length === 0 ? <div className="px-2 py-2 text-xs text-red-600">No severe alerts.</div> : null}
      </div>
      <div className="px-2 py-1 text-xs font-semibold text-red-700">Visible total: ${total.toLocaleString()}</div>
    </div>
  );
}
