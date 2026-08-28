import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

type Props = {
  alerts: Array<Record<string, unknown>>;
  totalCount: number;
  /** MAINT-MONEY-F6943 — true SUM(total_actual_cost) across every matching WO, not just the
   * visible page (server-computed, unbounded by the LIMIT 50 the alert list itself uses). */
  totalEstimatedCostAll?: number;
};

export function SevereAlertsBand({ alerts, totalCount, totalEstimatedCostAll }: Props) {
  const visibleTotal = alerts.reduce((sum, row) => sum + Number(row.total_estimated_cost ?? 0), 0);
  const isTruncated = totalCount > alerts.length;
  // Fall back to the visible sum only when the server didn't send the full-population total at all
  // (an older/dev backend) -- never silently prefer a truncated number once the real one exists.
  const trueTotal = totalEstimatedCostAll ?? visibleTotal;
  return (
    <div className="rounded-sm border border-red-300 bg-red-50">
      <div className="border-b border-red-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
        Severe Repair / Out of Service
      </div>
      <div className="max-h-40 overflow-y-auto">
        {isTruncated ? (
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
      {/* MAINT-MONEY-F6943 — "Visible total" alone silently understated real exposure once
          totalCount exceeded the LIMIT-50 alert list: it summed only the rows shown, never the WOs
          the truncation disclosure above admits exist. When truncated, show BOTH the honest full
          total and what it excludes, rather than replacing one dishonest number with another that
          quietly drops the "visible" framing. */}
      {isTruncated ? (
        <div className="border-t border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
          <div data-testid="severe-alerts-total-all">Total exposure (all {totalCount}): ${trueTotal.toLocaleString()}</div>
          <div className="font-normal text-red-600">Visible subtotal ({alerts.length} shown): ${visibleTotal.toLocaleString()}</div>
        </div>
      ) : (
        <div className="px-2 py-1 text-xs font-semibold text-red-700">Total: ${trueTotal.toLocaleString()}</div>
      )}
    </div>
  );
}
