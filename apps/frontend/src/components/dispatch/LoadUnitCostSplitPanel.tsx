import { useQuery } from "@tanstack/react-query";
import { getLoadUnitCostSplit } from "../../api/accounting";
import { formatMoneyCents } from "./constants";

/**
 * SET-28 — vehicle-swap mid-trip cost split by miles each truck ran.
 *
 * Shows, on the load's Costs tab, how the load's operating-cost pool (expenses + bills) is
 * attributed across the truck(s) that ran it, weighted by miles. One truck → a single 100% row
 * (the normal case). A mid-trip swap → one row per truck, each with its miles and miles-weighted
 * dollar share, reconciling exactly to the pool. Driver pay is NOT here — it follows the driver.
 */

const BASIS_LABEL: Record<string, string> = {
  telematics: "real driven miles (telematics)",
  time_window: "practical miles by time each truck was assigned",
  equal: "split evenly — no miles captured yet",
};

export function LoadUnitCostSplitPanel({
  loadId,
  operatingCompanyId,
  currency,
}: {
  loadId: string;
  operatingCompanyId: string;
  currency?: string;
}) {
  const q = useQuery({
    queryKey: ["load-unit-cost-split", loadId, operatingCompanyId],
    queryFn: () => getLoadUnitCostSplit(operatingCompanyId, loadId),
    enabled: Boolean(loadId && operatingCompanyId),
  });

  const data = q.data;
  // Only render when a truck actually ran the load. A single-truck load still renders (100% row) so
  // the attribution is always visible; nothing renders while loading or on an unassigned load.
  if (!data || data.units.length === 0) return null;

  const multi = data.is_multi_unit;

  return (
    <section
      data-testid="load-unit-cost-split"
      data-multi-unit={multi ? "true" : "false"}
      className="ldt-card"
      style={{ padding: 8 }}
    >
      <div className="ldt-rowbar" style={{ marginBottom: 6 }}>
        <span className="ldt-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#4B5563" }}>
          {multi ? "Vehicle swap — cost split by miles each truck ran" : "Cost by truck"}
        </span>
        <span className="ldt-muted" style={{ fontSize: 11 }}>
          {formatMoneyCents(data.pool_cents, currency)} · basis: {BASIS_LABEL[data.miles_basis] ?? data.miles_basis}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} data-testid="load-unit-cost-split-table">
        <thead>
          <tr>
            <th style={thStyle("left")}>Truck</th>
            <th style={thStyle("right")}>Miles</th>
            <th style={thStyle("right")}>Share</th>
            <th style={thStyle("right")}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {data.units.map((u) => (
            <tr key={u.unit_id} data-testid="load-unit-cost-split-row">
              <td style={tdStyle("left")}>{u.unit_number ?? "—"}</td>
              <td style={tdStyle("right")}>{u.miles > 0 ? u.miles.toFixed(1) : "—"}</td>
              <td style={tdStyle("right")} data-testid="load-unit-cost-split-pct">{u.miles_pct.toFixed(1)}%</td>
              <td style={tdStyle("right")} data-testid="load-unit-cost-split-cost">{formatMoneyCents(u.allocated_cost_cents, currency)}</td>
            </tr>
          ))}
        </tbody>
        {multi ? (
          <tfoot>
            <tr>
              <td style={{ ...tdStyle("left"), fontWeight: 700 }}>Total</td>
              <td style={{ ...tdStyle("right"), fontWeight: 700 }}>{data.total_miles > 0 ? data.total_miles.toFixed(1) : "—"}</td>
              <td style={{ ...tdStyle("right"), fontWeight: 700 }}>100.0%</td>
              <td style={{ ...tdStyle("right"), fontWeight: 700 }} data-testid="load-unit-cost-split-total">
                {formatMoneyCents(data.pool_cents, currency)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      {!data.reconciled ? (
        <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }} data-testid="load-unit-cost-split-unreconciled">
          Split does not reconcile to the cost pool — do not trust these figures.
        </div>
      ) : null}
    </section>
  );
}

function thStyle(align: "left" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#4B5563",
    padding: "4px 8px",
    borderBottom: "1px solid #E5E7EB",
  };
}
function tdStyle(align: "left" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "4px 8px",
    borderBottom: "1px solid #F3F4F6",
    fontVariantNumeric: "tabular-nums",
  };
}
